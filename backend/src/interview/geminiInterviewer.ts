import { GoogleGenerativeAI } from "@google/generative-ai";
import type { CommunicationAssessment, ExecutionOutput, ExecutionRequest, InterviewFeedback } from "../execution/types.js";

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

function difficultyGuidance(difficulty?: ExecutionRequest["difficulty"]): string {
  switch (difficulty) {
    case "easy": return "Interview difficulty: easy. Keep coding and follow-up questions beginner-friendly; focus on basic concepts, clear reasoning, and avoid advanced edge cases or jargon.";
    case "hard": return "Interview difficulty: hard. Use challenging coding and follow-up questions that probe trade-offs, edge cases, complexity, and deeper system or language details.";
    default: return "Interview difficulty: medium. Use intermediate coding and follow-up questions that test practical problem solving, complexity, and relevant trade-offs.";
  }
}

function trim(value: string): string {
  return value.length > MAX_CONTEXT_LENGTH ? `${value.slice(0, MAX_CONTEXT_LENGTH)}\n[truncated]` : value;
}

function limitToLines(value: string, maximum = 3): string {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, maximum)
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
        const response = typeof responseValue === "string" ? limitToLines(responseValue) : "";
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
    const response = limitToLines(unwrapped);
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
${difficultyGuidance(request.difficulty)}

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

export async function generateCommunicationAssessment(
  transcript: Array<{ role: "user" | "assistant"; text: string }>,
): Promise<CommunicationAssessment> {
  const candidateMessages = transcript.filter((entry) => entry.role === "user" && entry.text.trim());
  if (candidateMessages.length === 0) {
    return {
      status: "not_assessed",
      interviewAnswerQuality: null,
      communicationClarity: null,
      englishProficiency: null,
      confidence: null,
      nervousnessIndicators: "not_assessed",
      summary: "No candidate responses were recorded, so communication and delivery could not be assessed.",
      evidence: [],
    };
  }

  const apiKey = process.env["GEMINI_API_KEY"];
  if (!apiKey) {
    return {
      status: "unavailable",
      interviewAnswerQuality: null,
      communicationClarity: null,
      englishProficiency: null,
      confidence: null,
      nervousnessIndicators: "not_assessed",
      summary: "Communication assessment is unavailable because the AI service is not configured.",
      evidence: [],
    };
  }

  const wordCount = candidateMessages.reduce((count, entry) => count + entry.text.trim().split(/\s+/).length, 0);
  const status: CommunicationAssessment["status"] = candidateMessages.length < 2 || wordCount < 40
    ? "limited"
    : "assessed";
  const client = new GoogleGenerativeAI(apiKey);
  const model = client.getGenerativeModel({
    model: MODEL_NAME,
    systemInstruction: `You are evaluating a candidate's full spoken technical interview transcript. Return only valid JSON with this shape: {"interviewAnswerQuality": number, "communicationClarity": number, "englishProficiency": number, "confidence": number, "nervousnessIndicators": "low"|"moderate"|"high", "summary": string, "evidence": string[]}. Scores must be integers from 0 to 100. Score interviewAnswerQuality for relevance, correctness, reasoning, and completeness of the candidate's verbal answers; do not score their code here. Evaluate communicationClarity and confidence using the recorded words. English proficiency means clarity and control of written/transcribed English; do not infer accent, pronunciation, nationality, or native-speaker status. Nervousness indicators may refer only to observable transcript patterns such as repeated hesitations, self-corrections, or uncertainty language. Do not diagnose or claim the candidate's actual emotional state. If the transcript offers little evidence, explain the uncertainty and use a conservative answer-quality score. Keep the summary concise and evidence to at most three short, transcript-grounded observations.`,
    generationConfig: { responseMimeType: "application/json" },
  });
  const conversation = transcript
    .map((entry) => `${entry.role === "user" ? "Candidate" : "Interviewer"}: ${trim(entry.text)}`)
    .join("\n");
  const response = await model.generateContent(`Assess the candidate's technical answers and communication in this interview transcript. The assessment is coaching feedback, not a clinical judgment.\n\n${trim(conversation)}`);
  const raw = response.response.text().trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object") throw new Error("Gemini returned an invalid communication assessment");
  const record = parsed as Record<string, unknown>;
  const score = (value: unknown): number | null => {
    const numeric = typeof value === "number" ? value : Number(value);
    return Number.isInteger(numeric) && numeric >= 0 && numeric <= 100 ? numeric : null;
  };
  const level = record.nervousnessIndicators;
  const nervousnessIndicators = level === "low" || level === "moderate" || level === "high"
    ? level
    : "moderate";
  const summary = typeof record.summary === "string" ? record.summary.trim().slice(0, 600) : "Communication feedback was not returned.";
  const evidence = Array.isArray(record.evidence)
    ? record.evidence.filter((item): item is string => typeof item === "string").map((item) => item.trim().slice(0, 240)).filter(Boolean).slice(0, 3)
    : [];
  return {
    status,
    interviewAnswerQuality: score(record.interviewAnswerQuality),
    communicationClarity: score(record.communicationClarity),
    englishProficiency: score(record.englishProficiency),
    confidence: score(record.confidence),
    nervousnessIndicators,
    summary,
    evidence,
  };
}

