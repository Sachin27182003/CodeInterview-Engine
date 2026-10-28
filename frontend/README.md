# CodeOracle frontend

The frontend is a Next.js code editor powered by Monaco. It supports JavaScript,
Python, Java, C, and C++ and sends submissions to the backend `/submit` endpoint.
Submissions are queued and the page polls `/status/:jobId` until the worker
returns execution output.

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

Start the backend separately and ensure its Docker runner image is available.
