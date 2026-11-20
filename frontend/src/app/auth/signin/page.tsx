"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

type Provider = "google" | "github";

function SignInOptions() {
  const searchParams = useSearchParams();
  const requestedCallback = searchParams.get("callbackUrl") ?? "/dashboard";
  const callbackPath = (() => {
    try {
      return new URL(requestedCallback, "http://localhost").pathname;
    } catch {
      return requestedCallback;
    }
  })();
  const isRecruiter =
    searchParams.get("mode") === "recruiter" || callbackPath.startsWith("/recruiter");
  const destination = isRecruiter ? "/recruiter" : "/dashboard";

  const [isSignUp, setIsSignUp] = useState(false);
  const [pending, setPending] = useState(false);
  const [pendingProvider, setPendingProvider] = useState<Provider | null>(null);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [emailValue, setEmailValue] = useState("");
  const [passwordValue, setPasswordValue] = useState("");

  function clearError() {
    setError("");
    setSuccessMessage("");
  }

  function safeCallbackUrl(): string {
    try {
      const url = new URL(requestedCallback, window.location.origin);
      return url.origin === window.location.origin
        ? `${url.pathname}${url.search}${url.hash}`
        : destination;
    } catch {
      return destination;
    }
  }

  async function submitCredentials(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    clearError();

    const formData = new FormData(event.currentTarget);
    const name = String(formData.get("name") ?? "").trim();
    const email = emailValue.trim();
    const password = passwordValue;
    const confirmPassword = String(formData.get("confirmPassword") ?? "");
    try {
      if (isSignUp) {
        if (password.length < 12) {
          throw new Error("Password must be at least 12 characters long.");
        }
        if (password !== confirmPassword) throw new Error("Your passwords do not match.");
        const registration = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, email, password }),
        });
        const registrationBody = (await registration.json()) as { error?: string };
        if (!registration.ok) {
          throw new Error(registrationBody.error ?? "Could not create your account.");
        }
        setIsSignUp(false);
        setSuccessMessage("Your account is ready. Log in with the password you just created.");
        setPending(false);
        return;
      }

      const callbackUrl = safeCallbackUrl();
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
        callbackUrl,
      });
      if (!result || result.error || !result.ok) {
        const credentialMessages: Record<string, string> = {
          email_not_found: "Email does not exist. Please sign up.",
          invalid_password: "Password is invalid.",
          password_not_set: "This account does not have a password. Try Google or GitHub sign-in.",
          auth_unavailable: "Sign-in is temporarily unavailable. Please try again.",
        };
        throw new Error(
          (result?.code && credentialMessages[result.code]) || "Unable to sign in. Please check your details and try again.",
        );
      }
      const signedInUrl = new URL(result.url ?? callbackUrl, window.location.origin);
      window.location.assign(
        signedInUrl.origin === window.location.origin
          ? `${signedInUrl.pathname}${signedInUrl.search}${signedInUrl.hash}`
          : destination,
      );
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : "Authentication is temporarily unavailable.";
      setError(message);
      setPending(false);
    }
  }

  function handleOAuth(provider: Provider) {
    setPendingProvider(provider);
    clearError();
    void signIn(provider, { callbackUrl: safeCallbackUrl() });
  }

  const activeTab = "auth-mode-option is-active";
  const inactiveTab = "auth-mode-option";

  return (
    <main className={`auth-page${isRecruiter ? " auth-page-recruiter" : " auth-page-candidate"}`}>
      <div className="auth-background-glow auth-background-glow-one" />
      <div className="auth-background-glow auth-background-glow-two" />
      <section className="auth-card" aria-labelledby="sign-in-title">
        <Link className="auth-brand" href="/">
          <img className="brand-logo" src="/codeOracle_logo.png" alt="CodeOracle" />
        </Link>

        <div className="auth-card-heading">
          <p className="eyebrow">{isRecruiter ? "RECRUITER PORTAL" : "AI INTERVIEW LAB"}</p>
          <h1 id="sign-in-title">
            {isRecruiter
              ? "Welcome back, recruiter."
              : isSignUp
                ? "Create your candidate account."
                : "Your next interview starts here."}
          </h1>
          <p>
            {isRecruiter
              ? "Sign in to review candidate assessments. Recruiter access is limited to approved accounts."
              : isSignUp
                ? "Create an account to practice coding and track your interview progress."
                : "Sign in to practice coding, explain your decisions, and track your progress."}
          </p>
        </div>

        <div className="auth-mode-switch" aria-label="Account type">
          <Link
            className={!isRecruiter ? activeTab : inactiveTab}
            href="/auth/signin?callbackUrl=%2Fdashboard&mode=candidate"
            aria-current={!isRecruiter ? "page" : undefined}
          >
            Candidate
          </Link>
          <Link
            className={isRecruiter ? activeTab : inactiveTab}
            href="/auth/signin?callbackUrl=%2Frecruiter&mode=recruiter"
            aria-current={isRecruiter ? "page" : undefined}
          >
            Recruiter
          </Link>
        </div>

        <form className="auth-form" onSubmit={submitCredentials}>
          {isSignUp && !isRecruiter && (
            <label className="auth-field" htmlFor="name">
              Full name
              <input
                className="auth-input"
                id="name"
                name="name"
                type="text"
                autoComplete="name"
                minLength={2}
                maxLength={120}
                required
              />
            </label>
          )}
          <label className="auth-field" htmlFor="email">
            Email address
            <input
              className="auth-input"
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              maxLength={320}
              value={emailValue}
              onChange={(event) => {
                setEmailValue(event.target.value);
                clearError();
              }}
              required
            />
          </label>
          <label className="auth-field" htmlFor="password">
            Password
            <input
              className="auth-input"
              id="password"
              name="password"
              type="password"
              autoComplete={isSignUp ? "new-password" : "current-password"}
              maxLength={72}
              value={passwordValue}
              onChange={(event) => {
                setPasswordValue(event.target.value);
                clearError();
              }}
              required
            />
            {isSignUp && <span className="auth-field-hint">Use at least 12 characters.</span>}
          </label>
          {isSignUp && !isRecruiter && (
            <label className="auth-field" htmlFor="confirmPassword">
              Confirm password
              <input
                className="auth-input"
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                maxLength={72}
                onChange={clearError}
                required
              />
            </label>
          )}

          {successMessage && <p className="auth-success" role="status">{successMessage}</p>}
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button
            className="auth-submit"
            type="submit"
            disabled={pending || pendingProvider !== null}
          >
            {pending ? "Please wait…" : isSignUp ? "Create candidate account" : isRecruiter ? "Log in as recruiter" : "Log in"}
          </button>
        </form>

        {!isRecruiter && (
          <p className="auth-toggle-line">
            {isSignUp ? "Already have an account?" : "New to CodeOracle?"}{" "}
            <button
              className="auth-inline-link"
              type="button"
              onClick={() => {
                setIsSignUp((current) => !current);
                clearError();
              }}
            >
              {isSignUp ? "Log in" : "Sign up"}
            </button>
          </p>
        )}

        <div className="auth-divider">
          <span />
          Or continue with
          <span />
        </div>
        <div className="auth-provider-list">
          <button
            className="auth-provider-button"
            type="button"
            onClick={() => handleOAuth("google")}
            disabled={pending || pendingProvider !== null}
          >
            <span className="provider-icon provider-icon-google">G</span>
            <span>{pendingProvider === "google" ? "Connecting…" : "Continue with Google"}</span>
            <span className="auth-provider-arrow" aria-hidden="true">-&gt;</span>
          </button>
          <button
            className="auth-provider-button"
            type="button"
            onClick={() => handleOAuth("github")}
            disabled={pending || pendingProvider !== null}
          >
            <span className="provider-icon provider-icon-github">GH</span>
            <span>{pendingProvider === "github" ? "Connecting…" : "Continue with GitHub"}</span>
            <span className="auth-provider-arrow" aria-hidden="true">-&gt;</span>
          </button>
        </div>

        <p className="auth-note">
          {isRecruiter
            ? "Recruiter access is granted only to accounts on the approved recruiter list."
            : "By continuing, you agree to use CodeOracle for interview practice and assessment."}
        </p>
        <Link className="auth-back-link" href="/">
          &lt;- Back to home
        </Link>
      </section>
    </main>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={<main className="auth-page"><section className="auth-card">Loading sign in...</section></main>}>
      <SignInOptions />
    </Suspense>
  );
}
