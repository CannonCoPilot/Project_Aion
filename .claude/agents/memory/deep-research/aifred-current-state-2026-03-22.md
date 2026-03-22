# Research Report: AIfred v3.0.0 — Current State vs Jarvis Fork

**Date**: 2026-03-22
**Scope**: Comprehensive analysis of AIfred's current main branch (v3.0.0) versus the Jarvis fork point at commit `2ea4e8b` (2026-01-16, AIfred v2.2). Covers architecture, new capabilities, gap analysis, and port candidates.

---

## Executive Summary

AIfred v3.0.0 has evolved substantially from the Jarvis fork point, adding 26 commits across seven weeks (2026-01-16 to 2026-03-22). The most significant additions are a Document Guard protection system, a TELOS strategic framework, a headless cron jobs system with multi-agent consensus (`team-runner.py`), a parallel-dev skill using git worktrees, and a memory maintenance lifecycle tracker. AIfred operates on a "hub not container" philosophy where it serves as a distributable starter kit, while deeper capabilities originate in a private `AIProjects` repository.

Jarvis has substantially outpaced AIfred in autonomic capabilities: the entire AC-01 through AC-10 system, the JICM dual-mechanism watcher, the Wiggum Loop, and the three-layer Nous/Pneuma/Soma architecture are all original Jarvis additions with no AIfred equivalent. Where AIfred leads is in operational governance (TELOS), file protection (Document Guard), testing infrastructure (YAML/shell/bats), and multi-agent consensus execution.

The most actionable port candidates for Jarvis are: Document Guard for Nous file protection, TELOS for Chronicler phase milestone governance, memory-maintenance entity tracking, and the team-runner consensus pattern for AC-03.

---

## Repository Metadata

| Property | Value |
|----------|-------|
| Repository | `https://github.com/davidmoneil/AIfred` |
| Current version | v3.0.0 |
| Primary language | Shell |
| License | Apache 2.0 |
| Last pushed | 2026-03-22 |
| Commits since fork | 26 (from `2ea4e8b` to `HEAD`) |
| Stars | 1 |

---

## Key Findings

### Finding 1: Jarvis Fork Delta — 26 Commits, Seven Weeks

The 26 commits between the Jarvis fork point and AIfred current main break into five thematic clusters:

1. **Testing framework** (2026-03-19): yamllint + shellcheck + bats functional tests; CI validation infrastructure
2. **Headless automation** (2026-03-05): cron dispatcher + executor scripts + `team-runner.py` multi-agent consensus
3. **Context optimization** (2026-02-19): session-start.js TELOS injection, pre-compact improvements, settings.local.json nudge
4. **148-component AIProjects sync** (2026-02-16): Largest single commit; bulk of Document Guard V2, memory-maintenance, subagent-dispatcher, index-sync, OpenCode portability came in this batch
5. **Document Guard V1+V2** (2026-02-08): File protection system with structural integrity validation

**Source**: GitHub commits API `api.github.com/repos/davidmoneil/AIfred/commits?per_page=20`

### Finding 2: AIfred Architecture — "Hub Not Container"

AIfred's `CLAUDE.md` (v3.0.0) articulates a "hub not container" philosophy: Claude Code is a coordination hub, not a container for all logic. The architectural layers are:

| Layer | Contents |
|-------|----------|
| Profiles | `.claude/profiles/` — role personas (investigator, analyst, autofix-executor, troubleshooter) |
| Hooks | `.claude/hooks/` — 43 active, 17 archived; all lifecycle events covered |
| Commands | `.claude/commands/` — 63+ slash commands |
| Skills | `.claude/skills/` — 11 skills including parallel-dev, orchestration, upgrade |
| Agents | `.claude/agents/` — 13 agents |
| Jobs | `.claude/jobs/` — headless cron system (new in v3.0.0) |
| TELOS | `.claude/context/telos/` — strategic governance framework (new) |

AIfred also added `.opencode/` for OpenCode portability — parallel agent definitions that make the same agents available in Claude Code AND OpenCode.

