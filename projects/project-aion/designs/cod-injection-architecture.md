# Chain-of-Draft Injection Architecture (Phase 2 Prep)

**Version**: 1.0.0
**Date**: 2026-05-03
**Status**: Design — for Phase 2 Tasks 2.3 + 2.4 wiring
**Cross-references**:
- Taxonomy: `projects/project-aion/designs/cod-task-type-taxonomy.md`
- Pre-registration: `.claude/metrics/token-compression/pre-registration-phase-2-cod.yaml`
- Roadmap: `projects/project-aion/reports/token-compression-roadmap.md` §3 Phase 2
- Implementation guide: `projects/project-aion/reports/token-compression-implementation-guide.md` §6
- Existing skill: `.claude/skills/token-compression/`

---

## Scope

Two design questions:

1. **Task-type routing** (Task 2.3) — how does the right CoD template get
   selected for the task at hand?
2. **Runtime wiring** (Task 2.4) — at what moment in the request lifecycle
   is CoD injected into the model's input?

The configuration-routing layer is **already complete**:
`.claude/skills/token-compression/config.yaml` maps
`reasoning × any level → cod → apply-cod.sh`. This document fills the
**runtime gap** — currently `apply-cod.sh` mutates a target file at rest;
nothing intercepts live prompts.

---

## §1. Inventory of existing artifacts

| Artifact | Status | Role |
|----------|--------|------|
| `apply-cod.sh` | Functional (5KB) | Prepends a CoD template to a target system prompt file; idempotent; metrics-logged |
| `templates/chain-of-draft.txt` | Existing (paraphrased seed + 4 generic few-shots) | Default template — *not* arxiv-verbatim |
| `templates/chain-of-draft-single-line.txt` | NEW (this session) | arxiv-verbatim seed only; ~25 tokens |
| `prompts/cod-examples/*.md` | TODO (Task 2.2) | Per-task-type few-shot libraries |
| `detect-phase.sh` | v0.1.0 STUB | Heuristic regex for *post-hoc* CoT markers — NOT suitable for proactive routing |
| `config.yaml` | Complete | Phase × level → strategy routing matrix |

---

## §2. Task-type routing design (Task 2.3)

### §2.1 Two candidate routing modes

**Option A — User-tagged routing** (RECOMMENDED FOR PHASE 2):

Caller passes `--task-type <type>` to apply-cod.sh; the script resolves the
template path. No auto-classification. Misroute risk: zero (caller is
explicit). Authoring cost: zero (no new classifier needed).

```bash
apply-cod.sh --task-type code-review --task-id <pulse-id> /path/to/prompt.txt
# Resolves to: templates/cod-examples/code-review.md OR similar
```

**Option B — Heuristic-classified routing** (DEFERRED):

A new `classify-task-type.py` reads the prompt content and emits one of
{code_review, bug_diagnosis, planning, research, session_mgmt, none}.
Misroute risk: non-trivial. Authoring cost: classifier + labeled eval set.
Use only if Option A's data shows broad benefit and explicit tagging is
operationally burdensome.

