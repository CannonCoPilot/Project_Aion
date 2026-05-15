# Pattern: Subagent Output Fidelity (YAML Schema Bug Diagnosis)

**Type**: Reliability pattern + functional refactor record
**Status**: RESOLVED (root cause + cache-scope empirically validated 2026-05-15 via Phase E-3 parallel-process comparison)
**Evidence**: `.claude/scratch/hallucination-experiment/experiment-report.md`
**Validation tool**: `.claude/scripts/validate-agent-schemas.sh`

---

## Root cause

The Claude Code harness parses agent YAML frontmatter's `tools:` field by comma-splitting. The literal value `tools: All tools` (English prose) is parsed as a list of two phantom tool names: `["All", "tools"]`. Neither exists in the harness's tool registry, so the agent is granted **zero tools**.

Without tools, the agent has no Write, Bash, Read, or Edit access. The model still produces a response message (because LLMs always complete), but the response is pure text generation — including fabricated tool-call placeholders ("[Tool: write]", "Tool result: File created successfully") that look like real tool output but represent nothing. The agent's metadata shows `tool_uses: 0` confirming zero real tool invocations.

Why the model fabricates rather than refusing: when its prompt mandates a workflow that requires tools, but no tools are available, the model has two options — refuse honestly or perform the workflow as text completion. Most specialist agent prompts are long (200+ lines) and prescriptive, which biases the model toward "perform the workflow" interpretation. Refusal is the minority behavior (observed once in Test 11 when `tools:` was entirely omitted).

## Canonical schema

```yaml
---
name: <agent-name>
description: <one-line description used for routing>
tools: Read, Write, Edit, Glob, Grep, Bash, TodoWrite, WebFetch
model: sonnet
---
```

**Valid tool names** (from canonical Claude Code registry):
- File: `Read`, `Write`, `Edit`, `Glob`, `Grep`, `LS`, `NotebookRead`, `NotebookEdit`
- Shell: `Bash`, `BashOutput`, `KillShell`
- Web: `WebFetch`, `WebSearch`
- Task: `TodoWrite`, `TaskCreate`, `TaskUpdate`, `TaskList`, `TaskGet`, `TaskOutput`, `TaskStop`
- Planning: `EnterPlanMode`, `ExitPlanMode`, `EnterWorktree`, `ExitWorktree`
- Other: `Skill`, `ToolSearch`, `Agent`, `ScheduleWakeup`, `AskUserQuestion`, `Monitor`, `LSP`, `CronCreate`, `CronDelete`, `CronList`, `PushNotification`, `RemoteTrigger`, `ListMcpResourcesTool`, `ReadMcpResourceTool`

**Invalid values to avoid**:
- `tools: All tools` (English prose — root cause of this bug)
- `tools: all` (English prose)
- `tools: *` (wildcard syntax not universally supported by Claude Code)

**Acceptable alternative**: omit the `tools:` field entirely → agent inherits all available tools by default.

## Fixed agent files (2026-05-15)

| File | Before | After |
|------|--------|-------|
| `code-review.md` | `tools: All tools` | `tools: Read, Write, Edit, Glob, Grep, Bash, TodoWrite, WebFetch` + `model: sonnet` |
| `code-analyzer.md` | `tools: All tools` | `tools: Read, Glob, Grep, Bash, TodoWrite, WebFetch` + `model: sonnet` |
| `code-implementer.md` | `tools: All tools` | `tools: Read, Write, Edit, Glob, Grep, Bash, TodoWrite, WebFetch` + `model: sonnet` |
| `_disabled/code-tester.md` | `tools: All tools` | `tools: Read, Write, Edit, Glob, Grep, Bash, TodoWrite, WebFetch` + `model: sonnet` |
| `_disabled/project-manager.md` | `tools: All tools` | `tools: Read, Glob, Grep, Bash, TodoWrite, WebFetch` + `model: sonnet` |

