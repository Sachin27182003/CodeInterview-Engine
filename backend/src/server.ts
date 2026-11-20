import "dotenv/config";
import { createServer } from "node:http";
import cors from "cors";
import bcrypt from "bcryptjs";
import express, { type ErrorRequestHandler, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import type { Prisma } from "./generated/prisma/client.js";
import { QueueEvents } from "bullmq";
import { Redis } from "ioredis";
import { Server } from "socket.io";
import { z } from "zod";
import type { ExecutionRequest, SupportedLanguage } from "./execution/types.js";
import { generateCommunicationAssessment, generateFollowUpResponse } from "./interview/geminiInterviewer.js";
import { easyRoleProblems } from "./interview/easyRoleQuestionCatalog.js";
import { prisma } from "./db.js";
import { CODE_QUEUE_NAME, codeQueue, redisConnection, redisUrl } from "./queue/codeQueue.js";
import {
  appendTranscript,
  getTranscriptBySubmissionId,
  getReportByShareToken,
  getReportBySubmissionId,
  renderReportPdf,
  saveCommunicationAssessment,
  type TranscriptEntry,
} from "./reports/interviewReport.js";

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: process.env["FRONTEND_URL"] ?? "*" },
});

type ProblemDefinition = {
  slug: string;
  difficulty: "easy" | "medium" | "hard";
  roles: string[];
  title: string;
  description: string;
  testCases: JsonValue[];
  boilerplateCode?: JsonValue;
  isExecutable?: boolean;
  runnerEntryPoint?: string;
  runnerTestCases?: { args: JsonValue[]; expected: JsonValue }[];
  exampleInputNames?: string[];
  exampleScenario?: string;
};

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

