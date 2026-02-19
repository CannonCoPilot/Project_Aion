# Research Report: CCTCRG Context Window Management Strategies vs. Jarvis JICM v7

**Date**: 2026-02-18
**Scope**: Full analysis of https://github.com/gino2013/CCTCRG — a bilingual (English/Chinese) token cost reduction guide for Claude Code — mapped against Jarvis's current JICM v7 and related context management implementations.

---

## Executive Summary

CCTCRG (Claude Code Token Cost Reduction Guide) is a lightweight, user-facing guide targeting individual developers who want to reduce token spend by 40-60% through disciplined prompt templating, project memory files (CLAUDE.md), and usage monitoring tools. Its strategies are manual and conversational in nature.

Jarvis's JICM v7 operates at a fundamentally different architectural level: autonomous, infrastructure-based, and fully unattended. The majority of CCTCRG's strategies are either already implemented in Jarvis — often in more sophisticated form — or are inapplicable because Jarvis is an autonomous archon rather than a human developer issuing prompts.

However, CCTCRG identifies three areas Jarvis has not yet operationalized: (1) a persistent usage log tracking per-task token consumption, (2) a `.claude-config` machine-readable project config complement to CLAUDE.md, and (3) a `ccusage` integration for live monitoring against budget ceilings. These are low-cost enhancements with measurable diagnostic value.

---

## Key Findings

### Finding 1: CCTCRG Core Strategy — Project Memory File (CLAUDE.md)

CCTCRG's highest-leverage recommendation is a structured `CLAUDE.md` at project root storing project identity, tech stack, dev commands, code style preferences, and avoidance rules. This eliminates per-session re-briefing overhead, which the guide estimates at 75-85% of repetitive character overhead.

**Implementation model:**
```
[Project Guide] → [Use Template] → [Input Requirements] → [Specify Output]
```

**Source**: `CCTCRG/CLAUDE.md`, `CCTCRG/AUTO_APPLY_SYSTEM.md`

**Jarvis Status**: FULLY IMPLEMENTED — exceeded.

Jarvis's `CLAUDE.md` (root) functions as the primary project memory file with 9 structured sections covering identity/persona, runtime environment, guardrails, architecture topology, git workflow, capability discovery, and key references. Beyond CLAUDE.md, Jarvis maintains:
- `.claude/context/session-state.md` — current work status
- `.claude/context/current-priorities.md` — task queue
- `.claude/context/compaction-essentials.md` — essential preserved context (now deprecated in v7; auto-loaded by Claude Code)
- `.claude/context/psyche/jarvis-identity.md` — persona and tone

Reference files: `/Users/nathanielcannon/Claude/Jarvis/CLAUDE.md`, `/Users/nathanielcannon/Claude/Jarvis/.claude/context/session-state.md`

---

### Finding 2: CCTCRG Strategy — Template-Based Prompt Standardization

CCTCRG provides `PromptTemplates.md` with a formula: `[Action] + [Object] + [Technology] + [Output Format]`. Templates eliminate repetitive context-setting per task type (React component, API endpoint, test file, refactor). The guide estimates significant per-request savings when templates are consistently applied.

**Source**: `CCTCRG/PromptTemplates.md`, `CCTCRG/ClaudeCodeOptimizationGuide.md`

**Jarvis Status**: IMPLEMENTED via slash commands and skills.

Jarvis's command system (`.claude/commands/`, 40 commands) implements the equivalent: `/react`, `/api`, `/fix`, `/test`, `/refactor`, `/quick`, `/debug`, `/optimize`, `/batch`, `/extend` — each encodes a structured template that Jarvis executes without requiring the human user to supply verbose context. Skill definitions in `.claude/skills/` provide the analogous standardized patterns for recurring task types.

Reference files: `/Users/nathanielcannon/Claude/Jarvis/.claude/commands/README.md`, `/Users/nathanielcannon/Claude/Jarvis/.claude/skills/_index.md`

---

### Finding 3: CCTCRG Strategy — Precise Output Control

CCTCRG recommends explicit output directives to suppress verbosity:
- "Output code only, no explanation"
- "Output only modified parts"
- "Output file content only, no preamble or postamble"
- "Complete in one conversation, provide complete solution for each task"

