import { redirect } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import { getAppSession } from "@/auth";
import SignOutButton from "../SignOutButton";

type Assessment = {
  id: string;
  language: string;
  status: string;
  aiScore: number | null;
  aiFeedback: string | null;
  executionTimeMs: number | null;
  createdAt: string;
  report?: { shareToken: string } | null;
};

async function getAssessments(): Promise<Assessment[]> {
  const response = await fetch(
    `${process.env.BACKEND_INTERNAL_URL ?? "http://localhost:3001"}/recruiter/assessments`,
    {
      cache: "no-store",
      headers: { "x-recruiter-dashboard-key": process.env.RECRUITER_DASHBOARD_KEY ?? "" },
    },
  );
  if (!response.ok) throw new Error("Unable to load recruiter assessments");
  const payload = (await response.json()) as { assessments?: Assessment[] };
  return payload.assessments ?? [];
}

async function RecruiterDashboardContent() {
  const session = await getAppSession();
  if (!session?.user?.email) {
    redirect("/api/auth/signin?callbackUrl=%2Frecruiter&mode=recruiter");
  }
  if (session.user.role !== "recruiter") redirect("/dashboard");

  const assessments = await getAssessments();
  return (
    <main className="dashboard-shell dashboard-shell-header">
      <header className="dashboard-header">
        <div>
          <Link className="dashboard-home-link" href="/">
            ← Back to home
          </Link>
          <p className="eyebrow">CODEORACLE</p>
          <h1>Recruiter assessments</h1>
        </div>
        <div className="flex items-center gap-3">
          <p>{session.user.email}</p>
          <SignOutButton />
        </div>
      </header>
      <section className="assessment-list" aria-label="Candidate assessments">
        {assessments.length === 0 ? (
          <p className="dashboard-empty">No candidate assessments are available yet.</p>
        ) : (
          assessments.map((assessment) => (
            <article className="assessment-card" key={assessment.id}>
              <div>
                <p className="assessment-id">Submission {assessment.id}</p>
                <p>
                  {assessment.language} · {new Date(assessment.createdAt).toLocaleString()}
                </p>
              </div>
              <strong className="assessment-score">
                {assessment.aiScore === null ? "Pending" : `${assessment.aiScore}/100`}
              </strong>
              <p>{assessment.aiFeedback ?? "AI feedback is unavailable."}</p>
              <span className={`assessment-status status-${assessment.status.toLowerCase()}`}>
                {assessment.status}
              </span>
              {assessment.report && (
                <div className="report-actions">
                  <Link href={`/shared/${assessment.report.shareToken}`}>View full report</Link>
                  <a href={`/api/reports/share/${assessment.report.shareToken}/pdf`}>
                    Download PDF
                  </a>
                </div>
              )}
            </article>
          ))
        )}
      </section>
    </main>
  );
}

export default function RecruiterDashboard() {
  return (
    <Suspense fallback={<main className="dashboard-shell">Loading recruiter assessments...</main>}>
      <RecruiterDashboardContent />
    </Suspense>
  );
}