const problemCatalog: ProblemDefinition[] = [
  {
    slug: "frontend-state-updates",
    difficulty: "easy",
    roles: ["Frontend Developer", "Web Developer", "Full-Stack Developer"],
    title: "Batch state updates",
    description:
      "Given an array of UI state updates, return the final state after applying each update in order. An update is an object whose keys replace the corresponding values. Preserve keys that were not updated and avoid mutating the input.",
    testCases: [
      { initial: { count: 0, theme: "light" }, updates: [{ count: 1 }, { theme: "dark" }], expected: { count: 1, theme: "dark" } },
      { initial: { ready: false }, updates: [{ ready: true }, { count: 2 }], expected: { ready: true, count: 2 } },
    ],
  },
  {
    slug: "frontend-render-window",
    difficulty: "medium",
    roles: ["Frontend Developer", "Web Developer", "Full-Stack Developer"],
    title: "Visible render window",
    description:
      "Given item heights and a viewport height, return the first and last item indexes visible after scrolling to a given offset. Clamp the range to valid indexes and avoid scanning items more than necessary.",
    testCases: [
      { heights: [10, 20, 30], viewport: 25, offset: 0, expected: [0, 1] },
      { heights: [10, 10, 10], viewport: 10, offset: 15, expected: [1, 2] },
    ],
  },
  {
    slug: "backend-concurrency-window",
    difficulty: "medium",
    roles: ["Backend Developer", "DevOps/SRE", "Cloud Architect"],
    title: "Concurrency window",
    description:
      "Given request start and end times, return the maximum number of requests active at the same time. Treat intervals as half-open: a request is active at its start but not at its end, so one ending at time t does not overlap one starting at time t.",
    testCases: [
      { intervals: [[1, 4], [2, 5], [7, 9]], expected: 2 },
      { intervals: [[1, 2], [2, 3]], expected: 1 },
      { intervals: [], expected: 0 },
      { intervals: [[3, 8], [3, 5], [3, 4]], expected: 3 },
    ],
  },
  {
    slug: "backend-rate-limiter",
    difficulty: "medium",
    roles: ["Backend Developer", "DevOps/SRE", "Cloud Architect"],
    title: "Sliding-window rate limiter",
    description:
      "Given request timestamps in chronological order, return whether each request is allowed under a limit of N requests in the previous W milliseconds. Include the current request in the window.",
    testCases: [
      { timestamps: [100, 200, 300], limit: 2, window: 150, expected: [true, true, true] },
      { timestamps: [100, 110, 120], limit: 2, window: 50, expected: [true, true, false] },
      { timestamps: [], limit: 1, window: 10, expected: [] },
      { timestamps: [0, 10, 20], limit: 1, window: 10, expected: [true, true, true] },
    ],
  },
  {
    slug: "indexed-log-search",
    difficulty: "medium",
    roles: ["Software Engineer", "General Software Engineering", "Data Scientist"],
    title: "Indexed event lookup",
    description:
      "Given a sorted list of event timestamps and a target timestamp, return the first index at which the target can be inserted while keeping the list sorted. The solution should be logarithmic.",
    testCases: [
      { timestamps: [1, 3, 5, 7], target: 4, expected: 2 },
      { timestamps: [1, 3, 5], target: 5, expected: 2 },
      { timestamps: [], target: 3, expected: 0 },
      { timestamps: [2, 2, 2, 4], target: 2, expected: 0 },
      { timestamps: [1, 3, 5], target: 9, expected: 3 },
    ],
  },
  {
    slug: "retry-budget",
    difficulty: "easy",
    roles: ["Security Engineer", "QA/SDET", "Machine Learning/AI Engineer"],
    title: "Retry budget",
    description:
      "Given a sequence of service attempts and a maximum retry budget, return whether the request can complete before the budget is exhausted. Failed attempts consume one retry; a successful attempt stops processing.",
    testCases: [
      { attempts: ["failed", "failed", "success"], retries: 2, expected: true },
      { attempts: ["failed", "failed", "failed", "success"], retries: 2, expected: false },
      { attempts: ["success", "failed"], retries: 0, expected: true },
      { attempts: ["failed", "success"], retries: 1, expected: true },
      { attempts: ["failed", "failed"], retries: 2, expected: false },
    ],
  },
  {
    slug: "data-deduplicate-events",
    difficulty: "easy",
    roles: ["Data Scientist", "Backend Developer", "QA/SDET"],
    title: "Deduplicate event records",
    description:
      "Given an array of event objects, return a new array containing only the first event for each id. Preserve the original order and do not mutate the input. Event ids are strings.",
    testCases: [
      { events: [{ id: "a", value: 1 }, { id: "b", value: 2 }, { id: "a", value: 3 }], expected: [{ id: "a", value: 1 }, { id: "b", value: 2 }] },
      { events: [], expected: [] },
      { events: [{ id: "x", value: 1 }], expected: [{ id: "x", value: 1 }] },
      { events: [{ id: "a", value: 1 }, { id: "a", value: 2 }, { id: "a", value: 3 }], expected: [{ id: "a", value: 1 }] },
    ],
  },
  {
    slug: "find-maximum-number",
    difficulty: "easy",
    roles: ["Software Engineer", "General Software Engineering", "Frontend Developer", "Web Developer", "Backend Developer", "Full-Stack Developer", "QA/SDET", "Data Scientist"],
    title: "Find the largest number",
    description: "Given a non-empty array of numbers, return the largest value. The array may contain negative numbers and duplicates. Do not use a built-in max function.",
    testCases: [
      { numbers: [3, 1, 8, 2], expected: 8 },
      { numbers: [-5, -2, -9], expected: -2 },
      { numbers: [4, 4, 4], expected: 4 },
    ],
  },
  {
    slug: "count-vowels",
    difficulty: "easy",
    roles: ["Software Engineer", "General Software Engineering", "Frontend Developer", "Web Developer", "Backend Developer", "Full-Stack Developer", "QA/SDET", "Data Scientist"],
    title: "Count vowels in a string",
    description: "Given a string, return the number of English vowels (a, e, i, o, u) it contains. Count uppercase vowels too; treat all other characters as non-vowels.",
    testCases: [
      { text: "Interview", expected: 4 },
      { text: "rhythm", expected: 0 },
      { text: "AEIOU", expected: 5 },
    ],
  },
  {
    slug: "valid-parentheses",
    difficulty: "medium",
    roles: ["Software Engineer", "General Software Engineering", "Frontend Developer", "Web Developer", "Backend Developer", "Full-Stack Developer", "QA/SDET"],
    title: "Validate bracket pairs",
    description: "Given a string containing only (, ), [, ], {, and }, return whether every opening bracket is closed by the correct type in the correct order.",
    testCases: [
      { text: "()[]{}", expected: true },
      { text: "([{}])", expected: true },
      { text: "(]", expected: false },
      { text: "([)]", expected: false },
      { text: "(()", expected: false },
    ],
  },
  {
    slug: "merge-overlapping-intervals",
    difficulty: "medium",
    roles: ["Software Engineer", "General Software Engineering", "Backend Developer", "Full-Stack Developer", "Data Scientist", "Cloud Architect"],
    title: "Merge overlapping intervals",
    description: "Given a list of [start, end] intervals in any order, merge all overlapping intervals and return the merged intervals sorted by start time. Intervals that touch at an endpoint overlap.",
    testCases: [
      { intervals: [[1, 3], [2, 6], [8, 10], [15, 18]], expected: [[1, 6], [8, 10], [15, 18]] },
      { intervals: [[1, 4], [4, 5]], expected: [[1, 5]] },
      { intervals: [], expected: [] },
      { intervals: [[5, 7], [1, 2]], expected: [[1, 2], [5, 7]] },
    ],
  },
  {
    slug: "longest-increasing-subsequence",
    difficulty: "hard",
    roles: ["Software Engineer", "General Software Engineering", "Backend Developer", "Full-Stack Developer", "Data Scientist", "Machine Learning/AI Engineer"],
    title: "Longest increasing subsequence",
    description: "Given an integer array, return the length of its longest strictly increasing subsequence. Target O(n log n) time; the subsequence does not need to be contiguous.",
    testCases: [
      { numbers: [10, 9, 2, 5, 3, 7, 101, 18], expected: 4 },
      { numbers: [0, 1, 0, 3, 2, 3], expected: 4 },
      { numbers: [7, 7, 7, 7], expected: 1 },
      { numbers: [], expected: 0 },
    ],
  },
  {
    slug: "minimum-window-substring",
    difficulty: "hard",
    roles: ["Software Engineer", "General Software Engineering", "Backend Developer", "Full-Stack Developer", "Data Scientist", "Machine Learning/AI Engineer"],
    title: "Minimum covering substring",
    description: "Given strings s and t, return the shortest substring of s containing every character in t with the required multiplicity. Return an empty string if no such substring exists. Target O(|s| + |t|) time.",
    testCases: [
      { source: "ADOBECODEBANC", target: "ABC", expected: "BANC" },
      { source: "a", target: "a", expected: "a" },
      { source: "a", target: "aa", expected: "" },
      { source: "aa", target: "aa", expected: "aa" },
    ],
  },
  {
    slug: "security-audit-log",
    difficulty: "easy",
    roles: ["Security Engineer", "Backend Developer", "QA/SDET"],
    title: "Find unauthorized audit events",
    description:
      "Given an array of audit events and a list of allowed actor names, return the indexes of events whose actor is not allowed. Preserve index order. Actor names are case-sensitive.",
    testCases: [
      { events: [{ actor: "service", action: "read" }, { actor: "guest", action: "delete" }], allowedActors: ["service"], expected: [1] },
      { events: [], allowedActors: ["admin"], expected: [] },
      { events: [{ actor: "admin", action: "write" }, { actor: "Admin", action: "read" }, { actor: "guest", action: "delete" }], allowedActors: ["admin"], expected: [1, 2] },
      { events: [{ actor: "guest", action: "read" }], allowedActors: [], expected: [0] },
    ],
  },
  {
    slug: "frontend-component-architecture",
    difficulty: "hard",
    roles: ["Frontend Developer", "Web Developer", "Full-Stack Developer", "Cloud Architect"],
    title: "Design a resilient dashboard component",
    description:
      "Design a React dashboard that displays live metrics and updates as new data arrives. Explain your design under each heading:\n\n1. Component structure: name the page, data hook or service, metrics grid, reusable metric card, and any status or error components. Describe what each one renders and how data flows between them.\n\n2. State boundaries: say where metrics data, connection status, loading/error state, filters, and card-only UI state live. Explain how you keep unrelated state changes from refreshing the entire dashboard.\n\n3. Data lifecycle: describe the initial fetch, live update subscription (WebSocket, server-sent events, or polling), cleanup on unmount, reconnection behavior, and how you prevent stale or out-of-order updates from overwriting newer values.\n\n4. Loading, empty, and error states: explain the first-load skeleton, no-metrics state, request failure and retry action, live connection loss, and how you preserve or label the last known values when updates stop.\n\n5. Rendering performance: explain how you update only changed metrics, keep props and callbacks stable where useful, split or memoize components based on profiling, and avoid unnecessary context-wide updates. Mention how you would measure whether the optimizations help.\n\n6. Accessibility: describe how live changes are announced without overwhelming screen-reader users, and how loading, errors, and metric trends are communicated without relying only on color.\n\nGive a few sentences or concise bullet points for every heading. State important trade-offs and how you would handle a slow or unavailable metrics service. The interviewer will assess clarity, state ownership, resilience, accessibility, and performance reasoning.",
    exampleScenario:
      "A dashboard displays CPU usage, memory use, request rate, and error rate. Each metric updates every five seconds. If the live connection drops, the last known values remain visible with a stale-data indicator while the dashboard attempts to reconnect.",
    testCases: [],
    isExecutable: false,
  },
  ...easyRoleProblems,
];

