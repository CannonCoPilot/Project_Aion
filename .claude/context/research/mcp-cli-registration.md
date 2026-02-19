# Research Report: Claude Code MCP CLI Registration and Context Isolation

**Date**: 2026-02-18
**Scope**: Claude Code CLI flags for MCP configuration, per-session override mechanisms, dynamic load/unload, and proxy/gateway patterns for context-lean architecture
**Branch context**: Project_Aion — Jarvis v5.10.0 with 7 active MCPs (heavy context load)

---

## Executive Summary

Claude Code has meaningful but incomplete support for per-session MCP configuration. The `--mcp-config` and `--strict-mcp-config` flags together provide a practical path to the "Jarvis-main (no MCPs)" + "Jarvis-MCPs (tool proxy)" split — but it requires spawning separate processes rather than dynamically toggling within a session. True in-session enable/disable CLI commands do not yet exist (open feature requests, no timeline).

The most immediately applicable solution for Jarvis is the `--strict-mcp-config` subprocess pattern: lean main session with no MCPs, MCP-heavy work delegated to isolated subprocesses launched via custom slash commands. A longer-term and more architecturally clean option is deploying an MCP gateway (e.g., `agent-mcp-gateway`) that fronts all downstream servers behind 3 lightweight proxy tools, drastically reducing context overhead regardless of which instance runs.

Claude Code v2.1.7+ also ships a native `ENABLE_TOOL_SEARCH` feature that defers MCP tool schema loading until needed, offering an 85–95% reduction in upfront context cost with no architectural changes required. This is the lowest-friction improvement available today.

---

## Key Findings

### Finding 1: `--mcp-config` and `--strict-mcp-config` Flags

These two flags together form the core mechanism for session-isolated MCP configuration.

**`--mcp-config <path|json>`** — Loads MCP server configuration from a JSON file or inline JSON string at launch time. Multiple flags can be passed and their configs are merged. Custom servers override same-named built-in servers. This flag is the standard mechanism used by Claude Code Action in CI/CD pipelines.

```bash
# Load specific MCPs for this process only
claude --mcp-config ~/.claude/mcp-rag-only.json

# Load inline JSON (no file needed)
claude --mcp-config '{"mcpServers": {"my-server": {"command": "python", "args": ["server.py"]}}}'

# Multiple configs merged
claude --mcp-config /tmp/config-a.json --mcp-config /tmp/config-b.json
```

**`--strict-mcp-config`** — When combined with `--mcp-config '{}'`, disables ALL configured MCP servers for that process. This is the current workaround for a `--no-mcp` flag that does not yet exist.

```bash
# Start Claude with zero MCPs loaded
claude --strict-mcp-config --mcp-config '{}'
```

The combination of both flags is the closest current equivalent to a "lean/main" mode. The `--strict-mcp-config` flag tells Claude to only use servers from the provided `--mcp-config`, ignoring `~/.claude.json`, `.mcp.json`, and all other sources.

