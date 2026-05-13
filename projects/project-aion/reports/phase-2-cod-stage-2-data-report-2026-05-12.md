---
title: Phase 2 CoD — Stage-2 Verdict-from-Data-As-Is Report
date: 2026-05-12
status: STAGE_2_NO_DATA — closed early per Sir's 2026-05-12 directive
project: Jarvis (CannonCoPilot/Jarvis main)
pre_registration: .claude/metrics/token-compression/pre-registration-phase-2-cod.yaml
deploy_commit: 2de41e5
deploy_timestamp: 2026-05-04T00:09:29Z
window_observed: 8 days (2026-05-04 → 2026-05-12)
stage_2_window_designed: 14 days (would have closed 2026-05-18T00:09:29Z)
closure_basis: Sir's 2026-05-12 directive — "cut short any Stage Verdict gating, ending them as of now, with reports produced from data as-is"
audience: Sir, future-Jarvis
---

# Phase 2 CoD — Stage-2 Verdict-from-Data-As-Is Report

## 1. Outcome

**STAGE_2_NO_DATA**. Phase 2 CoD (Chain-of-Draft) intervention was deployed via UPS hook on 2026-05-04T00:09:29Z and ran for 8 days through this report's filing date. **Zero in-vivo production invocations occurred** during the window. The deployed infrastructure is correctness-validated by 16 smoke-test / diagnostic log entries from 2026-05-03 and 2026-05-04, but the effectiveness hypotheses in the pre-registration (per-task-type thinking-token reduction, quality rubric stability, register-violation count, skip-rule compliance) cannot be evaluated because no qualifying prompts triggered the hook.

The infrastructure is shipped and gated-but-dormant. Re-enabling CoD as an effectiveness intervention requires a different gating mechanism than the current prefix-tag opt-in; that re-design is queued for tail-end of Phase 2 work in the revised roadmap (Token Compression phase).

## 2. What the data actually shows

### 2.1 Inventory of cod-inject.log entries

`/Users/nathanielcannon/Claude/Jarvis/.claude/logs/cod-inject.log` contains exactly **16 lines**, all from 2026-05-03T23:09Z – 2026-05-04T00:27Z (pre-deploy and immediate post-deploy diagnostic burst):

| Time window | Entry type | Count | Purpose |
|---|---|---|---|
| 2026-05-03T23:09Z | `SKIP_RULE_VIOLATION` | 1 | smoke-test-1: arithmetic skip-rule validation |
| 2026-05-03T23:09Z | `APPLIED` | 1 | smoke-test-2: code-review single-line variant |
| 2026-05-04T00:26Z | `APPLIED` | 5 | smoke-fewshot-* one per task type (code-review, bug-diagnosis, planning, research, session-mgmt) |
| 2026-05-04T00:26Z | `SKIP_RULE_VIOLATION` | 1 | smoke-skip-recheck: code-generation skip-rule re-validation |
| 2026-05-04T00:27Z | `APPLIED` | 7 | diag session: per-task-type fewshot recheck + single-line recheck |

**Total**: 14 APPLIED + 2 SKIP_RULE_VIOLATION events, all by `session=smoke-*` or `session=diag` — explicitly identified as wiring-validation traffic, not production invocation.

**Production-window entries (2026-05-04T00:09:30Z onward, by an end-user-issued prompt)**: 0.

### 2.2 Why zero in-vivo fires

Per `pre-registration-phase-2-cod.yaml` §"Outcome.reason" and `cod-inject.sh` source, the hook gates application on a **prefix-tag opt-in**: prompts must begin with `[task: code-review]`, `[task: planning]`, etc. for the hook to apply the corresponding fewshot brief. This was a deliberate safety-first deployment choice — eliminates the risk of misapplied CoD to non-reasoning prompts (skip-rule violations would otherwise be the dominant failure mode per the arxiv 2502.18600 -4% accuracy regression on misapplied math) at the cost of requiring explicit user invocation.

