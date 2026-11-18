import { GoogleGenerativeAI } from "@google/generative-ai";
import type { ExecutionOutput, ExecutionRequest, InterviewFeedback } from "../execution/types.js";

const MODEL_NAME = process.env["GEMINI_MODEL"] ?? "gemini-3.8-flash";
const FALLBACK_MODEL_NAME = process.env["GEMINI_FALLBACK_MODEL"] ?? "gemini-3.7-flash";
const SECONDARY_FALLBACK_MODEL_NAME =
  process.env["GEMINI_SECONDARY_FALLBACK_MODEL"] ?? "gemini-3.6-flash";
const MAX_CONTEXT_LENGTH = 20_000;
const MAX_ATTEMPTS = 4;
const INITIAL_RETRY_DELAY = 2_000;

const systemPrompt = `You are a strict but encouraging technical interviewer conducting a live interview.
Review the candidate's code and its execution result, or perform static analysis when execution was skipped.
Do not provide the direct answer, corrected code, or a full solution.
Return only valid JSON with this shape: {"score": number, "response": string}.
The score must be an integer from 0 to 100 based on correctness, reliability, and code quality.
The response must be at most 3 short lines. Give concise feedback, then ask exactly one role-specific technical question.
Ask between 5 and 10 follow-up questions in total, choosing the stopping point based on the candidate's code complexity and answers.
For frontend roles, probe state ownership, re-renders, accessibility, and UI performance; for backend roles, probe concurrency, consistency, failure handling, and data access.
If the candidate deflects or answers irrelevantly, issue one polite warning to return to the technical topic. On a second deflection, terminate immediately with a penalty.
Do not give the direct answer, corrected code, or a full solution.`;

function roleGuidance(targetRole?: string): string {
  return targetRole
    ? `The candidate is targeting the ${targetRole} role. Tailor questions to this role while still testing the code.`
    : "The candidate has not selected a target role. Test general software engineering fundamentals.";
}

function trim(value: string): string {
  return value.length > MAX_CONTEXT_LENGTH ? `${value.slice(0, MAX_CONTEXT_LENGTH)}\n[truncated]` : value;
}

function limitToThreeLines(value: string): string {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join("\n");
}

function parseFeedback(value: string): InterviewFeedback {
  const trimmed = value.trim();
  const unwrapped = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  const candidates = [
    trimmed,
    unwrapped,
  ];
  const objectStart = trimmed.indexOf("{");
  const objectEnd = trimmed.lastIndexOf("}");
  if (objectStart >= 0 && objectEnd > objectStart) {
    candidates.push(trimmed.slice(objectStart, objectEnd + 1));
  }

  for (const candidate of candidates) {
    try {
      const parsed: unknown = JSON.parse(candidate);
      if (parsed && typeof parsed === "object") {
        const record = parsed as Record<string, unknown>;
        const responseValue = record.response ?? record.feedback ?? record.message;
        const response = typeof responseValue === "string" ? limitToThreeLines(responseValue) : "";
        const rawScore = record.score;
        const numericScore = typeof rawScore === "number" || typeof rawScore === "string"
          ? Number(rawScore)
          : Number.NaN;
        const score = Number.isInteger(numericScore) && numericScore >= 0 && numericScore <= 100
          ? numericScore
          : null;
        if (response) return { available: true, response, score };
      }
    } catch {
      // Try the next representation when the provider wraps or prefixes the JSON.
    }
  }
  if (unwrapped && !unwrapped.startsWith("{") && !unwrapped.startsWith("[")) {
    const response = limitToThreeLines(unwrapped);
    if (response) return { available: true, response, score: null };
  }
  return { available: false, response: "AI feedback was not returned in the expected format.", score: null };
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
      score: null,
    };
  }

  const client = new GoogleGenerativeAI(apiKey);
  const executionOutput = [result.stdout, result.stderr].filter(Boolean).join("\n") || "(no output)";
  const prompt = `${roleGuidance(request.targetRole)}

Problem:
${trim(request.problemDescription ?? "No problem statement was provided. Focus on the code's behavior and complexity.")}

Language: ${request.language}
Code:
${trim(request.code)}

Execution output/error:
${trim(executionOutput)}
Execution mode: ${request.isExecutable === false ? "static analysis; do not infer runtime correctness from output" : "container execution"}
Exit code: ${result.exitCode ?? "unknown"}; timed out: ${result.timedOut}`;

  let lastError: unknown;
  const modelNames = [...new Set([MODEL_NAME, FALLBACK_MODEL_NAME, SECONDARY_FALLBACK_MODEL_NAME])];
  for (const [modelIndex, modelName] of modelNames.entries()) {
    const model = client.getGenerativeModel({
      model: modelName,
      systemInstruction: systemPrompt,
      generationConfig: { responseMimeType: "application/json" },
    });
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        const response = await model.generateContent(prompt);
        const text = response.response.text();
        if (!text) {
          throw new Error("Gemini returned an empty response");
        }
        return parseFeedback(text);
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
    score: null,
  };
}

export async function generateFollowUpResponse(
  request: ExecutionRequest,
  userMessage: string,
  deflectionCount = 0,
  followUpNumber = 1,
  followUpTarget = 7,
): Promise<{ response: string; strike: number; terminated: boolean; penaltyApplied: boolean }> {
  const apiKey = process.env["GEMINI_API_KEY"];
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const client = new GoogleGenerativeAI(apiKey);
  const looksLikeDeflection =
    /\b(what(?:'s| is) your name|who are you|how are you|tell me a joke|weather|politic|unrelated|off[- ]topic|change the subject|skip this|no idea)\b/i.test(
      userMessage,
    ) ||
    (/\b(can we|could we|i want to)\b.*\b(change|switch|avoid)\b/i.test(userMessage));
  const strike = Math.min(2, deflectionCount + (looksLikeDeflection ? 1 : 0));
  if (strike >= 2) {
    return {
      response: "This interview is ending because the discussion moved off the technical topic twice.",
      strike,
      terminated: true,
      penaltyApplied: true,
    };
  }
  if (strike === 1) {
    return {
      response: "Let's stay focused on the technical approach. Can you explain your time complexity?",
      strike,
      terminated: false,
      penaltyApplied: false,
    };
  }
  if (followUpNumber >= followUpTarget) {
    return {
      response: "Thank you. I have enough evidence to complete the technical assessment.",
      strike,
      terminated: true,
      penaltyApplied: false,
    };
  }
  const prompt = `You are conducting a technical interview.
${roleGuidance(request.targetRole)}
Problem:
${trim(request.problemDescription ?? "No problem statement was provided.")}

Candidate code:
${trim(request.code)}

Candidate's spoken answer:
${trim(userMessage)}

This is follow-up ${followUpNumber} of ${followUpTarget}. Reply in at most two short sentences. Directly acknowledge the candidate's answer, then ask one concise role-specific follow-up question. Do not provide corrected code or a full solution.`;
  const model = client.getGenerativeModel({
    model: MODEL_NAME,
    systemInstruction:
      "You are an interactive technical interviewer. Keep the conversation going and always ask a relevant follow-up question.",
  });
  const response = await model.generateContent(prompt);
  const text = response.response.text();
  if (!text) throw new Error("Gemini returned an empty follow-up response");
  return { response: limitToThreeLines(text), strike, terminated: false, penaltyApplied: false };
}
