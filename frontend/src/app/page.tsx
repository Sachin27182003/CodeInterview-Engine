"use client";

import Editor from "@monaco-editor/react";
import Vapi from "@vapi-ai/web";
import { io } from "socket.io-client";
import { useEffect, useRef, useState } from "react";

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
type JobProgress = {
  phase?: JobPhase | "completed";
  executionResult?: Omit<ExecutionResult, "interview">;
  interview?: ExecutionResult["interview"];
};

type JobResponse = {
  jobId: string;
  status: JobStatus;
  result?: ExecutionResult;
  error?: string;
  progress?: JobProgress;
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
  "Given an array of integers and a target value, return the indices of two different elements whose sum equals the target. Expected time complexity: O(n). Expected space complexity: O(n).";
const vapiPublicKey = process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY;
const vapiAssistantId = process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID;

function getVoiceErrorMessage(error: unknown): string {
  if (!error || typeof error !== "object") {
    return "Voice interview is unavailable. Please try again later.";
  }

  const root = error as {
    error?: { error?: { message?: unknown }; message?: unknown };
    message?: unknown;
  };
  const nestedMessage = root.error?.error?.message;
  const message =
    typeof nestedMessage === "string"
      ? nestedMessage
      : typeof root.error?.message === "string"
        ? root.error.message
        : typeof root.message === "string"
          ? root.message
          : "";

  if (message.toLowerCase().includes("wallet balance is 0")) {
    return "Voice interview is temporarily unavailable because the Vapi account has no credits.";
  }
  return message || "Voice interview is unavailable. Please try again later.";
}

export default function Home() {
  const [language, setLanguage] = useState<Language>("javascript");
  const [code, setCode] = useState(examples.javascript);
  const [result, setResult] = useState<ExecutionResult | null>(null);
  const [error, setError] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [problemDescription, setProblemDescription] = useState(defaultProblem);
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState("Voice assistant is ready");
  const [voiceError, setVoiceError] = useState("");
  const vapiRef = useRef<Vapi | null>(null);
  const spokenFeedbackRef = useRef<string | null>(null);
  const voiceStartedRef = useRef(false);
  const callStartResolverRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!jobId) return;

    const socket = io(apiUrl);
    socket.emit("job:subscribe", jobId);
    socket.on("job:progress", (payload: { jobId: string; progress: JobProgress }) => {
      if (payload.jobId !== jobId) return;
      const { progress } = payload;
      if (progress.phase === "executing" || progress.phase === "interviewing") {
        setJobStatus("active");
      }
      if (progress.executionResult) {
        setResult((currentResult) => currentResult ?? progress.executionResult ?? null);
      }
    });

    socket.on("job:completed", (payload: { jobId: string; result?: ExecutionResult }) => {
      if (payload.jobId !== jobId) return;
      if (payload.result) setResult(payload.result);
      setJobStatus("completed");
      setIsRunning(false);
      setJobId(null);
    });

    socket.on("job:failed", (payload: { jobId: string; error?: string }) => {
      if (payload.jobId !== jobId) return;
      setError(payload.error ?? "Code execution failed");
      setJobStatus("failed");
      setIsRunning(false);
      setJobId(null);
    });

    socket.on("connect_error", () => {
      setError("Unable to connect to the real-time execution service");
      setIsRunning(false);
      setJobId(null);
    });

    return () => {
      socket.emit("job:unsubscribe", jobId);
      socket.disconnect();
    };
  }, [jobId]);

  useEffect(() => {
    if (!vapiPublicKey || !vapiAssistantId) return;
    const vapi = new Vapi(vapiPublicKey);
    vapiRef.current = vapi;
    vapi.on("call-start", () => {
      voiceStartedRef.current = true;
      callStartResolverRef.current?.();
      callStartResolverRef.current = null;
      setIsVoiceActive(true);
      setVoiceStatus("Listening for your response...");
    });
    vapi.on("call-end", () => {
      voiceStartedRef.current = false;
      setIsVoiceActive(false);
      setIsSpeaking(false);
      setVoiceStatus("Voice session ended. Run code again to restart it.");
    });
    vapi.on("speech-start", () => {
      setIsSpeaking(true);
      setVoiceStatus("AI interviewer is speaking...");
    });
    vapi.on("speech-end", () => {
      setIsSpeaking(false);
      setVoiceStatus("Listening for your response...");
    });
    vapi.on("volume-level", (volume) => {
      if (volume > 0.03) {
        setIsSpeaking(true);
        setVoiceStatus("AI interviewer is speaking...");
      }
    });
    vapi.on("message", (message: unknown) => {
      if (!message || typeof message !== "object") return;
      const event = message as {
        type?: unknown;
        role?: unknown;
        transcriptType?: unknown;
        transcript?: unknown;
      };
      if (
        event.type === "transcript" &&
        event.role === "user" &&
        typeof event.transcript === "string" &&
        (event.transcriptType === undefined || event.transcriptType === "final")
      ) {
        setVoiceStatus("AI interviewer is thinking...");
      }
    });
    vapi.on("error", (voiceErrorEvent) => {
      const message = getVoiceErrorMessage(voiceErrorEvent);
      if (!message.toLowerCase().includes("meeting has ended")) {
        setVoiceError(message);
      }
      voiceStartedRef.current = false;
      setIsVoiceActive(false);
      setIsSpeaking(false);
      setVoiceStatus(message);
    });
    return () => {
      if (voiceStartedRef.current) {
        void vapi.stop().catch(() => undefined);
      }
      vapiRef.current = null;
    };
  }, []);

  useEffect(() => {
    const feedback = result?.interview;
    if (
      !feedback?.available ||
      !feedback.response ||
      !vapiRef.current ||
      !vapiAssistantId ||
      voiceError ||
      spokenFeedbackRef.current === feedback.response
    ) {
      return;
    }

    spokenFeedbackRef.current = feedback.response;
    const speakFeedback = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("Microphone access is not available in this browser");
        }
        const microphone = await navigator.mediaDevices.getUserMedia({ audio: true });
        microphone.getTracks().forEach((track) => track.stop());
        if (!isVoiceActive) {
          voiceStartedRef.current = false;
          const callStarted = new Promise<void>((resolve) => {
            callStartResolverRef.current = resolve;
          });
          await vapiRef.current?.start(vapiAssistantId, {
            firstMessageMode: "assistant-waits-for-user",
            firstMessageInterruptionsEnabled: false,
            maxDurationSeconds: 1800,
            startSpeakingPlan: { waitSeconds: 0.6 },
            stopSpeakingPlan: { numWords: 1, voiceSeconds: 0.2, backoffSeconds: 0.8 },
          });
          if (!voiceStartedRef.current) {
            await Promise.race([
              callStarted,
              new Promise<void>((_, reject) =>
                window.setTimeout(
                  () => reject(new Error("Vapi call did not start")),
                  15_000,
                ),
              ),
            ]);
          }
        }
        vapiRef.current?.say(feedback.response);
      } catch (voiceStartError) {
        callStartResolverRef.current = null;
        setVoiceError(getVoiceErrorMessage(voiceStartError));
        setIsVoiceActive(false);
        setIsSpeaking(false);
      }
    };

    void speakFeedback();
  }, [result, isVoiceActive, voiceError]);

  const endVoiceCall = async () => {
    if (!vapiRef.current || !voiceStartedRef.current) return;

    try {
      await vapiRef.current.stop();
    } catch (voiceStopError) {
      setVoiceError(getVoiceErrorMessage(voiceStopError));
    } finally {
      voiceStartedRef.current = false;
      setIsVoiceActive(false);
      setIsSpeaking(false);
      setVoiceStatus("Voice session ended.");
    }
  };

  const handleLanguageChange = (nextLanguage: Language) => {
    setLanguage(nextLanguage);
    setCode(examples[nextLanguage]);
    setResult(null);
    setError("");
    setVoiceError("");
    spokenFeedbackRef.current = null;
  };

  const runCode = async () => {
    setIsRunning(true);
    setJobStatus("active");
    setError("");
    setResult(null);
    setVoiceError("");
    spokenFeedbackRef.current = null;

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
            <div className={`assistant-avatar${isSpeaking ? " speaking" : ""}`}>
              <div className="assistant-avatar-face" aria-hidden="true">
                ✦
              </div>
              <span>{voiceStatus}</span>
            </div>
            {isVoiceActive && (
              <button
                type="button"
                className="end-call-button"
                onClick={() => void endVoiceCall()}
              >
                End call
              </button>
            )}
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
            {voiceError && <span className="chat-note">{voiceError}</span>}
          </div>
        </aside>
      </section>
    </main>
  );
}
