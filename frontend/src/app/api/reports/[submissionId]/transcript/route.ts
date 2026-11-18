import { auth } from "@/auth";
import { NextResponse } from "next/server";

export async function POST(
  request: Request,
  context: { params: Promise<{ submissionId: string }> },
): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in is required" }, { status: 401 });
  const { submissionId } = await context.params;
  const response = await fetch(
    `${process.env.BACKEND_INTERNAL_URL ?? "http://localhost:3001"}/reports/${submissionId}/transcript`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-auth-internal-key": process.env.AUTH_INTERNAL_KEY ?? "",
      },
      body: JSON.stringify({ ...(await request.json()), userId: session.user.id }),
      cache: "no-store",
    },
  );
  return new Response(response.body, {
    status: response.status,
    headers: { "Content-Type": response.headers.get("Content-Type") ?? "application/json" },
  });
}
