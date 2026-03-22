# Research Report: rd-2026-01-031 — Background Agent Support

**Date**: 2026-03-22
**Status**: COMPLETE
**Result**: ADAPT (significant potential, partial adoption recommended)
**Source**: Claude Code v2.1.78 documentation, live system analysis

---

## Executive Summary

Claude Code's subagent system is substantially more capable than anticipated when this research item was queued (2026-01-20). The platform now supports background execution, persistent memory, agent-scoped hooks/MCPs, worktree isolation, and session persistence. Several Jarvis tmux-based systems could be simplified or enhanced using native agents, while others (JICM watcher, command-handler) require capabilities agents don't provide.

## Capability Matrix

### What Native Agents Can Do

| Capability | Details |
|---|---|
| Background execution | `run_in_background: true` or `background: true` in frontmatter |
| Persistent memory | `memory: user\|project\|local` — survives across sessions via MEMORY.md files |
| Agent-scoped hooks | PreToolUse, PostToolUse, Stop hooks in agent frontmatter |
| Agent-scoped MCPs | Inline MCP definitions connected only while agent runs |
| Worktree isolation | `isolation: "worktree"` — isolated git working copy |
| Model selection | Per-agent model choice (haiku/sonnet/opus/inherit) |
| Permission modes | Per-agent: default, acceptEdits, dontAsk, bypassPermissions, plan |
| Tool restrictions | `tools` allowlist or `disallowedTools` denylist |
| Skill preloading | `skills` field injects skill content into agent context |
| Session persistence | Transcripts at `~/.claude/projects/{project}/{sessionId}/subagents/` |
| Auto-compaction | Agents compact independently, respects CLAUDE_AUTOCOMPACT_PCT_OVERRIDE |
| Resume/continue | `SendMessage` to agent ID resumes with full context |
| Ctrl+B | User can background a running foreground agent |

### What Native Agents Cannot Do

| Limitation | Impact on Jarvis |
|---|---|
| No tmux screen-scraping | JICM watcher needs to read TUI statusline for token % |
| No tmux keystroke injection | JICM watcher needs to send /clear, prompts to W0 |
| No process management | Can't start/stop Docker, MLX, LiteLLM |
| No inter-agent communication | Agents can't talk to each other (must go through main) |
| Can't spawn sub-subagents | Agents cannot spawn other agents |
| Background agents auto-deny unpermitted tools | Must pre-approve all tools before launch |
| Background AskUserQuestion fails | Can't ask clarifying questions when backgrounded |

## Jarvis Component Analysis

### Could Replace with Native Agents

| Current System | Native Replacement | Benefit | Effort |
|---|---|---|---|
| **Ennoia (W2)** — idle detection + maintenance scheduling | Background agent with `memory: project` + periodic `/loop` | Gains persistent memory, better reasoning about priorities | Medium |
| **Virgil (W3)** — task/file tracking | Background agent with `memory: project` | Native tool access for codebase analysis | Low |
| **Idle-hands hook** — maintenance injection | Agent with `background: true` + scheduled prompt | More sophisticated decision-making than bash script | Low |

### Should Keep as External Scripts

| Current System | Why | Notes |
|---|---|---|
| **JICM Watcher (W1)** | Needs tmux screen-scraping + keystroke injection | No agent can read the TUI or send /clear |
| **Command Handler (W4)** | Needs signal file → tmux send-keys pipeline | Agents can't inject keystrokes into other windows |
| **MLX/LiteLLM/Docker startup** | Process management outside Claude's scope | Launcher pre-flight handles this |

### Hybrid Opportunities

| Concept | Description |
|---|---|
| **Agent-based code review** | Use `code-review` agent with `background: true` for automatic post-commit review |
| **Research delegation** | Use `deep-research` agent with `memory: project` to accumulate codebase knowledge |
| **Agent-scoped MCPs** | Give specific agents access to MCPs without loading them globally (saves context) |

## Recommendations

### Immediate (Low Effort)

1. **Add `memory: project` to existing agents** — code-review, deep-research, code-analyzer. They'll accumulate project-specific knowledge across sessions.
2. **Add `background: true` to code-review agent** — automatic background review after code changes.
3. **Use agent-scoped MCPs** — move rarely-used MCPs (bioRxiv, PubMed) from global `.mcp.json` to specific agent configs.

### Medium-Term

4. **Prototype Ennoia-as-agent** — replace bash idle detection with a native agent that has memory and better reasoning about what maintenance to perform.
5. **Add `isolation: "worktree"` to code-implementer** — safe code changes that don't affect the main working tree.

### Not Recommended

6. **Don't replace JICM watcher** — the screen-scraping + keystroke injection pipeline has no native equivalent.
7. **Don't replace command-handler** — same reason (tmux interaction required).

## Key Technical Details

### Agent Persistence Model
- Agent transcripts stored at `~/.claude/projects/{project}/{sessionId}/subagents/agent-{agentId}.jsonl`
- Transcripts survive main conversation compaction (stored separately)
- Resume via `SendMessage` with agent ID
- Cleanup after `cleanupPeriodDays` (default: 30)

### Background Agent Permissions
- Before launch, Claude prompts for all tools the agent will need
- Once backgrounded, inherits pre-approved permissions, auto-denies others
- If fails due to missing permissions → retry as foreground agent

### Agent Memory Model
- `MEMORY.md` in memory directory — first 200 lines auto-loaded
- Agent instructed to curate MEMORY.md if it exceeds 200 lines
- Read/Write/Edit auto-enabled when memory is active
- Scopes: `user` (global), `project` (git-tracked), `local` (git-ignored)

---

## Research Agenda Update

- **rd-2026-01-031**: Status → COMPLETE, Result → ADAPT
- **New items generated**:
  - rd-2026-03-001: "Prototype Ennoia-as-native-agent with persistent memory"
  - rd-2026-03-002: "Evaluate agent-scoped MCPs for context budget optimization"

---

*Research Report rd-2026-01-031 — W5:Jarvis-dev, 2026-03-22*