const boilerplates: Record<string, JsonValue> = {
  "frontend-state-updates": {
    javascript: "function applyUpdates(initial, updates) {\n  // Return the final state without mutating initial.\n}",
    python: "def apply_updates(initial, updates):\n    # Return the final state without mutating initial.\n    pass",
  },
  "frontend-render-window": {
    javascript: "function visibleWindow(heights, viewport, offset) {\n  // Return [firstIndex, lastIndex].\n}",
    python: "def visible_window(heights, viewport, offset):\n    # Return [firstIndex, lastIndex].\n    pass",
  },
  "backend-concurrency-window": {
    javascript: "function maxConcurrency(intervals) {\n  // Return the maximum number of active requests.\n}",
    python: "def max_concurrency(intervals):\n    # Return the maximum number of active requests.\n    pass",
  },
  "backend-rate-limiter": {
    javascript: "function allowRequests(timestamps, limit, windowMs) {\n  // Return an allow/deny value for each request.\n}",
    python: "def allow_requests(timestamps, limit, window_ms):\n    # Return an allow/deny value for each request.\n    pass",
  },
  "indexed-log-search": {
    javascript: "function insertionIndex(timestamps, target) {\n  // Return the first valid insertion index.\n}",
    python: "def insertion_index(timestamps, target):\n    # Return the first valid insertion index.\n    pass",
  },
  "retry-budget": {
    javascript: "function withinRetryBudget(attempts, retries) {\n  // Return whether the request can complete.\n}",
    python: "def within_retry_budget(attempts, retries):\n    # Return whether the request can complete.\n    pass",
  },
  "data-deduplicate-events": {
    javascript: "function deduplicateEvents(events) {\n  // Keep the first event for each id without mutating events.\n}",
    python: "def deduplicate_events(events):\n    # Keep the first event for each id without mutating events.\n    pass",
  },
  "find-maximum-number": {
    javascript: "function findMaximum(numbers) {\n  // Return the largest number without using Math.max.\n}",
    python: "def find_maximum(numbers):\n    # Return the largest number without using max().\n    pass",
  },
  "count-vowels": {
    javascript: "function countVowels(text) {\n  // Count lowercase and uppercase English vowels.\n}",
    python: "def count_vowels(text):\n    # Count lowercase and uppercase English vowels.\n    pass",
  },
  "valid-parentheses": {
    javascript: "function isValidBrackets(text) {\n  // Return whether all bracket pairs are correctly nested.\n}",
    python: "def is_valid_brackets(text):\n    # Return whether all bracket pairs are correctly nested.\n    pass",
  },
  "merge-overlapping-intervals": {
    javascript: "function mergeIntervals(intervals) {\n  // Return sorted, merged intervals without mutating the input.\n}",
    python: "def merge_intervals(intervals):\n    # Return sorted, merged intervals without mutating the input.\n    pass",
  },
  "longest-increasing-subsequence": {
    javascript: "function longestIncreasingSubsequence(numbers) {\n  // Return the LIS length in O(n log n) time.\n}",
    python: "def longest_increasing_subsequence(numbers):\n    # Return the LIS length in O(n log n) time.\n    pass",
  },
  "minimum-window-substring": {
    javascript: "function minimumWindow(source, target) {\n  // Return the shortest substring covering target's characters.\n}",
    python: "def minimum_window(source, target):\n    # Return the shortest substring covering target's characters.\n    pass",
  },
  "security-audit-log": {
    javascript: "function unauthorizedIndexes(events, allowedActors) {\n  // Return indexes for events from actors outside the allowlist.\n}",
    python: "def unauthorized_indexes(events, allowed_actors):\n    # Return indexes for events from actors outside the allowlist.\n    pass",
  },
  "frontend-component-architecture": {
    javascript: "// STATIC DESIGN REVIEW — Do not write executable code. Answer in JavaScript comments.\n//\n// 1. Component structure and data flow:\n//\n// 2. State ownership and boundaries:\n//\n// 3. Initial fetch, live updates, cleanup, and reconnection:\n//\n// 4. Loading, empty, error, and stale-data states:\n//\n// 5. Rendering performance and how you would measure it:\n//\n// 6. Accessibility for live metric updates:\n//\n// 7. Important trade-offs and failure handling:\n// Write a few clear sentences or bullets under every heading.",
  },
};

const nonExecutableSlugs = new Set(["frontend-component-architecture"]);

function enrichProblem(problem: ProblemDefinition): {
  boilerplateCode: JsonValue;
  isExecutable: boolean;
} {
  return {
    boilerplateCode:
      problem.boilerplateCode ??
      boilerplates[problem.slug] ??
      boilerplates["indexed-log-search"]!,
    isExecutable: problem.isExecutable ?? !nonExecutableSlugs.has(problem.slug),
  };
}

