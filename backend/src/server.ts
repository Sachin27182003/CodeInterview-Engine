import "dotenv/config";
import { createServer } from "node:http";
import cors from "cors";
import express, { type ErrorRequestHandler, type Request, type Response } from "express";
import { QueueEvents } from "bullmq";
import { Redis } from "ioredis";
import { Server } from "socket.io";
import type { ExecutionRequest, SupportedLanguage } from "./execution/types.js";
import { prisma } from "./db.js";
import { CODE_QUEUE_NAME, codeQueue, redisConnection, redisUrl } from "./queue/codeQueue.js";

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: process.env["FRONTEND_URL"] ?? "*" },
});
const queueEvents = new QueueEvents(CODE_QUEUE_NAME, {
  connection: new Redis(redisUrl, {
    maxRetriesPerRequest: null,
  }),
});
const port = Number(process.env["PORT"] ?? 3001);
const MAX_CODE_LENGTH = 100_000;
const supportedLanguages = new Set<SupportedLanguage>(["javascript", "python", "java", "c", "cpp"]);

app.use(cors());
app.use(express.json({ limit: "128kb" }));

io.on("connection", (socket) => {
  socket.on("job:subscribe", async (jobId: unknown) => {
    if (typeof jobId === "string" && jobId.length > 0) {
      void socket.join(`job:${jobId}`);
      try {
        const job = await codeQueue.getJob(jobId);
        if (!job) return;
        const state = await job.getState();
        const progress = job.progress as {
          phase?: string;
          executionResult?: Record<string, unknown>;
          interview?: Record<string, unknown>;
        };
        if (state === "failed") {
          socket.emit("job:failed", { jobId, error: job.failedReason ?? "Code execution failed" });
        } else if (state === "completed" || progress.phase === "completed") {
          socket.emit("job:completed", {
            jobId,
            result: progress.executionResult
              ? { ...progress.executionResult, interview: progress.interview }
              : job.returnvalue,
          });
        } else {
          socket.emit("job:progress", { jobId, progress });
        }
      } catch (error) {
        console.error(`Could not subscribe to execution job ${jobId}:`, error);
        socket.emit("job:failed", { jobId, error: "Unable to read execution status" });
      }
    }
  });

  socket.on("job:unsubscribe", (jobId: unknown) => {
    if (typeof jobId === "string") {
      void socket.leave(`job:${jobId}`);
    }
  });
});

queueEvents.on("progress", ({ jobId, data }) => {
  let progress: unknown = data;
  if (typeof data === "string") {
    try {
      progress = JSON.parse(data) as unknown;
    } catch (error) {
      console.error(`Could not parse progress for execution job ${jobId}:`, error);
      return;
    }
  }
  io.to(`job:${jobId}`).emit("job:progress", { jobId, progress });
  if (
    progress &&
    typeof progress === "object" &&
    "phase" in progress &&
    progress.phase === "completed"
  ) {
    const completedProgress = progress as {
      executionResult?: Record<string, unknown>;
      interview?: Record<string, unknown>;
    };
    io.to(`job:${jobId}`).emit("job:completed", {
      jobId,
      result: completedProgress.executionResult
        ? { ...completedProgress.executionResult, interview: completedProgress.interview }
        : undefined,
    });
  }
});

queueEvents.on("failed", ({ jobId, failedReason }) => {
  io.to(`job:${jobId}`).emit("job:failed", {
    jobId,
    error: failedReason || "Code execution failed",
  });
});

queueEvents.on("error", (error) => {
  console.error("Execution queue events error:", error);
});

app.get("/health", (_request, response) => {
  response.json({ status: "ok" });
});

