"use client";

import Editor from "@monaco-editor/react";
import Vapi from "@vapi-ai/web";
import Link from "next/link";
import { io } from "socket.io-client";
import { useCallback, useEffect, useRef, useState } from "react";

type Language = "javascript" | "python" | "java" | "c" | "cpp";

type ExecutionResult = {
  stdout: string;
  stderr: string;
  timedOut: boolean;
  exitCode: number | null;
  executionTimeMs?: number;
  interview?: {
    response: string;
    available: boolean;
    score: number | null;
  };
};

type JobStatus = "queued" | "waiting" | "active" | "completed" | "failed";
type JobPhase = "executing" | "interviewing";
type InterviewPhase = "CodingPhase" | "AnalyzingPhase" | "InterviewPhase";
type JobProgress = {
  phase?: JobPhase | "completed";
  executionResult?: Omit<ExecutionResult, "interview">;
  interview?: ExecutionResult["interview"];
};

type JobResponse = {
  jobId: string;
  submissionId: string;
  status: JobStatus;
  result?: ExecutionResult;
  error?: string;
  progress?: JobProgress;
};

type InterviewProblem = {
  slug: string;
  title: string;
  description: string;
  boilerplateCode: Record<string, string> | string;
  isExecutable: boolean;
};

type TranscriptEntry = { role: "user" | "assistant"; text: string };

type BrowserSpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onend: (() => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onresult: ((event: {
    resultIndex: number;
    results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
  }) => void) | null;
  start: () => void;
  stop: () => void;
};