function formatProblemDescription(problem: ProblemDefinition): string {
  if (problem.exampleScenario) {
    return `${problem.description}\n\nExample scenario:\n${problem.exampleScenario}`;
  }

  const examples = problem.testCases.slice(0, 2).flatMap((testCase, index) => {
    if (!testCase || typeof testCase !== "object" || Array.isArray(testCase)) return [];
    const record = testCase as Record<string, JsonValue>;
    const expected = record.expected;
    if (expected === undefined) return [];

    let input: string;
    if (Array.isArray(record.args)) {
      const args = record.args;
      input = args.map((value, argIndex) => {
        const name = problem.exampleInputNames?.[argIndex];
        return `${name ?? `argument ${argIndex + 1}`} = ${JSON.stringify(value)}`;
      }).join(", ");
    } else {
      input = Object.entries(record)
        .filter(([key]) => key !== "expected")
        .map(([key, value]) => `${key} = ${JSON.stringify(value)}`)
        .join(", ");
    }

    return [`Example ${index + 1}:\nInput: ${input}\nOutput: ${JSON.stringify(expected)}`];
  });

  return examples.length > 0
    ? `${problem.description}\n\nExamples:\n\n${examples.join("\n\n")}`
    : problem.description;
}

function roleMatches(problem: ProblemDefinition, targetRole?: string | null): boolean {
  if (!targetRole) return problem.roles.includes("General Software Engineering");
  return problem.roles.some((role) => targetRole.includes(role) || role.includes(targetRole));
}

async function selectProblemForUser(userId: string, targetRole: string | null | undefined, difficulty: ProblemDefinition["difficulty"]): Promise<ProblemDefinition> {
  const used = await prisma.interviewSession.findMany({
    where: { userId },
    select: { problem: { select: { slug: true } } },
  });
  const usedSlugs = new Set(used.map((session) => session.problem.slug));
  const difficultyProblems = problemCatalog.filter((problem) => problem.difficulty === difficulty);
  const roleProblems = difficultyProblems.filter((problem) => roleMatches(problem, targetRole));
  const candidates = (roleProblems.length > 0 ? roleProblems : difficultyProblems).filter(
    (problem) => !usedSlugs.has(problem.slug),
  );
  const pool = candidates.length > 0 ? candidates : roleProblems.length > 0 ? roleProblems : difficultyProblems;
  return pool[Math.floor(Math.random() * pool.length)] ?? problemCatalog[0]!;
}
const queueEvents = new QueueEvents(CODE_QUEUE_NAME, {
  connection: new Redis(redisUrl, {
    maxRetriesPerRequest: null,
  }),
});
const port = Number(process.env["PORT"] ?? 3001);
const MAX_CODE_LENGTH = 100_000;
const recruiterDashboardKey = process.env["RECRUITER_DASHBOARD_KEY"];
const authInternalKey = process.env["AUTH_INTERNAL_KEY"];
const recruiterEmails = new Set(
  (process.env["RECRUITER_EMAILS"] ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
);
const submitPayloadSchema = z.object({
  code: z.string().min(1).max(MAX_CODE_LENGTH),
  language: z.enum(["javascript", "python", "java", "c", "cpp"]),
  problemDescription: z.string().max(MAX_CODE_LENGTH).optional(),
  problemSlug: z.string().max(120).optional(),
  difficulty: z.enum(["easy", "medium", "hard"]).optional(),
  userId: z.string().min(1).optional(),
}).strict();
const credentialSignupSchema = z.object({
  name: z.string().trim().min(2, "Name must be between 2 and 120 characters.").max(120),
  email: z.string().trim().email("Enter a valid email address.").max(320),
  password: z.string().min(12, "Password must be at least 12 characters long.").refine((password) => Buffer.byteLength(password, "utf8") <= 72, {
    message: "Password must be 72 UTF-8 bytes or fewer.",
  }),
}).strict();
const credentialLoginSchema = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(1).refine((password) => Buffer.byteLength(password, "utf8") <= 72),
}).strict();
const interviewResponseSchema = z.object({
  code: z.string().min(1).max(MAX_CODE_LENGTH),
  language: z.enum(["javascript", "python", "java", "c", "cpp"]),
  problemDescription: z.string().max(MAX_CODE_LENGTH).optional(),
  userMessage: z.string().trim().min(1).max(10_000),
  deflectionCount: z.number().int().min(0).max(2).optional(),
  followUpNumber: z.number().int().min(1).max(10).optional(),
  followUpTarget: z.number().int().min(5).max(10).optional(),
  targetRole: z.string().max(120).optional(),
  difficulty: z.enum(["easy", "medium", "hard"]).optional(),
}).strict();
const transcriptSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(["user", "assistant"]),
  text: z.string().trim().min(1).max(10_000),
  timestamp: z.string().datetime(),
}).strict();
const targetRoleSchema = z.object({
  targetRole: z.string().min(1).max(100),
  customRole: z.string().trim().max(100).optional(),
}).strict().superRefine((value, context) => {
  if (value.targetRole === "Others" && !value.customRole) {
    context.addIssue({ code: "custom", path: ["customRole"], message: "customRole is required for Others" });
  }
});
const profilePatchSchema = z.object({
  name: z.string().trim().min(1).max(120),
  avatarUrl: z
    .string()
    .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/, "Invalid image")
    .max(2_800_000)
    .nullable()
    .optional(),
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
    .refine((value) => !Number.isNaN(new Date(`${value}T00:00:00.000Z`).getTime()), "Invalid date")
    .nullable(),
  phone: z.string().trim().max(30).nullable(),
  email: z.string().trim().email().max(320),
  targetRole: z.string().trim().min(1).max(100),
}).strict();

app.use(cors());
app.use(express.json({ limit: "8mb" }));
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "Too many requests. Please try again later." },
  }),
);
const submissionRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Submission rate limit exceeded. Please wait before running more code." },
});
const interviewRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Interview request rate limit exceeded. Please try again later." },
});
const credentialSignupRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many sign-up attempts. Please try again later." },
});
const credentialLoginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many sign-in attempts. Please try again later." },
});

io.on("connection", (socket) => {
  socket.on("job:subscribe", async (jobId: unknown) => {
    if (typeof jobId === "string" && jobId.length > 0) {
      void socket.join(`job:${jobId}`);
      try {
        const job = await codeQueue.getJob(jobId);
        if (!job) return;
        const state = await job.getState();
        const progress = job.progress as {
          phase?: string;
          executionResult?: Record<string, unknown>;
          interview?: Record<string, unknown>;
        };
        if (state === "failed") {
          socket.emit("job:failed", { jobId, error: job.failedReason ?? "Code execution failed" });
        } else if (state === "completed" || progress.phase === "completed") {
          socket.emit("job:completed", {
            jobId,
            result: progress.executionResult
              ? { ...progress.executionResult, interview: progress.interview }
              : job.returnvalue,
          });
        } else {
          socket.emit("job:progress", { jobId, progress });
        }
      } catch (error) {
        console.error(`Could not subscribe to execution job ${jobId}:`, error);
        socket.emit("job:failed", { jobId, error: "Unable to read execution status" });
      }
    }
  });

  socket.on("job:unsubscribe", (jobId: unknown) => {
    if (typeof jobId === "string") {
      void socket.leave(`job:${jobId}`);
    }
  });
});

