# Jarvis 2.0 — Master Agent Platform Architecture & Roadmap

## Context

Jarvis 1.x runs "through" Claude Code in a tmux session — powerful but limited to single-project, terminal-only, macOS-only operation. The user wants a complete rebuild into a **master autonomous agent platform** with: desktop app, voice interface, multi-project management, agent orchestration above Claude Code, local LLM management, and the research/quality tooling of a professional engineering organization.

Research phase evaluated 23+ open source projects across 6 parallel agents. Key finding: Claude Code has a full headless API (`-p --bare --stream-json`) that enables programmatic orchestration. No reviewed project matches Jarvis's autonomic infrastructure (JICM, AC-01 through AC-10). The rebuild preserves the Mind and gains new surfaces.

---

## Technology Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Language | **Rust** | Single binary, Tauri-native, cross-platform, no runtime deps |
| Async | **Tokio** | Standard Rust async runtime |
| CLI/TUI | **Ratatui + clap** | Immediate interactive value before desktop app |
| Desktop | **Tauri v2** | Rust backend + webview, ~5MB binary (Phase 8) |
| Frontend | **SolidJS + TailwindCSS** | 7KB reactive framework inside Tauri |
| Database | **PostgreSQL** (existing) | Already running in Docker |
| Vector DB | **Qdrant** (existing) | Already running |
| Graph DB | **Neo4j** (existing) | Already running |
| CC integration | **`claude -p --bare --stream-json`** | Official headless API |

## New Repo Structure

Separate repo at `/Users/nathanielcannon/Claude/Jarvis2/`. Jarvis 1.x untouched until Phase 5 migration.

```
Jarvis2/
  Cargo.toml                    # Workspace root
  crates/
    jarvis-core/                # Config, domain types, errors
    jarvis-mind/                # Psyche, JICM, autonomics, memory, model router
    jarvis-runtime/             # CC headless, Ollama/MLX, n8n, agent registry
    jarvis-ipc/                 # Event bus, WebSocket gateway
    jarvis-cli/                 # TUI + CLI binary
    jarvis-tauri/               # Desktop app (Phase 8+)
  migrations/                   # SQL migrations
  config/                       # Default config, identity templates
  docker/                       # Compose files (inherits from 1.x)
  tests/                        # Integration tests
```

## Migration Strategy

Gradual, reversible. 1.x remains daily driver through Phase 4. Coexistence via shared Docker services and symlinked context files. `jarvis2 migrate` command in Phase 10 finalizes cutover.

---

## Phased Roadmap (10 phases, ~27 weeks)

### Phase 0: Skeleton & Core Types (1 week)

**Deps**: None

- Init Rust workspace with 5 crates
- `jarvis-core`: config loading (YAML), error types (`thiserror`), domain types (`AgentId`, `SessionId`, `ProjectId`, `ModelTier`)
- Config schema maps to existing `paths-registry.yaml` + `capability-map.yaml`
- `jarvis2 --version` prints version, `--config path` loads config

**DoD**: `cargo build --release` < 5MB binary, 10+ unit tests, config loading works

---

### Phase 1: Event Bus & IPC (2 weeks)

**Deps**: Phase 0

- `jarvis-ipc`: async event bus via `tokio::sync::broadcast`
- Event types: `ContextThreshold`, `AgentStarted/Completed`, `SessionEvent`, `CommandSignal`, `UserMessage`
- Signal file bridge: reads 1.x signal files (`.jicm-state`, `.command-signal`, etc.) → bus events
- WebSocket server (port 9700): publishes events to clients (OpenClaw gateway pattern)
- JSONL event logger

**DoD**: Signal file → WebSocket event within 500ms, `jarvis2 bus --watch` works, 20+ tests

---

### Phase 2: Mind Layer — Identity, JICM, Memory (3 weeks)

**Deps**: Phase 1. **Preserves**: All identity/psyche files, AC specs, JICM design, memory tiers.

**2a: Psyche** — Parse `jarvis-identity.md` → `Psyche` struct, parse `capability-map.yaml` → typed `CapabilityMap`, model router (task → opus/sonnet/haiku)

**2b: JICM** — Port state machine (WATCHING→HALTING→COMPRESSING→CLEARING→RESTORING) to Rust, token counter from CC JSONL, context preparation (port `jicm-prep-context.sh`)

**2c: Memory** — `MemoryStore` trait with implementations: `ScratchpadStore`, `QdrantStore`, `GraphitiStore`. Memory router decides which tier(s) to query.

**DoD**: `jarvis2 identity` prints parsed identity, `jarvis2 jicm --session-file` reports tokens, `jarvis2 memory search` returns results, 40+ tests

**Key files**: `psyche/jarvis-identity.md`, `psyche/capability-map.yaml`, `scripts/jicm-watcher.sh`, `scripts/jicm-prep-context.sh`

---

### Phase 3: Agent Runtime — CC Headless (3 weeks)

**Deps**: Phase 2. **Preserves**: All agent definitions (`.claude/agents/*.md`)

**3a: CC Session Manager** — Spawn `claude -p --bare --output-format stream-json`, parse stream-json, send via stdin, session lifecycle (create/send/receive/interrupt/resume via `--session-id`)

**3b: Agent Registry** — Parse agent markdown → `AgentDefinition`, launch agent = spawn CC session with agent config, agent mailbox (async channel), lifecycle events on bus

**3c: Multi-Session Orchestrator** — Up to N concurrent CC sessions (default 3), git worktree isolation per agent (`git2` crate), sequential pipeline matching `capability-map.yaml` compositions

**DoD**: `jarvis2 agent run code-analyzer --prompt "..."` streams output, `jarvis2 agent list` shows agents, concurrent session test passes, 30+ tests

---

