# Evaluation: claude_agent_teams_ui (777genius)

**Date**: 2026-04-01 | **Repo**: github.com/777genius/claude_agent_teams_ui | **Stars**: 488 | **Forks**: 121 | **License**: AGPL-3.0

## Architecture

Electron 40 + React 19 + TypeScript 5 desktop app. Zustand for state, Tailwind CSS, Vite bundler. Entirely local -- no cloud backend. Reads Claude Code session logs from `~/.claude/` to track agent activity. Ships an `agent-teams-controller` package (Node.js) for orchestration and a built-in MCP server for tool extensibility. Standard Electron split: `main/`, `preload/`, `renderer/`, `shared/`, `types/`. Tested with Vitest; quality gates via Husky pre-commit hooks.

## Standout Features

1. **Agent-to-agent messaging**: Native mailbox system -- agents spawn tasks, message peers, and review each other's code without human intermediation. This is the key differentiator vs. competing tools.
2. **Hunk-level code review**: Diff viewer with per-hunk accept/reject, comparable to Cursor's review flow but for multi-agent output.
3. **6-category token analytics**: Breaks session cost into user messages, CLAUDE.md instructions, tool outputs, thinking, team coordination, and total -- useful for budget optimization.
4. **Kanban with agent awareness**: Five-column board where cards are created/moved by agents autonomously. Supports `#task-id` cross-references and `@team-name` mentions.
5. **Granular autonomy dial**: Full automation down to per-action approval, with mid-task redirection via direct messages to agents.
6. **Git worktree isolation**: Optional per-agent worktree to prevent file conflicts during parallel work.

## Integration Potential for Jarvis 2.0

**High value to extract**:
- Agent-to-agent messaging protocol (signal-file or mailbox pattern maps directly to Jarvis's existing tmux signal architecture).
- Hunk-level review UI pattern for AC-03 milestone review -- currently text-only.
- Token breakdown by category -- Jarvis JICM tracks aggregate tokens but not per-category spend.
- Task dependency graph (`agent-graph` package) for multi-stage Chronicler pipeline orchestration.

**Low value / conflicts**:
- Electron shell adds ~200MB runtime for a UI Jarvis doesn't need (CLI-first).
- Reads `~/.claude/` session logs directly -- fragile coupling to Claude Code internals that could break on updates.
- AGPL-3.0 license is copyleft: any derivative incorporating its code must also be AGPL. Extracting *patterns* is fine; copying source is legally constraining.
- No remote/headless mode yet (on roadmap but not shipped).

## Implementation Quality

Solid engineering: TypeScript strict mode, full test suite with coverage targets, IPC input validation with path containment checks, no external data transmission. The `agent-teams-controller` is cleanly separated from the UI -- this is the most extractable component. Community is active (488 stars, 121 forks, Discord) but the project is young; roadmap items (multi-model, SSH remote, CLI runtime) are unshipped promises.

## Verdict

A well-built multi-agent UI with genuinely novel agent-to-agent communication. For Jarvis 2.0, extract the **messaging protocol pattern**, **token category analytics**, and **task dependency graph** as design references. Do not adopt the Electron wrapper or direct `~/.claude/` log parsing. The AGPL license means pattern extraction only -- no code copying without license adoption.
