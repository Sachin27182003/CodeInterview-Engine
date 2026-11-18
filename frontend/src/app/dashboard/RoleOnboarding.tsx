"use client";

import { useState } from "react";

const roles = [
  ["Web Developer", "Build modern web experiences"],
  ["Frontend Developer", "Craft polished user interfaces"],
  ["Backend Developer", "Design reliable APIs and services"],
  ["Full-Stack Developer", "Own products from UI to database"],
  ["Software Engineer", "Solve complex engineering problems"],
  ["Machine Learning/AI Engineer", "Build intelligent systems"],
  ["Data Scientist", "Turn data into useful decisions"],
  ["DevOps/SRE", "Automate and operate at scale"],
  ["Mobile App Developer", "Create native mobile experiences"],
  ["Cloud Architect", "Design secure cloud platforms"],
  ["Security Engineer", "Protect systems and data"],
  ["QA/SDET", "Build quality through automation"],
  ["General Software Engineering", "Practice broad fundamentals"],
  ["Others", "Tell us about your target role"],
] as const;
type TargetRole = (typeof roles)[number][0];

export default function RoleOnboarding() {
  const [targetRole, setTargetRole] = useState<TargetRole>("General Software Engineering");
  const [customRole, setCustomRole] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function saveRole(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/profile/role", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetRole, ...(targetRole === "Others" ? { customRole } : {}) }),
      });
      if (!response.ok) {
        const contentType = response.headers.get("content-type") ?? "";
        if (contentType.includes("application/json")) {
          const payload = (await response.json()) as { error?: string };
          throw new Error(payload.error ?? "Could not save your target role");
        }
        throw new Error(
          response.status === 404
            ? "Role service is unavailable. Restart the backend and try again."
            : `Could not save your target role (HTTP ${response.status})`,
        );
      }
      window.location.reload();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save your target role");
      setSaving(false);
    }
  }

  return (
    <section className="role-onboarding" aria-labelledby="role-onboarding-title">
      <p className="eyebrow">PERSONALIZE YOUR INTERVIEW</p>
      <h2 id="role-onboarding-title">Which role are you targeting?</h2>
      <p>We will tailor Gemini&apos;s technical questions to this role.</p>
      <form onSubmit={saveRole}>
        <div className="role-step-meta">
          <span>Step 1 of 1</span>
          <span>Select one role to continue</span>
        </div>
        <div className="role-grid">
          {roles.map(([role, description]) => (
            <label className={`role-tile${targetRole === role ? " selected" : ""}`} key={role}>
              <input
                type="radio"
                name="targetRole"
                value={role}
                checked={targetRole === role}
                onChange={() => setTargetRole(role)}
              />
              <span className="role-tile-check" aria-hidden="true">✓</span>
              <span className="role-tile-content">
                <strong>{role}</strong>
                <small>{description}</small>
              </span>
            </label>
          ))}
        </div>
        {targetRole === "Others" && (
          <input
            className="role-custom-input"
            value={customRole}
            onChange={(event) => setCustomRole(event.target.value)}
            placeholder="e.g. Blockchain Developer"
            required
            maxLength={100}
          />
        )}
        {error && <p className="role-error">{error}</p>}
        <div className="role-form-footer">
          <span>Your choice can be updated later.</span>
          <button className="primary-cta" type="submit" disabled={saving}>
            {saving ? "Saving..." : "Continue"}
            <span aria-hidden="true">→</span>
          </button>
        </div>
      </form>
    </section>
  );
}
