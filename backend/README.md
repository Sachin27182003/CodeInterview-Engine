# Code execution backend

## Run locally

Docker Desktop and Redis must be running because each submission is queued and
then executed in a separate container. Start Redis with Docker Compose:

```powershell
docker compose up --detach redis
```

```powershell
docker build -f Dockerfile.runner -t codeoracle-runner:latest .
npm install
npm run build
```

The API listens on port `3001` by default. Set `PORT` to use another port and
`CODE_EXECUTION_IMAGE` to use a different runner image tag. Set `REDIS_URL` to
use a different Redis instance; it defaults to `redis://127.0.0.1:6379`. Set
`GEMINI_API_KEY` to enable the AI interviewer after each execution.
`GEMINI_MODEL` optionally selects the Gemini model and defaults to
`gemini-3.8-flash`. `GEMINI_FALLBACK_MODEL` defaults to `gemini-3.7-flash`
and `GEMINI_SECONDARY_FALLBACK_MODEL` defaults to `gemini-3.6-flash`; fallback
models are tried when a provider error is transient. Each model is retried up
to four times with 2, 4, and 8 second backoff delays.

Set `DATABASE_URL` to a PostgreSQL connection string, then generate the client
and apply the checked-in migration:

```powershell
npm run prisma:generate
npm run prisma:migrate
```

The database stores users, problems and their JSON test cases, interview
sessions, and every submission including execution output, timing, status, and
AI feedback. Authentication is not enabled yet, so submissions create
anonymous interview sessions until a user identity is available.

Start the API and worker together:

```powershell
npm start
```

`npm run dev` also starts both the API and worker with automatic restart.
Running only `npm run server` or `npm run dev:server` starts the API without a
worker and will leave jobs queued.

## Submit code

`POST /submit` accepts JSON with a function-only `code` string and a `language` of
`javascript`, `python`, `java`, `c`, or `cpp`:

```json
{
  "code": "print('hello')",
  "language": "python",
  "problemDescription": "Implement twoSum/two_sum; hidden tests call the function"
}
```

The response is queued immediately and contains a `jobId`:

```json
{
  "jobId": "1",
  "status": "queued"
}
```

Poll `GET /status/:jobId` until the status is `completed` or `failed`.
Completed jobs contain `stdout`, `stderr`, `exitCode`, `timedOut`, and an
`interview` object under `result`. Missing or unavailable Gemini credentials do
not fail code execution; the interview response explains the unavailable state.
The built-in challenge is Two Sum. Do not write a `main` function or read
standard input: hidden tests call `twoSum` (JavaScript/C++), `two_sum`
(Python/C), or the method on `Solution` (Java). C receives the array, length,
target, and a two-element output buffer. C++ receives a vector and returns a
vector. Submissions are limited to 100,000 characters and
program execution is limited to five seconds (with up to 30 seconds allowed
for container startup and compilation), 128 MB of memory, 0.5 CPU, 64
processes, and 64 KiB per output stream. Compiled artifacts use an isolated
executable tmpfs and are discarded with the container.
Containers have no network access, no added Linux capabilities, a read-only
filesystem, and a small writable `/tmp`.
