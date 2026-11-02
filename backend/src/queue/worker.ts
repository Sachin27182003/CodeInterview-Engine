import "dotenv/config";
import { Job, Worker } from "bullmq";
import { runInDocker } from "../execution/dockerRunner.js";
import type { ExecutionRequest } from "../execution/types.js";
import { generateInterviewFeedback } from "../interview/geminiInterviewer.js";
import { prisma } from "../db.js";
import { CODE_QUEUE_NAME, redisConnection } from "./codeQueue.js";

const worker = new Worker<ExecutionRequest>(
  CODE_QUEUE_NAME,
  async (job: Job<ExecutionRequest>) => {
    console.log(`Starting execution job ${job.id}`);
    if (job.data.submissionId) {
      await prisma.submission.update({
        where: { id: job.data.submissionId },
        data: { status: "RUNNING" },
      });
    }
    try {
      await job.updateProgress({ phase: "executing" });
      const startedAt = Date.now();
      const executionResult = await runInDocker(job.data.code, job.data.language);
      const executionTimeMs = Date.now() - startedAt;
      await job.updateProgress({ phase: "interviewing", executionResult });
      const interview = await generateInterviewFeedback(job.data, executionResult);
      if (job.data.submissionId) {
        await prisma.submission.update({
          where: { id: job.data.submissionId },
          data: {
            status: "COMPLETED",
            executionTimeMs,
            stdout: executionResult.stdout,
            stderr: executionResult.stderr,
            exitCode: executionResult.exitCode,
            timedOut: executionResult.timedOut,
            aiFeedback: interview.response,
            aiFeedbackAvailable: interview.available,
            completedAt: new Date(),
          },
        });
        const submission = await prisma.submission.findUnique({
          where: { id: job.data.submissionId },
          select: { sessionId: true },
        });
        if (submission) {
          await prisma.interviewSession.update({
            where: { id: submission.sessionId },
            data: { status: "COMPLETED", completedAt: new Date() },
          });
        }
      }
      await job.updateProgress({ phase: "completed", executionResult, interview });
      console.log(`Finished execution job ${job.id}`);
      return executionResult;
    } catch (error) {
      if (job.data.submissionId) {
        await prisma.submission.update({
          where: { id: job.data.submissionId },
          data: { status: "FAILED", completedAt: new Date() },
        });
      }
      throw error;
    }
  },
  {
    connection: redisConnection,
    concurrency: 1,
  },
);

worker.on("completed", (job) => {
  console.log(`Execution job ${job.id} completed`);
});

worker.on("failed", (job, error) => {
  console.error(`Execution job ${job?.id ?? "unknown"} failed:`, error);
});

worker.on("error", (error) => {
  console.error("Execution worker error:", error);
});

const shutdown = async (signal: string): Promise<void> => {
  console.log(`Received ${signal}; stopping execution worker`);
  await worker.close();
  await redisConnection.quit();
  await prisma.$disconnect();
  process.exit(0);
};

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

console.log(`Execution worker listening on queue "${CODE_QUEUE_NAME}"`);
