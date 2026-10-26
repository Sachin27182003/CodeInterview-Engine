import cors from "cors";
import express, { type ErrorRequestHandler, type Request, type Response } from "express";
import { runInDocker } from "./execution/dockerRunner.js";
import type { SupportedLanguage } from "./execution/types.js";

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
    const result = await runInDocker(code, language as SupportedLanguage);
    response.json(result);
  } catch (error) {
    console.error("Code execution failed:", error);
    response.status(503).json({ error: "The code execution service is unavailable" });
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

export { app };
