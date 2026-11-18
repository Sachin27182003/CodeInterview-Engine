import { getAppSession } from "@/auth";
import { NextResponse } from "next/server";

export async function GET(): Promise<Response> {
  const session = await getAppSession();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in is required" }, { status: 401 });
  const response = await fetch(
    `${process.env.BACKEND_INTERNAL_URL ?? "http://localhost:3001"}/users/${session.user.id}/profile`,
    {
      headers: { "x-auth-internal-key": process.env.AUTH_INTERNAL_KEY ?? "" },
      cache: "no-store",
    },
  );
  return new Response(response.body, {
    status: response.status,
    headers: { "Content-Type": response.headers.get("Content-Type") ?? "application/json" },
  });
}

export async function PATCH(request: Request): Promise<Response> {
  const session = await getAppSession();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in is required" }, { status: 401 });
  try {
    const response = await fetch(
      `${process.env.BACKEND_INTERNAL_URL ?? "http://localhost:3001"}/users/${session.user.id}/profile`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-auth-internal-key": process.env.AUTH_INTERNAL_KEY ?? "",
        },
        body: JSON.stringify(await request.json()),
        cache: "no-store",
      },
    );
    return new Response(response.body, {
      status: response.status,
      headers: { "Content-Type": response.headers.get("Content-Type") ?? "application/json" },
    });
  } catch (error) {
    console.error("Could not reach profile service:", error);
    return NextResponse.json({ error: "Profile service is unavailable" }, { status: 503 });
  }
}
