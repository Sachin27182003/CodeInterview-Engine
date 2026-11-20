"use client";

import Editor from "@monaco-editor/react";
import Vapi from "@vapi-ai/web";
import Link from "next/link";
import { io } from "socket.io-client";
import { useCallback, useEffect, useRef, useState } from "react";

type Language = "javascript" | "python" | "java" | "c" | "cpp";
type Difficulty = "easy" | "medium" | "hard";

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
type CommunicationAssessment = {
  status: "assessed" | "limited" | "not_assessed" | "unavailable";
  interviewAnswerQuality: number | null;
  communicationClarity: number | null;
  englishProficiency: number | null;
  confidence: number | null;
  nervousnessIndicators: "low" | "moderate" | "high" | "not_assessed";
  summary: string;
  evidence: string[];
};

type BrowserSpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onend: (() => void) | null;
  onstart: (() => void) | null;
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
  javascript: "// Your selected interview question will appear shortly.\n// A matching starter template will load here.",
  python: "# Your selected interview question will appear shortly.\n# A matching starter template will load here.",
  java: "// Your selected interview question will appear shortly.\n// A matching starter template will load here.",
  c: "// Your selected interview question will appear shortly.\n// A matching starter template will load here.",
  cpp: "// Your selected interview question will appear shortly.\n// A matching starter template will load here.",
};

const languages: Language[] = ["javascript", "python", "java", "c", "cpp"];

