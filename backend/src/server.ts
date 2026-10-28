import cors from "cors";
import express, { type ErrorRequestHandler, type Request, type Response } from "express";
import type { SupportedLanguage } from "./execution/types.js";
import { codeQueue, redisConnection } from "./queue/codeQueue.js";

const app = express();
const port = Number(process.env["PORT"] ?? 3001);
const MAX_CODE_LENGTH = 100_000;
const supportedLanguages = new Set<SupportedLanguage>(["javascript", "python", "java", "c", "cpp"]);

app.use(cors());
app.use(express.json({ limit: "128kb" }));

app.get("/health", (_request, response) => {
  response.json({ status: "ok" });
});

app.post("/submit", async (request: Request, response: Response): Promise<void> => {
  const { code, language } = request.body as { code?: unknown; language?: unknown };

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

  try {
    const job = await codeQueue.add("execute", {
      code,
      language: language as SupportedLanguage,
    });
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
    if (state === "completed") {
      response.json({ jobId, status: state, result: job.returnvalue });
      return;
    }
    if (state === "failed") {
      response.json({ jobId, status: state, error: job.failedReason ?? "Code execution failed" });
      return;
    }
    response.json({ jobId, status: state });
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

app.listen(port, () => {
  console.log(`Code execution API listening on port ${port}`);
});

const shutdown = async (signal: string): Promise<void> => {
  console.log(`Received ${signal}; stopping API`);
  await codeQueue.close();
  await redisConnection.quit();
  process.exit(0);
};

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

export { app };
