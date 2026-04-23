# Claude Code Source Snapshot — Analysis Report

**Date**: 2026-03-30
**Analyst**: Jarvis-dev (W5), Session 49
**Source**: gitee.com/free/claude-code (cloned to `/Users/nathanielcannon/Claude/GitRepos/claude-code-source`)
**Classification**: Research reference — security research and architecture study

---

## 1. Origin & Provenance

The source snapshot became publicly accessible on **March 31, 2026** through a **source map exposure in the npm distribution** of Claude Code. The README explicitly states this is a "publicly exposed Claude Code source snapshot" maintained for "educational, defensive security research, and software supply-chain analysis."

The repository was created by a user identified as **instructkr** (instruct.kr, a Korean university student) and subsequently received build configuration contributions from **abel533** (abel533@gmail.com, Chinese developer).

### Legal Context

The repo includes a full essay by Hong Minhee analyzing the legal and ethical dimensions of AI-assisted reimplementation vs. copyleft obligations (the chardet/LGPL controversy). This appears to be included as contextual justification for the repository's existence, framing it within the broader debate about source code exposure, clean-room analysis, and security research.

---

## 2. Commit History (3 commits total)

| # | Hash | Author | Date | Description |
|---|------|--------|------|-------------|
| 1 | `4b9d30f` | instructkr | 2026-03-31 03:34 PDT | **Initial squashed commit** — all 1,903 source files in one commit. Subject: "asdf" (deliberately informal). Commit message notes: "Squash the current repository state back into one baseline commit." |
| 2 | `16a676f` | instructkr | 2026-03-31 05:09 PDT | "rewrite the port" — adds README reframing and the legal analysis essay. **2 files changed**, 109 insertions. |
| 3 | `83fb089` | abel533 | 2026-03-31 23:33 CST | "feat: 补充构建配置" (Add build configuration). Adds package.json, tsconfig.json, globals.d.ts, build script, and BUILD_GUIDE.md (Chinese). **8 files changed**, 2,275 insertions. Makes the source compilable: `dist/cli.js` (11.7 MB). |

### Recommendation: Original Source Snapshot

**Commit `4b9d30f`** (the initial squash) is the **representative original source code release**. It contains the raw 1,903 source files from the npm source map exposure without any modifications, build configs, or editorial additions. Commits 2 and 3 add third-party contributions (legal essay, build infrastructure) that were not part of the original Anthropic codebase.

To view the pure source:
```bash
cd /Users/nathanielcannon/Claude/GitRepos/claude-code-source
git checkout 4b9d30f
```

---

## 3. Codebase Statistics

| Metric | Value |
|--------|-------|
| Total files | 1,903 |
| TypeScript (.ts) | 1,332 files |
| TypeScript/React (.tsx) | 552 files |
| JavaScript (.js) | 18 files |
| Total lines (initial commit) | 513,517 |
| Package name | @anthropic-ai/claude-code |
| Runtime | Bun (not Node.js) |
| UI framework | Ink (React for CLI) |
| Build output | dist/cli.js (11.7 MB single bundle) |

---

## 4. Architecture Overview

The source reveals Claude Code's internal architecture in full detail:

### 4.1 Entry Point & Bootstrap

- **Entry**: `src/main.tsx` — Commander.js CLI with Bun runtime
- **Startup sequence**: startup profiler → MDM raw read → keychain prefetch → CLI parse → Ink render
- **Feature flags**: `bun:bundle` feature() calls for conditional compilation (PROACTIVE, KAIROS, etc.)

### 4.2 Tool System (40 tools)

Every tool in Claude Code has a dedicated directory under `src/tools/`:

