# Jarvis 2.0 — Research Findings

**Status**: ALL 6/6 RESEARCH AGENTS COMPLETE
**Created**: 2026-04-02

---

## 1. Existing Jarvis (Project_Aion) — KNOWN

**Architecture**: Three-layer Archon (Nous/Pneuma/Soma) with 10 autonomic components (AC-01 through AC-10), external tmux orchestration (Aion Quartet: Watcher, Ennoia, Virgil, Commands).

**Strengths to preserve**:
- Autopoietic self-improvement framework (AC-05/06/07/08)
- JICM context management (AC-04) — unique, no equivalent found in ANY reviewed project
- Wiggum Loop multi-pass verification (AC-02)
- Ulfhedthnar berserker override (AC-10)
- Personality/identity system (psyche layer)
- 4-tier memory hierarchy (scratchpad → MEMORY.md → Qdrant → Graphiti)
- Capability-map manifest router
- 51 behavioral patterns

**Weaknesses to fix**:
- Runs "through" Claude Code — cannot orchestrate from above
- tmux-dependent — not portable to Windows
- No UI beyond terminal
- Single-project focus (manual context switching)
- No voice interface
- No kanban/project board
- Agent spawning limited to Claude Code's native Agent tool

---

## 2. AIfred-Pro — KNOWN

**Architecture**: Operations Archon with Nexus cron dispatcher, 24 personas, Pulse task management API, Telegram bot.

**Extract**: Nexus job dispatcher, Pulse task API, persona system, infra health monitoring, Telegram bot pattern.

**Skip**: Bash-heavy scripts (need rewrite in TypeScript/Python), no UI.

---

## 3. OpenClaw — RESEARCHED ✅

**What**: Multi-channel messaging/automation hub (NOT a coding agent). 20+ channels (WhatsApp, Telegram, Slack, iMessage). TypeScript/Node 24. WebSocket Gateway at `ws://127.0.0.1:18789`.

**Extract**: WebSocket Gateway protocol for unified command surface, multi-channel routing architecture, session isolation model, skill registry (ClawHub pattern), Canvas/A2UI visual workspace concept.

**Skip**: Not a coding agent. No MCP support. Large dependency surface.

---

## 4. OpenCode — RESEARCHED ✅

**What**: Provider-agnostic Claude Code alternative. Client/server split. Build/Plan dual-agent model. MCP Registry support.

**Extract**: **Client/server decoupling** (most valuable — run agent on workstation, drive from phone), provider-agnostic model routing, Build/Plan role separation, MCP Registry integration.

**Skip**: No autonomic infrastructure. Still maturing (v1.3.x).

---

## 5. Piebald AI — RESEARCHED ✅

**What**: Desktop/web chat UI wrapper (v0.1.x, early). NOT an orchestration framework. Shallow agent model.

**Extract**:
- **Chat branching/forking** — reply to any earlier message to fork conversation. Novel UX.
- **claude-code-system-prompts repo** — maintained extraction of every CC system prompt (140+ versions). Reveals modular conditional prompt injection architecture.
- **tweakcc patches** — CC binary is patchable for custom system prompts, per-subagent model selection, custom toolsets, ~50% faster MCP startup.
- Subagent isolation model (restricted tool access, results as tool output).

**Skip**: Everything else is commodity UI. Our JICM is categorically superior to their compaction-based context management.

---

## 6. Claude Agent Teams UI — RESEARCHED ✅

**What**: Electron 40 + React 19 desktop app. Reads `~/.claude/` session logs. Includes orchestration package + built-in MCP server. AGPL-3.0 (copyleft — pattern extraction only).

**Extract** (patterns, not code — AGPL):
- **Agent-to-agent mailbox messaging** — native peer messaging without human intermediation
- **Hunk-level code review** — per-hunk accept/reject for multi-agent output
- **6-category token analytics** — user/instructions/tools/thinking/coordination/total
- **Kanban with agent awareness** — 5-column board where agents create/move cards
- **Granular autonomy dial** — full-auto to per-action approval, with mid-task redirection
- **Git worktree isolation** — per-agent worktree for parallel work

