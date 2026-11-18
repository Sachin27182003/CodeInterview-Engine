import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getAppSession } from "@/auth";
import ProfileForm from "./ProfileForm";

async function ProfileContent() {
  const session = await getAppSession();
  if (!session?.user?.id) redirect("/api/auth/signin?callbackUrl=%2Fprofile&mode=candidate");

  return (
    <main className="dashboard-shell">
      <ProfileForm />
    </main>
  );
}

export default function ProfilePage() {
  return (
    <Suspense fallback={<main className="dashboard-shell">Loading your profile...</main>}>
      <ProfileContent />
    </Suspense>
  );
}
