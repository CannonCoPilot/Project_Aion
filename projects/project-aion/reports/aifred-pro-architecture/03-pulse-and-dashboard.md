# AIFred-Pro Architecture Report: Pulse API & Dashboard

**Report**: 03 of 10
**Scope**: `pulse/` (5 files) + `dashboard/` (~35 source files excl. node_modules)
**Date**: 2026-04-23
**Series**: AIFred-Pro Architectural Analysis

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Pulse API (FastAPI)](#2-pulse-api-fastapi)
3. [Dashboard Server (Express BFF)](#3-dashboard-server-express-bff)
4. [Dashboard Frontend (React)](#4-dashboard-frontend-react)
5. [Issues Found](#5-issues-found)
6. [Summary](#6-summary)

---

## 1. Architecture Overview

The Pulse + Dashboard subsystem follows a **three-tier architecture with a BFF (Backend-for-Frontend) proxy pattern**:

```
                          +-----------------------+
                          |   React Frontend      |
                          |   (Vite + TypeScript)  |
                          |   :5173 (dev)          |
                          +-----------+-----------+
                                      |
                                      | /api/*
                                      v
                          +-----------+-----------+
                          |   Express BFF Server  |
                          |   (Node.js + TS)       |
                          |   :3001                |
                          +-----------+-----------+
                                      |
                                      | HTTP (fetch)
                                      v
                          +-----------+-----------+
                          |   Pulse FastAPI        |
                          |   (Python 3.12)        |
                          |   :8700                |
                          +-----------+-----------+
                                      |
                                      | asyncpg
                                      v
                          +-----------+-----------+
                          |   PostgreSQL           |
                          |   :5432                |
                          |   Database: pulse      |
                          +-----------------------+

  Separately:
  +-----------------------+
  |   Pulse CLI (cli.py)  | -------> Pulse API :8700 (direct, urllib)
  +-----------------------+
```

**Key design choice**: The Express BFF acts as a pure proxy, forwarding frontend requests to the Pulse API without transformation. This decouples the frontend from the backend API location and provides a single origin for the browser, avoiding CORS complexity. The CLI bypasses the BFF entirely and talks directly to the Pulse API.

---

## 2. Pulse API (FastAPI)

### 2.1 File Inventory (5 files)

| File | Purpose | Lines (approx) |
|------|---------|-----------------|
| `pulse/app.py` | FastAPI application — all endpoints, Pydantic models, DB schema, connection pool | Core |
| `pulse/cli.py` | CLI client using stdlib `urllib` (zero external dependencies) | Thin client |
| `pulse/start-pulse.sh` | Launcher with venv auto-creation, PID-file dedup, `--background` mode | Ops |
| `pulse/requirements.txt` | `fastapi`, `uvicorn`, `asyncpg`, `pydantic` | Deps |
| `pulse/Dockerfile` | Python 3.12-slim base image | Container |

**Design note**: The entire Pulse API is a single-file application (`app.py`). All models, routes, DB logic, and schema DDL live in one module. This is appropriate for the current scope (single table, 7 endpoints) but will need extraction if the schema grows.

### 2.2 Database Schema

A single `tasks` table with 12 columns:

```sql
CREATE TABLE IF NOT EXISTS tasks (
    id          SERIAL PRIMARY KEY,
    title       TEXT NOT NULL,
    description TEXT,
    status      TEXT CHECK (status IN ('open', 'in_progress', 'blocked', 'done', 'cancelled')),
    priority    TEXT CHECK (priority IN ('critical', 'high', 'medium', 'low')),
    agent       TEXT CHECK (agent IN ('jarvis', 'aifred', 'shared')),
    labels      JSONB,
    due_date    TIMESTAMPTZ,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW(),
    closed_at   TIMESTAMPTZ,
    notes       JSONB
);
```

**Indexes** (3):
- `idx_tasks_status` on `status`
- `idx_tasks_agent` on `agent`
- `idx_tasks_priority` on `priority`

**Schema lifecycle**: Auto-applied via `CREATE TABLE IF NOT EXISTS` at pool startup. No migration system. Schema changes require manual `ALTER TABLE` or a full recreate.

### 2.3 Connection Pool

- Engine: `asyncpg`
- Pool size: min 2, max 10
- Created at application startup (`@app.on_event("startup")`)

### 2.4 API Endpoints (7)

| Method | Path | Status | Description |
|--------|------|--------|-------------|
| `GET` | `/health` | 200 | Health check (pool connectivity) |
| `POST` | `/tasks` | 201 | Create task |
| `GET` | `/tasks` | 200 | List tasks with filters (status, agent, priority, label) |
| `GET` | `/tasks/{id}` | 200 | Get single task |
| `PATCH` | `/tasks/{id}` | 200 | Update task fields |
| `DELETE` | `/tasks/{id}` | 200 | Delete task |
| `POST` | `/tasks/{id}/notes` | 201 | Append note to task |

### 2.5 Business Logic

**Sort order**: Tasks are sorted by priority weight ascending, then `created_at` descending:

| Priority | Weight |
|----------|--------|
| critical | 0 |
| high | 1 |
| medium | 2 |
| low | 3 |

This ensures critical tasks always surface first, with ties broken by newest-first.

**Auto-close behavior**:
- Setting `status` to `done` or `cancelled` automatically sets `closed_at = NOW()`
- Setting `status` back to `open`, `in_progress`, or `blocked` clears `closed_at` to `NULL`

**Notes mechanism**: Notes are stored as a JSONB array on the task row. Appending a note uses a read-modify-write pattern: read current notes array, append new note, write back. This is **not concurrent-safe** -- two simultaneous note additions could result in one being lost.

**Label filtering**: Uses PostgreSQL's JSONB containment operator (`@>`) for efficient label-based queries.

**Updated timestamp**: `updated_at` is set to `NOW()` on every `PATCH` operation.

**List limits**: Accepts a `limit` query parameter (1-200, default 50).

### 2.6 CLI Client (cli.py)

7 commands, all using stdlib `urllib.request` (no pip dependencies required):

| Command | Aliases | Description |
|---------|---------|-------------|
| `list` | `ls` | List tasks with optional filters |
| `create` | `new` | Create a new task |
| `show` | -- | Show task details |
| `update` | -- | Update task fields |
| `note` | -- | Add a note to a task |
| `close` | -- | Close a task (sets status=done) |
| `delete` | `rm` | Delete a task |

**Design note**: Using stdlib `urllib` instead of `requests` or `httpx` means the CLI has zero external dependencies and can run in any Python 3.x environment without a venv.

---

## 3. Dashboard Server (Express BFF)

### 3.1 File Inventory (8 files)

| File | Purpose |
|------|---------|
| `server/index.ts` | Express app, mounts routes, serves static frontend from `../frontend/dist/` |
| `server/types.ts` | TypeScript interfaces mirroring Pulse Pydantic models |
| `server/services/pulse.ts` | HTTP client wrapping all Pulse API calls via `fetch` |
| `server/routes/tasks.ts` | Pure proxy — forwards query params to Pulse API |
| `server/routes/health.ts` | Composite health — aggregates dashboard + Pulse health |
| `server/Dockerfile` | `node:20-slim`, builds frontend, serves via `tsx` |
| `server/tsconfig.json` | ES2022, commonjs, strict mode |
| `server/package.json` | express 4.21, cors 2.8; dev: tsx, typescript 5.6 |

### 3.2 BFF Proxy Pattern

The Express server acts as a **pure proxy** with no business logic transformation. Request flow:

```
Browser GET /api/tasks?status=open
  -> Express routes/tasks.ts
    -> services/pulse.ts fetch("http://localhost:8700/tasks?status=open")
      -> Pulse API
    <- JSON response
  <- JSON response (passed through)
```

This pattern provides:
- **Single origin** for the browser (no CORS needed between frontend and API)
- **Static file serving** for the production frontend build
- **Composite health endpoint** that checks both the BFF and the Pulse API

### 3.3 Composite Health

The `/api/health` endpoint aggregates health from multiple sources:

```json
{
  "status": "healthy",       // or "degraded"
  "dashboard": "up",
  "pulse": "up"              // or "down"
}
```

When the Pulse API is unreachable, the BFF returns `"degraded"` rather than `"error"` -- the dashboard itself is still operational even if the backend is down.

### 3.4 CRITICAL BUG: Missing config.ts

`server/index.ts` imports `{ config } from './config'` but **`config.ts` does not exist on disk**. The server will fail at startup with `MODULE_NOT_FOUND`. This is a blocking issue -- the dashboard server cannot start without this file being created. Likely intended to export port numbers and the Pulse API base URL.

### 3.5 Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| express | 4.21 | HTTP server framework |
| cors | 2.8 | CORS middleware |
| tsx | (dev) | TypeScript execution without compilation |
| typescript | 5.6 | Type checking |

---

## 4. Dashboard Frontend (React)

### 4.1 File Inventory (17 files)

| File | Purpose |
|------|---------|
| `frontend/src/main.tsx` | React root (ReactDOM.createRoot) |
| `frontend/src/App.tsx` | Root component, orchestrates layout |
| `frontend/src/types.ts` | `Task`, `Note`, `TaskFilters` type definitions |
| `frontend/src/hooks/useTasks.ts` | Custom hook — all state + API calls |
| `frontend/src/components/Header.tsx` | App header with Refresh and +New Task buttons |
| `frontend/src/components/TaskFilters.tsx` | Three filter dropdowns (status, agent, priority) |
| `frontend/src/components/TaskCard.tsx` | List item for each task with inline badges |
| `frontend/src/components/StatusBadge.tsx` | Color-coded status indicator |
| `frontend/src/components/PriorityBadge.tsx` | Color-coded priority indicator |
| `frontend/src/components/AgentBadge.tsx` | Color-coded agent indicator |
| `frontend/src/components/TaskDetail.tsx` | Slide-out panel with full task detail, controls, notes timeline, delete |
| `frontend/src/components/TaskForm.tsx` | Modal form for creating new tasks |
| `frontend/index.html` | HTML shell, loads Tailwind CSS via CDN |
| `frontend/vite.config.ts` | Vite config, proxies `/api` to `:3001` |
| `frontend/src/index.css` | Global styles |
| `frontend/src/App.css` | Empty (all styling via Tailwind) |
| `frontend/package.json` | React 18.3.1, Vite 5.4, TypeScript 5.6 |

### 4.2 Component Tree

```
App
 +-- Header
 |     +-- [Refresh Button]
 |     +-- [+New Task Button]
 +-- TaskFilters
 |     +-- [Status Dropdown]
 |     +-- [Agent Dropdown]
 |     +-- [Priority Dropdown]
 +-- TaskCard[] (list)
 |     +-- StatusBadge
 |     +-- PriorityBadge
 |     +-- AgentBadge
 +-- TaskDetail (slide-out panel, conditional)
 |     +-- StatusBadge
 |     +-- PriorityBadge
 |     +-- AgentBadge
 |     +-- [Status/Priority Controls]
 |     +-- [Notes Timeline]
 |     +-- [Delete Button]
 +-- TaskForm (modal, conditional)
       +-- [Title, Description, Status, Priority, Agent fields]
       +-- [Submit / Cancel]
```

### 4.3 State Management (useTasks Hook)

All application state is centralized in a single custom hook:

**State:**

| Field | Type | Purpose |
|-------|------|---------|
| `tasks` | `Task[]` | Current task list |
| `loading` | `boolean` | Loading indicator |
| `error` | `string \| null` | Error message |
| `filters` | `TaskFilters` | Active filter criteria |
| `selectedTask` | `Task \| null` | Currently selected task for detail view |

**Actions:**

| Action | Description |
|--------|-------------|
| `fetchTasks()` | GET /api/tasks with current filters |
| `createTask(data)` | POST /api/tasks, then refetch |
| `updateTask(id, data)` | PATCH /api/tasks/{id}, then refetch |
| `deleteTask(id)` | DELETE /api/tasks/{id}, then refetch |
| `addNote(id, text)` | POST /api/tasks/{id}/notes, then refetch |

**Reactive behavior**: Filter changes trigger an automatic refetch via `useEffect` dependency on the `filters` object.

### 4.4 UI Design

**Theme**: Dark mode (gray-900 base background)

**Styling**: Tailwind CSS loaded via CDN `<script>` tag in `index.html`. All component styling uses Tailwind utility classes. `App.css` is empty.

**Interaction patterns**:
- **Status cycling**: Clicking a status badge cycles through `open` -> `in_progress` -> `done` (inline, no modal)
- **Detail view**: Clicking a task card opens a right-side slide-out panel
- **Create form**: +New Task opens a centered modal overlay
- **No URL routing**: Single-page, no React Router, no deep-linkable views
- **No pagination**: Relies on the API's default limit of 50 tasks

### 4.5 Color Scheme

**Status badges:**

| Status | Color |
|--------|-------|
| open | Blue |
| in_progress | Yellow |
| blocked | Red |
| done | Green |
| cancelled | Gray |

**Agent badges:**

| Agent | Color |
|-------|-------|
| jarvis | Purple |
| aifred | Teal |
| shared | Gray |

**Priority badges:**

| Priority | Color |
|----------|-------|
| critical | Red |
| high | Orange |
| medium | Yellow |
| low | Green |

### 4.6 Build & Dev

- **Dev server**: `vite` on `:5173`, proxies `/api/*` to `:3001` (Express BFF)
- **Production**: `vite build` outputs to `frontend/dist/`, served as static files by Express

---

## 5. Issues Found

### 5.1 Critical

| # | Issue | Impact | Location |
|---|-------|--------|----------|
| 1 | **Missing `config.ts`** | Server will not start -- `MODULE_NOT_FOUND` error on import | `server/index.ts` imports `{ config } from './config'` but the file does not exist |

### 5.2 Medium

| # | Issue | Impact | Location |
|---|-------|--------|----------|
| 2 | **Note append race condition** | Concurrent note additions use read-modify-write on a JSONB array without any locking; two simultaneous appends can lose one note | `pulse/app.py` POST `/tasks/{id}/notes` |
| 3 | **Tailwind via CDN** | Development-only approach ships ~300KB of runtime JavaScript to the browser; not suitable for production | `frontend/index.html` `<script src="https://cdn.tailwindcss.com">` |
| 4 | **No authentication** | Entire stack (API, BFF, frontend) is open with no auth; anyone on the network can create/delete tasks | All layers |
| 5 | **Type duplication** | `Task` and `Note` interfaces are defined identically in both `server/types.ts` and `frontend/src/types.ts`; changes must be synchronized manually | `server/types.ts`, `frontend/src/types.ts` |

### 5.3 Low

| # | Issue | Impact | Location |
|---|-------|--------|----------|
| 6 | `due_date` not exposed in UI | Tasks can have due dates (API supports it) but the frontend has no date picker or display | `frontend/src/components/TaskForm.tsx`, `TaskDetail.tsx` |
| 7 | No text search | Cannot search tasks by title or description; only filter by status/agent/priority | `frontend/src/components/TaskFilters.tsx` |
| 8 | No error boundary | React errors in any component will crash the entire app with a white screen | `frontend/src/App.tsx` |
| 9 | No pagination beyond default limit | Frontend does not implement pagination; limited to the API's default 50-task response | `frontend/src/hooks/useTasks.ts` |

---

## 6. Summary

The Pulse + Dashboard subsystem is a functional task management layer designed for cross-Archon visibility between Jarvis and AIfred. The architecture is clean and appropriately simple for its scope:

- **Pulse API**: Minimal, well-structured single-table CRUD with sensible defaults (priority-weighted sorting, auto-close timestamps, JSONB labels). The single-file design is pragmatic for a 7-endpoint API.
- **Dashboard BFF**: Pure proxy pattern keeps concerns separated. Composite health endpoint is a nice operational touch.
- **Dashboard Frontend**: Standard React + TypeScript with centralized state. Dark theme with color-coded badges provides quick visual scanning.

The **blocking issue** is the missing `config.ts` file in the server directory -- this must be created before the dashboard can start. Beyond that, the note race condition and lack of authentication are the most impactful items for a multi-user (multi-Archon) environment. The Tailwind CDN approach should be replaced with a proper PostCSS build for production use.

---

*AIFred-Pro Architecture Report 03/10 -- Pulse API & Dashboard*
*Generated 2026-04-23*