Across the 8-day window, no end-user-issued prompt carried the prefix tag. The hook ran on every prompt, found no tag, exited cleanly, logged nothing. This is the correct behavior given the gating rules; it is also the reason no data accumulated.

### 2.3 Cross-cutting data: cache telemetry stability

Cache telemetry files (`cache-telemetry-aifred-v2-20260501.csv`, `cache-telemetry-v2-20260501.csv`) cover the pre-deploy window 2026-04-30 → 2026-05-01. No post-deploy cache-telemetry capture exists targeting CoD's hypothesized `cache_hit_rate_dip_pp` axis. This is mechanically expected — since CoD never fired in-vivo, there is no signal to capture beyond the natural cache-hit-rate baseline.

## 3. Pre-registered axes — evaluation status

| Axis | Pre-reg expectation | Observed | Verdict |
|---|---|---|---|
| `per_task_type_thinking_reduction.code_review` | -55% ±15 | NO DATA | UNEVALUABLE |
| `per_task_type_thinking_reduction.bug_diagnosis` | -50% ±15 | NO DATA | UNEVALUABLE |
| `per_task_type_thinking_reduction.planning` | -45% ±15 | NO DATA | UNEVALUABLE |
| `per_task_type_thinking_reduction.research` | -35% ±15 | NO DATA | UNEVALUABLE |
| `per_task_type_thinking_reduction.session_mgmt` | -40% ±15 | NO DATA | UNEVALUABLE |
| `cache_stability.hit_rate_dip_pp` | -2 ±5 | NO DEVIATION OBSERVED (CoD never fired; no signal) | UNEVALUABLE (vacuously held) |
| `cache_stability.eph_1h_adoption` | 95% ±10 | UNAFFECTED (CoD orthogonal to system-prompt prefix) | UNEVALUABLE (vacuously held) |
| `register.violations_per_100_blocks` | 0 ±2 | 0 observed | PASS (vacuously — zero applications means zero possible leaks) |
| `register.leak_marker_pattern` | no `<draft>/<answer>` in output | 0 leaks | PASS (vacuously) |
| `default_route_regression.skip_rule_compliance` | 100% ±0 | 100% (2/2 SKIP_RULE_VIOLATION events both correctly fired in smoke-test) | PASS (on smoke-test-only basis) |
| `quality.rubric_score_min` | 0.95 ±0.03 | NO DATA | UNEVALUABLE |

**Strict reading**: 4 of 11 axes are "PASS" (vacuously — zero invocations means zero failures); 7 are UNEVALUABLE. **No axis returned an effectiveness signal.**

**Honest reading**: the Stage-2 design assumed natural-flow accumulation of 25 reasoning sessions over 14 days. The prefix-tag opt-in interrupted that assumption. The intervention is unproven on Jarvis-class tasks, but also unfalsified.

## 4. What this means

### 4.1 Pre-registration disposition

`pre-registration-phase-2-cod.yaml` is **closed** as of this report with status `STAGE_2_NO_DATA`. `outcome.result_report` field updated to point here; `outcome.closed_at` set to 2026-05-12. The hypotheses are not validated and not invalidated — they are **untested**. Future re-investigation (queued in tail-end of Phase 2 Token Compression workstream) carries the same hypotheses forward but under a different gating mechanism.

### 4.2 The cron-dispatcher-was-wrong-for-CoD framing

Sir's 2026-05-12 directive states "the cron dispatcher is wrong conceptually for CoD token management fundamentally." This is correct and worth naming. CoD is a **per-prompt token-budget intervention** — it shapes the request-shaped surface of every Claude API call by injecting a few-shot brief into the UserPromptSubmit hook chain. The cron dispatcher is the **wrong-tier abstraction** because it operates on the recurring-job timeline (every N minutes), not the per-invocation timeline (every prompt). The Phase D architectural rule that Sir codified for Pulse-Nexus pipeline operations (`dispatcher.sh` = recurring jobs only; all pipeline-state transitions event-driven) applies one tier higher to token-management interventions: they belong on the per-Claude-call event stream (UPS hook is correct), not the cron schedule.

