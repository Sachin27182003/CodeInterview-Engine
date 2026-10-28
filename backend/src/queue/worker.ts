import { Job, Worker } from "bullmq";
import { runInDocker } from "../execution/dockerRunner.js";
import type { ExecutionRequest } from "../execution/types.js";
import { CODE_QUEUE_NAME, redisConnection } from "./codeQueue.js";

const worker = new Worker<ExecutionRequest>(
  CODE_QUEUE_NAME,
  async (job: Job<ExecutionRequest>) => {
    console.log(`Starting execution job ${job.id}`);
    const result = await runInDocker(job.data.code, job.data.language);
    console.log(`Finished execution job ${job.id}`);
    return result;
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
  process.exit(0);
};

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

console.log(`Execution worker listening on queue "${CODE_QUEUE_NAME}"`);
