# Pattern: Subagent Output Fidelity (YAML Schema Bug Diagnosis)

**Type**: Reliability pattern + functional refactor record
**Status**: Active (root-caused 2026-05-15; fix applied; pending session-restart validation)
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

## Validation tool

`.claude/scripts/validate-agent-schemas.sh` — scans all agent directories for malformed YAML and reports unknown tool names. Run before milestone-review work or any session that will heavily use subagents.

```bash
bash .claude/scripts/validate-agent-schemas.sh
# Output: [OK ] / [BAD] / [WARN] per file, exit 0 if all valid
```

Recommend wiring into `/maintain` workflow and/or session-start hooks once stable.

## Session-restart caveat

The Claude Code harness reads agent definitions at session start and caches the tool registry for the session lifetime. Disk edits to agent files **do not propagate** until the next session restart.

In-session diagnostic tests 10, 11, 12 (after disk edits) all continued to show `tool_uses: 0` for `code-review` despite the disk file now having a valid schema. The cached broken schema from session start (`tools: All tools` → empty tool list) remains in effect.

**Implication**: Phase E validation of this fix requires Sir to restart the session and re-run the diagnostic test (or invoke a specialist agent and verify `tool_uses > 0` in the response metadata).

## Verification protocol (next session)

After Sir restarts the session:

1. Run validation script as smoke test:
   ```bash
   bash .claude/scripts/validate-agent-schemas.sh
   ```
   Expect: 17 files checked, no errors.

2. Spawn `code-review` agent with a minimal Write+Bash diagnostic prompt (mirror of Test 6 from this session). Verify:
   - Response metadata shows `tool_uses >= 2`
   - File appears on host fs at the expected path
   - Bash output quoted in response matches actual `ls` output

3. If verification passes: AC-03 protocol may resume using `code-review` + `project-manager` agents as originally designed.

4. If verification fails: this pattern doc gets a v2 entry. Possible further causes to investigate:
   - Claude Code version-specific behavior (custom-agent tool injection may require plugin format)
   - Per-agent tool gates beyond YAML frontmatter
   - Workspace permissions not propagating to subagents

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

- [x] All `tools: All tools` malformed schemas replaced with canonical lists
- [x] Validation script written and passes 17/17 files
- [x] Pattern doc records root cause + fix + verification protocol
- [x] Self-corrections log references this pattern
- [x] CLAUDE.md AC-03 line restored to original (specialist agents are correct path once fix is validated)
- [ ] **Phase E**: post-restart diagnostic verifies `tool_uses > 0` for code-review agent (pending session restart)
- [ ] If post-restart still fails: open follow-up investigation into Claude Code's custom-agent tool injection mechanism