app.post("/submit", async (request: Request, response: Response): Promise<void> => {
  const { code, language, problemDescription } = request.body as {
    code?: unknown;
    language?: unknown;
    problemDescription?: unknown;
  };

  if (typeof code !== "string" || code.length === 0 || code.length > MAX_CODE_LENGTH) {
    response.status(400).json({
      error: `code must be a non-empty string of at most ${MAX_CODE_LENGTH} characters`,
    });
    return;
  }

  if (typeof language !== "string" || !supportedLanguages.has(language as SupportedLanguage)) {
    response.status(400).json({
      error: "language must be one of: javascript, python, java, c, cpp",
    });
    return;
  }

  if (problemDescription !== undefined && (typeof problemDescription !== "string" || problemDescription.length > MAX_CODE_LENGTH)) {
    response.status(400).json({ error: `problemDescription must be a string of at most ${MAX_CODE_LENGTH} characters` });
    return;
  }

  try {
    const requestData: ExecutionRequest = {
      code,
      language: language as SupportedLanguage,
      ...(typeof problemDescription === "string" ? { problemDescription } : {}),
    };
    const problem = await prisma.problem.upsert({
      where: { slug: "two-sum" },
      update: {},
      create: {
        slug: "two-sum",
        title: "Two Sum",
        description:
          problemDescription ??
          "Given an array of integers and a target value, return the indices of two different elements whose sum equals the target. Expected time complexity: O(n). Expected space complexity: O(n).",
        testCases: [
          { nums: [2, 7, 11, 15], target: 9, expected: [0, 1] },
          { nums: [3, 2, 4], target: 6, expected: [1, 2] },
        ],
      },
    });
    const session = await prisma.interviewSession.create({
      data: { problemId: problem.id },
    });
    const submission = await prisma.submission.create({
      data: {
        sessionId: session.id,
        problemId: problem.id,
        code,
        language,
      },
    });
    requestData.submissionId = submission.id;
    const job = await codeQueue.add("execute", requestData);
    response.status(202).json({ jobId: job.id, status: "queued" });
  } catch (error) {
    console.error("Could not queue code execution:", error);
    response.status(503).json({ error: "The code execution queue is unavailable" });
  }
});

app.get("/status/:jobId", async (request: Request, response: Response): Promise<void> => {
  const jobIdParam = request.params["jobId"];
  if (!jobIdParam || Array.isArray(jobIdParam)) {
    response.status(400).json({ error: "jobId is required" });
    return;
  }
  const jobId = jobIdParam;

  try {
    const job = await codeQueue.getJob(jobId);
    if (!job) {
      response.status(404).json({ error: "Execution job not found" });
      return;
    }

    const state = await job.getState();
    const progress = job.progress as {
      phase?: unknown;
      executionResult?: unknown;
      interview?: unknown;
    };
    if (state === "completed" && progress.phase === "interviewing" && progress.interview === undefined) {
      response.json({
        jobId,
        status: "active",
        progress: job.progress,
      });
      return;
    }
    if (state === "completed") {
      const result =
        progress.interview !== undefined && progress.executionResult !== undefined
          ? { ...progress.executionResult, interview: progress.interview }
          : job.returnvalue;
      response.json({ jobId, status: state, result });
      return;
    }
    if (state === "failed") {
      response.json({ jobId, status: state, error: job.failedReason ?? "Code execution failed" });
      return;
    }
    const phase = progress.phase;
    const effectiveStatus =
      phase === "executing" || phase === "interviewing" ? "active" : state;
    response.json({ jobId, status: effectiveStatus, progress: job.progress });
  } catch (error) {
    console.error("Could not read code execution status:", error);
    response.status(503).json({ error: "The code execution queue is unavailable" });
  }
});

const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  if (error instanceof SyntaxError) {
    response.status(400).json({ error: "Request body must be valid JSON" });
    return;
  }
  console.error("Unhandled request error:", error);
  response.status(500).json({ error: "Internal server error" });
};

app.use(errorHandler);

httpServer.listen(port, () => {
  console.log(`Code execution API listening on port ${port}`);
});

const shutdown = async (signal: string): Promise<void> => {
  console.log(`Received ${signal}; stopping API`);
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  await queueEvents.close();
  await codeQueue.close();
  await prisma.$disconnect();
  await redisConnection.quit();
  process.exit(0);
};

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

export { app };
