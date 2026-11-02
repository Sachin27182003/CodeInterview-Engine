import { GoogleGenerativeAI } from "@google/generative-ai";
import type { ExecutionOutput, ExecutionRequest, InterviewFeedback } from "../execution/types.js";

const MODEL_NAME = process.env["GEMINI_MODEL"] ?? "gemini-3.8-flash";
const FALLBACK_MODEL_NAME = process.env["GEMINI_FALLBACK_MODEL"] ?? "gemini-3.7-flash";
const SECONDARY_FALLBACK_MODEL_NAME =
  process.env["GEMINI_SECONDARY_FALLBACK_MODEL"] ?? "gemini-3.6-flash";
const MAX_CONTEXT_LENGTH = 20_000;
const MAX_ATTEMPTS = 4;
const INITIAL_RETRY_DELAY = 2_000;

const systemPrompt = `You are a strict but encouraging technical interviewer.
Review the candidate's code and its execution result.
Do not provide the direct answer, corrected code, or a full solution.
Respond in at most 2 short lines: give one specific hint about the mistake or ask one follow-up question about correctness or time complexity.
If the code is correct, acknowledge it briefly and ask a time/space complexity follow-up question.`;

function trim(value: string): string {
  return value.length > MAX_CONTEXT_LENGTH ? `${value.slice(0, MAX_CONTEXT_LENGTH)}\n[truncated]` : value;
}

function limitToTwoLines(value: string): string {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 2)
    .join("\n");
}

function getProviderStatus(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null || !("status" in error)) {
    return undefined;
  }
  const status = error.status;
  return typeof status === "number" ? status : undefined;
}

function isRetryable(error: unknown): boolean {
  const status = getProviderStatus(error);
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function generateInterviewFeedback(
  request: ExecutionRequest,
  result: ExecutionOutput,
): Promise<InterviewFeedback> {
  const apiKey = process.env["GEMINI_API_KEY"];
  if (!apiKey) {
    console.error("GEMINI_API_KEY is not configured; interview feedback was not generated");
    return {
      available: false,
      response: "AI interviewer is unavailable. Configure GEMINI_API_KEY to receive hints and follow-up questions.",
    };
  }

  const client = new GoogleGenerativeAI(apiKey);
  const executionOutput = [result.stdout, result.stderr].filter(Boolean).join("\n") || "(no output)";
  const prompt = `Problem:
${trim(request.problemDescription ?? "No problem statement was provided. Focus on the code's behavior and complexity.")}

Language: ${request.language}
Code:
${trim(request.code)}

Execution output/error:
${trim(executionOutput)}
Exit code: ${result.exitCode ?? "unknown"}; timed out: ${result.timedOut}`;

  let lastError: unknown;
  const modelNames = [...new Set([MODEL_NAME, FALLBACK_MODEL_NAME, SECONDARY_FALLBACK_MODEL_NAME])];
  for (const [modelIndex, modelName] of modelNames.entries()) {
    const model = client.getGenerativeModel({
      model: modelName,
      systemInstruction: systemPrompt,
    });
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        const response = await model.generateContent(prompt);
        const text = limitToTwoLines(response.response.text());
        if (!text) {
          throw new Error("Gemini returned an empty response");
        }
        return { available: true, response: text };
      } catch (error) {
        lastError = error;
        if (!isRetryable(error) || attempt === MAX_ATTEMPTS) {
          break;
        }
        const delay = INITIAL_RETRY_DELAY * 2 ** (attempt - 1);
        console.warn(
          `Gemini model ${modelName} returned a transient error; retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_ATTEMPTS})`,
        );
        await wait(delay);
      }
    }
    if (modelIndex < modelNames.length - 1 && isRetryable(lastError)) {
      console.warn(`Falling back from Gemini model ${modelName} to ${modelNames[modelIndex + 1]}`);
    }
  }

  const status = getProviderStatus(lastError);
  console.error("Could not generate Gemini interview feedback:", lastError);
  return {
    available: false,
    response:
      status === 429
        ? "Gemini daily quota is exhausted. Code execution succeeded; enable billing or wait for the quota reset before requesting interview feedback."
        :
      status === 503
        ? "The AI interviewer models are temporarily busy. Your code ran successfully; please submit again in a moment."
        : "Gemini could not evaluate this submission. Check the backend logs for the provider error and configuration.",
  };
}
