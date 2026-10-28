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
use a different Redis instance; it defaults to `redis://127.0.0.1:6379`.

Start the API and worker together:

```powershell
npm start
```

`npm run dev` also starts both the API and worker with automatic restart.
Running only `npm run server` or `npm run dev:server` starts the API without a
worker and will leave jobs queued.

## Submit code

`POST /submit` accepts JSON with a `code` string and a `language` of
`javascript`, `python`, `java`, `c`, or `cpp`:

```json
{
  "code": "print('hello')",
  "language": "python"
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
Completed jobs contain `stdout`, `stderr`, `exitCode`, and `timedOut` under
`result`.
Java submissions must define a `Main` class. C and C++ submissions are compiled
with GCC before execution. Submissions are limited to 100,000 characters and
program execution is limited to five seconds (with up to 30 seconds allowed
for container startup and compilation), 128 MB of memory, 0.5 CPU, 64
processes, and 64 KiB per output stream. Compiled artifacts use an isolated
executable tmpfs and are discarded with the container.
Containers have no network access, no added Linux capabilities, a read-only
filesystem, and a small writable `/tmp`.
