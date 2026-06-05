# Research Report: Blitz.dev — Full-Stack React Toolkit

**Date**: 2026-02-18
**Scope**: Full investigation of Blitz.js v3, its capabilities, current status, local installation, and practical applications for Jarvis/Project Aion

---

## Executive Summary

Blitz.js (https://blitzjs.com) is a fullstack React framework built on top of Next.js that adds a zero-API RPC data layer, built-in authentication, code generators, and opinionated project scaffolding. It is best described as "Ruby on Rails for the React/Next.js ecosystem." Version 3.0.2 is installed on this system (via npx cache at `/Users/nathanielcannon/.npm/_npx/f8d2cc529b1ae519/node_modules/blitz/`), reachable as `npx blitz`.

The project is actively maintained as of 2024–2025, with v3.0.0 released February 2024, v3.0.2 in September 2024, and ongoing Next.js/Prisma version bumps. The GitHub repository has 14,100+ stars. The framework is a strong candidate for building Jarvis web UIs — dashboards, admin panels, a knowledge graph browser — because it eliminates the REST/GraphQL boilerplate that would otherwise be required, ships with Prisma (already used in Jarvis infrastructure), and produces typesafe full-stack apps rapidly.

For Jarvis/Project Aion, the highest-value use case is a **System Monitoring Dashboard** that surfaces telemetry from Qdrant, Neo4j, PostgreSQL, Redis, and LiteLLM — all already running in the infrastructure stack. A Blitz app would connect directly to PostgreSQL via Prisma and expose live data via typed RPC queries, requiring no separate REST API.

---

## Key Findings

### 1. What Blitz Is

Blitz is the "missing fullstack toolkit for Next.js." It wraps Next.js and adds the layers that Next.js deliberately omits:

- A **Zero-API / RPC data layer** — server functions (queries, mutations) are called directly from React components. Blitz compiles the import into a POST call automatically. There is no REST endpoint to write, no fetch() to manage, and no API contract to maintain separately.
- **Built-in authentication** (`@blitzjs/auth`) — JWT-signed sessions, Passport.js, role-based authorization, impersonation.
- **Code generators** (`blitz generate`) — scaffold pages, queries, mutations, Prisma models, and full CRUD resources from the CLI.
- **Route manifest** — typed routes (`Routes.DashboardPage()`) instead of interpolated strings.
- **Pre-configured toolchain** — ESLint, Prettier, Husky, Vitest already wired when you run `blitz new`.

Blitz 2.0 split the monolithic v1 framework into composable packages (`@blitzjs/next`, `@blitzjs/rpc`, `@blitzjs/auth`) so it can be incrementally adopted in existing Next.js apps. Version 3.0 upgraded the internal query/mutation hooks to TanStack React Query v5 (breaking change from v2) and dropped the Recipes system.

**Source**: https://blitzjs.com/docs/get-started, https://blitzjs.com/docs/why-blitz

### 2. Key Features and Capabilities

#### Zero-API RPC Layer
Server resolver functions live in `src/[domain]/queries/` and `src/[domain]/mutations/`. The client imports them and calls them like normal async functions via `useQuery()` and `useMutation()` hooks from TanStack React Query v5. At build time, Blitz replaces the import with an HTTP POST to `/api/rpc/[functionPath]`. The transport uses a HEAD warmup request before mutations to reduce serverless cold-start latency.

Request structure: `POST /api/rpc/users/queries/getCurrentUser` with body `{"params": {}}`.
Response: `{"result": {...}, "error": null}`.

Full type safety flows end-to-end — the resolver's TypeScript types are shared with the client automatically.

**Source**: https://blitzjs.com/docs/rpc-specification

#### Code Generation
```
blitz generate all Product name:string price:float description:string
```
This single command creates: Prisma model migration, CRUD queries (getProduct, getProducts), CRUD mutations (createProduct, updateProduct, deleteProduct), and full Next.js pages with forms. Generator types: `all`, `resource`, `model`, `crud`, `queries`, `query`, `mutations`, `mutation`, `pages`.

**Source**: https://blitzjs.com/docs/cli-generate

#### Authentication
`@blitzjs/auth` provides:
- JWT-signed sessions with `SESSION_SECRET_KEY` env var
- Prisma session storage (maps to PostgreSQL, which Jarvis already runs)
- Role-based authorization via `simpleRolesIsAuthorized`
- Passport.js integration for OAuth (GitHub, Google, etc.)
- User impersonation support

**Source**: https://blitzjs.com/docs/auth-setup

#### Project Structure
```
src/
  blitz-client.ts        # client plugin config
  blitz-server.ts        # server plugin config
  [domain]/
    queries/             # server-side read functions
    mutations/           # server-side write functions
    components/          # React components
    pages/               # Next.js pages
db/
  schema.prisma          # Prisma schema
  migrations/
public/
test/
next.config.js
```

**Source**: https://blitzjs.com/docs/file-structure

#### Templates
- `full` — includes database (Prisma/PostgreSQL), authentication, full scaffolding
- `minimal` — bare Next.js + Blitz RPC, no database or auth

#### Supported Form Libraries
react-final-form, react-hook-form, or formik (selected at project creation).

### 3. Current Status

| Metric | Value |
|--------|-------|
| Latest version | 3.0.2 |
| Release date | September 11, 2024 |
| v3.0.0 release | February 21, 2024 |
| GitHub stars | 14,100+ |
| GitHub forks | 817 |
| Node.js requirement | 16+ (system has 24.13.1) |
| npm publish date | 2025-09-11 |
| Prisma support | v6 (latest) |
| React Query version | TanStack React Query v5 |
| Next.js | App Directory supported |

The project is **actively maintained**. The npm registry shows a publish date of 2025-09-11, confirming recent activity. Major architectural decisions include: upgrading to TanStack Query v5 (v3), dropping Recipes (scope reduction for maintainability), and adding Next.js App Directory support. The 14k+ stars and 817 forks indicate a healthy community.

**Source**: https://github.com/blitz-js/blitz/releases, npm registry

### 4. Local Installation

Blitz 3.0.2 is installed on this system and working:

```
$ npx blitz --version
3.0.2
```

Binary location: `/Users/nathanielcannon/.npm/_npx/f8d2cc529b1ae519/node_modules/blitz/bin/blitz`

The binary is in the npx cache, not a global npm install. It is accessible via:
- `npx blitz <command>` — always works
- Direct path: `/Users/nathanielcannon/.npm/_npx/f8d2cc529b1ae519/node_modules/blitz/bin/blitz`

To create a permanent global install:
```bash
npm install -g blitz
# Then: blitz --version
```

System compatibility:
- Node.js: 24.13.1 (requirement: 16+) — PASS
- npm: 11.8.0 — PASS
- OS: macOS Tahoe, arm64 (Apple M4 Max) — PASS

### 5. How Blitz RPC Works (Technical Detail)

```typescript
// src/products/queries/getProduct.ts  (SERVER — runs in Node.js)
import { resolver } from "@blitzjs/rpc"
import db from "db"

export default resolver.pipe(
  resolver.zod(z.object({ id: z.number() })),
  resolver.authorize(),
  async ({ id }) => {
    return db.product.findFirst({ where: { id } })
  }
)

// src/pages/products/[productId].tsx  (CLIENT — browser)
import getProduct from "src/products/queries/getProduct"
import { useQuery } from "@blitzjs/rpc"

// Blitz compiles this import into a POST /api/rpc/... call at build time
const [product] = useQuery(getProduct, { id: productId })
```

The `resolver.authorize()` middleware checks the session automatically. Authorization, input validation (Zod), and data access are co-located in one function.

---

## Comparison: Blitz vs. Alternatives for Jarvis Dashboard

| Aspect | Blitz.js | Plain Next.js | FastAPI + React | n8n UI |
|--------|----------|---------------|-----------------|--------|
| Setup time | Low (scaffold in minutes) | Medium (manual wiring) | High (two repos) | None (built-in) |
| Type safety | End-to-end (shared types) | Manual (openapi-typescript) | Moderate (manual) | None |
| API boilerplate | Zero (RPC removes it) | High (REST routes) | High | None |
| Auth built-in | Yes (full) | No (DIY or next-auth) | No | Yes (basic) |
| Prisma integration | First-class | Manual | No | No |
| Custom UI | Full control | Full control | Full control | Limited |
| PostgreSQL access | Direct via Prisma | Manual | Via SQLAlchemy | Via nodes |
| Qdrant/Redis/Neo4j access | Via server queries | Via server routes | Native | Via nodes |
| Real-time updates | Via SWR/polling | Via SWR/polling | Via WebSocket | Built-in |
| Deployment | Node.js process | Node.js process | Python process | Docker |
| Jarvis fit | Excellent | Good | Good | Good (already running) |

---

## Recommendations

### Primary Recommendation: Blitz for the Jarvis System Monitoring Dashboard

Build a dedicated Blitz app at `projects/jarvis-dashboard/` that provides a web UI for monitoring and interacting with the Jarvis infrastructure. This is the highest-ROI use case given that:

1. All backend services (PostgreSQL, Qdrant, Neo4j, Redis, LiteLLM) are already running in Docker Compose.
2. Prisma already maps to PostgreSQL for structured data.
3. The dashboard can surface telemetry tables already in PostgreSQL (`analytics.*`).
4. Blitz eliminates the REST API layer entirely, making this a 1-person-day project instead of a 1-week project.

**Rationale**: Jarvis currently has no web UI. All monitoring is terminal-based or via `.claude/reports/`. A Blitz dashboard would make system state observable without needing tmux access.

**Caveats**: Blitz apps require a running Node.js process. For Jarvis, this means adding a `blitz dev` process to the tmux layout or running `blitz build && blitz start` as a Docker container. The dashboard would be local-only (no external exposure needed).

### Alternative 1: Minimal Blitz App for Knowledge Graph Browser

Use `blitz new jarvis-graph-browser --template=minimal` to build a Neo4j knowledge graph explorer. Use the Graphiti MCP data (36 entities, 29 edges) exposed via server queries that call the Neo4j HTTP API. Renders entity relationships as a D3.js force graph.

**When to use**: When Milestone 4 (Graphiti cross-session memory) is wired into the session lifecycle and the graph grows large enough to need visual navigation.

### Alternative 2: Add Blitz RPC to Existing Next.js App

If an existing Next.js app is already in the project, install `@blitzjs/rpc` and `@blitzjs/next` as packages. This does not require `blitz new` and adds only the RPC layer.

**When to use**: If a Next.js app already exists in the Jarvis infrastructure.

---

## Action Items

- [ ] Run `npx blitz new jarvis-dashboard --template=full --language=typescript --form=react-hook-form` in `projects/` to scaffold the dashboard
- [ ] Configure `db/schema.prisma` to point to the Jarvis PostgreSQL instance (`postgresql://jarvis:jarvispass@localhost:5432/jarvis`)
- [ ] Add Jarvis-specific Prisma models: `SystemMetric`, `AgentSession`, `RagIngestion`, `GraphEntity`
- [ ] Scaffold queries: `getSystemHealth`, `getSessionHistory`, `getRagStats`, `getGraphStats`
- [ ] Add W6 tmux window "Dashboard" to run `npx blitz dev` on port 3000
- [ ] Expose Qdrant collection stats via a `/api/rpc/qdrant/queries/getCollections` query
- [ ] Expose LiteLLM proxy stats via a `/api/rpc/litellm/queries/getModelStats` query
- [ ] Add a knowledge graph panel that reads Neo4j entities via server-side query

---

## Practical Implementation Guide

### Quickstart (5 minutes)

```bash
cd /Users/nathanielcannon/Claude/Project_Aion/projects/
npx blitz new jarvis-dashboard --template=full --language=typescript

# In the new project:
cd jarvis-dashboard
npx blitz dev  # starts on http://localhost:3000
```

### Connecting to Jarvis PostgreSQL

```prisma
// db/schema.prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

```bash
# .env.local
DATABASE_URL="postgresql://jarvis:jarvispass@localhost:5432/jarvis"
```

```bash
npx blitz prisma db push    # sync schema to DB
npx blitz prisma studio     # visual DB editor at localhost:5555
```

### Example: System Health Query

```typescript
// src/system/queries/getSystemHealth.ts
import { resolver } from "@blitzjs/rpc"
import db from "db"

export default resolver.pipe(async () => {
  const [qdrantStats, sessionCount, lastSession] = await Promise.all([
    fetch("http://localhost:6333/collections").then(r => r.json()),
    db.agentSession.count(),
    db.agentSession.findFirst({ orderBy: { createdAt: "desc" } }),
  ])
  return { qdrantStats, sessionCount, lastSession }
})
```

### Example: Scaffolding a Full Resource

```bash
npx blitz generate all AgentSession \
  sessionId:string \
  startedAt:dateTime \
  endedAt:dateTime \
  tokenCount:int \
  status:string
```

This creates: Prisma model, 5 queries, 3 mutations, 4 pages (index, new, edit, show).

---

## Sources

1. [Blitz.js Official Site](https://blitzjs.com)
2. [Blitz Get Started Docs](https://blitzjs.com/docs/get-started)
3. [Why Blitz?](https://blitzjs.com/docs/why-blitz)
4. [Blitz File Structure](https://blitzjs.com/docs/file-structure)
5. [Blitz RPC Specification](https://blitzjs.com/docs/rpc-specification)
6. [Blitz CLI: blitz new](https://blitzjs.com/docs/cli-new)
7. [Blitz CLI: blitz generate](https://blitzjs.com/docs/cli-generate)
8. [Blitz Auth Setup](https://blitzjs.com/docs/auth-setup)
9. [GitHub: blitz-js/blitz](https://github.com/blitz-js/blitz)
10. [GitHub Releases](https://github.com/blitz-js/blitz/releases)
11. [npm: blitz](https://www.npmjs.com/package/blitz)
12. [InfoWorld: Intro to Blitz.js](https://www.infoworld.com/article/2336634/intro-to-blitzjs-a-full-stack-framework-for-nextjs.html)

---

## Uncertainties

- **Next.js App Router support**: Blitz v3 adds App Directory support but the extent of compatibility with React Server Components is not fully documented. The RPC layer is designed for client components. Mixed App Router + Pages Router projects may need configuration.
- **Real-time/WebSocket support**: Blitz does not have first-class WebSocket support. For live dashboard updates (e.g., streaming Qdrant ingestion progress), polling via TanStack Query's `refetchInterval` is the current approach. Server-Sent Events can be added via Next.js route handlers.
- **Maintenance velocity**: The last release (v3.0.2) was September 2024. Activity has slowed compared to v2.x. The framework is stable but may not receive rapid feature additions. Core Next.js functionality continues to advance independently.
- **Recipes removal**: Blitz v3 removed the one-line integration system (e.g., `blitz install tailwind`). Tailwind, Shadcn/ui, and other UI libraries must now be added manually — though their own installation guides are straightforward.

---

## Related Topics

- **n8n Integration**: n8n (already running at http://localhost:5678) can trigger Blitz API endpoints via HTTP Request nodes, enabling workflow-driven data updates.
- **Prisma Studio**: Ships with Blitz — provides a visual database editor for the PostgreSQL instance without any additional tooling.
- **TanStack Query v5**: The underlying data-fetching library. Understanding its cache invalidation and optimistic update patterns is important for building a responsive dashboard.
- **shadcn/ui**: The recommended component library for Blitz apps in 2025 — provides pre-built accessible components (tables, charts, cards) that accelerate dashboard development significantly.

---

*Jarvis Deep Research Agent — blitz-dev.md*