Estimated savings: significant per-interaction reduction in response length.

**Source**: `CCTCRG/ClaudeCodeOptimizationGuide.md`, `CCTCRG/PromptTemplates.md`

**Jarvis Status**: IMPLEMENTED via observation masking pattern.

Jarvis's `observation-masking-pattern.md` implements the equivalent at the infrastructure level: tool outputs >50 files get summarized, grep results >100 lines get written to temp files with inline summary, bash outputs >2000 chars get offloaded. Target savings: 60-80% reduction on tool output tokens. Additionally, Jarvis's CLAUDE.md guardrails specify autonomic behavior that prevents verbose wait-and-ask responses.

Reference files: `/Users/nathanielcannon/Claude/Jarvis/.claude/context/patterns/observation-masking-pattern.md`, `/Users/nathanielcannon/Claude/Jarvis/.claude/context/compaction-essentials.md` (lines 85-98)

---

### Finding 4: CCTCRG Strategy — Batch Task Processing

CCTCRG recommends grouping related tasks in a single conversation ("chain related tasks in a single conversation rather than starting fresh sessions each time"). The guide's `/batch` command explicitly handles multiple tasks in one pass.

**Source**: `CCTCRG/CLAUDE_COMMANDS.md`, `CCTCRG/QuickStartGuide.md`

**Jarvis Status**: IMPLEMENTED — exceeded via Wiggum Loop and parallelization.

The Wiggum Loop (AC-02) is Jarvis's autonomous iteration engine: Execute → Check → Review → Drift Check → Context Check → Continue. This keeps related work in one session without user-triggered batching. The parallelization-strategy pattern further extends this by running independent subtasks as parallel tool calls. Both eliminate the per-session re-briefing overhead that CCTCRG's batch strategy targets.

Reference: `/Users/nathanielcannon/Claude/Jarvis/.claude/context/patterns/wiggum-loop-pattern.md`, `/Users/nathanielcannon/Claude/Jarvis/.claude/context/patterns/parallelization-strategy.md`

---

### Finding 5: CCTCRG Strategy — Keyword Toggle / One-Time Optimization Mode Activation

CCTCRG's `AUTO_APPLY_SYSTEM.md` describes a per-session activation pattern: send one prompt at session start declaring "optimization mode on," after which all subsequent requests are minimal. The system claims 75-85% overhead reduction by front-loading configuration.

Three mechanisms:
1. Conversation-level activation prompt (one-time per session)
2. `.claude-config` JSON file at project root (`{"auto_apply": true, "response_mode": "code_only", "token_optimization": true}`)
3. Magic keyword toggles: `START_OPTIMIZATION_MODE`, `STOP_OPTIMIZATION_MODE`, `CHECK_MODE_STATUS`

**Source**: `CCTCRG/AUTO_APPLY_SYSTEM.md`

**Jarvis Status**: PARTIALLY IMPLEMENTED — session activation is automated; `.claude-config` machine-readable file is NOT implemented.

Jarvis's session-start hook (AC-01, `session-start.sh`) automatically injects optimization context at session start via `additionalContext` — the equivalent of CCTCRG's one-time activation prompt, but without requiring any user action. The persona defined in `jarvis-identity.md` persistently encodes the autonomic/concise behavior that CCTCRG's optimization mode activates.

What Jarvis does NOT have: a machine-readable `.claude-config` JSON file at project root. This is separate from `CLAUDE.md` and could serve as a structured API for programmatic optimization settings. Priority: LOW — the functional equivalent is already achieved via hooks and CLAUDE.md.

---

### Finding 6: CCTCRG Strategy — Task Type Awareness (What to Avoid)

CCTCRG explicitly categorizes task types by token efficiency:

**Recommended (efficient):**
- Frontend component development
- API endpoint implementation
- Test code writing
- Configuration file generation
- Code refactoring

**Avoid (token-inefficient):**
- Single-line changes (color/spacing tweaks)
- Variable renaming
- Copy-paste repetitive operations
- Basic code search

**Source**: `CCTCRG/ClaudeCodeOptimizationGuide.md`

