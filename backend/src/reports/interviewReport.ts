import PDFDocument from "pdfkit";
import { prisma } from "../db.js";

export type TranscriptEntry = {
  role: "user" | "assistant";
  text: string;
  timestamp: string;
};

function inferComplexity(code: string): { time: string; space: string } {
  const normalized = code.toLowerCase();
  const hasNestedLoop =
    /(for|while)[\s\S]{0,800}(for|while)/.test(normalized) ||
    normalized.match(/\b(for|while)\b/g)?.length === 2;
  const hasSorting = /\b(sort|sorted|sort_by)\b/.test(normalized);
  const allocatesCollection = /\b(map|set|dict|array|object|vector|unordered_map|hashmap)\b/.test(
    normalized,
  );

  return {
    time: hasNestedLoop ? "O(n²)" : hasSorting ? "O(n log n)" : "O(n)",
    space: allocatesCollection ? "O(n)" : "O(1)",
  };
}

function asTranscript(value: unknown): TranscriptEntry[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is TranscriptEntry => {
    if (!entry || typeof entry !== "object") return false;
    const candidate = entry as Record<string, unknown>;
    return (
      (candidate.role === "user" || candidate.role === "assistant") &&
      typeof candidate.text === "string" &&
      typeof candidate.timestamp === "string"
    );
  });
}

export async function createInterviewReport(submissionId: string): Promise<void> {
  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    select: { id: true, code: true, report: { select: { id: true } } },
  });
  if (!submission) throw new Error(`Submission ${submissionId} was not found`);
  const complexity = inferComplexity(submission.code);
  await prisma.interviewReport.upsert({
    where: { submissionId },
    update: {
      timeComplexity: complexity.time,
      spaceComplexity: complexity.space,
    },
    create: {
      submissionId,
      timeComplexity: complexity.time,
      spaceComplexity: complexity.space,
    },
  });
}

export async function appendTranscript(
  submissionId: string,
  entry: TranscriptEntry,
): Promise<void> {
  const report = await prisma.interviewReport.findUnique({
    where: { submissionId },
    select: { transcript: true },
  });
  if (!report) throw new Error(`Report for submission ${submissionId} was not found`);
  const transcript = [...asTranscript(report.transcript), entry].slice(-200);
  await prisma.interviewReport.update({
    where: { submissionId },
    data: { transcript },
  });
}

export async function getReportBySubmissionId(submissionId: string) {
  return prisma.interviewReport.findUnique({
    where: { submissionId },
    include: {
      submission: {
        include: {
          problem: { select: { title: true, description: true } },
          session: { include: { user: { select: { name: true, email: true } } } },
        },
      },
    },
  });
}

export async function getReportByShareToken(shareToken: string) {
  return prisma.interviewReport.findUnique({
    where: { shareToken },
    include: {
      submission: {
        include: {
          problem: { select: { title: true, description: true } },
          session: { include: { user: { select: { name: true, email: true } } } },
        },
      },
    },
  });
}

export async function renderReportPdf(report: NonNullable<Awaited<ReturnType<typeof getReportBySubmissionId>>>) {
  const document = new PDFDocument({ margin: 48 });
  const chunks: Buffer[] = [];
  document.on("data", (chunk: Buffer) => chunks.push(chunk));
  const completed = new Promise<Buffer>((resolve, reject) => {
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.on("error", reject);
  });

  const candidate = report.submission.session.user?.name ?? report.submission.session.user?.email ?? "Candidate";
  document.fontSize(22).text("CodeOracle Interview Report");
  document.moveDown(0.5).fontSize(11).fillColor("#555").text(`Candidate: ${candidate}`);
  document.text(`Problem: ${report.submission.problem.title}`);
  document.text(`Language: ${report.submission.language}`);
  document.text(`Generated: ${report.createdAt.toISOString()}`);
  document.fillColor("#000").moveDown();
  document.fontSize(14).text("Problem statement");
  document.fontSize(10).text(report.submission.problem.description);
  document.moveDown();
  document.fontSize(14).text("Assessment");
  document.fontSize(11).text(`Score: ${report.submission.aiScore ?? "Pending"}/100`);
  document.text(`Time complexity: ${report.timeComplexity}`);
  document.text(`Space complexity: ${report.spaceComplexity}`);
  document.text(`Execution status: ${report.submission.timedOut ? "Timed out" : report.submission.exitCode === 0 ? "Passed" : "Failed or unavailable"}`);
  document.text(`Runtime: ${report.submission.executionTimeMs === null ? "Unavailable" : `${report.submission.executionTimeMs} ms`}`);
  document.text(`Exit code: ${report.submission.exitCode ?? "Unavailable"}`);
  const testSummary = report.submission.stdout?.match(/Passed\s+(\d+)\s*\/\s*(\d+)\s+tests?/i);
  const sourceLines = report.submission.code.split(/\r?\n/);
  document.text(`Tests passed: ${testSummary ? `${testSummary[1]} / ${testSummary[2]}` : "No test summary returned"}`);
  document.text(`Source lines: ${sourceLines.length} total, ${sourceLines.filter((line) => line.trim()).length} non-empty`);
  document.text(`Code size: ${report.submission.code.length} characters`);
  document.text(`Candidate responses: ${asTranscript(report.transcript).filter((entry) => entry.role === "user").length}`);
  document.text(`Interviewer messages: ${asTranscript(report.transcript).filter((entry) => entry.role === "assistant").length}`);
  document.moveDown().fontSize(14).text("AI feedback");
  document.fontSize(11).text(report.submission.aiFeedback ?? "AI feedback is unavailable.");
  document.moveDown().fontSize(9).fillColor("#555").text("Assessment basis: The AI score reflects available interview feedback. Separate communication skills and nervousness ratings are not currently generated. The transcript is included for context.").fillColor("#000");
  if (report.submission.stderr) {
    document.moveDown().fontSize(14).text("Compiler or runtime errors");
    document.font("Courier").fontSize(8).text(report.submission.stderr);
    document.font("Helvetica");
  }
  if (report.submission.stdout) {
    document.moveDown().fontSize(14).text("Execution output");
    document.font("Courier").fontSize(8).text(report.submission.stdout);
    document.font("Helvetica");
  }
  document.moveDown().fontSize(14).text("Submitted code");
  document.font("Courier").fontSize(8).text(report.submission.code);
  document.font("Helvetica").fontSize(14).moveDown().text("Interview transcript");
  document.fontSize(10);
  for (const entry of asTranscript(report.transcript)) {
    document.moveDown(0.35).font("Helvetica-Bold").text(`${entry.role === "user" ? "Candidate" : "AI interviewer"}:`);
    document.font("Helvetica").text(entry.text);
  }
  document.end();
  return completed;
}