type BrowserSpeechWindow = Window & {
  SpeechRecognition?: new () => BrowserSpeechRecognition;
  webkitSpeechRecognition?: new () => BrowserSpeechRecognition;
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

const languages: Language[] = ["javascript", "python", "java", "c", "cpp"];

function getProblemBoilerplate(problem: InterviewProblem, language: Language): string | undefined {
  if (typeof problem.boilerplateCode === "string") {
    return language === "javascript" ? problem.boilerplateCode : undefined;
  }
  return problem.boilerplateCode[language];
}

function getProblemLanguages(problem: InterviewProblem): Language[] {
  if (typeof problem.boilerplateCode === "string") return ["javascript"];
  const boilerplateCode = problem.boilerplateCode;
  return languages.filter((language) => typeof boilerplateCode[language] === "string");
}

const apiUrl = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:3001";
const defaultProblem = "Loading a role-specific interview problem...";
const vapiPublicKey = process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY;
const vapiAssistantId = process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID;
const useVapi = process.env.NEXT_PUBLIC_USE_VAPI === "true";

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
  const [problem, setProblem] = useState<InterviewProblem | null>(null);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [showReport, setShowReport] = useState(false);
  const [phase, setPhase] = useState<InterviewPhase>("CodingPhase");
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [isVoiceStarting, setIsVoiceStarting] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState("Voice assistant is ready");
  const [voiceError, setVoiceError] = useState("");
  const [textAnswer, setTextAnswer] = useState("");
  const vapiRef = useRef<Vapi | null>(null);
  const voiceStartedRef = useRef(false);
  const callStartResolverRef = useRef<(() => void) | null>(null);
  const startedFeedbackRef = useRef<string | null>(null);
  const browserRecognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const browserVoiceActiveRef = useRef(false);
  const manualVoiceStopRef = useRef(false);
  const browserFallbackTimerRef = useRef<number | null>(null);
  const resultRef = useRef(result);
  const submissionIdRef = useRef<string | null>(null);
  const interviewContextRef = useRef({ code, language, problemDescription });
  const deflectionCountRef = useRef(0);
  const followUpCountRef = useRef(0);
  const followUpTargetRef = useRef(7);
  resultRef.current = result;

  const saveTranscript = useCallback((role: "user" | "assistant", text: string) => {
    const submissionId = submissionIdRef.current;
    if (!submissionId || !text.trim()) return;
    setTranscript((current) => [...current, { role, text: text.trim() }].slice(-100));
    void fetch(`/api/reports/${submissionId}/transcript`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, text: text.trim(), timestamp: new Date().toISOString() }),
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    void fetch("/api/interview/problem")
      .then(async (response) => {
        const payload = (await response.json()) as { problem?: InterviewProblem; error?: string };
        if (!response.ok || !payload.problem) throw new Error(payload.error ?? "Could not load an interview problem");
        setProblem(payload.problem);
        setProblemDescription(payload.problem.description);
        setCode(getProblemBoilerplate(payload.problem, "javascript") ?? examples.javascript);
      })
      .catch((problemError: unknown) =>
        setError(problemError instanceof Error ? problemError.message : "Could not load an interview problem"),
      );
  }, []);

  useEffect(() => {
    interviewContextRef.current = { code, language, problemDescription };
  }, [code, language, problemDescription]);

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
      if (progress.phase === "interviewing") {
        setPhase("AnalyzingPhase");
      }
      if (progress.phase === "completed") {
        if (progress.executionResult) {
          setResult({
            ...progress.executionResult,
            interview: progress.interview,
          });
        }
        setPhase("InterviewPhase");
        setJobStatus("completed");
        setIsRunning(false);
        setJobId(null);
        return;
      }
      if (progress.executionResult) {
        setResult((currentResult) => currentResult ?? progress.executionResult ?? null);
        setPhase("AnalyzingPhase");
      }
    });

    socket.on("job:completed", (payload: { jobId: string; result?: ExecutionResult }) => {
      if (payload.jobId !== jobId) return;
      if (payload.result) {
        setResult(payload.result);
        setPhase("InterviewPhase");
      }
      setJobStatus("completed");
      setIsRunning(false);
      setJobId(null);
    });

    socket.on("job:failed", (payload: { jobId: string; error?: string }) => {
      if (payload.jobId !== jobId) return;
      setError(payload.error ?? "Code execution failed");
      setPhase("CodingPhase");
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
    if (!useVapi || !vapiPublicKey || !vapiAssistantId) return;
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
      if (!manualVoiceStopRef.current && resultRef.current?.interview?.available) {
        setVoiceStatus("Vapi ended the call. Switching to browser voice mode...");
        browserFallbackTimerRef.current = window.setTimeout(() => {
          browserFallbackTimerRef.current = null;
          if (!manualVoiceStopRef.current && resultRef.current?.interview?.response) {
            startBrowserVoiceInterview(resultRef.current.interview.response);
          }
        }, 500);
      } else {
        setVoiceStatus("Voice session ended. Run code again to restart it.");
      }
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
        saveTranscript("user", event.transcript);
      } else if (
        event.type === "transcript" &&
        event.role === "assistant" &&
        typeof event.transcript === "string" &&
        (event.transcriptType === undefined || event.transcriptType === "final")
      ) {
        saveTranscript("assistant", event.transcript);
      }
    });
    vapi.on("error", (voiceErrorEvent) => {
      const message = getVoiceErrorMessage(voiceErrorEvent);
      const callEnded =
        message.toLowerCase().includes("meeting has ended") ||
        message.toLowerCase().includes("ejection");
      if (!callEnded) {
        setVoiceError(message);
      }
      voiceStartedRef.current = false;
      setIsVoiceActive(false);
      setIsSpeaking(false);
      if (callEnded && resultRef.current?.interview?.available) {
        setVoiceStatus("Vapi ended the call. Switching to browser voice mode...");
        browserFallbackTimerRef.current = window.setTimeout(() => {
          browserFallbackTimerRef.current = null;
          if (!manualVoiceStopRef.current && resultRef.current?.interview?.response) {
            startBrowserVoiceInterview(resultRef.current.interview.response);
          }
        }, 500);
      } else {
        setVoiceStatus(message);
      }
    });
    return () => {
      if (voiceStartedRef.current) {
        void vapi.stop().catch(() => undefined);
      }
      if (browserFallbackTimerRef.current !== null) {
        window.clearTimeout(browserFallbackTimerRef.current);
      }
      vapiRef.current = null;
    };
  }, [saveTranscript]);

  function startBrowserVoiceInterview(openingMessage: string): void {
    if (browserVoiceActiveRef.current) return;
    const speechWindow = window as BrowserSpeechWindow;
    const Recognition =
      speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setVoiceError("Voice input is unavailable in this browser. Use Google Chrome.");
      return;
    }

    browserRecognitionRef.current?.stop();
    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    browserRecognitionRef.current = recognition;
    browserVoiceActiveRef.current = true;
    manualVoiceStopRef.current = false;
    followUpCountRef.current = 0;
    followUpTargetRef.current = 5 + Math.floor(Math.random() * 6);
    setIsVoiceActive(true);
    setVoiceError("");

    const speak = (text: string) => {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.onstart = () => {
        setIsSpeaking(true);
        setVoiceStatus("AI interviewer is speaking...");
      };
      utterance.onend = () => {
        setIsSpeaking(false);
        if (browserVoiceActiveRef.current) {
          setVoiceStatus("Listening for your response...");
          try {
            recognition.start();
          } catch {
            // Recognition is already active; keep the existing listener.
          }
        }
      };
      saveTranscript("assistant", text);
      window.speechSynthesis.speak(utterance);
    };

    recognition.onresult = (event) => {
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const speechResult = event.results[index];
        if (!speechResult.isFinal) continue;
        const userMessage = speechResult[0]?.transcript.trim();
        if (!userMessage) continue;
        recognition.stop();
        saveTranscript("user", userMessage);
        followUpCountRef.current += 1;
        setVoiceStatus("AI interviewer is thinking...");
        void fetch("/api/interview/respond", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...interviewContextRef.current,
            userMessage,
            deflectionCount: deflectionCountRef.current,
            followUpNumber: followUpCountRef.current,
            followUpTarget: followUpTargetRef.current,
          }),
        })
          .then(async (response) => {
            const payload = (await response.json()) as {
              response?: string;
              error?: string;
              strike?: number;
              terminated?: boolean;
              penaltyApplied?: boolean;
            };
            if (!response.ok || !payload.response) {
              throw new Error(payload.error ?? "The AI interviewer could not respond");
            }
            if (typeof payload.strike === "number") deflectionCountRef.current = payload.strike;
            if (payload.penaltyApplied) {
              setResult((current) =>
                current?.interview
                  ? { ...current, interview: { ...current.interview, score: Math.max(0, (current.interview.score ?? 0) - 40) } }
                  : current,
              );
            }
            speak(payload.response);
            if (payload.terminated || followUpCountRef.current >= followUpTargetRef.current) {
              window.setTimeout(() => {
                browserVoiceActiveRef.current = false;
                recognition.stop();
                setIsVoiceActive(false);
                setShowReport(true);
                setPhase("InterviewPhase");
              }, 1500);
            }
          })
          .catch((responseError: unknown) => {
            setVoiceError(
              responseError instanceof Error
                ? responseError.message
                : "The AI interviewer could not respond",
            );
            setVoiceStatus("Listening for your response...");
          });
      }
    };
    recognition.onerror = (event) => {
      if (event.error !== "no-speech" && event.error !== "aborted") {
        setVoiceError(`Browser voice input error: ${event.error ?? "unknown error"}`);
      }
    };
    recognition.onend = () => {
      if (browserVoiceActiveRef.current && !window.speechSynthesis.speaking) {
        try {
          recognition.start();
        } catch {
          // Recognition is already active; keep the existing listener.
        }
      }
    };

    speak(openingMessage);
  }

  const startVoiceInterview = useCallback(async () => {
    const feedback = result?.interview;
    if (
      !feedback?.available ||
      !feedback.response ||
      isVoiceActive ||
      isVoiceStarting
    ) {
      return;
    }

    setIsVoiceStarting(true);
    setVoiceError("");
    setVoiceStatus("Requesting microphone access...");
    try {
      if (!useVapi || !vapiRef.current || !vapiAssistantId) {
        startBrowserVoiceInterview(feedback.response);
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Microphone access is not available in this browser");
      }
      const microphone = await navigator.mediaDevices.getUserMedia({ audio: true });
      microphone.getTracks().forEach((track) => track.stop());
      voiceStartedRef.current = false;
      const callStarted = new Promise<void>((resolve) => {
        callStartResolverRef.current = resolve;
      });
      await vapiRef.current.start(vapiAssistantId, {
        firstMessage: feedback.response,
        firstMessageMode: "assistant-speaks-first",
        firstMessageInterruptionsEnabled: true,
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
    } catch (voiceStartError) {
      callStartResolverRef.current = null;
      const message = getVoiceErrorMessage(voiceStartError);
      setVoiceError(message);
      setIsVoiceActive(false);
      setIsSpeaking(false);
      if (feedback.available) {
        setVoiceStatus("Vapi could not start. Switching to browser voice mode...");
        startBrowserVoiceInterview(feedback.response);
      } else {
        setVoiceStatus("Voice assistant is ready to start again.");
      }
    } finally {
      setIsVoiceStarting(false);
    }
  }, [isVoiceActive, isVoiceStarting, result, saveTranscript]);

  useEffect(() => {
    const feedback = result?.interview;
    if (
      !feedback?.available ||
      !feedback.response ||
      startedFeedbackRef.current === feedback.response
    ) {
      return;
    }
    startedFeedbackRef.current = feedback.response;
    window.setTimeout(() => void startVoiceInterview(), 0);
  }, [result, startVoiceInterview]);

  const endVoiceCall = async () => {
    manualVoiceStopRef.current = true;
    if (browserFallbackTimerRef.current !== null) {
      window.clearTimeout(browserFallbackTimerRef.current);
      browserFallbackTimerRef.current = null;
    }
    browserVoiceActiveRef.current = false;
    browserRecognitionRef.current?.stop();
    browserRecognitionRef.current = null;
    window.speechSynthesis.cancel();
    if (!vapiRef.current || !voiceStartedRef.current) {
      setIsVoiceActive(false);
      setIsSpeaking(false);
      setVoiceStatus("Voice session ended.");
      setShowReport(true);
      setPhase("InterviewPhase");
      return;
    }

    try {
      await vapiRef.current.stop();
    } catch (voiceStopError) {
      setVoiceError(getVoiceErrorMessage(voiceStopError));
    } finally {
      voiceStartedRef.current = false;
      setIsVoiceActive(false);
      setIsSpeaking(false);
      setVoiceStatus("Voice session ended.");
      setShowReport(true);
    }
  };

  const handleLanguageChange = (nextLanguage: Language) => {
    setLanguage(nextLanguage);
    setCode(problem ? getProblemBoilerplate(problem, nextLanguage) ?? examples[nextLanguage] : examples[nextLanguage]);
    setResult(null);
    setError("");
    setVoiceError("");
  };

  const runCode = async () => {
    if (!problem) {
      setError("The interview problem is still loading.");
      return;
    }
    if (problem.isExecutable === false) setPhase("AnalyzingPhase");
    setIsRunning(true);
    setJobStatus("active");
    setError("");
    setResult(null);
    setTranscript([]);
    followUpCountRef.current = 0;
    deflectionCountRef.current = 0;
    startedFeedbackRef.current = null;
    setVoiceError("");
    setVoiceStatus("Voice assistant is ready");

    try {
      const response = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, language, problemDescription, problemSlug: problem.slug }),
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

      const queuedJob = payload as JobResponse;
      submissionIdRef.current = queuedJob.submissionId;
      setJobId(queuedJob.jobId);
      setJobStatus("active");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to reach the execution service",
      );
      setIsRunning(false);
      setPhase("CodingPhase");
      return;
    }
  };

  const submitTextAnswer = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const answer = textAnswer.trim();
    if (!answer || !result?.interview?.available) return;
    setTextAnswer("");
    followUpCountRef.current += 1;
    saveTranscript("user", answer);
    setVoiceStatus("AI interviewer is thinking...");
    try {
      const response = await fetch("/api/interview/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...interviewContextRef.current,
          userMessage: answer,
          deflectionCount: deflectionCountRef.current,
          followUpNumber: followUpCountRef.current,
          followUpTarget: followUpTargetRef.current,
        }),
      });
      const payload = (await response.json()) as {
        response?: string;
        error?: string;
        strike?: number;
        terminated?: boolean;
        penaltyApplied?: boolean;
      };
      if (!response.ok || !payload.response) throw new Error(payload.error ?? "The AI interviewer could not respond");
      if (typeof payload.strike === "number") deflectionCountRef.current = payload.strike;
      if (payload.penaltyApplied) {
        setResult((current) =>
          current?.interview
            ? { ...current, interview: { ...current.interview, score: Math.max(0, (current.interview.score ?? 0) - 40) } }
            : current,
        );
      }
      saveTranscript("assistant", payload.response);
      setVoiceStatus(payload.response);
      if (payload.terminated) setShowReport(true);
      if (payload.terminated) setPhase("InterviewPhase");
    } catch (answerError) {
      setVoiceError(answerError instanceof Error ? answerError.message : "The AI interviewer could not respond");
    }
  };

  if (showReport && result) {
    const score = result.interview?.score;
    const candidateAnswers = transcript.filter((entry) => entry.role === "user");
    const interviewerMessages = transcript.filter((entry) => entry.role === "assistant");
    const passedTests = result.stdout.match(/Passed\s+(\d+)\s*\/\s*(\d+)\s+tests?/i);
    const passedCount = passedTests ? Number(passedTests[1]) : null;
    const totalCount = passedTests ? Number(passedTests[2]) : null;
    const codeLines = code.split(/\r?\n/).length;
    const nonEmptyLines = code.split(/\r?\n/).filter((line) => line.trim()).length;
    const executionPassed = result.exitCode === 0 && !result.timedOut;
    const transcriptEntries = transcript.slice(-10);
    return (
      <main className="interview-report-page">
        <section className="interview-report-card">
          <p className="eyebrow">INTERVIEW COMPLETE</p>
          <div className="report-title-row">
            <div>
              <h1>Performance report</h1>
              <p className="report-problem-title">{problem?.title ?? "Technical interview"}</p>
            </div>
            <div className="report-overall-score">
              <span>AI score</span>
              <strong>{score === null || score === undefined ? "—" : `${score}`}<small>{score === null || score === undefined ? "" : "/100"}</small></strong>
            </div>
          </div>
          <p className="report-summary">
            {deflectionCountRef.current >= 2
              ? "The interview was terminated after repeated off-topic responses. Technical performance could not be established."
              : result.interview?.response ?? "The interview ended before AI feedback was available."}
          </p>
          <section className="report-section" aria-labelledby="report-execution-heading">
            <div className="report-section-heading">
              <div>
                <p className="eyebrow">SUBMISSION REVIEW</p>
                <h2 id="report-execution-heading">Execution and code details</h2>
              </div>
              <span className={`report-status ${executionPassed ? "is-passed" : "is-failed"}`}>
                {result.timedOut ? "Timed out" : executionPassed ? "Execution passed" : "Execution failed"}
              </span>
            </div>
            <div className="report-facts-grid">
              <div className="report-fact"><span>Language</span><strong>{language === "cpp" ? "C++" : language === "javascript" ? "JavaScript" : language.toUpperCase()}</strong></div>
              <div className="report-fact"><span>Runtime</span><strong>{typeof result.executionTimeMs === "number" ? `${result.executionTimeMs} ms` : "Unavailable"}</strong></div>
              <div className="report-fact"><span>Tests passed</span><strong>{passedTests ? `${passedCount} / ${totalCount}` : "No test summary returned"}</strong></div>
              <div className="report-fact"><span>Exit code</span><strong>{result.exitCode ?? "Unavailable"}</strong></div>
              <div className="report-fact"><span>Source lines</span><strong>{codeLines} total · {nonEmptyLines} non-empty</strong></div>
              <div className="report-fact"><span>Code size</span><strong>{code.length.toLocaleString()} characters</strong></div>
            </div>
            {result.stderr && (
              <details className="report-output-details">
                <summary>View compiler or runtime output</summary>
                <pre>{result.stderr}</pre>
              </details>
            )}
            {result.stdout && (
              <details className="report-output-details">
                <summary>View full execution output</summary>
                <pre>{result.stdout}</pre>
              </details>
            )}
            <details className="report-output-details">
              <summary>View submitted source code</summary>
              <pre className="report-source-code">{code}</pre>
            </details>
          </section>
          <section className="report-section" aria-labelledby="report-interview-heading">
            <div className="report-section-heading">
              <div>
                <p className="eyebrow">INTERVIEW SIGNAL</p>
                <h2 id="report-interview-heading">Conversation summary</h2>
              </div>
            </div>
            <div className="report-facts-grid report-interview-facts">
              <div className="report-fact"><span>Candidate responses</span><strong>{candidateAnswers.length}</strong></div>
              <div className="report-fact"><span>Interviewer messages</span><strong>{interviewerMessages.length}</strong></div>
              <div className="report-fact"><span>Interview status</span><strong>{deflectionCountRef.current >= 2 ? "Ended after repeated off-topic replies" : result.interview?.available ? "Feedback available" : "AI feedback unavailable"}</strong></div>
            </div>
            {transcriptEntries.length > 0 ? (
              <details className="report-transcript">
                <summary>View recent transcript ({transcript.length} messages)</summary>
                <ol>
                  {transcriptEntries.map((entry, index) => (
                    <li key={`${entry.role}-${index}`}>
                      <strong>{entry.role === "user" ? "You" : "Interviewer"}</strong>
                      <p>{entry.text}</p>
                    </li>
                  ))}
                </ol>
              </details>
            ) : (
              <p className="report-empty-note">No interview responses were recorded for this submission.</p>
            )}
          </section>
          <div className="report-details">
            <p><strong>Assessment basis:</strong> The AI score reflects the interview feedback. Execution and test counts above come directly from the code runner; category-level scores are not generated.</p>
            <p><strong>Candidate replies recorded:</strong> {candidateAnswers.length}. Message counts come from the saved transcript and may exclude speech that was not transcribed.</p>
          </div>
          <Link className="primary-cta report-home-button" href="/">Return to Home Page <span aria-hidden="true">-&gt;</span></Link>
        </section>
      </main>
    );
  }

  if (phase === "AnalyzingPhase") {
    return (
      <main
        className="min-h-screen bg-slate-950 px-6 text-center text-slate-100 flex flex-col items-center justify-center"
        aria-live="polite"
      >
        <div className="mb-8 grid h-44 w-44 place-items-center rounded-full border border-purple-300/70 bg-gradient-to-br from-purple-300 via-violet-700 to-purple-950 text-6xl text-white shadow-[0_0_80px_rgba(168,85,247,0.55)] animate-pulse">
          <span aria-hidden="true">✦</span>
        </div>
        <p className="mb-3 text-xs font-bold uppercase tracking-[0.3em] text-blue-400">
          LIVE TECHNICAL INTERVIEW
        </p>
        <h1 className="text-4xl font-semibold tracking-tight text-white">
          {problem?.title ?? "Reviewing code structure..."}
        </h1>
        <p className="mt-4 text-base text-slate-400">Reviewing your submission...</p>
      </main>
    );
  }

  if (phase === "InterviewPhase") {
    return (
      <main className="avatar-interview-page">
        <div className={`avatar-orb${isSpeaking ? " speaking" : ""}`} aria-hidden="true">✦</div>
        <p className="eyebrow">LIVE TECHNICAL INTERVIEW</p>
        <h1>{problem?.title ?? "AI Interviewer"}</h1>
        <p>{result ? voiceStatus : "Reviewing your submission..."}</p>
        {result?.interview?.available && !isVoiceActive && (
          <button type="button" className="start-voice-button" onClick={() => void startVoiceInterview()} disabled={isVoiceStarting}>
            {isVoiceStarting ? "Starting interview..." : "Start interview"}
          </button>
        )}
        {result && !result.interview?.available && (
          <button type="button" className="start-voice-button" onClick={() => setShowReport(true)}>
            View assessment report
          </button>
        )}
        <div className="avatar-transcript">
          {transcript.slice(-4).map((entry, index) => <p key={`${entry.role}-${index}`}><strong>{entry.role === "user" ? "You" : "Interviewer"}:</strong> {entry.text}</p>)}
        </div>
        {result?.interview?.available && !isVoiceActive && (
          <form className="avatar-answer-form" onSubmit={submitTextAnswer}>
            <label htmlFor="text-answer">Answer the interviewer</label>
            <textarea
              id="text-answer"
              value={textAnswer}
              onChange={(event) => setTextAnswer(event.target.value)}
              placeholder="Explain your approach..."
              rows={3}
            />
            <button type="submit" className="start-voice-button">Send answer</button>
          </form>
        )}
        {isVoiceActive && (
          <button type="button" className="end-call-button" onClick={() => void endVoiceCall()}>End interview</button>
        )}
      </main>
    );
  }

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
            disabled={!problem}
            onChange={(event) =>
              handleLanguageChange(event.target.value as Language)
            }
          >
            {languages.map((option) => (
              <option
                key={option}
                value={option}
                disabled={problem ? !getProblemLanguages(problem).includes(option) : true}
              >
                {option === "cpp" ? "C++" : option === "javascript" ? "JavaScript" : option === "python" ? "Python" : option.toUpperCase()}
              </option>
            ))}
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
              : problem?.isExecutable === false
                ? "Analyze Code"
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

        {problem?.isExecutable !== false && <div className="panel output-panel">
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
        </div>}

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
            {result?.interview?.available && !isVoiceActive && (
              <button
                type="button"
                className="start-voice-button"
                onClick={() => void startVoiceInterview()}
                disabled={isVoiceStarting}
              >
                {isVoiceStarting ? "Starting voice interview..." : "Start voice interview"}
              </button>
            )}
            <div className="chat-bubble interviewer">
              <span className="chat-author">AI interviewer</span>
              {result
                ? result.interview?.response ?? "Execution finished. Waiting for interview feedback..."
                : "Run your code and I will review the result without giving away the solution."}
            </div>
            {result?.interview?.score !== null && result?.interview?.score !== undefined && (
              <span className="chat-note">AI assessment score: {result.interview.score}/100</span>
            )}
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