**Jarvis Status**: NOT IMPLEMENTED as a formal avoidance rule.

Jarvis has no equivalent "task type avoidance" pattern. However, this is less critical for Jarvis because (a) Jarvis is autonomous and self-selects appropriate task granularity, and (b) JICM v7 provides autonomous context management regardless of task type. The practical equivalent is the Wiggum Loop's drift check, which catches when Jarvis is spending context on low-value work.

**Assessment**: NOT APPLICABLE to Jarvis's autonomous mode. If human-driven work via Jarvis is common, a "task triage" pattern could be documented, but this is low priority.

---

### Finding 7: CCTCRG Strategy — Layered Requirements Expression

CCTCRG recommends separating requirements into: core (must-have), advanced (nice-to-have), style requirements, and technical constraints — to avoid over-specification that inflates prompt length.

**Source**: `CCTCRG/ClaudeCodeOptimizationGuide.md`

**Jarvis Status**: IMPLEMENTED as progressive-constraint-encoding pattern.

Jarvis's `progressive-constraint-encoding.md` pattern formalizes the exact same concept: 3-level constraint encoding for artifact generation prompts (essential → behavioral → quality). This was independently derived but functionally identical to CCTCRG's layered requirements approach.

Reference: `/Users/nathanielcannon/Claude/Jarvis/.claude/context/patterns/progressive-constraint-encoding.md`

---

### Finding 8: CCTCRG Strategy — Token Usage Monitoring Tools

CCTCRG catalogs the current ecosystem of token monitoring tools:

| Tool | Type | Key Commands |
|------|------|-------------|
| `ccusage` (npm) | CLI | `ccusage daily`, `ccusage blocks --live`, `ccusage monthly` |
| Claude-Code-Usage-Monitor | Python dashboard | `./ccusage_monitor.py --plan max20` |
| CCSeva | Mac menu bar app | Visual indicator |
| Raycast Extension | Quick lookup | IDE integration |

These tools parse actual JSONL usage files for accurate tracking rather than estimates.

**Source**: `CCTCRG/QuickStartGuide.md`, main README

**Jarvis Status**: PARTIALLY IMPLEMENTED — JICM v7 monitors context % via watcher; ccusage integration is NOT implemented.

JICM v7's `jicm-watcher.sh` monitors context window usage percentage and triggers compression at 55%, emergency `/compact` at 73%, and lockout at 78.5%. This is real-time in-session monitoring.

What Jarvis does NOT have: post-session usage tracking (daily/monthly summaries), historical trend analysis, or integration with `ccusage` for cross-session cost accounting. The JSONL usage files that `ccusage` parses (`~/.claude/projects/*/`) are already generated by Claude Code and present on disk.

**Priority: MEDIUM** — adds diagnostic visibility for context budget decisions.

---

### Finding 9: CCTCRG Strategy — Usage Log for Task Optimization

CCTCRG recommends maintaining a usage log tracking:
- Task type
- Estimated token consumption
- Techniques applied
- Measured savings

This creates a feedback loop for identifying optimization opportunities.

**Source**: `CCTCRG/ClaudeCodeOptimizationGuide.md`

**Jarvis Status**: NOT IMPLEMENTED as a structured usage log.

Jarvis tracks session history in `session-state.md` and has JICM cycle telemetry in `.claude/reports/testing/compression-timing-data.jsonl`, but no structured per-task token consumption log exists. The JICM compression experiments (Experiments 1-7) provide one-time benchmark data, not ongoing logging.

**Priority: MEDIUM** — structured usage logging could inform context budget decisions and identify high-cost task patterns.

---

### Finding 10: CCTCRG Strategy — Session Scope Limiting via `/extend`

CCTCRG's `/extend` command limits output to "only new/modified parts" rather than regenerating entire files. This is an output-scoping technique that directly reduces context consumption per task cycle.

**Source**: `CCTCRG/CLAUDE_COMMANDS.md`

**Jarvis Status**: IMPLEMENTED via observation masking and Edit tool preference.

Jarvis's CLAUDE.md guardrail "minimal changes for the task at hand" and the observation masking pattern together implement scope limiting. Jarvis prefers the Edit tool over full file rewrites when possible, which achieves the same output-scoping effect.

