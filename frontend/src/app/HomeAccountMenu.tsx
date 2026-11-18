"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import SignOutButton from "./SignOutButton";

type HomeAccountMenuProps = {
  name: string;
  avatarUrl?: string | null;
  dashboardHref: string;
};

export default function HomeAccountMenu({ name, avatarUrl, dashboardHref }: HomeAccountMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const displayName = name.trim() || "User";

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div className="home-account-menu" ref={menuRef}>
      <button
        className="account-profile-card home-profile-trigger"
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Open account menu"
        onClick={() => setOpen((current) => !current)}
      >
        {avatarUrl ? (
          <img className="account-avatar" src={avatarUrl} alt="" />
        ) : (
          <span className="account-avatar account-avatar-initial" aria-hidden="true">
            {displayName.charAt(0).toUpperCase()}
          </span>
        )}
        <span className="account-profile-label">Profile</span>
      </button>
      {open && (
        <div className="home-account-popover" role="menu" aria-label="Account menu">
          <Link role="menuitem" href="/profile" onClick={() => setOpen(false)}>
            <span>Profile</span><small>Manage your account</small>
          </Link>
          <Link role="menuitem" href={dashboardHref} onClick={() => setOpen(false)}>
            <span>Dashboard</span><small>Open your workspace</small>
          </Link>
          <div className="home-account-divider" />
          <SignOutButton className="home-account-logout" />
        </div>
      )}
    </div>
  );
}
