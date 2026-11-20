import Link from "next/link";

export const instant = false;

type SharedReport = {
  candidateName: string;
  problemTitle: string;
  problemDescription: string;
  language: string;
  score: number | null;
  feedback: string | null;
  executionTimeMs: number | null;
  stdout: string | null;
  stderr: string | null;
  exitCode: number | null;
  timedOut: boolean;
  executionStatus: string;
  timeComplexity: string;
  spaceComplexity: string;
  code: string;
  transcript: Array<{ role: "user" | "assistant"; text: string; timestamp: string }>;
  communicationAssessment: {
    status: "assessed" | "limited" | "not_assessed" | "unavailable";
    interviewAnswerQuality: number | null;
    communicationClarity: number | null;
    englishProficiency: number | null;
    confidence: number | null;
    nervousnessIndicators: "low" | "moderate" | "high" | "not_assessed";
    summary: string;
    evidence: string[];
  } | null;
  createdAt: string;
};

async function getReport(shareToken: string): Promise<SharedReport> {
  const response = await fetch(
    `${process.env.BACKEND_INTERNAL_URL ?? "http://localhost:3001"}/reports/share/${shareToken}`,
    { cache: "no-store" },
  );
  if (!response.ok) throw new Error("Shared report not found");
  const payload = (await response.json()) as { report?: SharedReport };
  if (!payload.report) throw new Error("Shared report not found");
  return payload.report;
}

