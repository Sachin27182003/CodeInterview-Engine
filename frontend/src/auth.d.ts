import type { DefaultSession } from "next-auth";
import "next-auth";

declare module "next-auth" {
  interface User {
    role?: "recruiter" | "candidate";
    targetRole?: string | null;
    customRole?: string | null;
  }

  interface Session {
    user: {
      id: string;
      role: "recruiter" | "candidate";
      targetRole: string | null;
      customRole: string | null;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: "recruiter" | "candidate";
    targetRole?: string | null;
    customRole?: string | null;
  }
}

declare module "next-auth/adapters" {
  interface AdapterUser {
    role?: "recruiter" | "candidate";
  }
}

declare module "@auth/core/types" {
  interface User {
    role?: "recruiter" | "candidate";
  }
}

declare module "@auth/core/adapters" {
  interface AdapterUser {
    role?: "recruiter" | "candidate";
  }
}