**Source**: GitHub tree API `api.github.com/repos/davidmoneil/AIfred/git/trees/main?recursive=1`

### Finding 3: No Autonomic Components — Jarvis's AC System Is Entirely Original

AIfred has no equivalent to:
- AC-01 Self-Launch (session startup with context injection)
- AC-02 Wiggum Loop (multi-pass verification as default execution mode)
- AC-03 Milestone Review (two-level agent review)
- AC-04 JICM (active context monitoring watcher, dual-mechanism resume)
- AC-05 Self-Reflection (session learnings pipeline)
- AC-06 Self-Evolution (risk-gated self-modification)
- AC-07 R&D Cycles (dual external/internal research)
- AC-08 Maintenance (scheduled health checks + organization audits)
- AC-09 Session Completion (seven-step handoff protocol)
- AC-10 Ulfhedthnar (defeat-signal override system)

AIfred's closest equivalent is a `session-start.js` hook that injects context and a `session-stop.js` that writes session summaries. There is no active watcher process, no autonomous self-improvement pipeline, no multi-pass verification loop.

**Source**: `raw.githubusercontent.com/davidmoneil/AIfred/main/.claude/CLAUDE.md`

### Finding 4: Context Management — AIfred Passive, Jarvis Active

**AIfred approach**: Passive `pre-compact.js` hook fires when Claude Code's native compaction triggers. It preserves:
- `compaction-essentials.md` (up to 2000 chars)
- `session-state.md` key sections (up to 1500 chars)  
- `recent-blockers.md` (up to 500 chars)
- Total: ~4KB preserved

**Jarvis approach**: Active `jarvis-watcher.sh` monitors context at 55% threshold. At threshold:
1. Sends `/intelligent-compress` (spawns compression agent)
2. Compression agent writes 5-15K token compressed context
3. Watcher sends `/clear` after `.compression-done.signal`
4. Mechanism 1: `session-start.sh` hook injects compressed context as `additionalContext`
5. Mechanism 2: Watcher sends resume keystroke via tmux idle-hands

Jarvis's JICM is proactive and prevents lockout. AIfred's compaction is reactive and preserves only a fraction of what Jarvis preserves.

**Source**: `raw.githubusercontent.com/davidmoneil/AIfred/main/.claude/hooks/pre-compact.js`

### Finding 5: Document Guard — Critical AIfred Addition with No Jarvis Equivalent

AIfred's `document-guard.js` (PostToolUse/PreToolUse) provides:

- **Glob pattern matching** from `document-guard.config.js` — configurable file protection rules
- **Structural integrity validation**: YAML frontmatter required fields, markdown section/heading requirements, shebang lines
- **Credential scanning**: Regex patterns for API keys, passwords, tokens
- **Optional Ollama semantic validation**: Checks semantic relevance of edits against document purpose
- **Violation tiers**: `critical`/`high` block the operation; `medium` warns; `low` logs
- **Override tokens**: `.document-guard-overrides.json` with configurable TTL (default 120s) for intentional overrides
- **Full JSONL audit trail**: `.claude/logs/document-guard.jsonl`

Jarvis has no equivalent protection for Nous files. The `session-state.md`, AC specs, patterns, and `capability-map.yaml` are all unprotected from accidental structural corruption.

**Source**: `raw.githubusercontent.com/davidmoneil/AIfred/main/.claude/hooks/document-guard.js`

### Finding 6: TELOS Strategic Framework — Governance Layer Jarvis Lacks

AIfred's `telos/TELOS.md` provides:

- **Quarterly focus**: Single named theme (current: "Foundation & Reliability")
- **Active goals**: YAML-formatted, 3 active goals with measurable outcomes
- **Anti-goals**: Explicit list of what NOT to pursue this quarter
- **Design principles**: "Scaffolding over Model", "Code Before Prompts", "One Source of Truth"
- **Governance cadence**: Weekly 15min, monthly 45min, quarterly 2-3h reviews