export default async function SharedReportPage({
  params,
}: {
  params: Promise<{ shareToken: string }>;
}) {
  const { shareToken } = await params;
  const report = await getReport(shareToken);
  const sourceLines = report.code.split(/\r?\n/);
  const testSummary = report.stdout?.match(/Passed\s+(\d+)\s*\/\s*(\d+)\s+tests?/i);
  const communication = report.communicationAssessment;
  const hasCommunicationScores = communication?.status === "assessed" || communication?.status === "limited";
  return (
    <main className="dashboard-shell shared-report-page">
      <header className="dashboard-header shared-report-header">
        <div className="shared-report-heading">
          <Link className="shared-report-brand" href="/">
            <img className="brand-logo" src="/codeOracle_logo.png" alt="CodeOracle" />
          </Link>
          <p className="eyebrow">SHAREABLE PROOF OF SKILL</p>
          <h1>{report.candidateName}</h1>
          <p className="shared-report-meta"><span>{report.problemTitle}</span><span>{report.language}</span></p>
        </div>
        <a className="primary-cta shared-report-download" href={`/api/reports/share/${shareToken}/pdf`}>
          Download PDF
        </a>
      </header>
      <section className="assessment-card shared-report-score">
        <div className="shared-score-value">
          <strong className="assessment-score">{report.score === null ? "Pending" : report.score}</strong>
          {report.score !== null && <span>/ 100</span>}
        </div>
        <p className="shared-report-feedback">{report.feedback ?? "AI feedback is unavailable."}</p>
        <div className="shared-complexities">
          <p><span>Time complexity</span><strong>{report.timeComplexity}</strong></p>
          <p><span>Space complexity</span><strong>{report.spaceComplexity}</strong></p>
        </div>
      </section>
      <section className="assessment-card shared-report-section">
        <div className="shared-section-heading"><div><span className="eyebrow">COMMUNICATION &amp; DELIVERY</span><h2>Interview speaking signals</h2></div>{communication?.status === "limited" && <span className="assessment-evidence-badge">Limited evidence</span>}</div>
        <div className="report-facts-grid shared-report-facts">
          <div className="report-fact"><span>Verbal answer quality</span><strong>{hasCommunicationScores && communication.interviewAnswerQuality !== null ? `${communication.interviewAnswerQuality}/100` : "Not assessed"}</strong></div>
          <div className="report-fact"><span>Communication clarity</span><strong>{hasCommunicationScores && communication.communicationClarity !== null ? `${communication.communicationClarity}/100` : "Not assessed"}</strong></div>
          <div className="report-fact"><span>English proficiency</span><strong>{hasCommunicationScores && communication.englishProficiency !== null ? `${communication.englishProficiency}/100` : "Not assessed"}</strong></div>
          <div className="report-fact"><span>Confidence</span><strong>{hasCommunicationScores && communication.confidence !== null ? `${communication.confidence}/100` : "Not assessed"}</strong></div>
          <div className="report-fact"><span>Nervousness indicators</span><strong>{hasCommunicationScores ? communication.nervousnessIndicators : "Not assessed"}</strong></div>
        </div>
        <p className="report-communication-summary">{communication?.summary ?? "Communication feedback is not available for this report."}</p>
        {communication?.evidence.length ? <ul className="report-communication-evidence">{communication.evidence.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul> : null}
        <p className="report-assessment-caveat">These transcript-based coaching indicators are not a clinical assessment and do not evaluate accent or pronunciation.</p>
      </section>
      <section className="assessment-card shared-report-section shared-details-section">
        <div className="shared-section-heading"><div><span className="eyebrow">ASSESSMENT DETAILS</span><h2>Interview and execution</h2></div><span className={`shared-execution-status ${report.timedOut || report.exitCode !== 0 ? "is-warning" : "is-success"}`}>{report.timedOut ? "Timed out" : report.exitCode === 0 ? "Execution passed" : "Execution failed"}</span></div>
        <div className="shared-details-content">
          <section className="shared-problem-statement"><h3>Problem statement</h3><p>{report.problemDescription}</p></section>
          <div className="report-facts-grid shared-report-facts">
            <div className="report-fact"><span>Runtime</span><strong>{report.executionTimeMs === null ? "Unavailable" : `${report.executionTimeMs} ms`}</strong></div>
            <div className="report-fact"><span>Exit code</span><strong>{report.exitCode ?? "Unavailable"}</strong></div>
            <div className="report-fact"><span>Candidate responses</span><strong>{report.transcript.filter((entry) => entry.role === "user").length}</strong></div>
            <div className="report-fact"><span>Interviewer messages</span><strong>{report.transcript.filter((entry) => entry.role === "assistant").length}</strong></div>
            <div className="report-fact"><span>Submission status</span><strong>{report.executionStatus}</strong></div>
            <div className="report-fact"><span>Report created</span><strong>{new Date(report.createdAt).toLocaleString()}</strong></div>
            <div className="report-fact"><span>Tests passed</span><strong>{testSummary ? `${testSummary[1]} / ${testSummary[2]}` : "No test summary returned"}</strong></div>
            <div className="report-fact"><span>Source lines</span><strong>{sourceLines.length} total · {sourceLines.filter((line) => line.trim()).length} non-empty</strong></div>
            <div className="report-fact"><span>Code size</span><strong>{report.code.length.toLocaleString()} characters</strong></div>
          </div>
          {report.stderr && <details className="report-output-details shared-output-details"><summary>Compiler or runtime output</summary><pre>{report.stderr}</pre></details>}
          {report.stdout && <details className="report-output-details shared-output-details"><summary>Full execution output</summary><pre>{report.stdout}</pre></details>}
        </div>
      </section>
      <section className="assessment-card shared-report-section">
        <div className="shared-section-heading"><div><span className="eyebrow">SOLUTION</span><h2>Submitted code</h2></div><span className="shared-language">{report.language}</span></div>
        <pre className="shared-code"><code>{report.code}</code></pre>
      </section>
      <p className="shared-assessment-note">Assessment basis: The overall score combines code performance (50%), verbal answer quality (25%), and communication clarity and confidence (25%). Nervousness indicators are transcript-based coaching feedback and do not directly affect the score.</p>
      <section className="assessment-card shared-report-section shared-transcript-section">
        <div className="shared-section-heading"><div><span className="eyebrow">CONVERSATION</span><h2>Interview transcript</h2></div><span className="shared-entry-count">{report.transcript.length} {report.transcript.length === 1 ? "message" : "messages"}</span></div>
        {report.transcript.length === 0 ? (
          <p className="shared-empty-transcript">Transcript was not captured for this interview.</p>
        ) : (
          <ol className="shared-transcript-list">
            {report.transcript.map((entry, index) => (
              <li className={`shared-transcript-entry ${entry.role === "user" ? "is-candidate" : "is-interviewer"}`} key={`${entry.timestamp}-${index}`}>
                <span className="shared-speaker">{entry.role === "user" ? "Candidate" : "AI interviewer"}</span>
                <p>{entry.text}</p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}
