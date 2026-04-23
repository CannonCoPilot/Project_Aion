# Piebald AI Evaluation -- Jarvis 2.0 Integration Assessment

**Date**: 2026-04-01 | **Scope**: docs.piebald.ai, tweakcc, claude-code-system-prompts

---

## Architecture

Piebald is a **desktop/web GUI wrapper** around LLM agent workflows (Electron-like app, v0.1.x). It is NOT an orchestration framework -- it is a chat UI with agentic features bolted on. The core is a multi-provider chat interface (Anthropic, OpenAI, Bedrock, Copilot, Qwen) that exposes 9 built-in tools (ReadFile, WriteFile, EditFile, Glob, Grep, WebFetch, WebSearch, terminal exec, planning). No default system prompt -- relies on model capability. Subagents use a `LaunchSubagent` tool that spawns isolated child chats with restricted toolsets (no nesting, no user interaction). Context management is compaction-based (summarize-and-replace), not preservation-based like JICM.

**tweakcc** is the technically interesting piece: a CLI that patches Claude Code's compiled `cli.js` binary, injecting custom system prompts, themes, toolsets, and behavioral modifications. It uses node-lief for native binary extraction/repacking and maintains a version-matched library of Claude Code's system prompts. This is the real reverse-engineering work.

**claude-code-system-prompts** is a maintained extraction of every Claude Code system prompt, updated within minutes of each release across 140+ versions. It reveals Claude Code's modular prompt architecture: conditional prompt injection based on environment/config, separate subagent prompts (Plan/Explore/Task), ~40 system reminders, and 24 builtin tool descriptions.

## Standout Features (Worth Extracting)

1. **Chat branching/forking** -- reply to any earlier message, creating alternate conversation paths. Avoids context waste from linear-only histories. Novel UX pattern for agent sessions.
2. **System prompt library** (claude-code-system-prompts) -- invaluable reference for understanding Claude Code internals. The modular prompt architecture insight (conditional injection, not monolithic) directly informs how we should structure CLAUDE.md and hook prompts.
3. **tweakcc's binary patching approach** -- demonstrates that Claude Code's `cli.js` is patchable for custom system prompts, custom toolsets (`/toolset` command), per-subagent model selection, and MCP startup optimization (~50% faster). The adhoc-patch system (string/regex/script) is a clean extension mechanism.
4. **Subagent isolation model** -- restricted tool access (no nesting, no user questions, no TodoWrite) with results returned as tool output. Clean contract.

## Commodity Features (Rebuild, Don't Extract)

- Chat compaction (we have JICM, which is superior -- preservation > summarization)
- Chat continuation button (trivial UX; our tmux keystroke injection handles this)
- AGENTS.md support (we already have CLAUDE.md with richer semantics)
- Provider switching (not relevant; we are Anthropic-native)
- Desktop app shell, themes, font customization (UI chrome, no architectural value)
- Message queuing, reactions, notifications (standard chat UX)

## Integration Potential for Jarvis 2.0

| Feature | Action | Effort | Value |
|---------|--------|--------|-------|
| System prompt library as reference | Use as-is for prompt engineering | Low | High |
| Chat branching concept | Design into session model | Medium | High |
| tweakcc patching technique | Study for CC customization | Low | Medium |
| Per-subagent model routing | Already in capability-map.yaml | None | N/A |
| Subagent isolation pattern | Validate against our agent model | Low | Medium |
| MCP startup optimization | Extract from tweakcc, apply | Low | Medium |

## Risks

1. **Piebald is early-stage** (v0.1.x, no hooks yet, plugin system planned but unbuilt). Extracting from it means tracking a moving target.
2. **tweakcc patches are fragile** -- they modify minified JS and must be re-applied after every Claude Code update. Not a foundation to build on, but a useful technique to know.
3. **No real orchestration** -- Piebald's "agents" are just chat sessions with restricted tools. No DAG execution, no state machines, no event-driven triggers. Jarvis's AC component architecture is categorically more sophisticated.
4. **Closed source** -- Piebald itself is proprietary (only the issue tracker is on GitHub). Cannot audit quality of core implementation.

## Verdict

Piebald is a **polished chat UI**, not an agent orchestration platform. Its value to Jarvis 2.0 is indirect: the system prompt library is a first-class reference, chat branching is a genuinely novel UX concept worth designing into our session model, and tweakcc demonstrates that Claude Code is more customizable than its official API suggests. None of these warrant integration -- they warrant *study and selective adoption* of ideas.

**Bottom line**: Read the system prompts repo thoroughly. Experiment with tweakcc's MCP optimization. Design branching into Jarvis 2.0's session architecture. Ignore everything else.