**Skip**: Electron shell (200MB), direct `~/.claude/` log parsing (fragile), any direct code (AGPL).

---

## 7. Orchestration Frameworks (17) — RESEARCHED ✅

**Ranked Top 5** (from 17 evaluated):

| Rank | Project | Key Value | Integration |
|------|---------|-----------|-------------|
| **1** | **Maestro** | Multi-project parallel agents, git worktree isolation, Auto Run playbooks, group chat, mobile remote, CLI headless mode | HIGH — solves exact multi-project problem |
| **2** | **Vestige** | Neuroscience-inspired memory (FSRS-6 decay, prediction error gating, memory dreaming, 3D dashboard). Rust + MCP | HIGH — replaces/upgrades 4-tier memory |
| **3** | **Claude-Flow (RuFlo)** | Swarm topologies (mesh/hierarchical), consensus protocols, Q-learning router, multi-LLM, 130+ skills, self-learning | HIGH — architectural reference, selective extraction |
| **4** | **wshobson/agents** | 72 plugins, 112 agents, 146 skills, PluginEval quality framework, Conductor workflow, progressive disclosure | HIGH — directly adoptable plugin/skill architecture |
| **5** | **Serena** | Symbol-level code navigation via LSP (40+ languages), MCP server. Replaces grep-and-read | HIGH — immediate tool augmentation |

**Honorable mentions**: Hephaestus (self-branching workflows), EquilateralAgents (standards-as-code), Harness (skeptical evaluator pattern).

**Low value**: CustomModes (Roo-specific config library), Agentic Cursor Rules (Cursor-specific), rUv-dev (scaffolding only), CCswarm (mostly planned, not implemented).

---

## 8. Must-Have Tools — RESEARCHED ✅

| Tool | Value | Integration | Risk | Verdict |
|------|-------|-------------|------|---------|
| **Biome.js** | HIGH (web projects) | LOW (single binary) | LOW (mature) | ADOPT for JS/TS |
| **WebClaw** | HIGH (token-efficient scraping) | LOW (native MCP) | MEDIUM (AGPL, new) | ADOPT — replaces web-fetch |
| **VibeCop** | MEDIUM-HIGH (anti-pattern detection) | LOW (CLI + GH Action) | LOW (MIT) | ADOPT as AC-03 gate |
| **Reminder-Watch** | LOW | MEDIUM | HIGH (fragile hack) | DEFER — Telegram/OpenClaw better |

**Key detail**: WebClaw delivers 67% token reduction vs raw HTML, 95.1% extraction accuracy, Chrome-level TLS fingerprinting. Native MCP with 10 tools. AGPL license requires attention if ever distributed.

**VibeCop**: 22 deterministic AST-based detectors for AI-induced anti-patterns (god functions, N+1, SQL injection, etc.). Pairs with Biome.js: Biome handles formatting/style, VibeCop handles structural/architectural.

---

## 9. Claude Code Source Internals — RESEARCHED ✅

**Critical finding: Full headless API exists.** Claude Code `-p` mode with `--output-format stream-json` is the official programmatic automation surface.

**Headless invocation pattern**:
```bash
claude -p "prompt" --output-format stream-json \
  --system-prompt "You are..." \
  --mcp-config /path/to/mcp.json \
  --allowed-tools "Bash(git:*) Edit Read" \
  --max-turns 5 --max-budget-usd 0.50 \
  --session-id <uuid> --bare
```

**Key flags**: `--bare` (skip hooks/LSP overhead), `--agents` (inject custom agents), `--strict-mcp-config`, `--resume`/`--continue`, `--session-id` (deterministic IDs).

**SDK control protocol** (stdin/stdout JSON): mid-session interrupt, model switching, MCP management, context usage stats, permission management.