Already-correct agents (no change needed): `deep-research.md`, all `_disabled/*` except the two above, all `_archive/*`.

## Secondary + tertiary root causes (Phase E / E-2 / E-3 progression, 2026-05-15)

The Jarvis-side fix landed at commit `74a6706` was **necessary but not sufficient**. Two additional layers were uncovered during validation:

**Secondary — cross-workspace shadow definitions**: `/Users/nathanielcannon/Claude/Jarvis-Dev/` is registered as an additionalDirectory in this workspace's Claude Code env. The harness aggregates `.claude/agents/` from ALL listed dirs; name collisions on `code-review` / `code-analyzer` / `code-implementer` / `code-tester` / `project-manager` silently merged with Jarvis-Dev's older Apr-21 broken frontmatter winning the merge. Fixed at Jarvis-Dev commit `6601d6d` on `dev` branch (PUSHED to `CannonCoPilot/Jarvis:dev`).

**Tertiary — process-scoped agent-definition cache**: Even after both disk fixes landed, the broken behavior persisted in the original `claude` CLI process across multiple `/clear` cycles. Phase E-3 empirical test confirmed: a parallel-launched fresh `claude` process in a separate tmux window (same disk, same workspace, same additionalDirectories) immediately rendered canonical tool lists in its system prompt and successfully spawned `code-review` with `tool_uses: 2` and host-fs file creation. The original process's cached parse of the pre-fix YAML persists for the process lifetime.

**Cross-workspace caveat for future agent fixes**: any edit to `.claude/agents/*.md` must be mirrored to every workspace listed in additionalDirectories. Extending `validate-agent-schemas.sh` to scan Jarvis-Dev is a Phase 1.4 cleanup item.

## Validation tool

`.claude/scripts/validate-agent-schemas.sh` — scans all agent directories for malformed YAML and reports unknown tool names. Run before milestone-review work or any session that will heavily use subagents.

```bash
bash .claude/scripts/validate-agent-schemas.sh
# Output: [OK ] / [BAD] / [WARN] per file, exit 0 if all valid
```

Recommend wiring into `/maintain` workflow and/or session-start hooks once stable.

## Cache scope: process-level, not session-level (Phase E-3 finding, 2026-05-15)

The Claude Code harness reads agent definitions at **CLI process start** and caches the parsed tool registry for the **lifetime of that OS process**. Critically:

- `/clear` resets conversation context **but does NOT reload agent YAML from disk**.
- Disk edits to agent files do not propagate within a running `claude` process — even across many `/clear` cycles.
- Only a full CLI process restart (terminate the `claude` invocation, relaunch it) refreshes the agent-definition cache.

**Pre-flight diagnostic** (use BEFORE spawning specialist agents): the system-prompt Agent tool listing IS ground truth. A healthy session shows each agent's actual tool list:

```
- code-review: Technical quality review of code changes ... (Tools: Read, Write, Edit, Glob, Grep, Bash, TodoWrite, WebFetch)
```

A session with the cached YAML schema bug shows the comma-split artifact:

```
- code-review: Technical quality review of code changes ... (Tools: All, tools)
```

**Asymmetric rendering is the smoking-gun signal**: in a partially-broken session, never-broken agents (e.g. `deep-research`) render correctly while previously-broken ones still show `(Tools: All, tools)`. That asymmetry conclusively identifies a stale cache, not a disk problem.

**Phase E-3 empirical evidence** (2026-05-15, parallel-process test):

| Process | started | system-prompt Agent listing for code-review | tool_uses on diagnostic | file on host fs |
|---------|---------|----------------------------------------------|--------------------------|------------------|
| W0 (original) | before 2026-05-15 disk fix | `(Tools: All, tools)` | 0 | absent |
| W8 (fresh launch) | after 2026-05-15 disk fix | `(Tools: Read, Write, Edit, Glob, Grep, Bash, TodoWrite, WebFetch)` | 2 | present, 30 bytes |

