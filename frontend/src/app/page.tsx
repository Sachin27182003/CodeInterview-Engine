"use client";

import Editor from "@monaco-editor/react";
import { useEffect, useState } from "react";

type Language = "javascript" | "python" | "java" | "c" | "cpp";

type ExecutionResult = {
  stdout: string;
  stderr: string;
  timedOut: boolean;
  exitCode: number | null;
};

type JobStatus = "queued" | "waiting" | "active" | "completed" | "failed";

type JobResponse = {
  jobId: string;
  status: JobStatus;
  result?: ExecutionResult;
  error?: string;
};

const examples: Record<Language, string> = {
  javascript: 'console.log("Hello from CodeOracle!");',
  python: 'print("Hello from CodeOracle!")',
  java: `public class Main {
  public static void main(String[] args) {
    System.out.println("Hello from CodeOracle!");
  }
}`,
  c: `#include <stdio.h>

int main(void) {
  printf("Hello from CodeOracle!\\n");
  return 0;
}`,
  cpp: `#include <iostream>

int main() {
  std::cout << "Hello from CodeOracle!\\n";
  return 0;
}`,
};

const apiUrl = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:3001";

export default function Home() {
  const [language, setLanguage] = useState<Language>("javascript");
  const [code, setCode] = useState(examples.javascript);
  const [result, setResult] = useState<ExecutionResult | null>(null);
  const [error, setError] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);

  useEffect(() => {
    if (!jobId) return;

    let cancelled = false;
    const pollStatus = async () => {
      try {
        const response = await fetch(`${apiUrl}/status/${encodeURIComponent(jobId)}`);
        const payload = (await response.json()) as JobResponse | { error?: string };
        if (!response.ok) {
          throw new Error("error" in payload && payload.error ? payload.error : "Unable to read execution status");
        }
        if (cancelled) return;

        const job = payload as JobResponse;
        setJobStatus(job.status);
        if (job.status === "completed" && job.result) {
          setResult(job.result);
          setIsRunning(false);
          setJobId(null);
        } else if (job.status === "failed") {
          setError(job.error ?? "Code execution failed");
          setIsRunning(false);
          setJobId(null);
        }
      } catch (requestError) {
        if (cancelled) return;
        setError(requestError instanceof Error ? requestError.message : "Unable to read execution status");
        setIsRunning(false);
        setJobId(null);
      }
    };

    void pollStatus();
    const intervalId = window.setInterval(() => void pollStatus(), 250);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [jobId]);

  const handleLanguageChange = (nextLanguage: Language) => {
    setLanguage(nextLanguage);
    setCode(examples[nextLanguage]);
    setResult(null);
    setError("");
  };

  const runCode = async () => {
    setIsRunning(true);
    setError("");
    setResult(null);
    setJobStatus(null);

    try {
      const response = await fetch(`${apiUrl}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, language }),
      });
      const payload = (await response.json()) as JobResponse | { error?: string };

      if (!response.ok) {
        throw new Error("error" in payload && payload.error ? payload.error : "Unable to queue code execution");
      }

      setJobId((payload as JobResponse).jobId);
      setJobStatus("queued");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to reach the execution service");
      setIsRunning(false);
      return;
    }
  };

  return (
    <main className="editor-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">CODEORACLE</p>
          <h1>Code editor</h1>
        </div>
        <div className="toolbar">
          <label htmlFor="language">Language</label>
          <select
            id="language"
            value={language}
            onChange={(event) => handleLanguageChange(event.target.value as Language)}
          >
            <option value="javascript">JavaScript</option>
            <option value="python">Python</option>
            <option value="java">Java</option>
            <option value="c">C</option>
            <option value="cpp">C++</option>
          </select>
          <button type="button" className="run-button" onClick={runCode} disabled={isRunning}>
            {isRunning ? `${jobStatus === "active" ? "Running" : "Queued"}...` : "Run Code"}
          </button>
        </div>
      </header>

      <section className="workspace">
        <div className="panel editor-panel">
          <div className="panel-heading">
            <span>Source</span>
            <span className="file-name">main.{language === "javascript" ? "js" : language}</span>
          </div>
          <div className="editor-container">
            <Editor
              height="100%"
              language={language === "cpp" ? "cpp" : language}
              theme="vs-dark"
              value={code}
              onChange={(value) => setCode(value ?? "")}
              options={{
                automaticLayout: true,
                minimap: { enabled: false },
                fontSize: 14,
                padding: { top: 16 },
                scrollBeyondLastLine: false,
              }}
            />
          </div>
        </div>

        <div className="panel output-panel">
          <div className="panel-heading">
            <span>Execution output</span>
            {jobStatus && jobStatus !== "completed" && jobStatus !== "failed" && (
              <span className="status-pending">{jobStatus === "active" ? "Running" : "Queued"}</span>
            )}
            {result && (
              <span className={result.exitCode === 0 && !result.timedOut ? "status-success" : "status-error"}>
                {result.timedOut ? "Timed out" : `Exit code ${result.exitCode ?? "—"}`}
              </span>
            )}
          </div>
          <pre className="output">
            {error ||
              (result
                ? `${result.stdout}${result.stderr ? `\n${result.stderr}` : ""}`
                : jobStatus
                  ? `Job ${jobStatus}. Waiting for execution output...`
                  : "Run your code to see output here.")}
          </pre>
        </div>
      </section>
    </main>
  );
}
