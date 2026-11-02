export type SupportedLanguage = "javascript" | "python" | "java" | "c" | "cpp";

export interface ExecutionRequest {
  code: string;
  language: SupportedLanguage;
  problemDescription?: string;
  submissionId?: string;
}

export interface InterviewFeedback {
  response: string;
  available: boolean;
}

export interface ExecutionOutput {
  stdout: string;
  stderr: string;
  timedOut: boolean;
  exitCode: number | null;
}

export interface ExecutionResult extends ExecutionOutput {
  interview: InterviewFeedback;
}
