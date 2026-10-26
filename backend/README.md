# Code execution backend

## Run locally

Docker Desktop must be running because each submission is executed in a separate
container.

```powershell
docker build -f Dockerfile.runner -t codeoracle-runner:latest .
npm install
npm run build
npm start
```

The API listens on port `3001` by default. Set `PORT` to use another port and
`CODE_EXECUTION_IMAGE` to use a different runner image tag.

## Submit code

`POST /submit` accepts JSON with a `code` string and a `language` of
`javascript`, `python`, `java`, `c`, or `cpp`:

```json
{
  "code": "print('hello')",
  "language": "python"
}
```

The response contains `stdout`, `stderr`, `exitCode`, and `timedOut`.
Java submissions must define a `Main` class. C and C++ submissions are compiled
with GCC before execution. Submissions are limited to 100,000 characters and
program execution is limited to five seconds (with up to 30 seconds allowed
for container startup and compilation), 128 MB of memory, 0.5 CPU, 64
processes, and 64 KiB per output stream. Compiled artifacts use an isolated
executable tmpfs and are discarded with the container.
Containers have no network access, no added Linux capabilities, a read-only
filesystem, and a small writable `/tmp`.