AIfred also injects TELOS goals into every session via `session-start.js` — goals are always in context.

Jarvis's equivalent would be the Chronicler roadmap and phase PRDs, but there is no explicit anti-goals list, no quarterly framing, and TELOS content is not injected into sessions automatically.

**Source**: `raw.githubusercontent.com/davidmoneil/AIfred/main/.claude/context/telos/TELOS.md`

### Finding 7: Headless Jobs System + Team-Runner Multi-Agent Consensus

AIfred's jobs system (entirely new in v3.0.0):

**Registry** (`.claude/jobs/registry.yaml`): 7 registered jobs:
| Job | Schedule | Budget |
|-----|----------|--------|
| health-check | every 6h | $0.50 |
| task-score | on-demand | $1.00 |
| task-investigator | every 4h | $2.00 |
| task-executor | every 6h | $2.50 |
| weekly-cost-report | Mon 9AM | $0.50 |
| doc-sync-check | daily | $1.00 |
| priority-review | Mon 7AM | $1.50 |

**Team-runner** (`.claude/jobs/team-runner.py`):
- Spawns multiple agent "members" in parallel for consensus decisions
- Each member returns: `approve`/`deny`/`uncertain` + confidence (high/medium/low) + evidence
- Verdict rules: `unanimous-approve`, `majority`, `any-deny-blocks` (configurable per job)
- Human escalation via Telegram when consensus fails
- Evidence preservation before escalation

Jarvis has no headless cron jobs system and no multi-agent consensus execution. The closest is AC-03 (two-level review with code-review + project-manager agents) but those are sequential, not parallel with consensus aggregation.

**Source**: `raw.githubusercontent.com/davidmoneil/AIfred/main/.claude/jobs/team-runner.py`

### Finding 8: Parallel-Dev Skill — Worktree Isolation Jarvis Lacks

AIfred's `parallel-dev` skill:
- Uses `git worktree` for complete filesystem isolation between parallel agents
- Worktree path: `~/tmp/worktrees/{project}/{name}`
- Uses `fresh-context-loop.sh` with `--no-session-persistence` flag for truly fresh context per agent
- Flow: plan → decompose → create worktrees → spawn parallel agents → conflict detection → merge → cleanup

Jarvis's parallelization (via TodoWrite, background Task spawns) does not provide filesystem isolation. Agents share the same working directory and can create conflicts.

**Source**: `raw.githubusercontent.com/davidmoneil/AIfred/main/.claude/skills/parallel-dev/SKILL.md`

### Finding 9: Memory Maintenance — Entity Lifecycle Tracking

AIfred's `memory-maintenance.js` (PostToolUse, fires every 100 operations):
- Tracks entity access to `.claude/agents/memory/entity-metadata.json`
- 30-day rolling access history per entity
- 90 days without access → review candidate
- 180 days without access → archive recommendation
- Generates pruning candidates report

Jarvis has no entity lifecycle tracking for its Memory MCP. Entities accumulate without any staleness detection. The `knowledge-ops` skill provides guidance but no automated tracking.

**Source**: `raw.githubusercontent.com/davidmoneil/AIfred/main/.claude/hooks/memory-maintenance.js`

### Finding 10: AIProjects Private Hub Explains Feature Flow

AIfred's `aiprojects-aifred-sync-pattern.md` documents a private hub:
- **AIProjects**: Private repository where all new features originate
- **AIfred**: Distributable starter kit; receives features after 1 week production testing + generalization
- **Maturity criteria**: 1 week production use, documented, generalizable (personal paths → `${AIFRED_ROOT}` env vars)
- The 148-component sync commit (2026-02-16) was a bulk transfer from AIProjects to AIfred

This explains why AIfred's capabilities appear more conservative than Jarvis — the full AIProjects capabilities are not publicly visible.

**Source**: `raw.githubusercontent.com/davidmoneil/AIfred/main/.claude/context/patterns/aiprojects-aifred-sync-pattern.md`

---

## Comparison Table

