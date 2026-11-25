# CodeOracle: Distributed AI Code Execution Engine & Real-Time Mock Interview Platform

[![Next.js](https://img.shields.io/badge/Frontend-Next.js%20%7C%20React%20%7C%20Tailwind-000000?style=flat-square&logo=next.js)](https://nextjs.org/)
[![Node.js](https://img.shields.io/badge/Backend-Node.js%20%7C%20Express%20%7C%20TypeScript-339933?style=flat-square&logo=node.js)](https://nodejs.org/)
[![Docker](https://img.shields.io/badge/Sandbox-Docker%20Engine-2496ED?style=flat-square&logo=docker)](https://www.docker.com/)
[![Redis](https://img.shields.io/badge/Queue-Redis%20%7C%20BullMQ-DC382D?style=flat-square&logo=redis)](https://redis.io/)
[![PostgreSQL](https://img.shields.io/badge/Database-PostgreSQL%20%7C%20Prisma-4169E1?style=flat-square&logo=postgresql)](https://www.postgresql.org/)
[![Gemini API](https://img.shields.io/badge/AI-Google%20Gemini%20%7C%20WebRTC-8E75B2?style=flat-square&logo=google-gemini)](https://ai.google.dev/)

**CodeOracle** is a full-stack, AI-driven technical assessment platform that combines an isolated, distributed code execution engine with a real-time conversational AI interviewer. Unlike static online judges that rely solely on binary pass/fail test cases, CodeOracle simulates real-world MNC technical interviews by evaluating both deterministic code execution metrics and a candidate's verbalized problem-solving logic.

---

## Table of Contents
- [Key Features](#key-features)
- [System Architecture](#system-architecture)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Prerequisites & Hardware Requirements](#prerequisites--hardware-requirements)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Security & Sandboxing](#security--sandboxing)
- [Database Schema](#database-schema)
- [Contributors & Guidance](#contributors--guidance)

---

## Key Features

* **Interactive VS Code-Style IDE:** Integrated Monaco Editor supporting syntax highlighting for **Python**, **C++**, and **JavaScript**, complete with a countdown timer, problem statement panel, console output, and live queue status indicators (`Pending`, `Running`, `Accepted`).
* **Ephemeral Docker Execution Engine:** Untrusted user submissions run inside lightweight, network-isolated, read-only Docker containers that spin up and tear down in milliseconds with strict CPU, memory, and 5-second execution timeouts.
* **Asynchronous Job Queuing:** Decouples API request ingestion from compute-heavy code execution using **Redis** and **BullMQ**, ensuring high availability and automatic retries under concurrent assessment loads.
* **Contextual AI Voice Interviewer:** Powered by **Google Gemini** and **WebRTC (Vapi)** with sub-second voice latency. Prompt-engineered to act as a senior engineer—probing edge cases on failed tests or time/space complexity optimizations on brute-force passes without giving away direct answers.
* **Session Integrity & Recruiter Reports:** Logs external clipboard copy-paste events during live sessions and generates post-interview evaluation reports featuring quantitative scores, code submission timelines, and full AI conversation transcripts.
* **Role-Based Access Control (RBAC):** JWT-authenticated workflows tailored for **Candidates** (interview sessions) and **HR / Admins** (problem management and candidate scorecards).

---

## System Architecture

```text
┌───────────────────┐       HTTP / WebSocket / WebRTC       ┌───────────────────────┐
│   Next.js Client  │ ◄───────────────────────────────────► │  Node.js API Gateway  │
│  (Monaco + Voice) │                                       │  (Express + JWT Auth) │
└───────────────────┘                                       └───────────┬───────────┘
                                                                        │ Enqueue Job
                                                                        ▼
┌───────────────────┐       Metrics & Context               ┌───────────────────────┐
│ Google Gemini API │ ◄───────────────────────────────────► │  Redis / BullMQ Queue │
│ (AI Evaluator)    │                                       └───────────┬───────────┘
└───────────────────┘                                                   │ Dequeue Job
                                                                        ▼
┌───────────────────┐       Persist Results & Logs          ┌───────────────────────┐
│    PostgreSQL     │ ◄──────────────────────────────────── │   Execution Worker    │
│   (Prisma ORM)    │                                       │  (Ephemeral Docker)   │
└───────────────────┘                                       └───────────────────────┘
```

### Runtime Workflow
1. **Submission:** Candidate submits code via the Monaco Editor; the Express API Gateway authenticates the JWT and pushes the payload (`code`, `language`, `test_cases`) to a Redis queue, returning a `jobId`.
2. **Sandboxed Execution:** A background worker dequeues the job, spawns an isolated Docker container, mounts the code, runs hidden test cases, captures deterministic runtime/memory metrics, and destroys the container.
3. **AI Cross-Questioning:** Execution results and problem context are fed to the Gemini AI Agent, which initiates contextual follow-up questions via text and WebRTC voice.
4. **Report Generation:** Upon completion, accuracy, optimization, and communication scores are synthesized into an HR assessment report stored in PostgreSQL.

---

## Tech Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend** | Next.js, React, TypeScript, Tailwind CSS, Monaco Editor |
| **Backend & API** | Node.js, Express, TypeScript, JWT Authentication |
| **Database & ORM** | PostgreSQL, Prisma ORM |
| **Execution & Queues** | Docker Engine, Redis, BullMQ |
| **AI & Real-Time Voice** | Google Gemini API, WebRTC (Vapi SDK) |
| **Infrastructure** | Docker Compose, Vercel (Frontend), Linux VPS (Worker Node) |

---

## Project Structure

```text
codeoracle/
├── apps/
│   ├── web/                 # Next.js frontend (Monaco IDE, WebRTC UI, HR Dashboard)
│   ├── api/                 # Express API Gateway (Auth, Sessions, Reports, Queue Producer)
│   └── worker/              # Background Execution Worker (BullMQ Consumer + Docker Runner)
├── packages/
│   ├── database/            # Prisma schema, migrations, and shared DB client
│   └── shared/              # Shared TypeScript types, Zod validators, and constants
├── docker/
│   ├── runners/             # Custom minimal Dockerfiles for Python, C++, and Node.js
│   └── docker-compose.yml   # Local orchestration for PostgreSQL, Redis, API, and Worker
└── .env.example             # Environment variable template
```

---

## Prerequisites & Hardware Requirements

### Software Prerequisites
* **Node.js** (v20+) & **npm / pnpm**
* **Docker Engine** & **Docker Compose** (daemon must be running to spawn execution containers)
* **Redis** (v7+) & **PostgreSQL** (v15+)
* **Google Gemini API Key** & **WebRTC/Vapi Credentials**

### Hardware Recommendations
* **Minimum:** Quad-core CPU (2.5 GHz), 8 GB RAM, 20 GB free SSD storage.
* **Recommended:** 6+ CPU cores (for concurrent Docker sandboxes), 16 GB+ RAM, 50 GB free SSD storage.

---

## Getting Started

### 1. Clone the Repository
```bash
git clone [https://github.com/](https://github.com/)<your-username>/codeoracle.git
cd codeoracle
```

### 2. Configure Environment Variables
```bash
cp .env.example .env
# Populate DATABASE_URL, REDIS_URL, JWT_SECRET, GEMINI_API_KEY, and VAPI_API_KEY
```

### 3. Start Infrastructure Services (PostgreSQL & Redis)
```bash
docker compose -f docker/docker-compose.yml up -d postgres redis
```

### 4. Build Sandbox Runner Images
```bash
docker build -t codeoracle-python ./docker/runners/python
docker build -t codeoracle-cpp ./docker/runners/cpp
docker build -t codeoracle-node ./docker/runners/node
```

### 5. Install Dependencies & Initialize Database
```bash
npm install
npx prisma migrate dev --schema=packages/database/prisma/schema.prisma
```

### 6. Run the Application
```bash
# Start API Gateway, Execution Worker, and Next.js Frontend concurrently
npm run dev
```
* **Frontend Dashboard:** `http://localhost:3000`
* **API Gateway:** `http://localhost:5000`

---

## Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
# Server & Auth
PORT=5000
JWT_SECRET=your_super_secret_jwt_key
NODE_ENV=development

# Database & Queue
DATABASE_URL="postgresql://postgres:password@localhost:5432/codeoracle?schema=public"
REDIS_URL="redis://localhost:6379"

# AI & Voice Integrations
GEMINI_API_KEY=your_google_gemini_api_key
NEXT_PUBLIC_VAPI_PUBLIC_KEY=your_vapi_webrtc_public_key

# Sandbox Constraints
DOCKER_TIMEOUT_MS=5000
DOCKER_MEMORY_LIMIT=128m
```

---

## Security & Sandboxing

Executing arbitrary user code poses severe security risks. CodeOracle enforces multi-layered container isolation:
* **Network Isolation (`--network none`):** Containers have zero outbound or inbound internet access, preventing SSRF, data exfiltration, or DDoS participation.
* **Read-Only Root Filesystem (`--read-only`):** Prevents malicious file modifications, mounting only a size-restricted `/tmp` directory for compilation artifacts.
* **Resource Quotas (cgroups):** Enforces strict CPU shares, RAM caps, and PID limits to neutralize fork bombs and memory exhaustion.
* **Deterministic Timeout:** Processes exceeding **5 seconds** are forcefully terminated (`SIGKILL`) and flagged as `Time Limit Exceeded (TLE)`.

---

## Database Schema

Core relational entities managed via **Prisma ORM**:
* **`Users`**: `id`, `name`, `email`, `password_hash`, `role` (`CANDIDATE` | `ADMIN`), `created_at`
* **`Problems`**: `id`, `title`, `difficulty`, `test_cases` (JSON)
* **`Sessions`**: `id`, `user_id` (FK), `problem_id` (FK), `status`, `score`
* **`Submissions`**: `id`, `session_id` (FK), `code_text`, `language`, `execution_time`, `ai_feedback`

---

## Contributors & Guidance

Developed as a B.Tech Computer Science & Engineering Minor Project (**ES-451**, Session 2026–2027) at **Delhi Technical Campus, Greater Noida** (Affiliated to GGSIPU, New Delhi):

* **Sachin Kumar Vishwakarma** — `11818002723`
* **Rohan Kamat** — `03918002723`
* **Project Guide:** Madhumita Mahapatra (Assistant Professor, Dept. of CSE)
````[cite: 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 19, 21]