| Tool | Directory | Purpose |
|------|-----------|---------|
| AgentTool | src/tools/AgentTool/ | Subagent spawning and management |
| AskUserQuestionTool | src/tools/AskUserQuestionTool/ | Interactive user questions |
| BashTool | src/tools/BashTool/ | Shell command execution with security |
| FileEditTool | src/tools/FileEditTool/ | String replacement edits |
| FileReadTool | src/tools/FileReadTool/ | File reading with line limits |
| FileWriteTool | src/tools/FileWriteTool/ | File creation/overwrite |
| GlobTool | src/tools/GlobTool/ | File pattern matching |
| GrepTool | src/tools/GrepTool/ | Content search (ripgrep wrapper) |
| LSPTool | src/tools/LSPTool/ | Language Server Protocol integration |
| MCPTool | src/tools/MCPTool/ | MCP server tool invocation |
| SkillTool | src/tools/SkillTool/ | Skill execution |
| TaskCreateTool | src/tools/TaskCreateTool/ | Background task creation |
| ToolSearchTool | src/tools/ToolSearchTool/ | Deferred tool schema loading |
| WebFetchTool | src/tools/WebFetchTool/ | URL content retrieval |
| WebSearchTool | src/tools/WebSearchTool/ | Web search |
| EnterPlanModeTool | src/tools/EnterPlanModeTool/ | Planning mode entry |
| NotebookEditTool | src/tools/NotebookEditTool/ | Jupyter notebook editing |
| PowerShellTool | src/tools/PowerShellTool/ | Windows PowerShell execution |
| ScheduleCronTool | src/tools/ScheduleCronTool/ | Cron job scheduling |
| SendMessageTool | src/tools/SendMessageTool/ | Inter-agent messaging |
| SleepTool | src/tools/SleepTool/ | Timed delay |
| TodoWriteTool | src/tools/TodoWriteTool/ | Todo list management |
| TeamCreateTool | src/tools/TeamCreateTool/ | Team creation |

### 4.3 Command System (90+ slash commands)

All under `src/commands/`:
agents, autofix-pr, branch, bridge, clear, compact, config, context, copy, cost, diff, doctor, effort, env, exit, export, fast, feedback, files, help, hooks, ide, keybindings, login, logout, mcp, memory, model, onboarding, output-style, permissions, plan, plugin, pr_comments, privacy-settings, release-notes, rename, resume, review, rewind, session, share, skills, stats, status, summary, tag, tasks, theme, upgrade, usage, vim, voice...

Notable unreleased/internal commands: `bughunter`, `chrome`, `desktop`, `good-claude`, `heapdump`, `mock-limits`, `mobile`, `oauth-refresh`, `passes`, `perf-issue`, `rate-limit-options`, `remote-env`, `remote-setup`, `reset-limits`, `sandbox-toggle`, `stickers`, `teleport`, `thinkback`, `thinkback-play`

### 4.4 Services Layer

Under `src/services/`:

| Service | Purpose |
|---------|---------|
| AgentSummary | Agent result summarization |
| analytics | Telemetry and GrowthBook feature flags |
| api | Anthropic API client |
| autoDream | Background autonomous processing |
| compact | Context compaction logic |
| extractMemories | Automatic memory extraction |
| lsp | Language Server Protocol client |
| MagicDocs | Automated documentation generation |
| mcp | MCP server management |
| oauth | OAuth flow handling |
| plugins | Plugin system |
| policyLimits | Usage limits and policies |
| PromptSuggestion | Context-aware prompt suggestions |
| remoteManagedSettings | Enterprise managed settings |
| SessionMemory | Session memory persistence |
| settingsSync | Settings synchronization |
| teamMemorySync | Team memory sharing |
| tips | Contextual tips system |
| tools | Tool registry and execution |
| toolUseSummary | Tool usage summarization |

### 4.5 UI Components (Ink/React)

Full React component tree under `src/components/`:
agents, design-system, diff, FeedbackSurvey, grove, HelpV2, HighlightedCode, hooks, LogoV2, LspRecommendation, mcp, memory, messages, Passes, permissions, PromptInput, sandbox, Settings, shell, skills, StructuredDiff, tasks, teams, TrustDialog, ui, wizard...

### 4.6 System Prompt Construction

The system prompt is built dynamically in `src/utils/systemPrompt.ts`:
- Priority system: override > coordinator > agent > custom > default
- Default prefix: `"You are Claude Code, Anthropic's official CLI for Claude."`
- Agent SDK variant: `"You are Claude Code, Anthropic's official CLI for Claude, running within the Claude Agent SDK."`
- Sections defined in `src/constants/systemPromptSections.ts`
- Feature flags control proactive/KAIROS mode prompts

### 4.7 Key Internal Systems