**92 feature flags — unreleased features**:
- **KAIROS** — Persistent assistant mode, channels, push notifications, dream mode, GitHub webhooks
- **BG_SESSIONS** — `claude ps`, `claude logs`, `claude attach`, `claude kill`, `--bg` flag
- **DAEMON** — Long-running supervisor process with worker registry
- **COORDINATOR_MODE** — Multi-agent coordination
- **BRIDGE_MODE** — Remote control (`claude remote-control`)
- **SSH_REMOTE** — `claude ssh <host>` with binary deployment
- **FORK_SUBAGENT** — Alternative subagent spawning
- **ULTRAPLAN/ULTRATHINK** — Enhanced planning/thinking
- **VERIFICATION_AGENT** — Automated verification
- **EXTRACT_MEMORIES** — Auto memory extraction
- **CONTEXT_COLLAPSE** — Context management optimization

**Agent spawning**: `AgentTool` → `createSubagentContext()` → `resolveAgentTools()` → `initializeAgentMcpServers()`. Supports worktree isolation, background execution, model override per agent.

**Implication**: Jarvis 2.0 can spawn Claude Code sessions as subprocesses via `-p --bare --stream-json`, inject context, tools, and MCP servers, then consume structured output. This is the bridge from "running through CC" to "running CC as a tool."

---

## Synthesis: Emerging Architecture

### What Each Project Contributes

| Capability | Best Source | Why |
|-----------|------------|-----|
| Identity/personality | Jarvis (psyche) | Unique, deeply designed |
| Context management | Jarvis (JICM) | No equivalent anywhere |
| Self-improvement | Jarvis (AC-05/06/07/08) | Unique autopoietic framework |
| Client/server split | OpenCode | Clean decoupling pattern |
| Multi-channel comms | OpenClaw | 20+ channel routing |
| Agent messaging | Claude Agent Teams | Mailbox protocol (pattern only) |
| Kanban + agent cards | Claude Agent Teams | Agent-aware board (pattern only) |
| Token analytics | Claude Agent Teams | 6-category breakdown (pattern only) |
| Code review UI | Claude Agent Teams | Hunk-level review (pattern only) |
| Chat branching | Piebald | Novel session model concept |
| CC system prompts | Piebald (repo) | 140+ version library |
| Model routing | OpenCode | Provider-agnostic layer |
| Job dispatch | AIfred-Pro (Nexus) | Cron-based, proven |
| Task management | AIfred-Pro (Pulse) | Cross-archon API |
| Web scraping | WebClaw | 67% token savings, native MCP |
| Code quality | Biome.js + VibeCop | Format + structural anti-patterns |

### 4-Layer Architecture (refined)

```
┌─────────────────────────────────────────────────────────────┐
│  UI Layer                                                    │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐ │
│  │ Tauri    │  │ iPhone   │  │ TUI      │  │ Multi-     │ │
│  │ Desktop  │  │ Claude   │  │ (co-code │  │ Channel    │ │
│  │ App      │  │ Voice    │  │  vibe)   │  │ (OpenClaw) │ │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └─────┬──────┘ │
│       └──────────────┴──────────────┴───────────────┘       │
│                        WebSocket API                         │
├─────────────────────────────────────────────────────────────┤
│  Jarvis Mind (Orchestration)                                 │
│  ┌─────────┐  ┌──────────┐  ┌──────────┐  ┌─────────────┐ │
│  │ Psyche  │  │ Project  │  │ Task     │  │ Capability  │ │
│  │ Identity│  │ Context  │  │ Board    │  │ Router      │ │
│  │ Memory  │  │ Switcher │  │ (Kanban) │  │ (Manifest)  │ │
│  └─────────┘  └──────────┘  └──────────┘  └─────────────┘ │
│  ┌─────────┐  ┌──────────┐  ┌──────────┐  ┌─────────────┐ │
│  │ JICM    │  │ Wiggum   │  │ Model    │  │ Agent       │ │
│  │ Context │  │ Loop     │  │ Router   │  │ Messaging   │ │
│  │ Mgmt    │  │ Verify   │  │ (Multi)  │  │ (Mailbox)   │ │
│  └─────────┘  └──────────┘  └──────────┘  └─────────────┘ │
├─────────────────────────────────────────────────────────────┤
│  Agent Runtime Layer                                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────────┐│
│  │ Claude   │  │ Local    │  │ n8n      │  │ Specialized ││
│  │ Code     │  │ LLMs     │  │ Workflows│  │ Agents      ││
│  │ Sessions │  │ (Ollama/ │  │          │  │ (research,  ││
│  │          │  │  MLX)    │  │          │  │  deploy...) ││
│  └──────────┘  └──────────┘  └──────────┘  └─────────────┘│
├─────────────────────────────────────────────────────────────┤
│  Infrastructure Layer                                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────────┐│
│  │ Docker   │  │ MCP      │  │ Quality  │  │ File/Git/   ││
│  │ Services │  │ Servers  │  │ Gates    │  │ SSH         ││
│  │ (PG,     │  │ (WebClaw │  │ (Biome,  │  │             ││
│  │  Qdrant) │  │  + more) │  │  VibeCop)│  │             ││
│  └──────────┘  └──────────┘  └──────────┘  └─────────────┘│
└─────────────────────────────────────────────────────────────┘
```

