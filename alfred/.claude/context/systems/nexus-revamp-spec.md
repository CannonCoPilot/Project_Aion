# Nexus Revamp — Design Specification

**Status**: Active — Session 206 (2026-03-09)
**Origin**: Sir identified that despite significant Nexus investment, he's still the bottleneck. 66% of tasks wait on him. System needs to make decisions autonomously using his documented patterns.
**Stage Lifecycle**: Operational (Phases 1-4 complete). Tasks now tracked via explicit `stage:` labels. See @.claude/context/systems/stage-lifecycle.md.

---

## Problem Statement

Nexus can evaluate, route, and execute tasks — but it can't make Sir's decisions. 69 of 104 open tasks are `waiting:david`. The system goes straight from "task exists" to "should we execute?" — skipping the design/proposal step Sir wants. Process overhead (~40-50% over-engineered) compounds the problem.

## Sir's Ideal Workflow

```
Tell Nexus what I want (Claude App or Claude Code)
  → System researches and proposes a plan (one-time "is this what you're thinking?")
  → Sir approves, rejects, or gives feedback
    → If rejected with feedback: system revises and re-proposes
    → If rejected outright: close the task
    → If approved: execute without asking again (unless critical risk)
  → System executes autonomously
  → Sir reviews results in dashboard (not Telegram)
  → Sir gives feedback (agreed / wrong / adjust)
  → System learns from feedback
```

## Core Design: AI David Persona

### Decision Thresholds

| Confidence | Risk | Complexity | Action |
|-----------|------|-----------|--------|
| High | Any | Any | **Do it** |
| Medium | Low-Med (reversible) | Any | **Do it** |
| Low | Low (easy, reversible) | Low | **Do it** |
| Low | High | High | **Don't do it — escalate** |
| Any | High | High + uncertain | **Don't do it — escalate** |

### Pattern Sources (Read at Decision Time)
- `voice-of-david.md` (interaction preferences)
- `.claude/CLAUDE.md` (project conventions)
- `.claude/context/patterns/` (design patterns)
- `.claude/context/systems/` (infrastructure knowledge)
- `.claude/context/projects/` (project-specific context)
- Pulse task history (past decisions, closed tasks with reasons)
- Linked Obsidian files (if task references research)
- Past session logs (when scenario-based patterns needed)

### Learning Mechanism
- When Sir gives feedback (agreed/wrong/adjust), persona updates its pattern file
- "Wrong + comment" → adds negative rule: "Never do X unless Y"
- "Adjust + note" → refines existing rule
- "Agreed" → reinforces pattern confidence
- Sir can review and correct the persona's pattern file at any time

### What AI David Does
1. **Processes `waiting:david` queue** — reads each task, checks against patterns, decides or proposes
2. **Auto-approves known patterns** — ABS file renames matching conventions, research tasks with clear scope, infrastructure tasks matching documented practices
3. **Proposes uncertain decisions** — writes 1-paragraph proposal with recommendation, posts to dashboard review queue
4. **Closes stale/duplicate tasks** — identifies obviously stale work, proposes closing with reason
5. **Never asks twice for same scenario** — if Sir approved a pattern once, it's learned

### Decision Audit Trail (JSON, Loki-compatible)
Every decision logged:
```json
{
  "timestamp": "2026-03-10T08:00:00Z",
  "task_id": "AIProjects-abc1",
  "task_title": "Rename ABS files for Series X",
  "decision": "auto-approved",
  "confidence": "high",
  "pattern_matched": "abs-naming-convention",
  "pattern_source": ".claude/context/patterns/abs-best-practices.md",
  "reasoning": "All 3 files match documented ABS naming pattern. Reversible via git.",
  "risk": "safe",
  "action_taken": "promoted to auto:ready + risk:safe"
}
```

---

## Review & Feedback System

### Primary: Dashboard Review Page
- Cards for each completed action / decision / research output
- Three feedback buttons per card:
  - **Agreed** (green check) — keep doing this, reinforces pattern
  - **Wrong** (red X) — don't do this again, with comment field ("unless...")
  - **Adjust** (amber) — right direction, tweak, with note field (can request verification before actioning)
- Sorted by recency, grouped by category (decisions, research, executions)
- "Pending deep review" section for complex items flagged for Claude Code session

