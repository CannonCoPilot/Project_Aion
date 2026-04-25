# System 3: Dashboard — Visual Operations Interface

**Purpose**: Web-based operations dashboard providing visual control over Nexus jobs, Pulse tasks, pipeline analytics, and system monitoring. The Dashboard gives both archons and human operators a browser-based view into the full operational state.

**Why it matters**: While Jarvis and AIFred interact with Pulse programmatically (MCP, CLI, API), the Dashboard provides the human-readable control surface — task boards, analytics, pipeline views, and real-time updates — accessible from any browser.

---

## Architecture Overview

```
  Browser (:5173 dev)
    │
    │ /api/* requests (proxied by Vite)
    v
  Fastify Server (:8600)
    ├── 37 route modules (REST API)
    ├── WebSocket server (live updates)
    ├── Static file serving (production)
    ├── SQLite (local dashboard state)
    │
    ├── fetch() → Pulse API (:8700)
    │              └── PostgreSQL (:5432)
    │
    └── Direct reads:
        ├── Nexus SQLite (jobs.db)
        ├── JSONL logs (executions, costs)
        └── YAML configs (pulsars, personas)
```

The Dashboard has its own Fastify backend (not just a proxy) with direct access to Nexus state, log files, and configuration — it's a full operations console, not a thin BFF layer.

---

## Subsystem 3.1: Fastify Backend Server

**Location**: `dashboard/server/`

### Key Files

| File | Purpose |
|------|---------|
| `index.ts` | Fastify app setup, 37 route registrations, WebSocket init, static serving, work aggregator |
| `config.ts` | Centralized configuration (ports, paths, env vars) |
| `types.ts` | TypeScript interfaces (Task, TaskEvent, TaskStats, PRIORITY_MAP) |
| `routes/*.ts` | 37 route modules |
| `package.json` | fastify 5.3.3, better-sqlite3, web-push, ws |
| `tsconfig.json` | TypeScript config |

### Configuration (config.ts)

All paths configurable via environment variables with sensible defaults:

| Config Key | Default | Purpose |
|------------|---------|---------|
| `port` | 8600 | Server listen port |
| `host` | 0.0.0.0 | Bind address |
| `frontendDir` | `../../frontend/dist` | Built SPA location |
| `nexusDbPath` | `.claude/jobs/state/nexus.db` | Nexus job database |
| `dashboardDbPath` | `../data/dashboard.db` | Dashboard-local state |
| `wsPollInterval` | 5000 | WebSocket push interval (ms) |
| `vapidPublicKey/Private/Subject` | (env) | Web Push notification keys |
| `executionLogsDir` | `.claude/logs/headless/executions` | Nexus execution logs |
| `costLedgerPath` | `.claude/data/cost-ledger.jsonl` | Token cost tracking |
| `pulsarsFilePath` | `.claude/jobs/pulsars.yaml` | Event-driven trigger definitions |
| `companyRegistryPath` | `.claude/context/systems/company-registry.yaml` | Multi-tenant registry |

### Route Modules (37)

Organized by domain:

| Category | Routes | Purpose |
|----------|--------|---------|
| **Task Management** | tasks, events, labels, projects, pulse-projects, approvals | Pulse task CRUD, labeling, project grouping |
| **Nexus Operations** | nexus-ops, nexus-health, nexus-logs, nexus-settings, recurring-jobs, personas, pulsars | Job management, persona config, health, logs |
| **Analytics** | stats, stats-throughput, stage-analytics, reports, costs, timeline | Throughput metrics, cost tracking, stage analytics |
| **Pipeline** | pipeline, pipeline-status | CI/CD pipeline monitoring |
| **Monitoring** | health, activity, notifications, findings, patterns | Service health, activity feed, notification management |
| **Configuration** | settings, rules, companies | System settings, automation rules, multi-tenant |
| **Integrations** | ollama, obsidian, cortex, pai-proxy, document-guard | External service proxies |
| **Auth** | auth | Authentication (token-based) |
| **Content** | digest, reviews | Activity digests, code reviews |

### Pulse Integration (pulse-client.ts)

Lightweight HTTP client connecting to Pulse API:
- Base URL: `http://pulse:8700/api/v1` (Docker) or `http://localhost:8700` (local)
- Authentication: `X-Service-Token` header from `PULSE_DASHBOARD_TOKEN` env var
- Methods: `pulseGet()`, `pulsePost()`, `pulsePatch()` — thin wrappers around `fetch()`

### WebSocket Server

Real-time updates via `ws` library:
- Polls Nexus state and pushes updates to connected clients
- Configurable interval (default 5s via `wsPollInterval`)
- Used by frontend hooks: `useNexusOpsWebSocket`, `useWebSocketNotifications`

### Work Aggregator

Background process running every 5 minutes:
- Aggregates work statistics across Nexus executions
- Updates dashboard analytics tables

### Dependencies

```json
{
  "fastify": "^5.3.3",
  "@fastify/static": "^8.1.0",
  "better-sqlite3": "^12.6.2",
  "web-push": "^3.6.7",
  "ws": "^8.19.0",
  "js-yaml": "^4.1.1"
}
```

