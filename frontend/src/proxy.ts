import { auth } from "@/auth";
import { NextResponse } from "next/server";

export default auth((request) => {
  const pathname = request.nextUrl.pathname;
  const isRecruiterPath = pathname.startsWith("/recruiter");
  const isProfilePath = pathname === "/profile" || pathname.startsWith("/profile/");
  const user = request.auth?.user;
  const userRole = (user as typeof user & { role?: "recruiter" | "candidate" } | undefined)?.role;

  if (!user?.id) {
    const signInUrl = new URL("/api/auth/signin", request.url);
    signInUrl.searchParams.set("callbackUrl", `${pathname}${request.nextUrl.search}`);
    signInUrl.searchParams.set("mode", isRecruiterPath ? "recruiter" : "candidate");
    return NextResponse.redirect(signInUrl);
  }

  if (isRecruiterPath && userRole !== "recruiter") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }
  if (!isRecruiterPath && !isProfilePath && userRole === "recruiter") {
    return NextResponse.redirect(new URL("/recruiter", request.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/dashboard/:path*", "/interview/:path*", "/profile/:path*", "/recruiter/:path*"],
};
