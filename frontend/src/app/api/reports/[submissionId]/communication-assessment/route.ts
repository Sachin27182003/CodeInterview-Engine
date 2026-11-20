import { getAppSession } from "@/auth";
import { NextResponse } from "next/server";

export async function POST(
  _request: Request,
  context: { params: Promise<{ submissionId: string }> },
): Promise<Response> {
  const session = await getAppSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in is required" }, { status: 401 });
  }
  const { submissionId } = await context.params;
  const response = await fetch(
    `${process.env.BACKEND_INTERNAL_URL ?? "http://localhost:3001"}/reports/${submissionId}/communication-assessment`,
    {
      method: "POST",
      headers: {
        "x-auth-internal-key": process.env.AUTH_INTERNAL_KEY ?? "",
        "x-user-id": session.user.id,
      },
      cache: "no-store",
    },
  );
  return new Response(response.body, {
    status: response.status,
    headers: { "Content-Type": response.headers.get("Content-Type") ?? "application/json" },
  });
}
