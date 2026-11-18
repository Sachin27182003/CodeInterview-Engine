export type SupportedLanguage = "javascript" | "python" | "java" | "c" | "cpp";

export interface ExecutionRequest {
  code: string;
  language: SupportedLanguage;
  problemDescription?: string;
  problemSlug?: string;
  isExecutable?: boolean;
  targetRole?: string;
  submissionId?: string;
}

export interface InterviewFeedback {
  response: string;
  available: boolean;
  score: number | null;
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
