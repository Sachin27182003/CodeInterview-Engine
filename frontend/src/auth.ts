import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import GitHub from "next-auth/providers/github";
import type { DefaultSession } from "next-auth";

type AuthUser = {
  id: string;
  email: string;
  name: string | null;
  role: "CANDIDATE" | "RECRUITER";
  targetRole: string | null;
  customRole: string | null;
};

class CredentialSigninError extends CredentialsSignin {
  constructor(code: string) {
    super();
    this.code = code;
  }
}

export type AppSession = {
  user: {
    id: string;
    role: "recruiter" | "candidate";
    targetRole: string | null;
    customRole: string | null;
  } & DefaultSession["user"];
};

async function synchronizeUser(email: string, name: string | null | undefined): Promise<AuthUser> {
  const response = await fetch(
    `${process.env.BACKEND_INTERNAL_URL ?? "http://localhost:3001"}/auth/users`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-auth-internal-key": process.env.AUTH_INTERNAL_KEY ?? "",
      },
      body: JSON.stringify({ email, name }),
      cache: "no-store",
    },
  );
  if (!response.ok) {
    throw new Error("Unable to synchronize authenticated user");
  }
  const payload = (await response.json()) as { user?: AuthUser };
  if (!payload.user) throw new Error("Authentication service returned no user");
  return payload.user;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  useSecureCookies: process.env.NODE_ENV === "production",
  providers: [
    Google,
    GitHub,
    Credentials({
      id: "credentials",
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials.email;
        const password = credentials.password;
        if (typeof email !== "string" || typeof password !== "string") return null;
        const response = await fetch(
          `${process.env.BACKEND_INTERNAL_URL ?? "http://localhost:3001"}/auth/credentials/login`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-auth-internal-key": process.env.AUTH_INTERNAL_KEY ?? "",
            },
            body: JSON.stringify({ email, password }),
            cache: "no-store",
          },
        );
        if (response.status === 404) throw new CredentialSigninError("email_not_found");
        if (response.status === 401) throw new CredentialSigninError("invalid_password");
        if (response.status === 409) throw new CredentialSigninError("password_not_set");
        if (!response.ok) throw new CredentialSigninError("auth_unavailable");
        const payload = (await response.json()) as { user?: AuthUser };
        if (!payload.user?.id || !payload.user.email) return null;
        return {
          id: payload.user.id,
          email: payload.user.email,
          name: payload.user.name,
          role: payload.user.role.toLowerCase() as "candidate" | "recruiter",
          targetRole: payload.user.targetRole,
          customRole: payload.user.customRole,
        };
      },
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60,
    updateAge: 24 * 60 * 60,
  },
  pages: {
    signIn: "/auth/signin",
  },
  callbacks: {
    async jwt({ token, user, account }) {
      if (user?.email) {
        if (account?.provider === "credentials") {
          const credentialsUser = user as typeof user & {
            role?: "candidate" | "recruiter";
            targetRole?: string | null;
            customRole?: string | null;
          };
          token.sub = credentialsUser.id;
          token.role = credentialsUser.role ?? "candidate";
          token.targetRole = credentialsUser.targetRole ?? null;
          token.customRole = credentialsUser.customRole ?? null;
        } else {
          const databaseUser = await synchronizeUser(user.email, user.name);
          token.sub = databaseUser.id;
          token.role = databaseUser.role.toLowerCase() as "candidate" | "recruiter";
          token.targetRole = databaseUser.targetRole;
          token.customRole = databaseUser.customRole;
        }
      }
      return token;
    },
    session({ session, token }) {
      const role: AppSession["user"]["role"] =
        token.role === "recruiter" ? "recruiter" : "candidate";
      Object.assign(session.user, {
        id: token.sub ?? "",
        role,
        targetRole: typeof token.targetRole === "string" ? token.targetRole : null,
        customRole: typeof token.customRole === "string" ? token.customRole : null,
      });
      return session;
    },
  },
});

export async function getAppSession(): Promise<AppSession | null> {
  return (await auth()) as AppSession | null;
}