### Secondary: Obsidian Daily Log
- Auto-generated daily note: "Nexus Activity — YYYY-MM-DD"
- Executive summary (3-5 sentences: what happened, what's pending, what needs you)
- Mid-level details per category (not full logs, but enough to understand)
- Links to dashboard for drill-down

### NOT Telegram (for now)
- Telegram is overloaded and display-limited
- Review happens in dashboard (can get web push notifications)
- Telegram reserved for: critical alerts only, simple approve/deny on urgent items

---

## Process Simplification

### Hooks to Disable
- `orchestration-detector.js` — auto-triggers on every prompt, generates unused YAML
- `prompt-dispatcher.js` — overlaps with skill-router

### Hooks to Keep
- `session-start.js`, `session-stop.js`, `pre-compact.js` — lifecycle (essential)
- `audit-logger.js` — audit trail (essential)
- `secret-scanner.js`, `branch-protection.js` — security (essential)
- `document-guard.js` — protection (essential)
- `skill-router.js` — slash command routing (useful)
- `file-access-tracker.js`, `cross-project-commit-tracker.js` — tracking (valuable)
- `docker-health-check.js` — validation (useful)
- `subagent-dispatcher.js` — agent lifecycle (keep)

### Context Consolidation
- 205 files → target ~100 by archiving redundant patterns and lessons
- Consolidate 25 overlapping patterns into 3 core guides:
  - `how-we-build.md` — coding patterns, project conventions
  - `how-we-decide.md` — automation routing, approval logic, risk assessment
  - `how-we-operate.md` — session lifecycle, task management, communication

### Session Exit Simplification
- Current: 19 steps (11 in checklist)
- Target: 6 essential steps:
  1. Update session-state.md
  2. Close completed Pulse tasks with evidence
  3. Create follow-up tasks for unfinished work
  4. Git status + commit changes
  5. Push to remote
  6. Brief summary of what happened

### Orchestration
- Keep the YAML system (valuable for multi-phase work)
- Remove auto-trigger hook (orchestration-detector)
- Keep `/orchestration:plan` as opt-in
- Approved orchestration plans execute autonomously (unless high risk phase)

---

## Claude App → Nexus Pipeline Enhancement

### MCP Read Access
- Add read-only access to AIProjects for Claude App sessions
- Include: CLAUDE.md, context/, patterns/, beads reference
- Exclude: .env files, actual secrets
- Enables: Claude App can pull full context before creating tasks

### Task Creation Patterns (from Sir)
1. **Direct**: "Create a task to research X" → task created, system handles
2. **Ideation**: Back-and-forth → Obsidian file → task linking to file
   - If task links to Obsidian file, AI David reads it as context
   - Research file may contain Sir's leanings → persona considers them

---

## Code Quality Fixes (Phase 3)

### Silent Failure Removal
- Replace all `|| true` with explicit error handling + logging
- Pre-check gates log pass/fail decisions
- Message bus operations log failures
- Telegram delivery failures logged and escalated

### Escalation Gap Closure
1. Critical findings → Telegram notification (not just log)
2. PAUSE signals → Telegram notification (not just dashboard)
3. Stalled tasks → Telegram notification
4. Unanswered questions → reminder before expiry, escalate at deadline
5. Retry exhaustion → escalate beyond warning

### Additional
- Relay watchdog (relay process has no monitoring today)
- Structured JSON logging throughout (Loki-compatible)
- Integration test suite for pipeline end-to-end

---

## Success Criteria

1. Sir spends <15 minutes/day reviewing Nexus output in dashboard
2. AI David autonomously handles >50% of `waiting:david` queue using documented patterns
3. Every autonomous decision has a logged reason and matched pattern
4. Feedback loop works: Sir corrects → persona learns → never repeats mistake
5. Claude App → task creation → execution works end-to-end without manual intervention
6. No silent failures — all errors visible and escalated appropriately
7. Sir feels informed at a strategic level without being in the operational loop

---

## Implementation Phases

### Phase 1: Strip the Weight — COMPLETE (Session 207)
- ✓ Disabled orchestration-detector.js and prompt-dispatcher.js hooks
- ✓ Simplified session exit from 19 steps to 4
- ✓ Cleaned CLAUDE.md (removed PARC mandates, clarification mandates)

### Phase 2: AI David Persona + Review System — COMPLETE (Session 207)
- ✓ AI David persona: prompt, config, permissions, learned-patterns (12 seeded)
- ✓ Registered in dispatcher at 2h interval with pre-check gate
- ✓ First run: processed 15 tasks (4 executed, 4 fixed, 1 closed, 1 escalated, 5 proposed)
- ✓ Dashboard review page at /reviews (stats, filters, inline feedback)
- ✓ Backend: reviews.ts reads JSONL decision logs, merges feedback, returns stats
- ✓ Sir reviewed all 21 decisions: 15 agreed, 4 adjust, 0 wrong
- Remaining: Obsidian daily summary generator (deferred — not blocking)

### Phase 3: Fix the Plumbing — COMPLETE (Session 209)
All 6 items complete:

**3.0 — Proposal approval → execution loop — COMPLETE (Session 209)**
- Backend: "agreed" on proposals writes to `approved-actions.jsonl` queue
- AI David prompt: new Step 3 reads approved queue, executes, marks executed via API
- API endpoints: `GET /api/reviews/approved-actions`, `POST .../mark-executed`
- Frontend: approved proposals show "approved → queued" badge with hourglass
- `execute-approved` action type added throughout (backend types, frontend display, filters)
- Backfilled 2 already-approved proposals (rkra, a24f) to queue

**3.1 — Silent failure removal — COMPLETE (Session 209)**
- Reduced from ~75 `|| true` in shell scripts to 26 (all remaining are legitimate: grep/find/unset)
- Added `try_or_warn()` helper to `common.sh` for reusable fail-and-log pattern
- Core pipeline files fixed: `executor.sh` (14→2), `dispatcher.sh` (8→2), `event-watcher.sh` (16→4)
- Lib files fixed: `msg-relay.sh` (5→1), `telegram-callback-handler.sh` (2→0), `dispatcher-watchdog.sh` (3→0), `weekly-digest.sh` (2→0)
- Remaining: `media-normalize.sh` (8, set -e guards), `cost-report.sh` (3), `pipeline-smoke-test.sh` (5, test file)

**3.2 — Escalation gap closure — COMPLETE (Session 209)**
All 5 gaps closed:
1. Critical findings → added msgbus notification in executor.sh (was log-only)
2. PAUSE signals → added msgbus notification in executor.sh (was push-endpoint only)
3. Stalled tasks → added msgbus notification in event-watcher.sh (was push-endpoint only)
4. Unanswered questions → msgbus.sh `expire` now sends pre-expiry reminders (at 80% TTL) and expiry notifications
5. Retry exhaustion → already covered by `write_notification` with severity "critical" (was not a gap)

**3.3 — Relay watchdog — COMPLETE (Session 209)**
- Added relay stuck detection in dispatcher.sh post-cycle
- Checks pending message count — if >10 for 3+ consecutive cycles, sends critical alert via msgbus
- Uses state file `relay-stuck-count` to track consecutive stuck cycles

**3.4 — Structured JSON logging — COMPLETE (Session 209)**
- Added dual-write logging to `common.sh`: human-readable to stdout + JSON to `nexus.jsonl`
- Loki-compatible format: `{"ts","level","component","job","msg"}`
- All scripts sourcing `common.sh` automatically get JSON logging via `LOG_COMPONENT`
- Set LOG_COMPONENT in: dispatcher, executor, event-watcher, relay
- Updated log-schema.md with nexus job definition
- Remaining: Promtail config to ingest `nexus.jsonl` into Loki (infra task)

**3.5 — Integration test suite — COMPLETE (Session 209)**
- `phase3-integration-test.sh` — 20 tests across 4 categories
- Test 1: Message bus operations (send, query, deliver, expire)
- Test 2: Approved-actions queue structure and API
- Test 3: Structured JSON logging (valid JSON, required fields, all levels)
- Test 4: Relay watchdog logic (stuck detection, threshold, recovery)
- Existing `pipeline-smoke-test.sh` covers end-to-end dispatcher → evaluator → executor

### Phase 4: Claude App MCP Read Access — COMPLETE (Session 209)
- **Nexus MCP source added** to homelab-mcp config.ts — exposes `.claude/` directory
  - Include: `*.md`, `*.yaml`, `*.yml`, `*.json`, `*.sh`, `*.ts`
  - Exclude: `.env`, `*.secret`, `agent-output`, `logs`, `data`, `state`, `node_modules`
- **Security hardened**: `isExcluded()` enforced on `read_file` and `list_files` (not just search)
  - Pattern types: glob (`*.secret`), exact filename (`.env`), directory segment (`agent-output`)
  - Validated: `.env` returns "Invalid path", CLAUDE.md accessible
- **Server instructions updated** with nexus source docs and Claude App task creation guidance
- **Deployed**: built, systemd restarted, verified working (commit `639d130` in homelab-mcp)

---

## Related Tasks
- AIProjects-ufk6: Research multi-agent autonomous system (related)
- AIProjects-3xq: Create unified log data model (Phase 3)
- AIProjects-vfm: Fix Loki container coverage gap (Phase 3)
- AIProjects-zfsl: Review feedback widget research (Phase 2)
