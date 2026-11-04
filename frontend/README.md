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

Start the backend separately and ensure its Docker runner image is available.