export async function generateFollowUpResponse(
  request: ExecutionRequest,
  userMessage: string,
  previousQuestion: string | undefined = undefined,
  deflectionCount = 0,
  followUpNumber = 1,
  followUpTarget = 7,
): Promise<{ response: string; strike: number; terminated: boolean; penaltyApplied: boolean }> {
  const apiKey = process.env["GEMINI_API_KEY"];
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const client = new GoogleGenerativeAI(apiKey);
  const doesNotKnow = /\b(i\s*(?:do not|don't|dont)\s+know|no idea|not sure|unsure|i\s*(?:cannot|can't|cant)\s+answer|i\s*(?:have|hv)\s+no clue|i\s*(?:am|m)\s+not certain)\b/i.test(userMessage);
  const looksLikeDeflection =
    /\b(what(?:'s| is) your name|who are you|how are you|tell me a joke|weather|politic|unrelated|off[- ]topic|change the subject|skip this)\b/i.test(
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
  if (followUpNumber >= followUpTarget && !doesNotKnow) {
    return {
      response: "Thank you. I have enough evidence to complete the technical assessment.",
      strike,
      terminated: true,
      penaltyApplied: false,
    };
  }
  const prompt = `You are conducting a technical interview.
${roleGuidance(request.targetRole)}
${difficultyGuidance(request.difficulty)}
Problem:
${trim(request.problemDescription ?? "No problem statement was provided.")}

Candidate code:
${trim(request.code)}

Candidate's spoken answer:
${trim(userMessage)}

Previous interviewer question:
${trim(previousQuestion ?? "No previous question was provided.")}

This is follow-up ${followUpNumber} of ${followUpTarget}. Reply in at most four concise sentences. If the candidate says they do not know, are unsure, or cannot answer, treat that as a valid answer, not a deflection: briefly and clearly explain the expected concept or answer, then immediately continue the interview without asking whether they have questions. When more questions remain, use the exact transition sentence "Let's start with the next question." and then ask exactly one new, concise role-specific technical question. If this was the final follow-up, briefly explain the answer and close the interview without asking another question. For any other answer, acknowledge it and ask exactly one relevant follow-up question. Do not offer to switch into tutoring mode, invite unrelated questions, or give corrected code or a full solution.`;
  const model = client.getGenerativeModel({
    model: MODEL_NAME,
    systemInstruction:
      "You are a professional technical interviewer. Keep control of the interview, assess the candidate's reasoning, and move to the next question after brief clarification when needed. Do not offer open-ended tutoring or ask whether the candidate has questions.",
  });
  const response = await model.generateContent(prompt);
  const text = response.response.text();
  if (!text) throw new Error("Gemini returned an empty follow-up response");
  return { response: limitToLines(text, 4), strike, terminated: false, penaltyApplied: false };
}