**Recommendation**: Phase 2 ships with Option A. Option B becomes a Phase
6 backlog item (under "Strategy router — auto-select compression mode by
phase + task type + model" — already roadmap §6.1).

### §2.2 apply-cod.sh extension shape

Backward-compatible extension. Default behavior unchanged: no flag → uses
existing `templates/chain-of-draft.txt`.

```diff
 while [ $# -gt 0 ]; do
     case "$1" in
         --template)  TEMPLATE="$2"; shift 2 ;;
+        --task-type) TASK_TYPE="$2"; shift 2 ;;
+        --variant)   VARIANT="$2"; shift 2 ;;     # single-line | full | fewshot
         --dry-run)   DRY_RUN=1; shift ;;
         ...
     esac
 done

+# Resolve template by task-type + variant
+if [ -n "${TASK_TYPE}" ] && [ -z "${TEMPLATE_OVERRIDE}" ]; then
+    case "${VARIANT:-fewshot}" in
+        single-line)
+            TEMPLATE="${SKILL_ROOT}/templates/chain-of-draft-single-line.txt" ;;
+        full)
+            TEMPLATE="${SKILL_ROOT}/templates/chain-of-draft.txt" ;;
+        fewshot)
+            TEMPLATE="${SKILL_ROOT}/prompts/cod-examples/${TASK_TYPE}.md" ;;
+    esac
+    if [ ! -f "${TEMPLATE}" ]; then
+        echo "[apply-cod] ERROR: template not found for task-type=${TASK_TYPE} variant=${VARIANT}: ${TEMPLATE}" >&2
+        exit 1
+    fi
+fi
```

### §2.3 Skip-rule enforcement

Per pre-registration: skip-rule compliance is a Stage-1 axis with **zero
tolerance**. apply-cod.sh must reject prompts matching skip rules even when
explicitly invoked.

Two enforcement layers:

**Layer 1 — opt-in safety** (default-on):

```bash
apply-cod.sh --task-type research /path/to/prompt.txt
# If --task-type is in the skip-rule set: ERROR + exit 3
# Skip-rule task types: arithmetic, code-generation, creative-writing, tool-use-heavy
```

**Layer 2 — content scan** (default-off; opt-in via `--scan-skip-rules`):

```bash
apply-cod.sh --scan-skip-rules --task-type bug-diagnosis /path/to/prompt.txt
# Reads prompt content; if it matches arithmetic/code-gen/creative/tool-use heuristics
# from the pre-registration: WARN + (configurable: ERROR or proceed-with-warning)
```

Layer 1 is mandatory. Layer 2 is the test-bench for Phase 2.5 — it lets us
measure how often a real Jarvis prompt would have been misrouted under
Option B (heuristic classification) without actually deploying the
classifier.

---

## §3. Runtime wiring design (Task 2.4)

### §3.1 Three candidate wirings

The CoD prompt must reach the model's input at the *right* moment. Three
options, with risk profiles and persistence semantics:

**Option I — UserPromptSubmit hook (additionalContext)**:

Add a UPS hook that classifies the user prompt by task type and, if eligible,
emits CoD as `additionalContext`. Per-prompt scope — no persistence between turns.

- Pro: minimal blast radius; CoD applies only to the next assistant turn
- Pro: hook system is already used by JICM v7.9 (jicm-gate.sh); pattern is familiar
- Pro: easy to audit (every CoD application leaves a hook log entry)
- Con: requires task-type classification at hook time (Option B from §2.1)
  OR explicit task-type tagging in the prompt itself (e.g., a `[task: code-review]` prefix)
- Con: adds ~25-200 tokens to every reasoning-eligible prompt; cache-prefix impact
  needs Stage-1 measurement

**Option II — Per-subagent system-prompt prepend**:

When dispatching a subagent (Agent tool), prepend CoD to the subagent's
system prompt. Per-subagent scope — applies to all turns within that subagent.

- Pro: subagent dispatch is already a structured event; classification is
  trivial (subagent type → task type mapping)
- Pro: cache-prefix impact is bounded — subagent prompts are already a
  separate cache stream
- Pro: matches roadmap §3 Phase 2 distinction between "main session" CoD
  and "subagent dispatch" CoD (separate concerns)
- Con: doesn't help main-session reasoning at all
- Con: requires modifying agent definitions (12 active agents) OR a
  central agent-prompt-builder

**Option III — Opt-in skill invocation**:

User explicitly invokes the token-compression skill (`/jarvis cod`) which
runs apply-cod.sh against the active conversation's effective system prompt.

- Pro: trivial deployment (no hook, no agent modification)
- Pro: zero misroute risk (user-controlled)
- Con: requires user remembering to invoke it — defeats the purpose of
  proactive compression
- Con: doesn't generate enough sample data for Stage-2 verdict

### §3.2 Recommendation

**Phase 2.4 wiring: Option I + Option II in parallel.**

- Option I (UPS hook) for **main-session reasoning** — covers code review,
  bug diagnosis, planning, research, session_mgmt when Jarvis is reasoning
  in the main thread.
- Option II (subagent prepend) for **subagent dispatch** — covers cases
  where Jarvis spawns deep-research, code-analyzer, etc. The subagent
  prompts are already a separate cache stream, so the impact is bounded
  and measurable.
- Option III (opt-in skill) is **deferred** as a manual override / debug
  path, not a primary wiring.

The UPS hook (Option I) and the subagent prepend (Option II) operate on
different token streams (main-thread reasoning vs subagent reasoning) at
different temporal points. They are orthogonal per the same logic that
makes Phase 1.1 + Phase 2 stack safe (roadmap §4.7 Rule 1) — different
streams, different lifecycle moments.

### §3.3 Task-type detection at hook time

For Option I to work, the UPS hook needs to know the task type. Three
sub-options:

**§3.3.1 Explicit prefix tag (RECOMMENDED FOR PHASE 2)**:

User (or autonomic component) prefixes the prompt with `[task: <type>]`.
The hook scans for this; absence → no CoD applied.

```
[task: code-review]
Look at src/auth.py and tell me if the session token rotation is correct.
```

- Pro: zero-classifier; zero misroute
- Pro: easily disabled (omit the prefix)
- Pro: makes the experimental scope explicit
- Con: requires user discipline OR autonomic-component prefix-injection
- Con: low coverage in early sessions until prefix becomes habitual

**§3.3.2 Frontmatter tag** (variant of 3.3.1):

```
---
task: code-review
---
Look at src/auth.py ...
```

Same trade-offs as 3.3.1 but more verbose; preferred if frontmatter is
already in use elsewhere (e.g., commands).

**§3.3.3 Heuristic classifier**:

Build classify-task-type.py per Option B in §2.1. Defer to Phase 6.1.

### §3.4 Hook implementation sketch

Mirroring jicm-gate.sh structure (sensing-only; no decision:block):

```bash
#!/bin/sh
# .claude/hooks/cod-inject.sh
# UserPromptSubmit hook — injects CoD seed when prompt is task-type-tagged

set -e
JARVIS_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SKILL_ROOT="${JARVIS_ROOT}/skills/token-compression"
INPUT="$(cat)"

# Emergency kill switch (per §8 Q3 decision)
if [ "${JICM_COD_DISABLED:-0}" = "1" ]; then
    jq -n '{}'
    exit 0
fi

# Extract the user prompt
PROMPT="$(echo "${INPUT}" | jq -r '.prompt // empty')"

# Look for [task: <type>] prefix or frontmatter
TASK_TYPE="$(echo "${PROMPT}" | head -1 | sed -nE 's/^\[task: ([a-z_-]+)\].*/\1/p')"
if [ -z "${TASK_TYPE}" ]; then
    # No tag → no CoD; emit empty additionalContext
    jq -n '{}'
    exit 0
fi

# Skip-rule check (Layer 1)
case "${TASK_TYPE}" in
    arithmetic|code-generation|creative-writing|tool-use-heavy)
        # Skip-rule violation — log and emit empty
        echo "[cod-inject] SKIP_RULE_VIOLATION: ${TASK_TYPE}" >> "${JARVIS_ROOT}/logs/cod-inject.log"
        jq -n '{}'
        exit 0 ;;
esac

# Resolve template
TEMPLATE="${SKILL_ROOT}/prompts/cod-examples/${TASK_TYPE}.md"
if [ ! -f "${TEMPLATE}" ]; then
    # Fallback to single-line variant if per-task-type fewshot doesn't exist
    TEMPLATE="${SKILL_ROOT}/templates/chain-of-draft-single-line.txt"
fi

# Emit additionalContext
COD_TEXT="$(cat "${TEMPLATE}")"
jq -n --arg ctx "${COD_TEXT}" \
    '{hookSpecificOutput: {hookEventName: "UserPromptSubmit", additionalContext: $ctx}}'

# Log for telemetry (Stage-1 register-violation tracking will read this)
echo "$(date -u +%FT%TZ) ${TASK_TYPE} ${TEMPLATE}" >> "${JARVIS_ROOT}/logs/cod-inject.log"
```

### §3.5 Persistence semantics

Per-prompt only. The hook fires on each UPS event; CoD is injected as
`additionalContext` for that single turn. Subsequent turns require
re-prefixing. This matches the pre-registration's "per-prompt telemetry"
effort class.

If sticky behavior is desired in later phases, the hook can write a sticky
flag (similar to JICM's `.jicm-nudge-shown`); deferred until Stage-2 data
justifies it.

---

## §4. detect-phase.sh assessment

The existing `.claude/skills/token-compression/scripts/detect-phase.sh` is a
**v0.1.0 stub** unsuitable for Phase 2 routing. Its limitations:

1. **Looks for post-hoc markers**: regex patterns like `<thinking>`, `step \d+:`,
   `chain of thought` — these appear AFTER reasoning has occurred, not BEFORE
   it. Useful for *classifying* a session log; useless for *routing* an
   incoming prompt.
2. **Phase-shaped, not task-type-shaped**: emits {startup, reasoning,
   tool_output, session_state, user_response, input_preprocessing, unknown}.
   Phase 2 needs task types {code_review, bug_diagnosis, planning, research,
   session_mgmt}. Different taxonomy entirely.
3. **Self-acknowledged stub**: header comment says "STUB: TC-07 (Build
   compression mode auto-detection) is pending. Uses heuristic
   pattern-matching. Replace with ML detection in TC-07."

**Decision**: do not modify detect-phase.sh for Phase 2. It serves a
different (TC-07) purpose. Phase 2 routing uses explicit `[task: <type>]`
prefix tagging per §3.3.1.

---

## §5. Telemetry plumbing

For Stage-1 / Stage-2 verdict computation, the following must be logged:

### §5.1 Per-CoD-application log

`.claude/logs/cod-inject.log` (line-per-event):

```
<timestamp> <task_type> <template_path> <prompt_chars> <session_id>
```

### §5.2 Per-turn telemetry extraction

The cache-telemetry-extractor.py needs extension to capture:
- `usage.thinking_tokens` (exists in JSONL when extended-thinking is enabled)
- `usage.input_tokens` and `usage.output_tokens` separately (already extracted)
- whether the turn was preceded by a CoD injection (cross-reference with
  cod-inject.log)

### §5.3 Stage-1 verdict computation

```bash
# 48h after deploy_timestamp, from the pre-reg
python3 - << 'PY'
import json, sys
# 1. Read cod-inject.log: count applications, count skip-rule violations
# 2. Read cache-telemetry CSV: compute hit rate Δ vs baseline
# 3. Read register-violation regex over output text: count <draft>/<answer> leaks
# 4. Emit verdict JSON
PY
```

### §5.4 Stage-2 verdict computation

Per pre-registration `gate_to_next_phase.passing_criteria`:

- Per-task-type thinking-token reduction (from extended telemetry)
- Quality rubric score (from cc-compression-bench-style human-judge or
  Sonnet-judge eval)
- Register violations (sustained metric over 14d)
- Default-route regression count (skip-rule violations)

---

## §6. Phasing

| Sub-task | Description | Status | Blocks |
|----------|-------------|--------|--------|
| 2.1.a | Single-line template (arxiv-verbatim) | DONE (this session) | — |
| 2.1.b | Apply single-line CoD to 5 reasoning sessions; capture baseline | TODO | Tasks 2.2, 2.5 |
| 2.2 | Author 5 per-task-type fewshot files | TODO (gated on 2.1.b results) | Task 2.5 |
| 2.3.a | Extend apply-cod.sh with --task-type / --variant | TODO | Task 2.4 |
| 2.3.b | Add Layer-1 skip-rule enforcement to apply-cod.sh | TODO | Task 2.4 |
| 2.4.a | Author cod-inject.sh hook (UPS) | TODO | Stage-1 deploy |
| 2.4.b | Register hook in settings.json | TODO | Stage-1 deploy |
| 2.4.c | Extend cache-telemetry-extractor for thinking_tokens | TODO | Stage-2 verdict |
| 2.4-bis | Subagent CoD via central agent-prompt-builder (own pre-reg delta) | DEFERRED (gated on Stage-1 CLEAR for main-session) | Subagent benchmark (separate from 2.5) |
| 2.5 | Benchmark CoD vs baseline (n≥25 sessions, main-session only) | TODO | Phase 4 promotion |

Tasks 2.5 and Stage-2 verdict are **GATED on Phase 1.1 Stage-2 PASS**
(currently scheduled 2026-05-15 per active-plan).

---

## §7. Rollback

Per pre-registration `rollback`:
1. Disable hook by removing it from `settings.json` (or commenting out)
2. Or: hook reads an env var `JICM_COD_DISABLED=1` and short-circuits
3. Or: rename `cod-inject.sh` to `.cod-inject.sh.disabled`

Apply-cod.sh script remains in place — it's the *runtime entry point*
that must rollback, not the *static template/script library*.

---

## §8. Decisions (User-confirmed 2026-05-03)

The three open questions in v1.0.0 were closed by User at the post-JICM-resume
turn on 2026-05-03. The decisions below are now **frozen** as the Phase 2.4
design contract; deviations require new pre-registration.

### Q1 — Tag format: **prefix-tag** `[task: <type>]`

Selected over frontmatter (§3.3.1 over §3.3.2).

Reasoning:
- Aligns with existing `[CHANNEL]` operational-signal convention
  (`[JICM-HALT]`, `[JICM-RESUME]`, `[SESSION-START]`); user is already trained
  on this shape
- Lower interactive-use friction (one prefix line vs three lines of YAML)
- Simpler anchored regex parser (`^\[task: ([a-z_-]+)\]`); fewer failure modes
- Namespace-safe: the `task:` key inside the bracket distinguishes from
  channel-only signals
- Extensibility: future multi-field metadata still works inline
  (`[task: code-review][prio: high]`)

### Q2 — Subagent CoD: **defer post Stage-1** (Phase 2.4-bis)

Phase 2.4 ships ONLY Option I (UPS hook for main-session reasoning).
Subagent CoD becomes Phase 2.4-bis, gated on STAGE_1_CLEAR for main-session.

Reasoning:
- **Stream isolation for Stage-1 verdict**: deploying both Option I and
  Option II simultaneously contaminates the regression signal — a HALT cannot
  be attributed to a specific stream
- **Pre-registration alignment**: `sample_targets.reasoning_sessions_per_task_type`
  describes main-session reasoning; subagent dispatch isn't in that frame
- **Risk geometry**: subagent dispatch is dominated by `deep-research`, which
  maps to LOW-fit `research` task type (-35% target, "synthesis collapse"
  risk per taxonomy). Highest-risk class deserves its own pre-registration
- **Independent rollback**: separate deploys = separate rollbacks. Subagent
  regression can be reverted without disturbing main-session

When Phase 2.4-bis ships, it will use a **central agent-prompt-builder**
(not per-agent edits to 12 files). Rationale: rollback is one-line in builder
vs 12 reverts; agent #13 inherits CoD automatically; subagent dispatch is
already centralized at the Agent tool layer.

### Q3 — Default opt-in by tag; emergency kill switch via `JICM_COD_DISABLED=1`

The prefix tag IS the opt-in mechanism; without a tag the hook does nothing.
The env var sketched in §3.4 / §7 (`JICM_COD_DISABLED=1`) is the **emergency
kill switch**, not a steady-state gate. The Q3-question's `JICM_COD_ENABLED=1`
framing is **rejected**; the canonical name is `JICM_COD_DISABLED` throughout.

Reasoning:
- **Stage-1 sample-sufficiency dominates**: a 14d × ~1-2 reasoning prompts/day
  window cannot afford friction-added gates without risking
  STAGE_1_DEFERRED → indefinite stall
- **Conservatism is already upstream**: the tag requirement is itself the
  opt-in; the hook is sensing-only without it
- **Reversibility parity**: both designs roll back via `settings.json` hook
  removal; the env var doesn't add reversibility, only friction
- **Mental-model simplicity**: "tag → CoD applies" is one rule. Adding a
  hidden env-var requirement creates discoverability traps during Stage-1
  iteration
- The env var's legitimate use is per-shell emergency disable
  (e.g., `JICM_COD_DISABLED=1 claude` to spawn a clean session) without
  touching `settings.json`

### Structural property of the frozen design

Every layer is **fail-closed** without imposing friction on the happy path:
- Hook absent → no CoD
- Tag absent → no CoD
- Skip-rule match → no CoD (Layer-1 enforcement, exit 3)
- Template not found → no CoD
- `JICM_COD_DISABLED=1` → no CoD

The single intentional act (typing the tag) flips ON. Mirrors the JICM v7.9
sensing-only hook pattern (no `decision: block` until a hard threshold) —
fail-closed-by-default with single explicit opt-in.

---

*CoD Injection Architecture v1.1.0 — 2026-05-03 (decisions frozen)*
