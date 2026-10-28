import { Queue } from "bullmq";
import { Redis } from "ioredis";
import type { ExecutionRequest } from "../execution/types.js";

export const CODE_QUEUE_NAME = "code-execution";
const redisUrl = process.env["REDIS_URL"] ?? "redis://127.0.0.1:6379";

export const redisConnection = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
});

export const codeQueue = new Queue<ExecutionRequest>(CODE_QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: { age: 3600, count: 1000 },
    removeOnFail: { age: 3600, count: 1000 },
  },
});
