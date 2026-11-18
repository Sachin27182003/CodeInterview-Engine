import { getAppSession } from "@/auth";
import { NextResponse } from "next/server";

export async function POST(request: Request): Promise<Response> {
  const session = await getAppSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in is required" }, { status: 401 });
  }

  const response = await fetch(
    `${process.env.BACKEND_INTERNAL_URL ?? "http://localhost:3001"}/interview/respond`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-auth-internal-key": process.env.AUTH_INTERNAL_KEY ?? "",
      },
      body: JSON.stringify({
        ...(await request.json()),
        targetRole: session.user.customRole
          ? `${session.user.targetRole} (${session.user.customRole})`
          : session.user.targetRole,
      }),
      cache: "no-store",
    },
  );
  return new Response(response.body, {
    status: response.status,
    headers: { "Content-Type": response.headers.get("Content-Type") ?? "application/json" },
  });
}
