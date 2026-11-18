# CodeOracle frontend

The frontend is a Next.js code editor powered by Monaco. It supports JavaScript,
Python, Java, C, and C++ and sends submissions to the backend `/submit` endpoint.
Submissions are queued and the page receives execution output and interview
feedback over Socket.IO. Optional Vapi voice interviews require
`NEXT_PUBLIC_VAPI_PUBLIC_KEY` and `NEXT_PUBLIC_VAPI_ASSISTANT_ID`.

## Run locally

Install dependencies and start the frontend:

```bash
npm install
npm run dev
```

The page expects the execution API at `http://localhost:3001` by default. To use
another backend URL, set `NEXT_PUBLIC_BACKEND_URL` before starting Next.js:

```bash
NEXT_PUBLIC_BACKEND_URL=http://localhost:3001 npm run dev
```

For voice interviews, also configure:

```bash
NEXT_PUBLIC_VAPI_PUBLIC_KEY=your-public-key
NEXT_PUBLIC_VAPI_ASSISTANT_ID=your-assistant-id
```

Recruiters can sign in at `/recruiter` with Google or GitHub. Configure NextAuth and the
recruiter allowlist on the frontend:

```bash
AUTH_SECRET=use-a-long-random-value
AUTH_GOOGLE_ID=your-google-client-id
AUTH_GOOGLE_SECRET=your-google-client-secret
AUTH_GITHUB_ID=your-github-client-id
AUTH_GITHUB_SECRET=your-github-client-secret
AUTH_INTERNAL_KEY=shared-auth-sync-key
RECRUITER_EMAILS=recruiter@example.com
BACKEND_INTERNAL_URL=http://localhost:3001
RECRUITER_DASHBOARD_KEY=shared-internal-key
```

Candidates can also create an account with an email address and a password of at
least 12 characters. Passwords are hashed by the backend with bcrypt before they
are stored. The recruiter sign-in view is invite-only; recruiter roles come from
the backend `RECRUITER_EMAILS` allowlist. NextAuth keeps a JWT session in an
HTTP-only cookie for up to 30 days, and requires HTTPS cookies in production.
After adding password authentication, apply the backend migration with
`npm run prisma:migrate` from `backend` before starting the updated services.

Set the same `RECRUITER_DASHBOARD_KEY` on the backend. The dashboard currently
shows persisted AI overall scores; complexity metrics and voice transcripts are
not included in this phase.

Set `AUTH_INTERNAL_KEY` to the same value on the backend for OAuth user
synchronization and authenticated submissions. Google and GitHub OAuth callback
URLs should point to `/api/auth/callback/google` and
`/api/auth/callback/github` on the frontend.

Start the backend separately and ensure its Docker runner image is available.
