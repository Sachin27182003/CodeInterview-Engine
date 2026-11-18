"use client";

import { signOut } from "next-auth/react";
import { useState } from "react";

export default function SignOutButton({ className }: { className?: string }) {
  const [pending, setPending] = useState(false);
  return (
    <button
      className={className ?? "rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-60"}
      type="button"
      disabled={pending}
      onClick={() => {
        setPending(true);
        void signOut({ callbackUrl: "/" });
      }}
    >
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}