queueEvents.on("progress", ({ jobId, data }) => {
  let progress: unknown = data;
  if (typeof data === "string") {
    try {
      progress = JSON.parse(data) as unknown;
    } catch (error) {
      console.error(`Could not parse progress for execution job ${jobId}:`, error);
      return;
    }
  }
  io.to(`job:${jobId}`).emit("job:progress", { jobId, progress });
  if (
    progress &&
    typeof progress === "object" &&
    "phase" in progress &&
    progress.phase === "completed"
  ) {
    const completedProgress = progress as {
      executionResult?: Record<string, unknown>;
      interview?: Record<string, unknown>;
    };
    io.to(`job:${jobId}`).emit("job:completed", {
      jobId,
      result: completedProgress.executionResult
        ? { ...completedProgress.executionResult, interview: completedProgress.interview }
        : undefined,
    });
  }
});

queueEvents.on("failed", ({ jobId, failedReason }) => {
  io.to(`job:${jobId}`).emit("job:failed", {
    jobId,
    error: failedReason || "Code execution failed",
  });
});

queueEvents.on("error", (error) => {
  console.error("Execution queue events error:", error);
});

app.get("/health", (_request, response) => {
  response.json({ status: "ok" });
});

app.get("/interview/problem", async (request, response): Promise<void> => {
  if (!authInternalKey || request.header("x-auth-internal-key") !== authInternalKey) {
    response.status(403).json({ error: "Interview problems are not configured" });
    return;
  }
  const userId = request.header("x-user-id");
  if (!userId) {
    response.status(400).json({ error: "userId is required" });
    return;
  }
  const difficulty = request.query.difficulty;
  if (difficulty !== "easy" && difficulty !== "medium" && difficulty !== "hard") {
    response.status(400).json({ error: "Choose an interview difficulty" });
    return;
  }
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { targetRole: true, customRole: true },
    });
    const targetRole = user?.targetRole === "Others" && user.customRole
      ? `Others (${user.customRole})`
      : user?.targetRole;
    const definition = await selectProblemForUser(userId, targetRole, difficulty);
    const metadata = enrichProblem(definition);
    const problem = await prisma.problem.upsert({
      where: { slug: definition.slug },
      update: {
        title: definition.title,
        description: formatProblemDescription(definition),
        testCases: definition.testCases as Prisma.InputJsonValue,
        boilerplateCode: metadata.boilerplateCode as Prisma.InputJsonValue,
        isExecutable: metadata.isExecutable,
      },
      create: {
        slug: definition.slug,
        title: definition.title,
        description: formatProblemDescription(definition),
        testCases: definition.testCases as Prisma.InputJsonValue,
        boilerplateCode: metadata.boilerplateCode as Prisma.InputJsonValue,
        isExecutable: metadata.isExecutable,
      },
    });
    response.json({
      problem: {
        slug: problem.slug,
        title: problem.title,
        description: problem.description,
        testCases: problem.testCases,
        boilerplateCode: problem.boilerplateCode,
        isExecutable: problem.isExecutable,
      },
    });
  } catch (error) {
    console.error("Could not allocate an interview problem:", error);
    response.status(503).json({ error: "Interview problem allocation is unavailable" });
  }
});

app.post("/interview/respond", interviewRateLimit, async (request, response): Promise<void> => {
  if (!authInternalKey || request.header("x-auth-internal-key") !== authInternalKey) {
    response.status(403).json({ error: "Interview responses are not configured" });
    return;
  }
  const parsed = interviewResponseSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Invalid interview response payload", details: parsed.error.flatten() });
    return;
  }
  const { code, language, problemDescription, userMessage, difficulty } = parsed.data;
  try {
    const reply = await generateFollowUpResponse(
      {
        code,
        language: language as SupportedLanguage,
        ...(parsed.data.targetRole ? { targetRole: parsed.data.targetRole } : {}),
        ...(difficulty ? { difficulty } : {}),
        ...(typeof problemDescription === "string" ? { problemDescription } : {}),
      },
      userMessage,
      parsed.data.deflectionCount ?? 0,
      parsed.data.followUpNumber ?? 1,
      parsed.data.followUpTarget ?? 7,
    );
    response.json(reply);
  } catch (error) {
    console.error("Could not generate voice interview follow-up:", error);
    response.status(503).json({ error: "The AI interviewer could not respond" });
  }
});

app.post("/auth/credentials/register", credentialSignupRateLimit, async (request, response): Promise<void> => {
  if (!authInternalKey || request.header("x-auth-internal-key") !== authInternalKey) {
    response.status(403).json({ error: "Registration is not configured" });
    return;
  }
  const parsed = credentialSignupSchema.safeParse(request.body);
  if (!parsed.success) {
    const passwordIssue = parsed.error.issues.find((issue) => issue.path[0] === "password");
    const nameIssue = parsed.error.issues.find((issue) => issue.path[0] === "name");
    const emailIssue = parsed.error.issues.find((issue) => issue.path[0] === "email");
    const error = passwordIssue
      ? passwordIssue.message
      : nameIssue
        ? nameIssue.message
        : emailIssue
          ? emailIssue.message
          : "Check your sign-up details and try again.";
    response.status(400).json({ error });
    return;
  }
  const email = parsed.data.email.toLowerCase();
  if (recruiterEmails.has(email)) {
    response.status(403).json({ error: "Recruiter accounts must be approved through the recruiter sign-in flow" });
    return;
  }
  try {
    const existingUser = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existingUser) {
      response.status(409).json({ error: "An account with that email already exists. Sign in instead." });
      return;
    }
    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    const user = await prisma.user.create({
      data: {
        name: parsed.data.name,
        email,
        passwordHash,
        role: "CANDIDATE",
      },
      select: { id: true, email: true, name: true },
    });
    response.status(201).json({ user });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      response.status(409).json({ error: "An account with that email already exists. Sign in instead." });
      return;
    }
    console.error("Could not register credentials account:", error);
    response.status(503).json({ error: "Registration is temporarily unavailable" });
  }
});