---

## Comparison Table

| Strategy | CCTCRG Approach | Jarvis Implementation | Status |
|----------|----------------|----------------------|--------|
| Project memory | CLAUDE.md file | CLAUDE.md + session-state + priorities + identity | EXCEEDED |
| Template prompts | PromptTemplates.md, slash commands | 40 commands + 28 skills | EXCEEDED |
| Output control | "Code only" directives | Observation masking pattern | EXCEEDED |
| Batch processing | Manual /batch command | Wiggum Loop (automated) | EXCEEDED |
| Session activation | One-time mode toggle | session-start hook (automated) | EXCEEDED |
| Layered requirements | 3-tier spec approach | progressive-constraint-encoding | IMPLEMENTED |
| Task type avoidance | Explicit avoid list | Wiggum drift check (implicit) | PARTIAL |
| Usage monitoring (in-session) | ccusage blocks --live | JICM watcher (context %) | IMPLEMENTED |
| Usage monitoring (cross-session) | ccusage daily/monthly | NOT IMPLEMENTED | GAP |
| Per-task usage log | Manual tracking template | NOT IMPLEMENTED | GAP |
| Machine-readable config | .claude-config JSON | NOT IMPLEMENTED (low priority) | GAP |
| Scope limiting | /extend command | Edit tool preference + masking | IMPLEMENTED |
| Context restoration | Manual re-briefing | JICM v7 automated restoration | JARVIS ONLY |
| Autonomous compression | Not addressed | JICM v7 script (0.028s) | JARVIS ONLY |
| MCP tier management | Not addressed | 3-tier MCP loading strategy | JARVIS ONLY |
| Tool output offloading | Not addressed | .tool-output/ temp file system | JARVIS ONLY |

---

## Recommendations

### 1. Integrate ccusage for Cross-Session Usage Tracking

**Priority: MEDIUM**
**Effort: LOW** (ccusage is already available as npm package; JSONL files are already on disk)

Install `ccusage` and wire it into AC-01 (session start) to display daily/weekly token burn rate alongside JICM context percentage:

```bash
npm install -g ccusage
# Add to session-start.sh:
ccusage daily 2>/dev/null | head -5  # Show recent burn rate
```

This provides the cross-session budget visibility that JICM's in-session monitoring lacks. Useful for identifying sessions that consistently burn high context (candidate for task restructuring).

Implementation location: `/Users/nathanielcannon/Claude/Jarvis/.claude/hooks/session-start.sh`

---

### 2. Implement a Structured Per-Task Usage Log

**Priority: MEDIUM**
**Effort: MEDIUM** (requires adding logging to Wiggum Loop or AC-09 exit hook)

Create `.claude/context/usage-log.jsonl` with per-session entries:

```jsonl
{"date":"2026-02-18","session":28,"task":"AC-01 Qdrant wiring","context_peak_pct":67,"jicm_cycles":1,"techniques":["observation-masking","parallelization"],"duration_min":45}
```

Populate via AC-09 (end-session) by reading JICM telemetry and session-state. This enables trend analysis: which task types drive context exhaustion, whether JICM cycles are correlated with specific work patterns, and whether observation masking is being applied consistently.

Implementation location: `/Users/nathanielcannon/Claude/Jarvis/.claude/commands/end-session.md` (add logging step), `/Users/nathanielcannon/Claude/Jarvis/.claude/context/usage-log.jsonl` (new file)

---

### 3. Document Task Triage Pattern for User-Initiated Work

**Priority: LOW**
**Effort: LOW** (documentation only)

When a human directs Jarvis to perform work, add a lightweight task triage step to determine whether the request is AI-appropriate (component generation, complex refactoring, API implementation) or trivially automatable via direct bash/edit (single-line change, rename, copy-paste). This prevents Jarvis from consuming context on work that a 5-line bash script would handle.

Candidate pattern name: `task-triage-pattern.md`
Implementation location: `/Users/nathanielcannon/Claude/Jarvis/.claude/context/patterns/task-triage-pattern.md`

---

### 4. Add .claude-config JSON Complement to CLAUDE.md (Optional)

