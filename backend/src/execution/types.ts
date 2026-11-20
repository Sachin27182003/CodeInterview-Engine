export type SupportedLanguage = "javascript" | "python" | "java" | "c" | "cpp";

export interface ExecutionRequest {
  code: string;
  language: SupportedLanguage;
  problemDescription?: string;
  problemSlug?: string;
  isExecutable?: boolean;
  targetRole?: string;
  difficulty?: "easy" | "medium" | "hard";
  runnerEntryPoint?: string;
  runnerTestCases?: Array<{ args: unknown[]; expected: unknown }>;
  submissionId?: string;
}

export interface InterviewFeedback {
  response: string;
  available: boolean;
  score: number | null;
}

export interface CommunicationAssessment {
  status: "assessed" | "limited" | "not_assessed" | "unavailable";
  interviewAnswerQuality: number | null;
  communicationClarity: number | null;
  englishProficiency: number | null;
  confidence: number | null;
  nervousnessIndicators: "low" | "moderate" | "high" | "not_assessed";
  summary: string;
  evidence: string[];
}

export interface ExecutionOutput {
  stdout: string;
  stderr: string;
  timedOut: boolean;
  exitCode: number | null;
  executionTimeMs?: number;
}

export interface ExecutionResult extends ExecutionOutput {
  interview: InterviewFeedback;
}