app.post("/auth/credentials/login", credentialLoginRateLimit, async (request, response): Promise<void> => {
  if (!authInternalKey || request.header("x-auth-internal-key") !== authInternalKey) {
    response.status(403).json({ error: "Sign-in is not configured" });
    return;
  }
  const parsed = credentialLoginSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(401).json({ error: "Invalid email or password" });
    return;
  }
  try {
    const email = parsed.data.email.toLowerCase();
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        targetRole: true,
        customRole: true,
        passwordHash: true,
      },
    });
    const passwordHash = user?.passwordHash ?? "$2b$12$bzX9fLKanZTG2W2BQ/WbGOxAKOomBKB/6NgPs0X9pAZTEANiyxik2";
    const passwordMatches = await bcrypt.compare(parsed.data.password, passwordHash);
    if (!user?.email) {
      response.status(404).json({ code: "EMAIL_NOT_FOUND", error: "Email does not exist. Please sign up." });
      return;
    }
    if (!user.passwordHash) {
      response.status(409).json({ code: "PASSWORD_NOT_SET", error: "This account does not have a password. Try Google or GitHub sign-in." });
      return;
    }
    if (!passwordMatches) {
      response.status(401).json({ code: "INVALID_PASSWORD", error: "Password is invalid." });
      return;
    }
    const { passwordHash: _passwordHash, ...safeUser } = user;
    response.json({ user: safeUser });
  } catch (error) {
    console.error("Could not authenticate credentials account:", error);
    response.status(503).json({ error: "Sign-in is temporarily unavailable" });
  }
});

app.post("/auth/users", async (request, response): Promise<void> => {
  if (!authInternalKey || request.header("x-auth-internal-key") !== authInternalKey) {
    response.status(403).json({ error: "Authentication sync is not configured" });
    return;
  }
  const { email, name } = request.body as { email?: unknown; name?: unknown };
  if (typeof email !== "string" || !email.includes("@")) {
    response.status(400).json({ error: "A valid email is required" });
    return;
  }
  const normalizedEmail = email.trim().toLowerCase();
  try {
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { passwordHash: true },
    });
    if (existingUser?.passwordHash) {
      response.status(409).json({ error: "This account uses email and password sign-in" });
      return;
    }
    const user = await prisma.user.upsert({
      where: { email: normalizedEmail },
      update: {
        ...(typeof name === "string" ? { name } : {}),
        ...(recruiterEmails.has(normalizedEmail) ? { role: "RECRUITER" as const } : {}),
      },
      create: {
        email: normalizedEmail,
        ...(typeof name === "string" ? { name } : {}),
        role: recruiterEmails.has(normalizedEmail) ? "RECRUITER" : "CANDIDATE",
      },
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        role: true,
        targetRole: true,
        customRole: true,
        dateOfBirth: true,
        phone: true,
      },
    });

    response.json({ user });
  } catch (error) {
    console.error("Could not synchronize authenticated user:", error);
    response.status(503).json({ error: "User synchronization is unavailable" });
  }
});

app.post("/users/:userId/target-role", async (request, response): Promise<void> => {
  if (!authInternalKey || request.header("x-auth-internal-key") !== authInternalKey) {
    response.status(403).json({ error: "Profile updates are not configured" });
    return;
  }
  const userId = request.params["userId"];
  const parsed = targetRoleSchema.safeParse(request.body);
  if (!userId || Array.isArray(userId) || !parsed.success) {
    response.status(400).json({ error: "Invalid target role", details: parsed.success ? undefined : parsed.error.flatten() });
    return;
  }
  try {
    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        targetRole: parsed.data.targetRole,
        customRole:
          parsed.data.targetRole === "Others" ? parsed.data.customRole ?? null : null,
      },
      select: { targetRole: true, customRole: true },
    });

    response.json({ user });
  } catch (error) {
    console.error(`Could not update target role for ${userId}:`, error);
    response.status(503).json({ error: "Target role could not be saved" });
  }
});

app.get("/users/:userId/profile", async (request, response): Promise<void> => {
  if (!authInternalKey || request.header("x-auth-internal-key") !== authInternalKey) {
    response.status(403).json({ error: "Profile access is not configured" });
    return;
  }
  const userId = request.params["userId"];
  if (!userId || Array.isArray(userId)) {
    response.status(400).json({ error: "userId is required" });
    return;
  }
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        avatarUrl: true,
        dateOfBirth: true,
        phone: true,
        email: true,
        targetRole: true,
        customRole: true,
      },
    });
    if (!user) {
      response.status(404).json({ error: "User profile not found" });
      return;
    }
    response.json({ user });
  } catch (error) {
    console.error(`Could not read profile for ${userId}:`, error);
    response.status(503).json({ error: "Profile is unavailable" });
  }
});

app.patch("/users/:userId/profile", async (request, response): Promise<void> => {
  if (!authInternalKey || request.header("x-auth-internal-key") !== authInternalKey) {
    response.status(403).json({ error: "Profile updates are not configured" });
    return;
  }
  const userId = request.params["userId"];
  const parsed = profilePatchSchema.safeParse(request.body);
  if (!userId || Array.isArray(userId) || !parsed.success) {
    response.status(400).json({
      error: "Invalid profile",
      details: parsed.success ? undefined : parsed.error.flatten(),
    });
    return;
  }
  try {
    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        name: parsed.data.name,
        avatarUrl: parsed.data.avatarUrl ?? null,
        email: parsed.data.email.toLowerCase(),
        phone: parsed.data.phone || null,
        dateOfBirth: parsed.data.dateOfBirth
          ? new Date(`${parsed.data.dateOfBirth}T00:00:00.000Z`)
          : null,
        targetRole: parsed.data.targetRole,
      },
      select: {
        id: true,
        name: true,
        avatarUrl: true,
        dateOfBirth: true,
        phone: true,
        email: true,
        targetRole: true,
        customRole: true,
      },
    });
    response.json({ user });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      response.status(409).json({ error: "That email address is already in use" });
      return;
    }
    console.error(`Could not update profile for ${userId}:`, error);
    response.status(503).json({ error: "Profile could not be saved" });
  }
});