| Capability | AIfred v3.0.0 | Jarvis v5.11.0 | Gap Direction |
|------------|--------------|-----------------|---------------|
| Autonomic component system (AC-01..10) | None | Full (10 components) | Jarvis leads |
| Context management (JICM) | Passive pre-compact (~4KB) | Active watcher + dual-mechanism (5-15K tokens) | Jarvis leads significantly |
| Session startup | session-start.js hook | AC-01 + session-start.sh + JICM resume | Jarvis leads |
| File protection | Document Guard (glob patterns, tiers, override tokens) | None | AIfred leads |
| Strategic governance | TELOS (quarterly goals, anti-goals, review cadence) | None | AIfred leads |
| Headless jobs | 7-job cron system + team-runner consensus | None | AIfred leads |
| Multi-agent consensus | team-runner.py (parallel, verdict rules, Telegram escalation) | AC-03 sequential two-level review | AIfred leads |
| Parallel execution isolation | git worktrees + fresh-context-loop.sh | TodoWrite/Task spawns (no isolation) | AIfred leads |
| Memory lifecycle tracking | memory-maintenance.js (90/180 day thresholds) | None | AIfred leads |
| Testing infrastructure | yamllint + shellcheck + bats | None | AIfred leads |
| Self-improvement pipeline | None | AC-05/06/07/08 full cycle | Jarvis leads significantly |
| Knowledge architecture | Hub model (3-layer implied) | Nous/Pneuma/Soma (documented 3-layer) | Comparable (Jarvis more explicit) |
| Hook count | 43 active | ~28 active | AIfred leads |
| OpenCode portability | .opencode/ directory | Claude Code only | AIfred leads |
| Wiggum Loop | None | AC-02 default execution mode | Jarvis leads |
| Background monitoring | jobs/ cron (fire-and-forget) | Aion Quartet (tmux live) | Different models; both have gaps |

---

## Recommendations

### 1. Port: Document Guard for Nous File Protection (HIGH PRIORITY)

Create `.claude/hooks/document-guard.js` with a Jarvis-specific config protecting:
- `.claude/context/session-state.md` — required sections: `## Current Work Status`, `## Current Priorities`
- `.claude/context/psyche/capability-map.yaml` — required YAML keys: `version`, `skills`, `agents`
- `.claude/context/components/AC-*.md` — required frontmatter: `Component ID`, `Status`
- `CLAUDE.md` — required sections: `## Autonomic behavior`, `## Architecture`

Rationale: These files are load-bearing. Accidental structural corruption breaks session startup, pattern loading, and capability routing. The cost of adding protection is low; the cost of corruption is a broken session.

Caveats: Need to adapt AIfred's config structure to Jarvis's file layout. Override tokens are important for intentional refactors.

### 2. Port: TELOS Framework Adapted for Chronicler (MEDIUM PRIORITY)

Create `.claude/context/telos/TELOS.md` with:
- Quarterly focus: "Chronicler Phase 3 Live Integration"
- Active goals: Stage 3.5 (Fortress State Capture), Stage 3.6 (Narrative Data Layer), Phase 3 DoD
- Anti-goals: No Phase 4 work before Phase 3 DoD, no explorer UI changes during live integration
- Inject TELOS into `session-start.sh` additionalContext

Rationale: Provides explicit drift protection. The anti-goals list prevents scope creep into Phase 4 features while Phase 3 is incomplete.

### 3. Port: Memory Maintenance Entity Tracking (LOW-MEDIUM PRIORITY)

Add entity access tracking to the knowledge-ops skill and/or a PostToolUse hook. Track access to `.claude/agents/memory/` files. Flag entities not accessed in 90 days.

Rationale: Jarvis's Memory MCP entities accumulate without cleanup. The 90/180 day threshold is a reasonable starting point.

### 4. Evaluate: Team-Runner for AC-03 Enhancement (MEDIUM PRIORITY)

Review the `team-runner.py` consensus pattern for AC-03 Milestone Review. Current AC-03 is sequential (code-review agent → project-manager agent). Team-runner would enable parallel execution with configurable consensus rules.

