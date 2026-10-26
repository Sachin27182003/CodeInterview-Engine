export type SupportedLanguage = "javascript" | "python" | "java" | "c" | "cpp";

export interface ExecutionRequest {
  code: string;
  language: SupportedLanguage;
}

export interface ExecutionResult {
  stdout: string;
  stderr: string;
  timedOut: boolean;
  exitCode: number | null;
}