app.get("/users/:userId/assessments", async (request, response): Promise<void> => {
  if (!authInternalKey || request.header("x-auth-internal-key") !== authInternalKey) {
    response.status(403).json({ error: "Candidate access is not configured" });
    return;
  }
  const userId = request.params["userId"];
  if (!userId || Array.isArray(userId)) {
    response.status(400).json({ error: "userId is required" });
    return;
  }
  try {
    const submissions = await prisma.submission.findMany({
      where: { session: { userId } },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        language: true,
        status: true,
        aiScore: true,
        aiFeedback: true,
        executionTimeMs: true,
        createdAt: true,
        report: { select: { shareToken: true } },
      },
    });
    response.json({ assessments: submissions });
  } catch (error) {
    console.error(`Could not read assessments for user ${userId}:`, error);
    response.status(503).json({ error: "Candidate assessments are unavailable" });
  }
});

app.get("/recruiter/assessments", async (request, response): Promise<void> => {
  if (!recruiterDashboardKey || request.header("x-recruiter-dashboard-key") !== recruiterDashboardKey) {
    response.status(403).json({ error: "Recruiter access is not configured" });
    return;
  }
  try {
    const submissions = await prisma.submission.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        language: true,
        status: true,
        aiScore: true,
        aiFeedback: true,
        executionTimeMs: true,
        createdAt: true,
        completedAt: true,
        report: { select: { shareToken: true } },
        session: { select: { id: true, startedAt: true, completedAt: true } },
      },
    });

    response.json({ assessments: submissions });
  } catch (error) {
    console.error("Could not read recruiter assessments:", error);
    response.status(503).json({ error: "Recruiter assessments are unavailable" });
  }
});

async function loadAuthorizedReport(request: Request, submissionId: string) {
  const report = await getReportBySubmissionId(submissionId);
  if (!report) return null;
  const recruiterAuthorized =
    Boolean(recruiterDashboardKey) &&
    request.header("x-recruiter-dashboard-key") === recruiterDashboardKey;
  const userId = request.header("x-user-id");
  const candidateAuthorized = typeof userId === "string" && report.submission.session.userId === userId;
  return recruiterAuthorized || candidateAuthorized ? report : null;
}

app.get("/reports/:submissionId/pdf", async (request, response): Promise<void> => {
  const submissionId = request.params["submissionId"];
  if (!submissionId || Array.isArray(submissionId)) {
    response.status(400).json({ error: "submissionId is required" });
    return;
  }
  try {
    const report = await loadAuthorizedReport(request, submissionId);
    if (!report) {
      response.status(404).json({ error: "Report not found" });
      return;
    }
    const pdf = await renderReportPdf(report);
    response.type("application/pdf");
    response.setHeader("Content-Disposition", `attachment; filename="codeoracle-${submissionId}.pdf"`);
    response.send(pdf);
  } catch (error) {
    console.error(`Could not generate report PDF for ${submissionId}:`, error);
    response.status(503).json({ error: "Report PDF generation is unavailable" });
  }
});

app.get("/reports/share/:shareToken", async (request, response): Promise<void> => {
  const shareToken = request.params["shareToken"];
  if (!shareToken || Array.isArray(shareToken)) {
    response.status(400).json({ error: "shareToken is required" });
    return;
  }
  try {
    const report = await getReportByShareToken(shareToken);
    if (!report) {
      response.status(404).json({ error: "Shared report not found" });
      return;
    }
    response.json({
      report: {
        shareToken: report.shareToken,
        candidateName: report.submission.session.user?.name ?? "Candidate",
        problemTitle: report.submission.problem.title,
        problemDescription: report.submission.problem.description,
        language: report.submission.language,
        score: report.submission.aiScore,
        feedback: report.submission.aiFeedback,
        executionTimeMs: report.submission.executionTimeMs,
        stdout: report.submission.stdout,
        stderr: report.submission.stderr,
        exitCode: report.submission.exitCode,
        timedOut: report.submission.timedOut,
        executionStatus: report.submission.status,
        timeComplexity: report.timeComplexity,
        spaceComplexity: report.spaceComplexity,
        communicationAssessment: report.communicationAssessment,
        code: report.submission.code,
        transcript: report.transcript,
        createdAt: report.createdAt,
      },
    });
  } catch (error) {
    console.error(`Could not read shared report ${shareToken}:`, error);
    response.status(503).json({ error: "Shared report is unavailable" });
  }
});

app.get("/reports/share/:shareToken/pdf", async (request, response): Promise<void> => {
  const shareToken = request.params["shareToken"];
  if (!shareToken || Array.isArray(shareToken)) {
    response.status(400).json({ error: "shareToken is required" });
    return;
  }
  try {
    const report = await getReportByShareToken(shareToken);
    if (!report) {
      response.status(404).json({ error: "Shared report not found" });
      return;
    }
    const pdf = await renderReportPdf(report);
    response.type("application/pdf");
    response.setHeader("Content-Disposition", `attachment; filename="codeoracle-shared-report.pdf"`);
    response.send(pdf);
  } catch (error) {
    console.error(`Could not generate shared report PDF ${shareToken}:`, error);
    response.status(503).json({ error: "Report PDF generation is unavailable" });
  }
});

app.post("/reports/:submissionId/transcript", async (request, response): Promise<void> => {
  if (!authInternalKey || request.header("x-auth-internal-key") !== authInternalKey) {
    response.status(403).json({ error: "Transcript access is not configured" });
    return;
  }
  const submissionId = request.params["submissionId"];
  const parsed = transcriptSchema.safeParse(request.body);
  if (!parsed.success || !submissionId) {
    response.status(400).json({ error: "Invalid transcript payload", details: parsed.success ? undefined : parsed.error.flatten() });
    return;
  }
  const { userId, role, text, timestamp } = parsed.data;
  try {
    const report = await getReportBySubmissionId(submissionId);
    if (!report || report.submission.session.userId !== userId) {
      response.status(404).json({ error: "Report not found" });
      return;
    }
    await appendTranscript(submissionId, {
      role,
      text,
      timestamp,
    } satisfies TranscriptEntry);
    response.status(204).end();
  } catch (error) {
    console.error(`Could not save transcript for ${submissionId}:`, error);
    response.status(503).json({ error: "Interview transcript is unavailable" });
  }
});

