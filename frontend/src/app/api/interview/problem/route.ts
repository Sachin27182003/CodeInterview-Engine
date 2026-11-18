import { getAppSession } from "@/auth";
import { NextResponse } from "next/server";

export async function GET(): Promise<Response> {
  const session = await getAppSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in is required" }, { status: 401 });
  }
  const response = await fetch(
    `${process.env.BACKEND_INTERNAL_URL ?? "http://localhost:3001"}/interview/problem`,
    {
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
