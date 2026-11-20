import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getAppSession } from "@/auth";
import AccountActions from "../AccountActions";
import RoleOnboarding from "./RoleOnboarding";

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

async function getAssessments(userId: string): Promise<{ assessments: Assessment[]; unavailable: boolean }> {
  try {
    const response = await fetch(
      `${process.env.BACKEND_INTERNAL_URL ?? "http://localhost:3001"}/users/${userId}/assessments`,
      {
        cache: "no-store",
        headers: { "x-auth-internal-key": process.env.AUTH_INTERNAL_KEY ?? "" },
      },
    );
    if (!response.ok) return { assessments: [], unavailable: true };
    const payload = (await response.json()) as { assessments?: Assessment[] };
    return { assessments: payload.assessments ?? [], unavailable: false };
  } catch {
    return { assessments: [], unavailable: true };
  }
}

async function getProfile(userId: string): Promise<{ targetRole: string | null; name: string | null; avatarUrl: string | null }> {
  const response = await fetch(
    `${process.env.BACKEND_INTERNAL_URL ?? "http://localhost:3001"}/users/${userId}/profile`,
    {
      cache: "no-store",
      headers: { "x-auth-internal-key": process.env.AUTH_INTERNAL_KEY ?? "" },
    },
  );
  if (!response.ok) return { targetRole: null, name: null, avatarUrl: null };
  const payload = (await response.json()) as {
    user?: { targetRole?: string | null; name?: string | null; avatarUrl?: string | null };
  };
  return {
    targetRole: payload.user?.targetRole ?? null,
    name: payload.user?.name ?? null,
    avatarUrl: payload.user?.avatarUrl ?? null,
  };
}

async function CandidateDashboardContent() {
  const session = await getAppSession();
  if (!session?.user?.id) {
    redirect("/api/auth/signin?callbackUrl=%2Fdashboard&mode=candidate");
  }
  if (session.user.role === "recruiter") redirect("/recruiter");

  const { assessments, unavailable: assessmentsUnavailable } = await getAssessments(session.user.id);
  const profile = await getProfile(session.user.id);
  if (!profile.targetRole && !session.user.targetRole) {
    return (
      <main className="dashboard-shell">
        <RoleOnboarding />
      </main>
    );
  }
  const displayName = profile.name ?? session.user.name ?? "Candidate";
  return (
    <main className="dashboard-shell dashboard-shell-header">
      <header className="dashboard-header">
        <div className="dashboard-brand-row">
          <Link className="brand-mark dashboard-brand" href="/">
            <img className="brand-logo" src="/codeOracle_logo.png" alt="CodeOracle" />
          </Link>
          <AccountActions name={displayName} avatarUrl={profile.avatarUrl} />
        </div>
        <div className="dashboard-title-row">
          <div>
            <Link className="dashboard-home-link" href="/">← Back to home</Link>
            <p className="eyebrow">YOUR PRACTICE SPACE</p>
            <h1>Interview dashboard</h1>
          </div>
        </div>
      </header>
      <div className="dashboard-actions">
        <div>
          <p className="dashboard-welcome">Welcome back, {displayName}.</p>
          <p>Review your practice history and keep improving your interview signal.</p>
        </div>
        <Link className="primary-cta" href="/interview">
          Start New Interview <span aria-hidden="true">-&gt;</span>
        </Link>
      </div>
      <section className="assessment-list" aria-label="Interview history">
        {assessmentsUnavailable ? (
          <p className="assessment-unavailable" role="status">
            Interview history is temporarily unavailable. <a href="/dashboard">Refresh to try again.</a>
          </p>
        ) : assessments.length === 0 ? (
          <p className="dashboard-empty">No interviews yet. Start your first practice session.</p>
        ) : (
          assessments.map((assessment) => (
            <article className="assessment-card" key={assessment.id}>
              <div>
                <p className="assessment-id">{assessment.language} interview</p>
                <p>{new Date(assessment.createdAt).toLocaleString()}</p>
              </div>
              <strong className="assessment-score">
                {assessment.aiScore === null ? "Pending" : `${assessment.aiScore}/100`}
              </strong>
              <p>{assessment.aiFeedback ?? "Feedback is not available yet."}</p>
              <span className={`assessment-status status-${assessment.status.toLowerCase()}`}>
                {assessment.status}
              </span>
              {assessment.report && (
                <div className="report-actions">
                  <Link href={`/shared/${assessment.report.shareToken}`}>View shareable report</Link>
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

export default function CandidateDashboard() {
  return (
    <Suspense fallback={<main className="dashboard-shell">Loading interview history...</main>}>
      <CandidateDashboardContent />
    </Suspense>
  );
}