Same disk, same workspace, same additionalDirectories, same agent, same prompt. Only variable: process lifecycle.

## Verification protocol (per-process)

Every Claude Code process needs to be independently verified. The recipe:

1. **Pre-flight**: grep the in-context Agent tool listing for `(Tools: All, tools)`. Any hit = cached broken YAML in this process = subagent spawning will hallucinate. No further test needed; just restart.

2. **Smoke test**: `bash .claude/scripts/validate-agent-schemas.sh` — confirms current disk state is canonical (catches future regressions even if cache is fine).

3. **Live test** (only if pre-flight is clean): spawn `code-review` with a minimal Write+Bash diagnostic targeting a unique filename. Verify all three: `tool_uses >= 2` in metadata, file exists on host fs with matching content/size, quoted ls output matches actual `ls`.

4. **If all three pass**: AC-03 protocol and other specialist-agent workflows are restored for the lifetime of that process.

**Phase E-3 was the canonical end-to-end run of this protocol** (parallel W8 process, 2026-05-15). PASS verdict captured at `.claude/scratch/hallucination-experiment/EXP-RESTART-3.md` (30 bytes, mtime 15:47).

## Until verified

For in-session work where Sir prefers not to restart:
- Use `general-purpose` agent (built-in, tool injection works reliably — confirmed 4/4 tests this session)
- Use `Explore` agent for read-only codebase exploration
- For AC-03 milestone reviews, do Jarvis-direct review (Jarvis reads files + writes report + scores)
- **Always host-fs-verify** any file-creation claim from any subagent before trusting it (Read tool or `ls -la`)

## Historical instance ledger

| Date | Agent | Failure mode | Reference |
|------|-------|-------------|-----------|
| 2026-04-22 | `code-analyzer` | Fabricated entire codebase architecture | insights-log:1755 |
| 2026-04-29 | `deep-research` | Fabricated team publications + journal citations | insights-log:4638-4692 |
| 2026-05-02 | dashboard agent (ad-hoc) | Fabricated code snippets, Vue vs React | insights-log:5480 |
| 2026-05-14 | `code-tester`, `code-review`, `project-manager` | Fabricated Playwright + AC-03 reports | scratchpad:157 |
| 2026-05-15 | `code-review`, `project-manager` | Fabricated AC-03 Phase 1.3 reports | self-corrections:2026-05-15 |
| 2026-05-15 | `code-review`, `code-analyzer`, `code-implementer` | Diagnostic Tests 4, 6, 7, 8, 10, 12 | hallucination-experiment/ |

**All instances are explained by the same root cause**: `tools: All tools` YAML schema bug → zero tools granted → text-completion fabrication.

`deep-research` (insights-log:4638) is an outlier — its current schema is correct (`tools: Read, Grep, Glob, Bash, WebFetch, WebSearch, TodoWrite`). The historical failure may predate a previous correction OR may indicate additional fragility in long research narratives (context-window saturation). Watch for recurrence post-fix.

## Acceptance criteria

- [x] All `tools: All tools` malformed schemas replaced with canonical lists (Jarvis + Jarvis-Dev)
- [x] Validation script written and passes 17/17 files
- [x] Pattern doc records root cause + fix + verification protocol
- [x] Self-corrections log references this pattern
- [x] CLAUDE.md AC-03 line restored to original (specialist agents are correct path)
- [x] **Phase E-3**: parallel-process diagnostic verified `tool_uses: 2` for code-review agent in fresh process (W8) with host-fs file creation
- [x] Cache scope (process-level vs session-level) documented; pre-flight diagnostic recipe recorded
- [ ] Extend `validate-agent-schemas.sh` to scan Jarvis-Dev's `.claude/agents/` (Phase 1.4 cleanup)
- [ ] Consider git pre-commit hook on both Jarvis + Jarvis-Dev to run validator and block `tools: All*` regressions