### Key Design Decisions (final synthesis)

1. **Tauri over Electron** — Rust backend + webview (5MB vs 200MB), cross-platform. Rust backend manages Docker, file I/O, LLM processes natively
2. **WebSocket API** as the universal interface between UI and Mind (inspired by OpenClaw Gateway)
3. **Project Context Switcher** as first-class — each project gets isolated workspace, memory, patterns, roadmap, agent team
4. **Claude Code via `-p --bare --stream-json`** — spawn as subprocess, inject context/tools/MCP, consume structured output. NOT a container, a tool
5. **Agent Mailbox Protocol** for inter-agent communication (pattern from Claude Agent Teams, AGPL-safe)
6. **Vestige memory engine** replaces/augments 4-tier hierarchy with FSRS-6 decay, prediction error gating, dream consolidation
7. **Quality gates built-in** — Biome.js (formatting) + VibeCop (anti-patterns) + Serena (semantic navigation) + AC-03 (milestone review)
8. **Provider-agnostic model router** (from OpenCode) — Claude, Ollama, MLX, OpenAI endpoints per-task
9. **Plugin architecture** (from wshobson/agents) — progressive disclosure, PluginEval quality framework
10. **Maestro patterns** for multi-project parallel agents — git worktree isolation, Auto Run playbooks

### Complete Capability Map (source → Jarvis 2.0 layer)

| Capability | Source | Target Layer |
|-----------|--------|-------------|
| Identity/personality | Jarvis psyche | Mind |
| Context management (JICM) | Jarvis AC-04 | Mind |
| Self-improvement | Jarvis AC-05/06/07/08 | Mind |
| Multi-pass verify | Jarvis AC-02 | Mind |
| Berserker override | Jarvis AC-10 | Mind |
| Client/server split | OpenCode | Architecture |
| Multi-channel comms | OpenClaw Gateway | UI |
| Agent messaging | Claude Agent Teams (pattern) | Mind |
| Kanban + agent cards | Claude Agent Teams (pattern) | UI |
| Token analytics (6-cat) | Claude Agent Teams (pattern) | Mind |
| Hunk-level review | Claude Agent Teams (pattern) | UI |
| Chat branching | Piebald | UI |
| CC system prompts | Piebald repo | Infrastructure |
| Provider-agnostic models | OpenCode | Agent Runtime |
| Job dispatch | AIfred-Pro Nexus | Mind |
| Task management | AIfred-Pro Pulse | Mind |
| CC headless API | CC source (`-p --bare`) | Agent Runtime |
| CC unreleased features | CC source (KAIROS, BG_SESSIONS) | Future alignment |
| Parallel agents + worktree | Maestro | Agent Runtime |
| Cognitive memory | Vestige (FSRS-6, dreaming) | Mind |
| Swarm/consensus | Claude-Flow (reference) | Mind |
| Plugin/skill architecture | wshobson/agents | Mind |
| Semantic code nav | Serena (LSP MCP) | Infrastructure |
| Web scraping | WebClaw (MCP) | Infrastructure |
| Code quality | Biome.js + VibeCop | Infrastructure |

---

*Research complete 2026-04-02. All 6 agents reported. Ready for architecture design document.*
