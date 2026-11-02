"use client";

import Editor from "@monaco-editor/react";
import { useEffect, useState } from "react";

type Language = "javascript" | "python" | "java" | "c" | "cpp";

type ExecutionResult = {
  stdout: string;
  stderr: string;
  timedOut: boolean;
  exitCode: number | null;
  interview?: {
    response: string;
    available: boolean;
  };
};

type JobStatus = "queued" | "waiting" | "active" | "completed" | "failed";
type JobPhase = "executing" | "interviewing";

type JobResponse = {
  jobId: string;
  status: JobStatus;
  result?: ExecutionResult;
  error?: string;
  progress?: {
    phase?: JobPhase;
    executionResult?: Omit<ExecutionResult, "interview">;
  };
};

const examples: Record<Language, string> = {
  javascript: `function twoSum(nums, target) {
  // Return the two indices whose values add up to target.
}`,
  python: `def two_sum(nums, target):
    # Return the two indices whose values add up to target.
    pass`,
  java: `class Solution {
  public int[] twoSum(int[] nums, int target) {
    return new int[] {};
  }
}`,
  c: `#include <stddef.h>

void two_sum(const int *nums, int length, int target, int result[2]) {
  // Write the two matching indices into result.
}`,
  cpp: `#include <vector>

std::vector<int> twoSum(const std::vector<int>& nums, int target) {
  return {};
}`,
};

const apiUrl = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:3001";
const defaultProblem =
  "Implement only the required function (do not write a main program or read input). Given an array of integers and a target value, return the indices of two different elements whose sum equals the target. Assume exactly one valid pair exists. Hidden test cases will call your function. Aim for better than O(n²) time and explain the trade-off of your approach.";

export default function Home() {
  const [language, setLanguage] = useState<Language>("javascript");
  const [code, setCode] = useState(examples.javascript);
  const [result, setResult] = useState<ExecutionResult | null>(null);
  const [error, setError] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [problemDescription, setProblemDescription] = useState(defaultProblem);

  useEffect(() => {
    if (!jobId) return;

    let cancelled = false;
    let requestInFlight = false;
    const pollStatus = async () => {
      if (requestInFlight) return;
      requestInFlight = true;
      try {
        const response = await fetch(
          `${apiUrl}/status/${encodeURIComponent(jobId)}`,
        );
        const payload = (await response.json()) as
          | JobResponse
          | { error?: string };
        if (!response.ok) {
          throw new Error(
            "error" in payload && payload.error
              ? payload.error
              : "Unable to read execution status",
          );
        }
        if (cancelled) return;

        const job = payload as JobResponse;
        const phase = job.progress?.phase;
        setJobStatus((currentStatus) => {
          if (job.status === "completed" || job.status === "failed") {
            return job.status;
          }
          return phase === "executing" || phase === "interviewing" || currentStatus === "active"
            ? "active"
            : job.status;
        });
        const executionResult = job.progress?.executionResult;
        if (job.status !== "completed" && executionResult) {
          setResult((currentResult) =>
            currentResult ?? {
              ...executionResult,
            },
          );
        }
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
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Unable to read execution status",
        );
        setIsRunning(false);
        setJobId(null);
      } finally {
        requestInFlight = false;
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
    setJobStatus("active");
    setError("");
    setResult(null);

    try {
      const response = await fetch(`${apiUrl}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, language, problemDescription }),
      });
      const payload = (await response.json()) as
        | JobResponse
        | { error?: string };

      if (!response.ok) {
        throw new Error(
          "error" in payload && payload.error
            ? payload.error
            : "Unable to queue code execution",
        );
      }

      setJobId((payload as JobResponse).jobId);
      setJobStatus("active");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to reach the execution service",
      );
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
            onChange={(event) =>
              handleLanguageChange(event.target.value as Language)
            }
          >
            <option value="javascript">JavaScript</option>
            <option value="python">Python</option>
            <option value="java">Java</option>
            <option value="c">C</option>
            <option value="cpp">C++</option>
          </select>
          <button
            type="button"
            className="run-button"
            onClick={runCode}
            disabled={isRunning}
          >
            {isRunning
              ? jobStatus === "active"
                ? "Running..."
                : jobStatus === "waiting"
                  ? "Waiting..."
                  : "Queued..."
              : "Run Code"}
          </button>
        </div>
      </header>

      <section className="workspace">
        <div className="panel editor-panel">
          <div className="panel-heading">
            <span>Source</span>
            <span className="file-name">
              main.{language === "javascript" ? "js" : language}
            </span>
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
            {jobStatus &&
              jobStatus !== "completed" &&
              jobStatus !== "failed" && (
                <span className="status-pending">
                  {jobStatus === "active"
                    ? "Running"
                    : jobStatus === "waiting"
                      ? "Waiting for worker"
                      : "Queued"}
                </span>
              )}
            {result && (
              <span
                className={
                  result.exitCode === 0 && !result.timedOut
                    ? "status-success"
                    : "status-error"
                }
              >
                {result.timedOut
                  ? "Timed out"
                  : `Exit code ${result.exitCode ?? "—"}`}
              </span>
            )}
          </div>
          <pre className="output">
            {error ||
              (result
                ? `${result.stdout}${result.stderr ? `\n${result.stderr}` : ""}`
                : jobStatus
                  ? jobStatus === "queued"
                    ? "Submission queued..."
                    : jobStatus === "waiting"
                      ? "Waiting for an execution worker..."
                    : jobStatus === "active"
                      ? "Code is running. Interview feedback will appear after execution..."
                      : `Job ${jobStatus}. Waiting for execution output...`
                  : "Run your code to see output here.")}
          </pre>
        </div>

        <aside className="panel interview-panel">
          <div className="panel-heading">
            <span>Interview panel</span>
            <span className="ai-badge">GEMINI</span>
          </div>
          <label className="problem-label" htmlFor="problem">
            Problem statement (function only)
          </label>
          <textarea
            id="problem"
            className="problem-input"
            value={problemDescription}
            onChange={(event) => setProblemDescription(event.target.value)}
            placeholder="Describe the problem you are solving..."
            rows={4}
          />
          <div className="chat-messages" aria-live="polite">
            <div className="chat-bubble interviewer">
              <span className="chat-author">AI interviewer</span>
              {result
                ? result.interview?.response ?? "Execution finished. Waiting for interview feedback..."
                : "Run your code and I will review the result without giving away the solution."}
            </div>
            {result && result.interview && !result.interview.available && (
              <span className="chat-note">
                Gemini feedback is currently unavailable.
              </span>
            )}
          </div>
        </aside>
      </section>
    </main>
  );
}