Dev: `tsx` (TypeScript execution), TypeScript 5.8.3

---

## Subsystem 3.2: React Frontend

**Location**: `dashboard/frontend/`
**Stack**: React 19.1.0 + TypeScript 5.8.3 + Vite 6.3.3 + Tailwind CSS 4.1.4 (proper build-time integration)

### Dependencies

```json
{
  "react": "^19.1.0",
  "react-dom": "^19.1.0",
  "react-router-dom": "^7.5.0",
  "@tanstack/react-query": "^5.75.5",
  "recharts": "^3.8.0",
  "@dnd-kit/core": "^6.3.1",
  "@dnd-kit/sortable": "^10.0.0",
  "@xyflow/react": "^12.10.1"
}
```

Dev: `@tailwindcss/vite` 4.1.4, `@vitejs/plugin-react` 4.4.1, Vite 6.3.3

### Scale

- **159 TypeScript/TSX files** across `src/`
- **32 API client modules** in `src/api/`
- **5 custom hooks** in `src/hooks/`
- **Component directories**: activity, board, events, filters, gantt, labels, layout, nexus-ops, notifications, orchestration, overview, pipeline, queue, stages, stats, tasks (16 dirs + 2 standalone: ErrorBoundary.tsx, KeyboardHelp.tsx)

### Key Frontend Features

| Feature | Technology | Description |
|---------|-----------|-------------|
| **Routing** | React Router v7 | Multi-page SPA with deep-linkable views |
| **Data fetching** | TanStack React Query | Cached, auto-refresing server state |
| **Charts** | Recharts 3.8 | Throughput, cost, timeline visualizations |
| **Drag & drop** | dnd-kit | Board-style task management |
| **Flow graphs** | @xyflow/react | Pipeline/orchestration visualization |
| **Real-time** | WebSocket hooks | Live Nexus status updates, notifications |
| **Styling** | Tailwind CSS 4.1 | Build-time CSS via `@tailwindcss/vite` plugin (no CDN) |
| **Notifications** | Web Push API | Browser push notifications via VAPID keys |

### Custom Hooks

| Hook | Purpose |
|------|---------|
| `useNexusOpsWebSocket` | Real-time Nexus job status via WebSocket |
| `useWebSocketNotifications` | Push notification management |
| `useKeyboardNav` | Keyboard navigation shortcuts |
| `useNexusOpsKeyboard` | Nexus-specific keyboard shortcuts |
| `useCompany` | Multi-tenant company context |

### Vite Configuration

```typescript
// vite.config.ts
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:8600', changeOrigin: true }
    }
  }
});
```

### Dev/Build

- **Dev**: `vite` on `:5173`, proxies `/api/*` to `:8600` (Fastify backend)
- **Build**: `tsc -b && vite build` → `frontend/dist/`, served by Fastify's `@fastify/static`
- **Start server**: `tsx watch index.ts` (dev) or `node dist/index.js` (prod)

---

## Subsystem 3.3: Data Architecture

The Dashboard reads from multiple data sources:

| Source | Technology | What |
|--------|-----------|------|
| **Pulse API** | PostgreSQL (remote) | Tasks, events, labels, projects |
| **Nexus DB** | SQLite (direct read) | Jobs, executions, schedules, personas |
| **Dashboard DB** | SQLite (local) | Dashboard-specific state, notification subscriptions |
| **Log files** | JSONL (direct read) | Execution logs, cost ledger, structured logs |
| **Config files** | YAML (direct read) | Pulsars, persona configs, company registry |

---

## Known Issues

| # | Issue | Severity | Detail |
|---|-------|----------|--------|
| 1 | No persistent auth | Medium | Token-based auth exists but no session persistence |
| 2 | Pulse connectivity | Medium | Dashboard degrades gracefully when Pulse is down |
| 3 | Feedback widget | Info | Points to external `feedback.theklyx.space` — may need DNS/availability check |

---

## Files Comprising This System

### Server (~40 files)
| File | Role |
|------|------|
| `dashboard/server/index.ts` | Fastify app + WebSocket + static serving |
| `dashboard/server/config.ts` | Centralized configuration |
| `dashboard/server/types.ts` | TypeScript interfaces |
| `dashboard/server/routes/*.ts` | 37 route modules |
| `dashboard/server/package.json` | Server dependencies |
| `dashboard/server/tsconfig.json` | TypeScript config |

### Frontend (~160 files)
| Directory | Content |
|-----------|---------|
| `dashboard/frontend/src/api/` | 32 API client modules |
| `dashboard/frontend/src/components/` | UI components (17+ subdirectories) |
| `dashboard/frontend/src/hooks/` | 5 custom hooks |
| `dashboard/frontend/src/App.tsx` | Root component with routing |
| `dashboard/frontend/src/main.tsx` | React entry point |
| `dashboard/frontend/vite.config.ts` | Vite + Tailwind + proxy config |
| `dashboard/frontend/package.json` | Frontend dependencies |
| `dashboard/frontend/index.html` | HTML shell (no CDN scripts) |

---

*System 3: Dashboard — AIFred-Pro Systems Architecture (verified 2026-04-23)*
