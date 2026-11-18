"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import SignOutButton from "../SignOutButton";

type Profile = {
  name: string | null;
  avatarUrl: string | null;
  dateOfBirth: string | null;
  phone: string | null;
  email: string | null;
  targetRole: string | null;
  customRole?: string | null;
};

const emptyProfile: Profile = {
  name: "",
  avatarUrl: null,
  dateOfBirth: "",
  phone: "",
  email: "",
  targetRole: "",
};
const targetRoles = [
  "Web Developer",
  "Frontend Developer",
  "Backend Developer",
  "Full-Stack Developer",
  "Software Engineer",
  "Machine Learning/AI Engineer",
  "Data Scientist",
  "DevOps/SRE",
  "Mobile App Developer",
  "Cloud Architect",
  "Security Engineer",
  "QA/SDET",
  "General Software Engineering",
  "Others",
] as const;

export default function ProfileForm() {
  const [profile, setProfile] = useState<Profile>(emptyProfile);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    fetch("/api/profile")
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load your profile");
        const payload = (await response.json()) as { user?: Profile };
        if (!payload.user) throw new Error("Could not load your profile");
        setProfile({
          ...payload.user,
          dateOfBirth: payload.user.dateOfBirth?.slice(0, 10) ?? "",
        });
      })
      .catch((error: unknown) =>
        setMessage(
          error instanceof Error
            ? error.message
            : "Could not load your profile",
        ),
      )
      .finally(() => setLoading(false));
  }, []);

  function updateField(field: keyof Profile, value: string) {
    setProfile((current) => ({ ...current, [field]: value }));
  }

  function chooseAvatar(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setMessage("Please choose a JPG, PNG, or WebP image.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setMessage("Profile images must be 2 MB or smaller.");
      return;
    }
    setUploading(true);
    setMessage("");
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") {
        setProfile((current) => ({ ...current, avatarUrl: result }));
      }
      setUploading(false);
    };
    reader.onerror = () => {
      setMessage("Could not read that image.");
      setUploading(false);
    };
    reader.readAsDataURL(file);
  }

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: profile.name,
          avatarUrl: profile.avatarUrl,
          email: profile.email,
          targetRole: profile.targetRole,
          dateOfBirth: profile.dateOfBirth || null,
          phone: profile.phone || null,
        }),
      });
      const payload = (await response.json()) as {
        user?: Profile;
        error?: string;
      };
      if (!response.ok || !payload.user)
        throw new Error(payload.error ?? "Could not save your profile");
      setProfile({
        ...payload.user,
        dateOfBirth: payload.user.dateOfBirth?.slice(0, 10) ?? "",
      });
      setMessage("Profile saved.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not save your profile",
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p>Loading your profile...</p>;

  return (
    <section className="profile-card" aria-labelledby="profile-title">
      <Link className="dashboard-home-link" href="/dashboard">
        ← Back to dashboard
      </Link>
      <div className="profile-heading">
        <div className="profile-avatar-wrap">
          {profile.avatarUrl ? (
            <img className="profile-avatar" src={profile.avatarUrl} alt="Profile preview" />
          ) : (
            <div className="profile-avatar" aria-hidden="true">
              {(profile.name || "U").charAt(0).toUpperCase()}
            </div>
          )}
          <p className="profile-avatar-label">Profile picture</p>
          <label className="profile-avatar-upload">
            <span aria-hidden="true">✎</span> {uploading ? "Reading..." : "Edit"}
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseAvatar} disabled={uploading} />
          </label>
        </div>
        <div>
          <p className="eyebrow">ACCOUNT SETTINGS</p>
          <h1 id="profile-title">Your profile</h1>
          <p className="profile-intro">
            Manage the details used to personalize your interview experience.
          </p>
        </div>
        <SignOutButton className="profile-signout-button" />
      </div>
      <div className="profile-section-heading">
        <div>
          <h2>Personal information</h2>
          <p>Keep your identity and contact details current.</p>
        </div>
        <span>All fields are private</span>
      </div>
      <form className="profile-form" onSubmit={saveProfile}>
        <label>
          <span>Full name</span>
          <input
            value={profile.name ?? ""}
            onChange={(event) => updateField("name", event.target.value)}
            required
            maxLength={120}
          />
        </label>
        <label className="date-field">
          <span className="date-field__label">Date of birth</span>
          <input
            className="date-field__input"
            type="date"
            value={profile.dateOfBirth ?? ""}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(event) => updateField("dateOfBirth", event.target.value)}
            autoComplete="bday"
          />
        </label>
        <label>
          <span>Phone number</span>
          <input
            type="tel"
            value={profile.phone ?? ""}
            onChange={(event) => updateField("phone", event.target.value)}
            maxLength={30}
            placeholder="Add a phone number"
          />
        </label>
        <label>
          <span>Email address</span>
          <input
            type="email"
            value={profile.email ?? ""}
            onChange={(event) => updateField("email", event.target.value)}
            required
            maxLength={320}
          />
        </label>
        <label className="profile-role-field">
          <span>Target role</span>
          <select
            value={profile.targetRole ?? ""}
            onChange={(event) => updateField("targetRole", event.target.value)}
            required
          >
            <option value="" disabled>
              Select a target role
            </option>
            {targetRoles.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
        </label>
        {message && (
          <p
            className={
              message === "Profile saved." ? "profile-success" : "role-error"
            }
          >
            {message}
          </p>
        )}
        <div className="profile-form-footer">
          <p>Changes update your AI interview context immediately.</p>
          <button
            className="primary-cta profile-save-button"
            type="submit"
            disabled={saving}
          >
            {saving ? "Saving..." : "Save changes"}{" "}
            <span aria-hidden="true">→</span>
          </button>
        </div>
      </form>
    </section>
  );
}