The deployed `cod-inject.sh` UPS hook is *not* the conceptually-broken thing. What's broken is the model that ever produced "deploy CoD via dispatcher cron job" as a candidate. The UPS-as-substrate decision (commit `2de41e5`) was the right architectural call.

### 4.3 Why the right architecture still produced zero data

Two compounding factors:

1. **Prefix-tag opt-in is safety-first, but data-poor.** Eliminating misapplied-CoD risk at the cost of zero accumulation is the wrong tradeoff during a Stage-2 evaluation window. The intended Stage-2 instrumentation (Tasks 2.1.b, 2.2, 2.4.c, 2.5 per pre-registration §"Outcome.reason") never landed — those tasks would have provided automatic task-type detection so the hook fires without prefix-tag opt-in, plus the `usage.thinking_tokens` extractor extension needed to compute the per-task-type reduction axis from real session data.

2. **Pre-deploy task carry-over.** The 4 pending instrumentation tasks were "pending Stage-1 verdict" by their original sequencing. Stage-1 verdict was never written. The cascade stalled the entire evidence-gathering path.

Both are addressable. Both are deferred to the tail-end of Phase 2 work (Token Compression phase) per Sir's directive.

## 5. Actions taken on the basis of this report

- `pre-registration-phase-2-cod.yaml.outcome.status` flipped `STAGE_1_DEPLOYED` → `STAGE_2_NO_DATA`.
- `cod-inject.sh` removed from Jarvis `.claude/settings.json` UPS hook chain (UPS chain unaffected — `jicm-gate.sh` remains as position #1, downstream hooks shift up by one slot). Hook file preserved at `.claude/hooks/cod-inject.sh` as a deployed-but-disabled artifact for future re-enablement during Phase 2 Token Compression work.
- Phase 2 Stage-2 entry in `project-aion-workstream-architecture-2026-05-05.md` §6.3 active-gates table updated to reflect this closure.
- `active-plan` gate `phase-2-cod-stage-2` (earliest_run 2026-05-18) removed; outcome captured in this report.

## 6. Forward path

When Phase 2 Token Compression work resumes per the revised roadmap, the four pending instrumentation tasks become the **entry gate** rather than waiting for verdict-from-existing-data:

1. **Task 2.1.b** — single-line CoD validation against Jarvis tasks (smoke-test extension to real-flow).
2. **Task 2.2** — per-task-type fewshot library authoring (already partially exists at `.claude/skills/token-compression/prompts/cod-examples/`).
3. **Task 2.4.c** — `cache-telemetry-extractor.py` extension for `usage.thinking_tokens` capture (the missing piece that prevented per-task-type reduction axis from being computable).
4. **Task 2.5** — CoD vs baseline benchmark (proper experimental run with n≥5 per task type).

The replacement gating mechanism for in-vivo invocation: **automatic task-type detection** (LLM-classifier or heuristic ensemble on prompt-surface signals) replacing prefix-tag opt-in. This satisfies the per-prompt intervention pattern Sir affirmed while removing the zero-data failure mode.

## 7. Cross-references

- Pre-registration (now closed): `.claude/metrics/token-compression/pre-registration-phase-2-cod.yaml`
- Hook source: `.claude/hooks/cod-inject.sh`
- Skill scripts: `.claude/skills/token-compression/scripts/apply-cod.sh`
- Fewshot templates: `.claude/skills/token-compression/prompts/cod-examples/{code-review,bug-diagnosis,planning,research,session-mgmt}.md`
- Roadmap: `projects/project-aion/reports/token-compression-roadmap.md`
- CoD injection architecture (v1.1.0, decisions frozen): `projects/project-aion/designs/cod-injection-architecture.md`
- Two-stage validation gating pattern: `.claude/context/patterns/two-stage-validation-gating.md`
- Source paper: https://arxiv.org/abs/2502.18600

---

*Stage-2 verdict-from-data report v1.0 — 2026-05-12 — closure per Sir's directive to end Stage Verdict gating and produce reports from data as-is.*