Specific improvement: Run code-review and project-manager in parallel, require both to approve (unanimous-approve rule), escalate to user when they disagree.

### 5. Add: Testing Infrastructure for Hooks (LOW PRIORITY)

Add shellcheck validation for all `.sh` hooks and bats functional tests for the most critical hooks (session-start.sh, jicm-watcher.sh). This catches syntax errors before they break sessions.

---

## Action Items

- [ ] Review `document-guard.js` source code in full; design Jarvis-specific config for Nous file protection
- [ ] Draft `TELOS.md` for current Chronicler phase milestones and anti-goals
- [ ] Port `memory-maintenance.js` with threshold tuned to Jarvis's Memory MCP entity patterns
- [ ] Evaluate `team-runner.py` pattern for AC-03 parallel agent execution
- [ ] Check AIfred's archived hook list against Jarvis's active hooks for divergence signals
- [ ] Assess `index-sync.js` overhead vs. value for Jarvis's context directory structure

---

## Sources

1. [AIfred GitHub Repository](https://github.com/davidmoneil/AIfred)
2. [AIfred Commits API](https://api.github.com/repos/davidmoneil/AIfred/commits?per_page=20)
3. [AIfred File Tree API](https://api.github.com/repos/davidmoneil/AIfred/git/trees/main?recursive=1)
4. [AIfred CLAUDE.md](https://raw.githubusercontent.com/davidmoneil/AIfred/main/.claude/CLAUDE.md)
5. [AIfred settings.json](https://raw.githubusercontent.com/davidmoneil/AIfred/main/.claude/settings.json)
6. [AIfred session-start.js](https://raw.githubusercontent.com/davidmoneil/AIfred/main/.claude/hooks/session-start.js)
7. [AIfred pre-compact.js](https://raw.githubusercontent.com/davidmoneil/AIfred/main/.claude/hooks/pre-compact.js)
8. [AIfred document-guard.js](https://raw.githubusercontent.com/davidmoneil/AIfred/main/.claude/hooks/document-guard.js)
9. [AIfred memory-maintenance.js](https://raw.githubusercontent.com/davidmoneil/AIfred/main/.claude/hooks/memory-maintenance.js)
10. [AIfred jobs/registry.yaml](https://raw.githubusercontent.com/davidmoneil/AIfred/main/.claude/jobs/registry.yaml)
11. [AIfred team-runner.py](https://raw.githubusercontent.com/davidmoneil/AIfred/main/.claude/jobs/team-runner.py)
12. [AIfred TELOS.md](https://raw.githubusercontent.com/davidmoneil/AIfred/main/.claude/context/telos/TELOS.md)
13. [AIfred parallel-dev SKILL.md](https://raw.githubusercontent.com/davidmoneil/AIfred/main/.claude/skills/parallel-dev/SKILL.md)
14. [AIfred aiprojects-aifred-sync-pattern.md](https://raw.githubusercontent.com/davidmoneil/AIfred/main/.claude/context/patterns/aiprojects-aifred-sync-pattern.md)

---

## Uncertainties

- AIProjects private hub contents are not publicly visible. The full extent of AIfred's upstream capabilities is unknown. The 148-component sync commit suggests substantially more capability exists there.
- AIfred's OpenCode portability (`.opencode/` directory) suggests compatibility with the OpenCode CLI tool — unclear whether this has implications for Jarvis's Claude Code dependency.
- `document-guard.config.js` contents not fetched — need to read the actual config to understand what AIfred protects and how glob patterns are structured before designing Jarvis config.
- `fresh-context-loop.sh` script not fetched — unclear whether `--no-session-persistence` flag is relevant to Jarvis's tmux-based session model.

---

## Related Topics

- AC-03 enhancement with parallel agent consensus
- Nous file protection strategy
- TELOS-based Chronicler milestone governance
- Entity lifecycle management for Memory MCP
- Jarvis testing infrastructure (hook validation)