**Source**: [Claude Code Action configuration docs](https://github.com/anthropics/claude-code-action/blob/main/docs/configuration.md), [Feature request #20873](https://github.com/anthropics/claude-code/issues/20873), [paddo.dev context isolation](https://paddo.dev/blog/claude-code-mcp-context-isolation/)

---

### Finding 2: `.mcp.json` Override Behavior and Caveats

`.mcp.json` at the project root is the "project-scoped" MCP configuration, intended for version control sharing. However, it has significant reliability issues:

- `.mcp.json` is **not** the source of truth; `~/.claude.json` is. Manual edits to `.mcp.json` may not be recognized until `claude mcp add` rewrites the file.
- When `claude mcp add` runs, it **overwrites** `.mcp.json` instead of merging, potentially destroying existing entries.
- `.mcp.json` is **disabled by default** for security (must opt in per-project via trust prompt).
- Multiple `mcpServers` sections in `~/.claude.json` silently override each other — a known bug.
- Project-specific `.mcp.json` files are sometimes not loaded at all (Issue #4938).

**Scope hierarchy** (highest wins for same-name conflicts):
1. `local` — stored in `~/.claude.json` under project path (default for `claude mcp add`)
2. `project` — stored in `.mcp.json` (team-shared, version-controlled)
3. `user` — stored in `~/.claude.json` globally (available across all projects)

**Per-session override via environment**: The `--mcp-config` flag (above) is the reliable way to override per-session. Writing a temporary JSON file and passing it at launch is fully supported and the recommended CI/CD pattern.

**Source**: [Claude Code Settings Docs](https://code.claude.com/docs/en/settings), [Issue #13281](https://github.com/anthropics/claude-code/issues/13281), [Issue #4938](https://github.com/anthropics/claude-code/issues/4938)

---

### Finding 3: Dynamic Load/Unload — Not Yet Supported via CLI

There is **no native CLI mechanism** to enable or disable MCP servers within a running session. The current state:

| Mechanism | Status |
|-----------|--------|
| `claude mcp enable <name>` | Does not exist |
| `claude mcp disable <name>` | Does not exist |
| `--no-mcp` launch flag | Does not exist |
| `/mcp` UI toggle (interactive sessions) | Works in v2.0.10+, but no CLI equivalent |
| Hook-based automation of enable/disable | Not possible without CLI commands |

Multiple feature requests exist:
- [Issue #4879](https://github.com/anthropics/claude-code/issues/4879) — MCP enable/disable toggle
- [Issue #10447](https://github.com/anthropics/claude-code/issues/10447) — CLI commands for enable/disable (26 upvotes, open)
- [Issue #20873](https://github.com/anthropics/claude-code/issues/20873) — `--no-mcp`, `--no-plugins`, `--vanilla` flags (marked stale)
- [Issue #6309](https://github.com/anthropics/claude-code/issues/6309), [#6638](https://github.com/anthropics/claude-code/issues/6638), [#7172](https://github.com/anthropics/claude-code/issues/7172) — all closed as "not planned"

The closing of multiple related issues as "not planned" is a signal that Anthropic's current direction favors the Tool Search approach (Finding 4) over in-session toggling.

**Source**: [Issue #10447](https://github.com/anthropics/claude-code/issues/10447), [Issue #20873](https://github.com/anthropics/claude-code/issues/20873)

---

### Finding 4: Native MCP Tool Search (ENABLE_TOOL_SEARCH)

Claude Code v2.1.7 introduced `ENABLE_TOOL_SEARCH`, a native lazy-loading mechanism that defers MCP tool schema injection until the model actually needs a tool. This is Anthropic's official answer to context bloat from MCP tool definitions.

**How it works:**
1. Claude Code calculates the token cost of all configured MCP tool definitions at startup.
2. If the total exceeds the configured threshold (default: 10% of context window), tool schemas are deferred.
3. Claude receives a lightweight `MCPSearch` meta-tool instead.
4. When Claude needs an MCP capability, it calls `MCPSearch` to discover and load only the relevant tools.
5. From the user perspective, tools work identically.

**Configuration:**
```bash
# Auto mode (default) — triggers at >10% context
ENABLE_TOOL_SEARCH=auto claude

# Force always-on
ENABLE_TOOL_SEARCH=true claude

# Custom threshold (5%)
ENABLE_TOOL_SEARCH=auto:5 claude

# Disable entirely
ENABLE_TOOL_SEARCH=false claude
```

Via `settings.json`:
```json
{
  "env": {
    "ENABLE_TOOL_SEARCH": "auto:5"
  }
}
```

**Performance data:**
- Reported 85–95% reduction in initial context usage for multi-server setups
- Anthropic internal testing: Opus 4 tool-selection accuracy improved from 49% to 74% with on-demand loading
- A session with 73 tools dropped from ~40k tokens upfront to ~5k tokens (tool registry only)

**Known bug**: Auto mode sometimes fails to trigger even when threshold is exceeded (Issue #19890). Workaround: set `ENABLE_TOOL_SEARCH=true` explicitly.

**Model requirement**: Requires Sonnet 4 or later, or Opus 4 or later. Haiku does not support tool search. Jarvis runs on claude-sonnet-4-6 — fully compatible.

**Source**: [Claude Code MCP docs](https://code.claude.com/docs/en/mcp), [Issue #19890](https://github.com/anthropics/claude-code/issues/19890), [claudefa.st tool search](https://claudefa.st/blog/tools/mcp-extensions/mcp-tool-search)

---

### Finding 5: MCP Gateway / Proxy Pattern

Several third-party gateways implement the "proxy MCP" architecture — a single MCP server that exposes 2–3 meta-tools, with all downstream servers hidden until explicitly requested.

**agent-mcp-gateway** (roddutra/agent-mcp-gateway):
- Exposes exactly 3 tools: `list_servers`, `get_server_tools`, `execute_tool`
- ~2k tokens total at startup vs. 50k+ for all downstream tools combined
- Per-subagent access control via `.mcp-gateway-rules.json`
- Agent identity via `agent_id` field in tool calls (set in system prompt)
- Hot config reload, audit logging, session isolation for concurrent requests
- Install: `uvx agent-mcp-gateway --init` then `claude mcp add agent-mcp-gateway uvx agent-mcp-gateway`

**claude-mcp-server-gateway** (bzsasson/claude-mcp-server-gateway):
- Exposes 3 tools: `list_available_mcps`, `load_mcp_tools`, `call_mcp_tool`
- Backend MCP servers only start when Claude actually needs them (cold-start on first call)
- Python 3.11+, configured via simple dict in `dcl_wrapper.py`
- Limitation: no state persistence between calls

**IBM ContextForge MCP Gateway**:
- Enterprise-grade: federation, Redis caching, Kubernetes support, RBAC, mTLS
- Admin UI for observability
- Appropriate for multi-cluster/multi-team deployments

**The key architectural insight**: The gateway pattern and `ENABLE_TOOL_SEARCH` solve the same problem from different angles. The gateway is a single registered MCP that fronts all others; Tool Search is a Claude Code-native deferral system. They can coexist.

**Source**: [agent-mcp-gateway](https://github.com/roddutra/agent-mcp-gateway), [claude-mcp-server-gateway](https://github.com/bzsasson/claude-mcp-server-gateway), [IBM ContextForge](https://ibm.github.io/mcp-context-forge/)

---

### Finding 6: Subprocess Isolation Pattern (`--strict-mcp-config` + Slash Commands)

The community-discovered pattern for true context isolation without modifying the main session:

1. Define per-tool MCP config files (e.g., `~/.claude/mcp-rag.json`, `~/.claude/mcp-db.json`)
2. Create custom slash commands (`.claude/commands/`) that launch isolated subprocesses
3. Main session stays lean; subprocess loads only the MCPs it needs; results are returned as text

```bash
# Slash command pattern (.claude/commands/rag.md):
claude --mcp-config ~/.claude/mcp-rag.json \
  --strict-mcp-config \
  --allowed-tools "mcp__local-rag,mcp__jarvis-rag" \
  --print \
  -p "TASK: $ARGUMENTS"
```

**Key distinction vs. Task tool (subagents)**: The `Task` tool still requires MCP tool definitions in the **main session context** because subagent spawning happens within the same process. The `--mcp-config` subprocess approach spawns a completely separate process — MCP definitions never touch the parent context.

**Limitation**: Subprocess output is returned as text only. No tool call history, no context sharing between parent and subprocess beyond the text response.

**Source**: [paddo.dev context isolation article](https://paddo.dev/blog/claude-code-mcp-context-isolation/), [Issue #10447 workaround section](https://github.com/anthropics/claude-code/issues/10447)

---

## Comparison: Approaches for Jarvis Architecture

| Approach | Context Saving | Complexity | Reliability | Fits Jarvis |
|----------|---------------|------------|-------------|-------------|
| `ENABLE_TOOL_SEARCH=true` | 85–95% upfront | Zero — env var only | Known auto-mode bug; use `=true` | Yes, immediate |
| Subprocess via `--strict-mcp-config` | 100% (zero MCPs in main) | Medium — slash commands per tool | Solid; pattern well-documented | Yes, for heavy MCP ops |
| MCP Gateway (agent-mcp-gateway) | ~95% (3 tools vs. all) | Medium — one-time setup | Good; actively maintained | Yes, longer-term |
| In-session enable/disable CLI | 100% (session-time only) | N/A — not implemented | N/A | Not available |
| Separate tmux window ("Jarvis-MCPs") | 100% in main | High — inter-process comms | Complex; no native IPC | Possible but fragile |

---

## Recommendations

### 1. Primary: Enable ENABLE_TOOL_SEARCH immediately (zero-cost, zero-risk)

Set in `.claude/settings.json` (or the global `~/.claude/settings.json`) under the `env` field. Use explicit `true` rather than `auto` to avoid the known auto-mode bug.

```json
{
  "env": {
    "ENABLE_TOOL_SEARCH": "true"
  }
}
```

This immediately defers all 7 current MCPs' tool schemas from upfront loading. With 7 active MCPs (qdrant-mcp, postgres-mcp, neo4j, local-rag, jarvis-rag, jarvis-graphiti, standard set), this could save 30,000–60,000 tokens per session startup. Rationale: zero architectural change, supported on claude-sonnet-4-6, available now.

### 2. Secondary: Create per-domain subprocess commands for heavy MCP operations

For operations that need sustained, deep MCP access (e.g., Graphiti ingestion, large RAG queries), create isolated slash commands that spawn subprocesses with targeted MCP configs:

```
.claude/commands/rag-query.md    → --mcp-config with local-rag + jarvis-rag only
.claude/commands/graphiti.md     → --mcp-config with neo4j + jarvis-graphiti only
.claude/commands/db.md           → --mcp-config with postgres-mcp only
```

Each command uses `--strict-mcp-config` to ensure only the specified MCPs load. Main Jarvis session never sees those tool definitions.

### 3. Tertiary: Evaluate agent-mcp-gateway for unified proxy

If the number of MCPs continues to grow (Phase 5+ adds n8n-mcp, potentially more), deploying `agent-mcp-gateway` would centralize all MCP access behind 3 stable proxy tools. This also enables per-subagent access control, which aligns with the multi-agent architecture (Ennoia, Virgil, etc. each getting appropriate tool subsets).

Install path: `claude mcp add agent-mcp-gateway uvx agent-mcp-gateway`, then define access rules in `.mcp-gateway-rules.json`.

### 4. Deferred: "Jarvis-MCPs" separate instance pattern

The originally proposed architecture (lean main + dedicated MCP instance) is achievable but requires inter-process communication (piped text via subprocess calls). This is essentially what the subprocess slash command pattern implements, just without a persistent "Jarvis-MCPs" instance. A persistent proxy via the gateway pattern (Recommendation 3) is cleaner and more maintainable than a persistent tmux-window-based MCP instance.

---

## Action Items

- [ ] Add `ENABLE_TOOL_SEARCH=true` to `.claude/settings.json` `env` field — immediate 85%+ startup context reduction
- [ ] Create `~/.claude/mcp-rag.json` and `.claude/commands/rag-query.md` for isolated RAG subprocess
- [ ] Create `~/.claude/mcp-graphiti.json` and `.claude/commands/graphiti.md` for isolated Graphiti subprocess
- [ ] Evaluate `agent-mcp-gateway` when MCP count exceeds 10 or Phase 5 (n8n) is added
- [ ] Monitor [Issue #10447](https://github.com/anthropics/claude-code/issues/10447) for native `claude mcp enable/disable` — would simplify hook-based context management significantly when it lands

---

## Sources

1. [Connect Claude Code to tools via MCP — Official Docs](https://code.claude.com/docs/en/mcp)
2. [Claude Code Settings — Official Docs](https://code.claude.com/docs/en/settings)
3. [Feature Request: CLI Flags --no-mcp, --no-plugins (Issue #20873)](https://github.com/anthropics/claude-code/issues/20873)
4. [Feature Request: CLI Commands for MCP Enable/Disable (Issue #10447)](https://github.com/anthropics/claude-code/issues/10447)
5. [Bug: .mcp.json Manual Edits Not Recognized (Issue #13281)](https://github.com/anthropics/claude-code/issues/13281)
6. [Bug: Multiple mcpServers Sections Override Each Other (Issue #4938)](https://github.com/anthropics/claude-code/issues/4938)
7. [Bug: ENABLE_TOOL_SEARCH auto mode not triggering (Issue #19890)](https://github.com/anthropics/claude-code/issues/19890)
8. [Isolating MCP Context in Claude Code with Slash Commands — paddo.dev](https://paddo.dev/blog/claude-code-mcp-context-isolation/)
9. [agent-mcp-gateway — GitHub (roddutra)](https://github.com/roddutra/agent-mcp-gateway)
10. [claude-mcp-server-gateway — GitHub (bzsasson)](https://github.com/bzsasson/claude-mcp-server-gateway)
11. [IBM ContextForge MCP Gateway](https://ibm.github.io/mcp-context-forge/)
12. [Claude Code Action Configuration (--mcp-config in CI)](https://github.com/anthropics/claude-code-action/blob/main/docs/configuration.md)
13. [MCP Tool Search: Save 95% Context — claudefa.st](https://claudefa.st/blog/tools/mcp-extensions/mcp-tool-search)
14. [Optimising MCP Server Context Usage in Claude Code — Scott Spence](https://scottspence.com/posts/optimising-mcp-server-context-usage-in-claude-code)
15. [Claude Code CLI Cheatsheet — Shipyard](https://shipyard.build/blog/claude-code-cheat-sheet/)

---

## Uncertainties

- Whether `--strict-mcp-config` is documented as a stable public flag or an implementation detail that could be removed. It is confirmed working but not prominently documented in official docs.
- Whether `agent-mcp-gateway`'s agent identity mechanism (`agent_id` in tool calls) is compatible with Jarvis's subagent system prompts without modification.
- Exact token counts for Jarvis's current 7 MCPs. A session startup with `ENABLE_TOOL_SEARCH=false` and the `/mcp` status command would reveal real numbers.
- Timeline for native `claude mcp enable/disable` CLI commands — no official ETA from Anthropic.

---

## Related Topics

- JICM context budget optimization (how MCP tool schema tokens affect the 55%/73%/78.5% thresholds)
- Subagent system prompt design for `agent_id`-based gateway routing
- n8n-mcp token profile (Phase 5) — important to know before adding another high-schema server
- Hook-based session startup to auto-configure `ENABLE_TOOL_SEARCH` threshold based on project context needs
