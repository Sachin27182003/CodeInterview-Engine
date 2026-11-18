"use client";

import Link from "next/link";
import SignOutButton from "./SignOutButton";

type AccountActionsProps = {
  name: string;
  avatarUrl?: string | null;
  showDashboardLink?: boolean;
  dashboardHref?: string;
};

export default function AccountActions({
  name,
  avatarUrl,
  showDashboardLink = false,
  dashboardHref = "/dashboard",
}: AccountActionsProps) {
  const displayName = name.trim() || "User";

  return (
    <div className="account-actions">
      {showDashboardLink && (
        <Link className="account-dashboard-link" href={dashboardHref}>
          Dashboard
        </Link>
      )}
      <Link className="account-profile-card" href="/profile" aria-label={`Open ${displayName}'s profile`}>
        {avatarUrl ? (
          <img className="account-avatar" src={avatarUrl} alt="" />
        ) : (
          <span className="account-avatar account-avatar-initial" aria-hidden="true">
            {displayName.charAt(0).toUpperCase()}
          </span>
        )}
        <span className="account-profile-label">Profile</span>
      </Link>
      <SignOutButton className="account-signout-card" />
    </div>
  );
}