app.post("/reports/:submissionId/communication-assessment", async (request, response): Promise<void> => {
  if (!authInternalKey || request.header("x-auth-internal-key") !== authInternalKey) {
    response.status(403).json({ error: "Communication assessment is not configured" });
    return;
  }
  const submissionId = request.params["submissionId"];
  const userId = request.header("x-user-id");
  if (!submissionId || !userId) {
    response.status(400).json({ error: "submissionId and userId are required" });
    return;
  }
  try {
    const report = await getReportBySubmissionId(submissionId);
    if (!report || report.submission.session.userId !== userId) {
      response.status(404).json({ error: "Report not found" });
      return;
    }
    const assessment = await generateCommunicationAssessment(
      await getTranscriptBySubmissionId(submissionId),
    );
    await saveCommunicationAssessment(submissionId, assessment);
    response.json({ assessment });
  } catch (error) {
    console.error(`Could not assess communication for submission ${submissionId}:`, error);
    response.status(503).json({ error: "Communication assessment is unavailable" });
  }
});

app.post("/submit", submissionRateLimit, async (request: Request, response: Response): Promise<void> => {
  const parsed = submitPayloadSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Invalid submission payload", details: parsed.error.flatten() });
    return;
  }
  const { code, language, problemDescription, problemSlug, userId, difficulty } = parsed.data;
  if (userId !== undefined && (!authInternalKey || request.header("x-auth-internal-key") !== authInternalKey)) {
    response.status(403).json({ error: "Authenticated submissions are not configured" });
    return;
  }

  try {
    const requestData: ExecutionRequest = {
      code,
      language: language as SupportedLanguage,
      ...(difficulty ? { difficulty } : {}),
    };
    if (typeof userId === "string") {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { targetRole: true, customRole: true },
      });
      if (user?.targetRole) {
        requestData.targetRole =
          user.targetRole === "Others" && user.customRole
            ? `Others (${user.customRole})`
            : user.targetRole;
      }
    }
    const problem = problemSlug
      ? await prisma.problem.findUnique({ where: { slug: problemSlug } })
      : null;
    const selectedProblem = problem ?? await prisma.problem.upsert({
      where: { slug: "two-sum" },
      update: {},
      create: {
        slug: "two-sum",
        title: "Two Sum",
        description:
          problemDescription ??
          "Given an array of integers and a target value, return the indices of two different elements whose sum equals the target. Expected time complexity: O(n). Expected space complexity: O(n).",
        testCases: [
          { nums: [2, 7, 11, 15], target: 9, expected: [0, 1] },
          { nums: [3, 2, 4], target: 6, expected: [1, 2] },
        ],
        boilerplateCode: boilerplates["indexed-log-search"]!,
        isExecutable: true,
      },
    });
    requestData.problemDescription = selectedProblem.description;
    requestData.problemSlug = selectedProblem.slug;
    requestData.isExecutable = selectedProblem.isExecutable;
    const definition = problemCatalog.find((candidate) => candidate.slug === selectedProblem.slug);
    if (definition?.runnerEntryPoint && definition.runnerTestCases) {
      requestData.runnerEntryPoint = definition.runnerEntryPoint;
      requestData.runnerTestCases = definition.runnerTestCases;
    }
    const session = await prisma.interviewSession.create({
      data: {
        problemId: selectedProblem.id,
        ...(typeof userId === "string" ? { userId } : {}),
      },
    });
    const submission = await prisma.submission.create({
      data: {
        sessionId: session.id,
        problemId: selectedProblem.id,
        code,
        language,
      },
    });
    requestData.submissionId = submission.id;
    const job = await codeQueue.add("execute", requestData);
    response.status(202).json({ jobId: job.id, submissionId: submission.id, status: "queued" });
  } catch (error) {
    console.error("Could not queue code execution:", error);
    response.status(503).json({ error: "The code execution queue is unavailable" });
  }
});

app.get("/status/:jobId", async (request: Request, response: Response): Promise<void> => {
  const jobIdParam = request.params["jobId"];
  if (!jobIdParam || Array.isArray(jobIdParam)) {
    response.status(400).json({ error: "jobId is required" });
    return;
  }
  const jobId = jobIdParam;

  try {
    const job = await codeQueue.getJob(jobId);
    if (!job) {
      response.status(404).json({ error: "Execution job not found" });
      return;
    }

    const state = await job.getState();
    const progress = job.progress as {
      phase?: unknown;
      executionResult?: unknown;
      interview?: unknown;
    };
    if (state === "completed" && progress.phase === "interviewing" && progress.interview === undefined) {
      response.json({
        jobId,
        status: "active",
        progress: job.progress,
      });
      return;
    }
    if (state === "completed") {
      const result =
        progress.interview !== undefined && progress.executionResult !== undefined
          ? { ...progress.executionResult, interview: progress.interview }
          : job.returnvalue;
      response.json({ jobId, status: state, result });
      return;
    }
    if (state === "failed") {
      response.json({ jobId, status: state, error: job.failedReason ?? "Code execution failed" });
      return;
    }
    const phase = progress.phase;
    const effectiveStatus =
      phase === "executing" || phase === "interviewing" ? "active" : state;
    response.json({ jobId, status: effectiveStatus, progress: job.progress });
  } catch (error) {
    console.error("Could not read code execution status:", error);
    response.status(503).json({ error: "The code execution queue is unavailable" });
  }
});

const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  if (error && typeof error === "object" && "type" in error && error.type === "entity.too.large") {
    response.status(413).json({ error: "Profile image is too large" });
    return;
  }
  if (error instanceof SyntaxError) {
    response.status(400).json({ error: "Request body must be valid JSON" });
    return;
  }
  console.error("Unhandled request error:", error);
  response.status(500).json({ error: "Internal server error" });
};

app.use(errorHandler);

httpServer.listen(port, () => {
  console.log(`Code execution API listening on port ${port}`);
});

const shutdown = async (signal: string): Promise<void> => {
  console.log(`Received ${signal}; stopping API`);
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  await queueEvents.close();
  await codeQueue.close();
  await prisma.$disconnect();
  await redisConnection.quit();
  process.exit(0);
};

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

export { app };
