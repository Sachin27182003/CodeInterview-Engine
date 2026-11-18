import { NextResponse } from "next/server";

export async function POST(request: Request): Promise<Response> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid registration request" }, { status: 400 });
  }

  try {
    const response = await fetch(
      `${process.env.BACKEND_INTERNAL_URL ?? "http://localhost:3001"}/auth/credentials/register`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-auth-internal-key": process.env.AUTH_INTERNAL_KEY ?? "",
        },
        body: JSON.stringify(payload),
        cache: "no-store",
      },
    );
    const body = await response.json().catch(() => ({ error: "Registration is temporarily unavailable" }));
    return NextResponse.json(body, { status: response.status });
  } catch {
    return NextResponse.json({ error: "Registration is temporarily unavailable" }, { status: 503 });
  }
}
