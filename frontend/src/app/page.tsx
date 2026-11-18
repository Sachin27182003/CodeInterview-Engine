"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useEffect } from "react";
import HomeAccountMenu from "./HomeAccountMenu";

const features = [
  {
    eyebrow: "01 / LIVE FEEDBACK",
    title: "Talk through your solution",
    description:
      "Practice explaining your thinking with Gemini voice feedback that feels like a real technical interview.",
  },
  {
    eyebrow: "02 / SAFE EXECUTION",
    title: "Run code with confidence",
    description:
      "Test your solution in an isolated sandbox with clear results across JavaScript, Python, Java, C, and C++.",
  },
  {
    eyebrow: "03 / HR-READY SIGNALS",
    title: "See your interview score",
    description:
      "Turn correctness, communication, and technical reasoning into a clear assessment you can improve.",
  },
];

const steps = [
  ["01", "Select a problem", "Choose a focused challenge that matches your target role."],
  ["02", "Write and run code", "Build your solution and get instant execution feedback."],
  ["03", "Talk to your AI interviewer", "Defend your choices and reason about complexity out loud."],
  ["04", "Get scored", "Review concise feedback and your overall interview signal."],
];

export default function LandingPage() {
  const { data: session, status } = useSession();
  const signedIn = status === "authenticated" && Boolean(session?.user);
  const profileName = session?.user?.name || session?.user?.email?.split("@")[0] || "My profile";
  const isRecruiter =
    (session?.user as { role?: "recruiter" | "candidate" } | undefined)?.role === "recruiter";
  const primaryDestination = isRecruiter ? "/recruiter" : "/interview";

  useEffect(() => {
    const revealElements = document.querySelectorAll<HTMLElement>("[data-reveal]");
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.14 },
    );
    revealElements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, []);

  return (
    <main className="landing-page">
      <nav className="landing-nav">
        <Link className="brand-mark" href="/">
          <span className="brand-symbol">C</span>
          CODEORACLE
        </Link>
        <div className="landing-nav-links">
          <a href="#features">Platform</a>
          <a href="#how-it-works">How it works</a>
          <Link href="/api/auth/signin?callbackUrl=%2Frecruiter&mode=recruiter">
            Recruiter sign in
          </Link>
        </div>
        <div className="landing-account-actions">
          {status === "loading" ? (
            <span className="landing-session-loading" aria-label="Checking sign-in status" />
          ) : signedIn ? (
            <HomeAccountMenu
              name={profileName}
              avatarUrl={session?.user?.image}
              dashboardHref={isRecruiter ? "/recruiter" : "/dashboard"}
            />
          ) : (
            <Link className="nav-cta" href="/api/auth/signin?callbackUrl=%2Fdashboard&mode=candidate">
              Sign in to practice
            </Link>
          )}
        </div>
      </nav>

      <section className="landing-hero">
        <div className="hero-copy" data-reveal>
          <p className="eyebrow">THE AI INTERVIEW LAB</p>
          <h1>
            Crack your next
            <span> technical interview.</span>
          </h1>
          <p className="hero-subtitle">
            A realistic coding interview environment where you write, run, explain,
            and improve your solution with an AI interviewer by your side.
          </p>
          <div className="hero-actions">
            <Link className="primary-cta" href={signedIn ? primaryDestination : "/api/auth/signin?callbackUrl=%2Fdashboard&mode=candidate"}>
              {signedIn ? (isRecruiter ? "Open recruiter dashboard" : "Try a mock interview") : "Try a mock interview"} <span aria-hidden="true">-&gt;</span>
            </Link>
            <a className="text-cta" href="#how-it-works">
              See how it works
            </a>
          </div>
          <div className="hero-proof">
            <span className="proof-dot" />
            Built for focused, repeatable practice
          </div>
        </div>

        <div className="hero-console" data-reveal>
          <div className="console-topbar">
            <span className="console-dots"><i /><i /><i /></span>
            <span>mock-interview / two-sum</span>
            <span className="console-live">LIVE</span>
          </div>
          <div className="console-body">
            <div className="console-code">
              <span className="code-muted">01</span> <b>function</b> twoSum(nums, target) {"{"}
              <br />
              <span className="code-muted">02</span> &nbsp;&nbsp;<b>const</b> seen = <b>new</b> Map();
              <br />
              <span className="code-muted">03</span> &nbsp;&nbsp;<b>for</b> (<b>const</b> [i, num] <b>of</b> nums.entries()) {"{"}
              <br />
              <span className="code-muted">04</span> &nbsp;&nbsp;&nbsp;&nbsp;<b>const</b> needed = target - num;
              <br />
              <span className="code-muted">05</span> &nbsp;&nbsp;&nbsp;&nbsp;<span className="code-highlight">...</span>
              <br />
              <span className="code-muted">06</span> &nbsp;&nbsp;{"}"}
              <br />
              <span className="code-muted">07</span> {"}"}
            </div>
            <div className="console-feedback">
              <div className="feedback-label"><span className="pulse-dot" /> AI INTERVIEWER</div>
              <p>&quot;Walk me through the time complexity of your approach.&quot;</p>
              <div className="feedback-wave"><span /><span /><span /><span /><span /><span /><span /></div>
              <small>Listening for your response...</small>
            </div>
          </div>
          <div className="console-footer">
            <span>EXECUTION OUTPUT</span>
            <strong>Passed 4/4 tests</strong>
            <span className="score-pill">SCORE 86</span>
          </div>
        </div>
      </section>

      <section className="trust-strip" data-reveal>
        <span>Practice the signals that matter</span>
        <span>CODE <b>+</b> COMMUNICATION <b>+</b> CONFIDENCE</span>
      </section>

      <section className="landing-section features-section" id="features">
        <div className="section-heading" data-reveal>
          <p className="eyebrow">ONE PLATFORM / COMPLETE SIGNAL</p>
          <h2>More than a code editor.</h2>
          <p>Every session is designed to mirror the pressure and rhythm of a real interview loop.</p>
        </div>
        <div className="feature-grid">
          {features.map((feature) => (
            <article className="feature-card" data-reveal key={feature.eyebrow}>
              <p className="card-eyebrow">{feature.eyebrow}</p>
              <div className="feature-icon" aria-hidden="true">+</div>
              <h3>{feature.title}</h3>
              <p>{feature.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-section journey-section" id="how-it-works">
        <div className="section-heading" data-reveal>
          <p className="eyebrow">THE INTERVIEW LOOP</p>
          <h2>From first line to final score.</h2>
        </div>
        <div className="journey-grid">
          {steps.map(([number, title, description]) => (
            <article className="journey-step" data-reveal key={number}>
              <span className="step-number">{number}</span>
              <div>
                <h3>{title}</h3>
                <p>{description}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-cta" data-reveal>
        <p className="eyebrow">YOUR NEXT OFFER STARTS WITH PRACTICE</p>
        <h2>Make your next interview feel familiar.</h2>
        <Link className="primary-cta" href={signedIn ? primaryDestination : "/api/auth/signin?callbackUrl=%2Fdashboard&mode=candidate"}>
          {signedIn ? (isRecruiter ? "Open recruiter dashboard" : "Start a mock interview") : "Start a mock interview"} <span aria-hidden="true">-&gt;</span>
        </Link>
      </section>

      <footer className="landing-footer">
        <Link className="brand-mark" href="/">
          <span className="brand-symbol">C</span>
          CODEORACLE
        </Link>
        <span>Practice with intent. Interview with confidence.</span>
      </footer>
    </main>
  );
}