function getProblemBoilerplate(problem: InterviewProblem, language: Language): string | undefined {
  if (problem.slug === "frontend-component-architecture") {
    return language === "javascript" ? designReviewStarter : undefined;
  }
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
const designReviewPrompt = `Design a React dashboard that displays live metrics and updates as new data arrives. Address each area:

1. Component structure and data flow: identify the page, data hook or service, metrics grid, reusable metric card, and status components. Explain each responsibility and how data moves between them.

2. State ownership: locate metrics, connection status, loading and error state, filters, and card-level UI state. Explain how unrelated changes avoid re-rendering the whole dashboard.

3. Data lifecycle: describe the initial request, live update subscription, cleanup, reconnection, and protection against stale or out-of-order updates.

4. User-facing states: cover initial loading, no data, request failure and retry, connection loss, and how you retain or label the last known values.

5. Rendering performance: explain how only changed metrics update, when stable props or memoization are useful, and how you would measure whether an optimization helps.

6. Accessibility: explain how to communicate live changes, loading, errors, and trends without overwhelming screen-reader users or relying on color alone.

7. Trade-offs and resilience: describe how the dashboard should behave when the metrics service is slow or unavailable.

Provide a few concise sentences or bullets under every heading.

Example scenario: A dashboard displays CPU usage, memory use, request rate, and error rate. Each metric updates every five seconds. If the live connection drops, the last known values remain visible with a stale-data indicator while the dashboard reconnects.`;
const designReviewStarter = `// STATIC DESIGN REVIEW — Executable code is not required.
// Respond in JavaScript comments (//) under each heading.
//
// 1. Component structure and data flow:
//
// 2. State ownership and boundaries:
//
// 3. Initial request, live updates, cleanup, and reconnection:
//
// 4. Loading, empty, error, and stale-data states:
//
// 5. Rendering performance and how to measure it:
//
// 6. Accessibility for live metric updates:
//
// 7. Trade-offs and resilience:
// Add a few concise sentences or bullets under every heading.`;
const vapiPublicKey = process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY;
const vapiAssistantId = process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID;
const useVapi = process.env.NEXT_PUBLIC_USE_VAPI === "true";

function getVoiceInterviewerInstructions(difficulty: Difficulty, questionTarget: number): string {
  return `You are a professional technical interviewer conducting a ${difficulty}-difficulty interview. The interview has a maximum of ${questionTarget} follow-up questions after the opening question. Ask one focused technical question at a time and keep control of the interview. If the candidate says "I don't know", "I'm not sure", or otherwise cannot answer, treat that as an honest answer, not a deflection. Briefly explain the correct concept or expected answer, then immediately say exactly: "Let's start with the next question." and ask one new, relevant technical question. Do not ask whether they have questions, offer open-ended tutoring, or stop to invite questions. Continue this pattern until the ${questionTarget}th follow-up question. After the final answer, give a short wrap-up and ask no more questions. If the candidate asks for clarification of the current technical question, answer briefly and return to the interview question.`;
}

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
  const [difficulty, setDifficulty] = useState<Difficulty | null>(null);
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
  const [communicationAssessment, setCommunicationAssessment] = useState<CommunicationAssessment | null>(null);
  const [isAssessingCommunication, setIsAssessingCommunication] = useState(false);
  const [communicationAssessmentError, setCommunicationAssessmentError] = useState("");
  const [phase, setPhase] = useState<InterviewPhase>("CodingPhase");
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [isVoiceStarting, setIsVoiceStarting] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState("");
  const [voiceError, setVoiceError] = useState("");
  const [micCheckStatus, setMicCheckStatus] = useState<"idle" | "checking" | "passed">("idle");
  const [textAnswer, setTextAnswer] = useState("");
  const [isReviewingTranscript, setIsReviewingTranscript] = useState(false);
  const [speechLanguage, setSpeechLanguage] = useState<"en-IN" | "en-US" | "en-GB">("en-IN");
  const [nextVoicePrompt, setNextVoicePrompt] = useState("");
  const vapiRef = useRef<Vapi | null>(null);
  const voiceStartedRef = useRef(false);
  const vapiInterviewCompleteRef = useRef(false);
  const callStartResolverRef = useRef<(() => void) | null>(null);
  const browserRecognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const browserVoiceActiveRef = useRef(false);
  const browserSpeakRef = useRef<((text: string, saveTranscriptEntry?: boolean) => void) | null>(null);
  const browserTranscriptBufferRef = useRef("");
  const browserTranscriptTimerRef = useRef<number | null>(null);
  const submissionIdRef = useRef<string | null>(null);
  const communicationAssessmentRequestedRef = useRef<string | null>(null);
  const transcriptSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const interviewContextRef = useRef({ code, language, problemDescription, difficulty: "medium" as Difficulty });
  const deflectionCountRef = useRef(0);
  const followUpCountRef = useRef(0);
  const followUpTargetRef = useRef(7);
  const testCasesPassed = problem?.isExecutable === false || Boolean(result && result.exitCode === 0 && !result.timedOut);

  const saveTranscript = useCallback((role: "user" | "assistant", text: string) => {
    const submissionId = submissionIdRef.current;
    if (!submissionId || !text.trim()) return;
    const entry = { role, text: text.trim() };
    setTranscript((current) => [...current, entry].slice(-100));
    transcriptSaveQueueRef.current = transcriptSaveQueueRef.current.then(async () => {
      try {
        await fetch(`/api/reports/${submissionId}/transcript`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...entry, timestamp: new Date().toISOString() }),
        });
      } catch {
        // Communication feedback can still be requested from the responses held in page state.
      }
    });
  }, []);

  useEffect(() => {
    if (!showReport) return;
    const submissionId = submissionIdRef.current;
    if (!submissionId || communicationAssessmentRequestedRef.current === submissionId) return;
    communicationAssessmentRequestedRef.current = submissionId;
    let active = true;
    setIsAssessingCommunication(true);
    setCommunicationAssessmentError("");
    setResult((current) => current?.interview
      ? { ...current, interview: { ...current.interview, score: null } }
      : current);
    void transcriptSaveQueueRef.current
      .then(async () => {
        const response = await fetch(`/api/reports/${submissionId}/communication-assessment`, { method: "POST" });
        const payload = (await response.json()) as { assessment?: CommunicationAssessment; overallScore?: number | null; error?: string };
        if (!response.ok || !payload.assessment) throw new Error(payload.error ?? "Could not assess interview communication");
        if (active) {
          setCommunicationAssessment(payload.assessment);
          setResult((current) => current?.interview
            ? { ...current, interview: { ...current.interview, score: payload.overallScore ?? null } }
            : current);
        }
      })
      .catch((assessmentError: unknown) => {
        if (active) setCommunicationAssessmentError(
          assessmentError instanceof Error ? assessmentError.message : "Communication assessment is unavailable",
        );
      })
      .finally(() => {
        if (active) setIsAssessingCommunication(false);
      });
    return () => { active = false; };
  }, [showReport]);

  useEffect(() => {
    if (!difficulty) return;
    setError("");
    setProblem(null);
    setProblemDescription(defaultProblem);
    void fetch(`/api/interview/problem?difficulty=${difficulty}`)
      .then(async (response) => {
        const payload = (await response.json()) as { problem?: InterviewProblem; error?: string };
        if (!response.ok || !payload.problem) throw new Error(payload.error ?? "Could not load an interview problem");
        setProblem(payload.problem);
        setProblemDescription(
          payload.problem.slug === "frontend-component-architecture"
            ? designReviewPrompt
            : payload.problem.description,
        );
        setCode(getProblemBoilerplate(payload.problem, "javascript") ?? examples.javascript);
      })
      .catch((problemError: unknown) =>
        setError(problemError instanceof Error ? problemError.message : "Could not load an interview problem"),
      );
  }, [difficulty]);

  useEffect(() => {
    interviewContextRef.current = { code, language, problemDescription, difficulty: difficulty ?? "medium" };
  }, [code, language, problemDescription, difficulty]);

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
      if (progress.phase === "completed") {
        if (progress.executionResult) {
          setResult({
            ...progress.executionResult,
            interview: progress.interview,
          });
          window.setTimeout(() => setPhase("InterviewPhase"), 2500);
        }
        setJobStatus("completed");
        setIsRunning(false);
        setJobId(null);
        return;
      }
      if (progress.executionResult) {
        setResult((currentResult) => currentResult ?? progress.executionResult ?? null);
        // Wait briefly after execution output arrives before opening the interview.
        if (progress.phase === "interviewing") {
          window.setTimeout(() => setPhase("InterviewPhase"), 2500);
        }
      }
    });

    socket.on("job:completed", (payload: { jobId: string; result?: ExecutionResult }) => {
      if (payload.jobId !== jobId) return;
      if (payload.result) {
        setResult(payload.result);
        window.setTimeout(() => setPhase("InterviewPhase"), 2500);
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
      setVoiceStatus("Voice session ended. Select Start interview to reconnect.");
    });
    vapi.on("speech-start", () => {
      setIsSpeaking(true);
      setVoiceStatus("AI interviewer is speaking...");
    });
    vapi.on("speech-end", () => {
      setIsSpeaking(false);
      if (vapiInterviewCompleteRef.current) {
        vapiInterviewCompleteRef.current = false;
        voiceStartedRef.current = false;
        setIsVoiceActive(false);
        setShowReport(true);
        setPhase("InterviewPhase");
        void vapi.stop().catch(() => undefined);
        return;
      }
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
        followUpCountRef.current += 1;
        setVoiceStatus("AI interviewer is thinking...");
        saveTranscript("user", event.transcript);
        if (followUpCountRef.current >= followUpTargetRef.current) {
          vapiInterviewCompleteRef.current = true;
          vapi.send({
            type: "add-message",
            message: {
              role: "system",
              content: "The candidate has just answered the final interview question. Give a brief closing summary now and ask no further questions.",
            },
          });
        }
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
      setVoiceError(message);
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
  }, [saveTranscript]);

  function startBrowserVoiceInterview(openingMessage: string, resume = false): void {
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
    recognition.lang = speechLanguage;
    browserRecognitionRef.current = recognition;
    browserVoiceActiveRef.current = true;
    browserTranscriptBufferRef.current = "";
    if (!resume) {
      followUpCountRef.current = 0;
      followUpTargetRef.current = difficulty === "easy" ? 5 : difficulty === "hard" ? 10 : 7;
    }
    vapiInterviewCompleteRef.current = false;
    setIsVoiceActive(true);
    setVoiceError("");

    const speak = (text: string, saveTranscriptEntry = true) => {
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
      if (saveTranscriptEntry) saveTranscript("assistant", text);
      window.speechSynthesis.speak(utterance);
    };
    browserSpeakRef.current = speak;

    recognition.onresult = (event) => {
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const speechResult = event.results[index];
        if (!speechResult.isFinal) continue;
        const userMessage = speechResult[0]?.transcript.trim();
        if (!userMessage) continue;
        browserTranscriptBufferRef.current = `${browserTranscriptBufferRef.current} ${userMessage}`.trim();
        setVoiceStatus("Capturing your response… pause when you have finished speaking.");
      }
      if (browserTranscriptTimerRef.current !== null) window.clearTimeout(browserTranscriptTimerRef.current);
      if (browserTranscriptBufferRef.current) {
        browserTranscriptTimerRef.current = window.setTimeout(() => {
          browserTranscriptTimerRef.current = null;
          const recognizedAnswer = browserTranscriptBufferRef.current.trim();
          browserTranscriptBufferRef.current = "";
          if (!recognizedAnswer) return;
          browserVoiceActiveRef.current = false;
          recognition.stop();
          setIsVoiceActive(false);
          setTextAnswer(recognizedAnswer);
          setIsReviewingTranscript(true);
          setVoiceStatus("Review the transcript, correct any mistakes, then send your complete answer.");
          setVoiceError("");
        }, 1800);
      }
    };
    recognition.onstart = () => {
      setVoiceError("");
      setVoiceStatus("Listening for your response...");
    };
    recognition.onerror = (event) => {
      if (event.error === "aborted") return;
      if (browserTranscriptTimerRef.current !== null) window.clearTimeout(browserTranscriptTimerRef.current);
      browserTranscriptTimerRef.current = null;
      browserTranscriptBufferRef.current = "";
      browserVoiceActiveRef.current = false;
      setIsVoiceActive(false);
      const message = event.error === "not-allowed"
        ? "Microphone access was blocked. Allow microphone permission in your browser, then start again."
        : event.error === "no-speech"
          ? "No speech was detected. Check your microphone, wait for the prompt to finish, then start again."
          : `Browser voice input error: ${event.error ?? "unknown error"}`;
      setVoiceError(message);
      setVoiceStatus("Voice input stopped. Start the interview again when ready.");
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
    const openingMessage = nextVoicePrompt || feedback?.response;
    if (
      !feedback?.available ||
      !openingMessage ||
      !testCasesPassed ||
      micCheckStatus !== "passed" ||
      isVoiceActive ||
      isVoiceStarting
    ) {
      return;
    }

    setIsVoiceStarting(true);
    setVoiceError("");
    setVoiceStatus("Requesting microphone access...");
    try {
      const isResume = Boolean(nextVoicePrompt);
      if (!isResume) {
        followUpCountRef.current = 0;
        followUpTargetRef.current = difficulty === "easy" ? 5 : difficulty === "hard" ? 10 : 7;
      }
      if (!useVapi || !vapiRef.current || !vapiAssistantId) {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("Microphone access is not available in this browser");
        }
        const microphone = await navigator.mediaDevices.getUserMedia({ audio: true });
        microphone.getTracks().forEach((track) => track.stop());
        startBrowserVoiceInterview(openingMessage, isResume);
        setNextVoicePrompt("");
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
        firstMessage: openingMessage,
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
      vapiRef.current?.send({
        type: "add-message",
        message: {
          role: "system",
          content: getVoiceInterviewerInstructions(difficulty ?? "medium", followUpTargetRef.current),
        },
      });
      setNextVoicePrompt("");
    } catch (voiceStartError) {
      callStartResolverRef.current = null;
      const message = getVoiceErrorMessage(voiceStartError);
      setVoiceError(message);
      setIsVoiceActive(false);
      setIsSpeaking(false);
      setVoiceStatus("Voice assistant could not connect. You can try browser voice or answer by text.");
    } finally {
      setIsVoiceStarting(false);
    }
  }, [isVoiceActive, isVoiceStarting, micCheckStatus, nextVoicePrompt, result, saveTranscript, speechLanguage, testCasesPassed]);

  const checkMicrophone = async () => {
    setMicCheckStatus("checking");
    setVoiceError("");
    setVoiceStatus("Say a short phrase while we check your microphone...");
    let stream: MediaStream | null = null;
    let audioContext: AudioContext | null = null;
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.AudioContext) {
        throw new Error("Microphone testing is not supported in this browser. Try the latest version of Chrome.");
      }
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const activeTrack = stream.getAudioTracks().find((track) => track.readyState === "live" && track.enabled);
      if (!activeTrack) throw new Error("No active microphone was found. Check your input device and browser permission.");
      audioContext = new AudioContext();
      await audioContext.resume();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 1024;
      audioContext.createMediaStreamSource(stream).connect(analyser);
      const samples = new Uint8Array(analyser.fftSize);
      const deadline = Date.now() + 3500;
      let detectedAudio = false;
      while (Date.now() < deadline && !detectedAudio) {
        analyser.getByteTimeDomainData(samples);
        const rms = Math.sqrt(samples.reduce((sum, sample) => sum + (sample - 128) ** 2, 0) / samples.length);
        detectedAudio = rms > 2.5;
        if (!detectedAudio) await new Promise((resolve) => window.setTimeout(resolve, 100));
      }
      if (!detectedAudio) throw new Error("No voice was detected. Check the selected microphone, then try again while speaking.");
      setMicCheckStatus("passed");
      setVoiceStatus("Microphone check passed. You can start the interview.");
    } catch (error) {
      setMicCheckStatus("idle");
      setVoiceError(getVoiceErrorMessage(error));
      setVoiceStatus("Microphone check did not pass. Check the device and try again.");
    } finally {
      stream?.getTracks().forEach((track) => track.stop());
      if (audioContext && audioContext.state !== "closed") await audioContext.close();
    }
  };

  const startBrowserVoiceManually = async () => {
    const feedback = result?.interview;
    const openingMessage = nextVoicePrompt || feedback?.response;
    if (!feedback?.available || !openingMessage || !testCasesPassed || micCheckStatus !== "passed" || isVoiceStarting || isVoiceActive) return;
    setIsVoiceStarting(true);
    setVoiceError("");
    setVoiceStatus("Requesting microphone access...");
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Microphone access is not available in this browser");
      const microphone = await navigator.mediaDevices.getUserMedia({ audio: true });
      microphone.getTracks().forEach((track) => track.stop());
      const resume = Boolean(nextVoicePrompt);
      setNextVoicePrompt("");
      startBrowserVoiceInterview(openingMessage, resume);
    } catch (error) {
      setVoiceError(getVoiceErrorMessage(error));
      setVoiceStatus("Could not access the microphone. Check browser permissions and try again.");
    } finally {
      setIsVoiceStarting(false);
    }
  };

  const endVoiceCall = async () => {
    browserVoiceActiveRef.current = false;
    if (browserTranscriptTimerRef.current !== null) window.clearTimeout(browserTranscriptTimerRef.current);
    browserTranscriptTimerRef.current = null;
    browserTranscriptBufferRef.current = "";
    browserRecognitionRef.current?.stop();
    browserRecognitionRef.current = null;
    browserSpeakRef.current = null;
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
    setMicCheckStatus("idle");
    setJobStatus("active");
    setError("");
    setResult(null);
    setTranscript([]);
    setShowReport(false);
    setCommunicationAssessment(null);
    setCommunicationAssessmentError("");
    communicationAssessmentRequestedRef.current = null;
    submissionIdRef.current = null;
    transcriptSaveQueueRef.current = Promise.resolve();
    followUpCountRef.current = 0;
    deflectionCountRef.current = 0;
    setVoiceError("");
    setVoiceStatus("");

    try {
      const response = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, language, problemDescription, problemSlug: problem.slug, difficulty }),
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
    setIsReviewingTranscript(false);
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
          previousQuestion: [...transcript].reverse().find((entry) => entry.role === "assistant")?.text,
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
      setNextVoicePrompt(payload.response);
      setVoiceStatus(payload.response);
      const interviewComplete = payload.terminated || followUpCountRef.current >= followUpTargetRef.current;
      if (browserRecognitionRef.current) {
        setNextVoicePrompt("");
        if (interviewComplete) {
          browserVoiceActiveRef.current = false;
          setIsVoiceActive(false);
          setShowReport(true);
          setPhase("InterviewPhase");
          browserSpeakRef.current?.(payload.response, false);
        } else {
          browserVoiceActiveRef.current = true;
          setIsVoiceActive(true);
          browserSpeakRef.current?.(payload.response, false);
        }
      } else {
        setNextVoicePrompt(payload.response);
      }
      if (interviewComplete) setShowReport(true);
      if (interviewComplete) setPhase("InterviewPhase");
    } catch (answerError) {
      setTextAnswer(answer);
      setIsReviewingTranscript(Boolean(browserRecognitionRef.current));
      setVoiceError(answerError instanceof Error ? answerError.message : "The AI interviewer could not respond");
    }
  };

  if (!difficulty) {
    const options: { value: Difficulty; title: string; description: string }[] = [
      { value: "easy", title: "Easy", description: "Beginner friendly questions on core concepts and clear problem solving." },
      { value: "medium", title: "Medium", description: "Intermediate coding challenges and practical technical follow-ups." },
      { value: "hard", title: "Hard", description: "Advanced challenges with deeper edge cases, trade-offs, and technical reasoning." },
    ];
    return (
      <main className="difficulty-page">
        <div className="difficulty-layout">
          <header className="difficulty-topbar">
            <Link className="brand-mark" href="/">
              <img className="brand-logo" src="/codeOracle_logo.png" alt="CodeOracle" />
            </Link>
            <span className="difficulty-step">NEW INTERVIEW <i /> 01 / 01</span>
          </header>
          <section className="difficulty-card" aria-labelledby="difficulty-heading">
            <div className="difficulty-intro">
              <p className="eyebrow">PERSONALIZE YOUR SESSION</p>
              <h1 id="difficulty-heading">Choose your interview level</h1>
              <p>Select a difficulty to shape your coding challenge and the interviewer&apos;s questions.</p>
            </div>
            <div className="difficulty-options" aria-label="Interview difficulty">
            {options.map((option) => (
              <button key={option.value} type="button" className={`difficulty-option difficulty-${option.value}`} onClick={() => setDifficulty(option.value)}>
                <span className="difficulty-option-top"><small>LEVEL {option.value === "easy" ? "01" : option.value === "medium" ? "02" : "03"}</small><span aria-hidden="true">↗</span></span>
                <span className="difficulty-option-title">{option.title}</span>
                <span className="difficulty-option-description">{option.description}</span>
                <span className="difficulty-option-action">Choose {option.title.toLowerCase()} <span aria-hidden="true">→</span></span>
              </button>
            ))}
            </div>
            <footer className="difficulty-footer">
              <span><span className="difficulty-lock" aria-hidden="true">✓</span> You can focus on the challenge. Your session starts after selection.</span>
              <Link className="difficulty-back-link" href="/dashboard">← Back to dashboard</Link>
            </footer>
          </section>
          <p className="difficulty-caption">Tailored practice. Clear feedback. Better interviews.</p>
        </div>
      </main>
    );
  }

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
    const hasCommunicationAssessment =
      communicationAssessment?.status === "assessed" || communicationAssessment?.status === "limited";
    const metricValue = (value: number | null | undefined) =>
      isAssessingCommunication ? "Assessing…" : hasCommunicationAssessment && value !== null && value !== undefined ? `${value}/100` : "Not assessed";
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
              <span>Overall interview score</span>
              <strong>{isAssessingCommunication ? "…" : score === null || score === undefined ? "—" : `${score}`}<small>{!isAssessingCommunication && score !== null && score !== undefined ? "/100" : ""}</small></strong>
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
          <section className="report-section" aria-labelledby="report-communication-heading">
            <div className="report-section-heading">
              <div>
                <p className="eyebrow">COMMUNICATION &amp; DELIVERY</p>
                <h2 id="report-communication-heading">Interview speaking signals</h2>
              </div>
              {communicationAssessment?.status === "limited" && <span className="assessment-evidence-badge">Limited evidence</span>}
            </div>
            <div className="report-facts-grid report-communication-grid">
              <div className="report-fact"><span>Verbal answer quality</span><strong>{metricValue(communicationAssessment?.interviewAnswerQuality)}</strong></div>
              <div className="report-fact"><span>Communication clarity</span><strong>{metricValue(communicationAssessment?.communicationClarity)}</strong></div>
              <div className="report-fact"><span>English proficiency</span><strong>{metricValue(communicationAssessment?.englishProficiency)}</strong></div>
              <div className="report-fact"><span>Confidence</span><strong>{metricValue(communicationAssessment?.confidence)}</strong></div>
              <div className="report-fact"><span>Nervousness indicators</span><strong>{isAssessingCommunication ? "Assessing…" : hasCommunicationAssessment ? communicationAssessment?.nervousnessIndicators : "Not assessed"}</strong></div>
            </div>
            <p className="report-communication-summary">
              {isAssessingCommunication
                ? "Reviewing your recorded responses…"
                : communicationAssessment?.summary ?? (communicationAssessmentError || "Communication feedback is not available.")}
            </p>
            {communicationAssessment?.evidence && communicationAssessment.evidence.length > 0 && (
              <ul className="report-communication-evidence">
                {communicationAssessment.evidence.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}
              </ul>
            )}
            {communicationAssessment?.status === "not_assessed" && (
              <p className="report-empty-note">Answer at least one interviewer question to receive communication feedback. More responses provide a more reliable assessment.</p>
            )}
            <p className="report-assessment-caveat">These are transcript-based coaching indicators. English proficiency reflects recorded word choice and clarity; nervousness indicators are not a clinical assessment and do not evaluate accent or pronunciation.</p>
          </section>
          <div className="report-details">
            <p><strong>Assessment basis:</strong> The overall score combines code performance (50%), verbal answer quality (25%), and communication clarity and confidence (25%). Nervousness indicators are shown as transcript-based coaching feedback and do not directly affect the score. Communication measures use only recorded candidate responses.</p>
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
        <p>{!result ? "Reviewing your submission..." : result.interview ? voiceStatus : "Code is ready. Preparing your interview..."}</p>
        {voiceError && <p className="voice-error-message" role="alert">{voiceError}</p>}
        {result?.interview?.available && !testCasesPassed && <p className="mic-check-notice">Pass the coding test cases before starting the voice interview.</p>}
        {result?.interview?.available && testCasesPassed && micCheckStatus !== "passed" && (
          <div className="mic-check-notice" role="status">
            <span>Check your microphone. Say a short phrase when prompted; interview controls unlock after we detect your voice.</span>
            <button type="button" className="start-voice-button" onClick={() => void checkMicrophone()} disabled={micCheckStatus === "checking"}>
              {micCheckStatus === "checking" ? "Checking microphone..." : "Check microphone"}
            </button>
          </div>
        )}
        {result?.interview?.available && testCasesPassed && micCheckStatus === "passed" && (
          <p className="mic-check-success" role="status">Microphone verified. Your interview is ready to start.</p>
        )}
        {result?.interview?.available && (
          <label className="speech-language-control">
            Browser voice recognition language
            <select value={speechLanguage} disabled={isVoiceActive || isVoiceStarting} onChange={(event) => setSpeechLanguage(event.target.value as typeof speechLanguage)}>
              <option value="en-IN">English (India)</option>
              <option value="en-US">English (United States)</option>
              <option value="en-GB">English (United Kingdom)</option>
            </select>
          </label>
        )}
        {result?.interview?.available && testCasesPassed && micCheckStatus === "passed" && !isVoiceActive && (
          <button type="button" className="start-voice-button" onClick={() => void startVoiceInterview()} disabled={isVoiceStarting}>
            {isVoiceStarting ? "Starting interview..." : nextVoicePrompt ? "Continue interview" : "Start interview"}
          </button>
        )}
        {result && !result.interview?.available && (
          <button type="button" className="start-voice-button" onClick={() => setShowReport(true)}>
            View assessment report
          </button>
        )}
        {useVapi && result?.interview?.available && testCasesPassed && micCheckStatus === "passed" && !isVoiceActive && (
          <button type="button" className="start-voice-button" onClick={() => void startBrowserVoiceManually()} disabled={isVoiceStarting}>
            {isVoiceStarting ? "Requesting microphone..." : "Use browser voice instead"}
          </button>
        )}
        <div className="avatar-transcript">
          {transcript.slice(-4).map((entry, index) => <p key={`${entry.role}-${index}`}><strong>{entry.role === "user" ? "You" : "Interviewer"}:</strong> {entry.text}</p>)}
        </div>
        {result?.interview?.available && testCasesPassed && micCheckStatus === "passed" && !isVoiceActive && (
          <form className="avatar-answer-form" onSubmit={submitTextAnswer}>
            <label htmlFor="text-answer">Answer the interviewer</label>
            {isReviewingTranscript && <p className="transcript-review-hint">Review and correct the recognized speech before sending. Nothing is submitted until you choose Send answer.</p>}
            <textarea
              id="text-answer"
              value={textAnswer}
              onChange={(event) => { setTextAnswer(event.target.value); setIsReviewingTranscript(false); }}
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
    <main className={`editor-shell${problem?.isExecutable === false ? " editor-shell-static-review" : ""}`}>
      <header className="topbar">
        <div>
          <img className="brand-logo editor-brand-logo" src="/codeOracle_logo.png" alt="CodeOracle" />
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

      <section className={`workspace${problem?.isExecutable === false ? " workspace-static-review" : ""}`}>
        <div className="panel editor-panel">
          <div className="panel-heading">
            <span>{problem?.isExecutable === false ? "Design response" : "Source"}</span>
            <span className="file-name">
              {problem?.isExecutable === false ? "JavaScript comments" : `main.${language === "javascript" ? "js" : language}`}
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
            {problem?.isExecutable === false ? "Design challenge" : "Problem statement"}
          </label>
          <textarea
            id="problem"
            className="problem-input"
            value={problemDescription}
            onChange={(event) => setProblemDescription(event.target.value)}
            placeholder="Describe the problem you are solving..."
            rows={problem?.isExecutable === false ? 10 : 8}
          />
          {problem?.isExecutable === false && (
            <div className="design-response-note">
              <strong>Response format</strong>
              <span>Provide your analysis as JavaScript comments (//), addressing each section below. Runnable code is not expected.</span>
            </div>
          )}
          <div className="chat-messages" aria-live="polite">
            {result?.interview?.available && !testCasesPassed && (
              <div className="mic-check-notice" role="status">Pass the coding test cases before starting the voice interview.</div>
            )}
            {result?.interview?.available && testCasesPassed && micCheckStatus !== "passed" && (
              <div className="mic-check-notice" role="status">
                <span>Say a short phrase to verify your microphone. Voice interview controls unlock after your voice is detected.</span>
                <button type="button" className="start-voice-button" onClick={() => void checkMicrophone()} disabled={micCheckStatus === "checking"}>
                  {micCheckStatus === "checking" ? "Checking microphone..." : "Check microphone"}
                </button>
              </div>
            )}
            {result?.interview?.available && testCasesPassed && micCheckStatus === "passed" && (
              <p className="mic-check-success" role="status">Microphone verified. Your interview is ready to start.</p>
            )}
            {isVoiceActive && (
              <button
                type="button"
                className="end-call-button"
                onClick={() => void endVoiceCall()}
              >
                End call
              </button>
            )}
            {result?.interview?.available && testCasesPassed && micCheckStatus === "passed" && !isVoiceActive && (
              <button
                type="button"
                className="start-voice-button"
                onClick={() => void startVoiceInterview()}
                disabled={isVoiceStarting}
              >
                {isVoiceStarting ? "Starting voice interview..." : nextVoicePrompt ? "Continue interview" : "Start voice interview"}
              </button>
            )}
            {useVapi && result?.interview?.available && testCasesPassed && micCheckStatus === "passed" && !isVoiceActive && (
              <button type="button" className="start-voice-button" onClick={() => void startBrowserVoiceManually()} disabled={isVoiceStarting}>
                {isVoiceStarting ? "Requesting microphone..." : "Use browser voice instead"}
              </button>
            )}
            <div className="chat-bubble interviewer">
              <span className="chat-author">AI interviewer</span>
              {result
                ? result.interview?.response ?? "Execution finished. Waiting for interview feedback..."
                : problem?.isExecutable === false
                  ? "Select Analyze Code to have the interviewer review your design response and provide feedback."
                  : "Run your code to have the interviewer review your solution and its output, then provide feedback."}
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
            {result?.interview?.available && testCasesPassed && micCheckStatus === "passed" && !isVoiceActive && (
              <form className="avatar-answer-form" onSubmit={submitTextAnswer}>
                <label htmlFor="text-answer">{isReviewingTranscript ? "Review your answer" : "Answer the interviewer"}</label>
                {isReviewingTranscript && (
                  <p className="transcript-review-hint">Check the recognized text, correct any mistakes, then send it to the interviewer.</p>
                )}
                <textarea
                  id="text-answer"
                  value={textAnswer}
                  onChange={(event) => { setTextAnswer(event.target.value); setIsReviewingTranscript(false); }}
                  placeholder="Your recognized speech will appear here. You can also type your answer."
                  rows={4}
                />
                <button type="submit" className="start-voice-button" disabled={!textAnswer.trim()}>
                  {isReviewingTranscript ? "Send reviewed answer" : "Send answer"}
                </button>
              </form>
            )}
          </div>
        </aside>
      </section>
    </main>
  );
}