**Priority: LOW**
**Effort: VERY LOW** (single file creation)

Create `.claude-config` at project root:

```json
{
  "auto_apply": true,
  "response_mode": "autonomous",
  "token_optimization": true,
  "output_verbosity": "minimal",
  "jicm_version": "v7"
}
```

This is primarily useful if external tooling (extensions, browser bookmarks, third-party optimizers) ever needs to detect Jarvis's optimization mode. Has no functional impact on Jarvis's operation today. Not recommended unless a specific integration requires it.

---

## Action Items

- [ ] Install `ccusage` (`npm install -g ccusage`) and add daily burn rate display to session-start.sh (MEDIUM priority)
- [ ] Add per-session usage log entry to AC-09 end-session command (MEDIUM priority)
- [ ] Create `task-triage-pattern.md` for user-initiated work routing (LOW priority)
- [ ] Consider `.claude-config` JSON only if external tooling integration is needed (VERY LOW priority)

---

## Sources

1. [CCTCRG Repository](https://github.com/gino2013/CCTCRG) — gino2013, MIT License
2. [CCTCRG ClaudeCodeOptimizationGuide.md](https://raw.githubusercontent.com/gino2013/CCTCRG/main/ClaudeCodeOptimizationGuide.md)
3. [CCTCRG AUTO_APPLY_SYSTEM.md](https://raw.githubusercontent.com/gino2013/CCTCRG/main/AUTO_APPLY_SYSTEM.md)
4. [CCTCRG PromptTemplates.md](https://raw.githubusercontent.com/gino2013/CCTCRG/main/PromptTemplates.md)
5. [CCTCRG CLAUDE_COMMANDS.md](https://raw.githubusercontent.com/gino2013/CCTCRG/main/CLAUDE_COMMANDS.md)
6. [CCTCRG QuickStartGuide.md](https://raw.githubusercontent.com/gino2013/CCTCRG/main/QuickStartGuide.md)
7. [Jarvis JICM v5 Design Addendum](file:///Users/nathanielcannon/Claude/Jarvis/.claude/context/designs/jicm-v5-design-addendum.md)
8. [Jarvis Compaction Essentials (JICM v7 ref)](file:///Users/nathanielcannon/Claude/Jarvis/.claude/context/compaction-essentials.md)
9. [Jarvis Context Budget Management Pattern](file:///Users/nathanielcannon/Claude/Jarvis/.claude/context/patterns/context-budget-management.md)
10. [Jarvis Observation Masking Pattern](file:///Users/nathanielcannon/Claude/Jarvis/.claude/context/patterns/observation-masking-pattern.md)
11. [Jarvis Current Priorities](file:///Users/nathanielcannon/Claude/Jarvis/.claude/context/current-priorities.md) — JICM v7 completion notes (2026-02-16)
12. [ccusage npm package](https://www.npmjs.com/package/ccusage)
13. [Claude-Code-Usage-Monitor](https://github.com/Maciek-roboblog/Claude-Code-Usage-Monitor)

---

## Uncertainties

- ccusage's exact JSONL format compatibility with Jarvis's session files was not validated; the parsing should be tested before relying on its output.
- CCTCRG's claimed 40-60% savings estimate is for human developers issuing manual prompts; the baseline is different for Jarvis's autonomous operation.
- The `.claude-config` file format is not an official Claude Code specification — it is a CCTCRG-specific convention without Anthropic endorsement. Its utility depends entirely on third-party tool adoption.

## Related Topics

- JICM v7 implementation report: `/Users/nathanielcannon/Claude/Jarvis/.claude/context/designs/jicm-v6.1-implementation-report.md`
- Context engineering marketplace analysis: `/Users/nathanielcannon/Claude/Jarvis/.claude/context/research/context-engineering-marketplace-analysis.md`
- Compression timing experiments 1-7: `/Users/nathanielcannon/Claude/Jarvis/.claude/reports/testing/`
- Research agenda (future topics): `/Users/nathanielcannon/Claude/Jarvis/.claude/context/research/research-agenda.yaml`

---

*Research conducted 2026-02-18 — Deep Research Agent (claude-sonnet-4-6)*