| System | Location | Purpose |
|--------|----------|---------|
| Coordinator | src/coordinator/ | Multi-agent coordination (internal) |
| Proactive mode | Referenced but gated behind feature flags | Autonomous agent behavior |
| KAIROS | Feature flag references | Unknown internal project codename |
| Vim mode | src/vim/ | Full vim keybinding emulation |
| Voice | src/voice/ | Voice input handling |
| Ultraplan | src/utils/ultraplan/ | Advanced planning system |
| Swarm | src/utils/swarm/ | Multi-agent swarm coordination |
| Dream | src/tasks/DreamTask/ | Background "dreaming" tasks |
| Teleport | src/commands/teleport/ + src/utils/teleport/ | Session transfer between machines |
| Moreright | src/moreright/ | Unknown — possibly permissions escalation |
| Buddy | src/buddy/ | Pair programming / buddy system |
| Grove | src/components/grove/ | Unknown — possibly team/org features |

---

## 5. Interesting Discoveries

### 5.1 Unreleased Features (Gated Behind Feature Flags)

- **Proactive mode** / **KAIROS**: Autonomous agent behavior — Claude acts without being prompted
- **Dream/autoDream**: Background processing when Claude is "idle"
- **Teleport**: Transfer sessions between machines
- **Stickers**: Unknown — possibly visual feedback/badges
- **Chrome integration**: Browser extension bridge
- **Desktop integration**: Native desktop app features
- **Mobile**: Mobile app support
- **Buddy**: Pair programming system
- **Good Claude**: Possibly a feedback/rating system
- **Thinkback / Thinkback-play**: Replay thinking process
- **Passes**: Unknown — possibly execution passes/quotas
- **Swarm**: Multi-agent coordination without user-visible control

### 5.2 Security Architecture

- `src/tools/BashTool/bashSecurity.ts` — Command safety analysis
- `src/utils/permissions/` — Full permission system (PermissionResult, PermissionUpdate)
- `src/utils/sandbox/` — Sandbox isolation
- `src/utils/secureStorage/` — Keychain integration
- `src/hooks/toolPermission/` — Permission hooks

### 5.3 Build System

- Runtime: **Bun** (not Node.js) — confirmed by `bun:bundle` imports and bun.lock
- Build: Custom `scripts/build.ts` using Bun's bundler
- Feature flags: Compile-time via `MACRO` constants (defined in globals.d.ts)
- Output: Single 11.7 MB JavaScript bundle

---

## 6. Relevance to Project Aion

### What We Can Learn (Architecture)

1. **Tool system pattern**: Each tool is a class in its own directory with inputSchema, execute(), and description. This is more structured than Jarvis's markdown-based tool definitions.

2. **Hooks architecture**: React hooks pattern for UI + lifecycle hooks for events. The hook system we see in CLAUDE.md (SessionStart, PreToolUse, etc.) maps to `src/hooks/`.

3. **System prompt construction**: Dynamic, priority-based system prompt assembly. Jarvis's CLAUDE.md is the equivalent but static (force-loaded).

4. **Feature flags**: Compile-time feature gating via Bun macros. This is how Anthropic rolls out features gradually — PROACTIVE, KAIROS, etc. are active in internal builds but stripped from public releases.

5. **Compact service**: `src/services/compact/` contains the native autocompact logic that interacts with our JICM system.

6. **Memory extraction**: `src/services/extractMemories/` shows how Claude Code auto-extracts memories — this informs how Jarvis's memory hooks should work.

### What We Should NOT Do

- Do not copy or incorporate any source code from this snapshot into Project Aion
- Do not build alternative Claude Code distributions
- Use this strictly as an architectural reference and research tool
- Respect Anthropic's intellectual property rights

---

## 7. Summary

| Question | Answer |
|----------|--------|
| Where is it? | `/Users/nathanielcannon/Claude/GitRepos/claude-code-source` |
| What commit is the original source? | **`4b9d30f`** (1,903 files, 513K lines, squashed baseline) |
| What commits are third-party additions? | `16a676f` (legal essay + README), `83fb089` (Chinese build config) |
| Is it real? | Yes — package.json identifies it as `@anthropic-ai/claude-code`, internal architecture matches observable behavior exactly |
| How did it leak? | Source map exposure in the npm distribution (build artifact included debug source maps) |
| Is it complete? | The `src/` directory appears complete. Build configs were missing (added by third party). Some features are gated behind compile-time flags not present in public builds. |
| Can it be built? | Yes — commit `83fb089` adds build tooling. Output: 11.7 MB `dist/cli.js` |
| Legal status | Gray area. Source maps in npm packages are public distribution artifacts. Research/analysis falls under fair use. Do not redistribute or create competing products. |

---

*Report generated by Jarvis-dev, Session 49, 2026-03-30*