### Phase 4: CLI & TUI (2 weeks)

**Deps**: Phase 3

**4a: Interactive CLI** — REPL with Jarvis persona, commands: `/status`, `/agent <name>`, `/jicm`, `/memory`, `/projects`, parity with critical 1.x commands

**4b: TUI Dashboard** — Ratatui split-pane: agent activity (left), chat (right), status bar (JICM %, agents, model). Keyboard shortcuts for panel switching.

**DoD**: `jarvis2` starts interactive CLI with identity greeting, `jarvis2 tui` shows live dashboard, 15+ tests

**Milestone: First usable system.** CLI + TUI can drive CC sessions, manage agents, monitor JICM.

---

### Phase 5: Autonomic Components Port (3 weeks)

**Deps**: Phase 4. **Preserves**: All AC-01 through AC-10 behavioral specs, all 55 patterns.

**5a: AC-01 through AC-04** — Session launch, Wiggum Loop (Execute→Check→Review→Drift→Context), Milestone Review (code-review + project-manager agents), JICM driving CC sessions directly

**5b: AC-05 through AC-09** — Self-Reflection, Self-Evolution (risk-gated), R&D, Maintenance, Session Completion

**5c: AC-10 Ulfhedthnar** — Defeat signal accumulator, parallel agent spawner, approach rotation, auto-disengage

**DoD**: Each AC has state machine tests, full session lifecycle integration test (AC-01→work→JICM→AC-09), 50+ tests

**Milestone: True Jarvis replacement.** All autonomic behavior ported.

---

### Phase 6: Multi-Project & Orchestration (2 weeks)

**Deps**: Phase 5

- Project registry with isolated contexts (system prompt, MCP config, paths, git repo)
- `jarvis2 project <name>` switches context
- Multi-project parallel agents (different CC sessions per project)
- In-memory kanban per project (persisted YAML, agents can read/update)
- Agent-to-agent messaging via bus (request/response pattern)

**DoD**: Two projects run agents concurrently without context bleed, task board functional, 25+ tests

---

### Phase 7: Vestige Memory & Research Library (3 weeks)

**Deps**: Phase 6. **Preserves**: All Qdrant collections, Graphiti entities.

**7a: Cognitive Memory** — FSRS-6 spaced repetition, prediction error gating, dream consolidation (background), memory decay

**7b: Research Library** — arXiv search, Google Scholar, Anna's Archive/Sci-Hub, PDF extraction → Qdrant, citation tracking

**7c: Quality Gates** — Biome.js integration (JS/TS), VibeCop AST analysis, Serena LSP MCP for semantic code nav, WebClaw MCP for web scraping

**DoD**: `jarvis2 memory recall` with FSRS ordering, `jarvis2 research arxiv` returns papers, quality gates run in AC-03, 40+ tests

---

### Phase 8: Tauri Desktop App (4 weeks)

**Deps**: Phase 6

- Tauri v2 + SolidJS + TailwindCSS
- Views: Kanban, Agent Activity, Chat, Project Browser, Settings, Token Analytics
- System tray (background, status icon)
- 6-category token analytics (user/instructions/tools/thinking/coordination/total)

**DoD**: `.dmg` < 10MB, kanban drag-drop, live agent streaming, token dashboard, 20+ manual UI tests

---

### Phase 9: Multi-Channel & Mobile (2 weeks)

**Deps**: Phase 8

- WebSocket gateway via Cloudflare Tunnel for remote access
- iPhone voice via Apple Shortcuts → WebSocket
- Push notifications (ntfy.sh)
- Remote agent launch + approval from phone

**DoD**: Voice command from iPhone triggers agent on Mac, push notification on completion

---

### Phase 10: Consolidation & 1.x Retirement (2 weeks)

**Deps**: All prior

- `jarvis2 migrate --from /path/to/Jarvis` converts 1.x state
- Unified launcher: `jarvis2 launch --tui | --gui | --headless`
- Documentation: architecture, user, migration, developer guides
- 1.x archived, version 2.0.0 released

**DoD**: Migration completes, 300+ tests passing, all 10 ACs functional, README with quickstart

---

## Timeline Summary

| Phase | Name | Weeks | Cumulative | Value Delivered |
|-------|------|-------|------------|-----------------|
| 0 | Skeleton | 1 | W1 | Build infrastructure |
| 1 | Event Bus | 2 | W3 | Observable system |
| 2 | Mind Layer | 3 | W6 | Identity + JICM + Memory |
| 3 | Agent Runtime | 3 | W9 | CC headless orchestration |
| **4** | **CLI + TUI** | **2** | **W11** | **First usable system** |
| **5** | **Autonomics** | **3** | **W14** | **True Jarvis replacement** |
| 6 | Multi-Project | 2 | W16 | Parallel project work |
| 7 | Memory + Research | 3 | W19 | Cognitive memory + library |
| 8 | Desktop App | 4 | W23 | Full GUI |
| 9 | Mobile | 2 | W25 | Remote access |
| 10 | Consolidation | 2 | W27 | 2.0.0 release |

## Key Risks & Mitigations

- **CC API instability**: Abstract behind `ClaudeSession` trait — one module to update
- **16GB RAM**: Core targets <200MB, CC sessions ~500MB each, max 3 concurrent
- **Rust learning curve**: Phases 0-1 are simple types/channels; complexity ramps gradually
- **Scope creep**: Each phase has concrete DoD with test counts; no phase starts until prior is done

## Verification

After each phase:
1. `cargo test` — all tests pass
2. `cargo clippy` — no warnings
3. Manual smoke test of new CLI commands
4. Integration test against live Docker services (PostgreSQL, Qdrant, Neo4j)
5. Memory profiling (`/usr/bin/time -l`) to verify <200MB resident
