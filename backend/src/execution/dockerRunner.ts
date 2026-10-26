import { spawn } from "node:child_process";
import type { ExecutionResult, SupportedLanguage } from "./types.js";

const IMAGE = process.env["CODE_EXECUTION_IMAGE"] ?? "codeoracle-runner:latest";
const TIMEOUT_MS = 30_000;
const MAX_OUTPUT_BYTES = 64 * 1024;
const MAX_MEMORY = "128m";

const commandForLanguage: Record<SupportedLanguage, string[]> = {
  javascript: ["/usr/local/bin/run-code", "javascript"],
  python: ["/usr/local/bin/run-code", "python"],
  java: ["/usr/local/bin/run-code", "java"],
  c: ["/usr/local/bin/run-code", "c"],
  cpp: ["/usr/local/bin/run-code", "cpp"],
};

function appendOutput(current: string, chunk: Buffer): string {
  const remaining = MAX_OUTPUT_BYTES - Buffer.byteLength(current, "utf8");
  if (remaining <= 0) return current;

  const text = chunk.subarray(0, remaining).toString("utf8");
  return current + text;
}

export function runInDocker(code: string, language: SupportedLanguage): Promise<ExecutionResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "docker",
      [
        "run",
        "--rm",
        "--interactive",
        "--network=none",
        "--memory",
        MAX_MEMORY,
        "--memory-swap",
        MAX_MEMORY,
        "--cpus=0.5",
        "--pids-limit=64",
        "--read-only",
        "--cap-drop=ALL",
        "--security-opt=no-new-privileges",
        "--tmpfs",
        "/tmp:rw,nosuid,size=16m",
        "--tmpfs",
        "/run/code:rw,exec,nosuid,size=16m",
        IMAGE,
        ...commandForLanguage[language],
      ],
      { stdio: ["pipe", "pipe", "pipe"] },
    );

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;

    const finish = (result: ExecutionResult): void => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, TIMEOUT_MS);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout = appendOutput(stdout, chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = appendOutput(stderr, chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      if (!settled) {
        settled = true;
        reject(error);
      }
    });
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      finish({ stdout, stderr, timedOut: timedOut || exitCode === 124, exitCode });
    });

    child.stdin.end(code);
  });
}
