# Active Implementation Plan
# Last updated: 2026-05-03 (post-JICM-RESUME #5, Phase 2.4 design FROZEN + apply-cod.sh v1.1.0 shipped)
#
# === STEP 4 IN-FLIGHT — Phase 2 CoD prep (Jarvis production) ===
#
# Per User-approved 4-step sequence:
#   1. Phase 0.5 to completion ✓ (prior session)
#   2. JICM v7.9 to completion ✓ (this session: 7.9.6a sensing + 7.9.6b watcher swap shipped; 7.9.6c shim removal queued)
#   3. Phase 0.2 refactor ✓ (this session)
#   4. Phase 2 CoD initial work — IN PROGRESS (this resume cycle)
#
# Phase 2 CoD prep shipped this resume cycle (4 artifacts + 2 docs updated):
#   - .claude/metrics/token-compression/pre-registration-phase-2-cod.yaml
#     FIRST CLEAN pre-deploy pre-registration in family. Per-task-type
#     thinking-token reduction hypothesis (5 task types, brackets ±15pp).
#     Stage-1 PT48H (regression-catch: cache, register, skip-rule compliance);
#     Stage-2 P14D (≥3-of-5 task types meet -50%; quality ≥0.95).
#     Filed BEFORE deployment — methodologically clean (vs Phase 1.1's post-hoc).
#   - .claude/skills/token-compression/templates/chain-of-draft-single-line.txt
#     arxiv-verbatim seed only (~25 tokens). Existing chain-of-draft.txt retained
#     as "full" variant (paraphrased seed + 4 generic few-shots).
#   - projects/project-aion/designs/cod-task-type-taxonomy.md (~10KB)
#     Defines 5 Jarvis task types per roadmap §3 Phase 2.2. Structure-fit theory:
#     code_review (HIGH fit, -55%) > bug_diagnosis (HIGH, -50) > planning (MED, -45)
#     > session_mgmt (MED, -40) > research (LOW, -35). Drives Tasks 2.2 + 2.5.
#   - projects/project-aion/designs/cod-injection-architecture.md (~14KB)
#     Combines Task 14 (routing) + Task 15 (wiring). Recommendation: Option A
#     user-tagged routing (`[task: <type>]` prefix) + Option I/II parallel (UPS
#     hook + per-subagent prepend). Hook design mirrors jicm-gate.sh pattern.
#     detect-phase.sh assessed v0.1.0 stub; not suitable for proactive routing.
#
# DECISIONS (User-confirmed 2026-05-03 ~17:55Z):
#   Q1 — Tag format: prefix-tag [task: <type>] (over frontmatter).
#         Aligns with [JICM-HALT]/[JICM-RESUME] operational-signal convention.
#   Q2 — Subagent CoD: defer to Phase 2.4-bis (gated on Stage-1 CLEAR for
#         main-session). When built, use central agent-prompt-builder
#         (NOT per-agent edits to 12 files). Reasoning: stream isolation for
#         clean Stage-1 verdict; subagent dispatch is dominated by deep-research
#         (LOW CoD fit) and deserves its own pre-registration delta.
#   Q3 — Default opt-in by tag (the tag IS the opt-in mechanism); env var
#         JICM_COD_DISABLED=1 is the emergency kill switch (NOT _ENABLED=1).
#         Reasoning: Stage-1 sample-sufficiency dominates; conservatism is
#         already upstream in the tag requirement; reversibility parity with
#         settings.json hook removal.
#   See cod-injection-architecture.md §8 (v1.1.0) for full reasoning.
#
# SHIPPED THIS RESUME (Phase 2.3.a + architecture freeze):
#   - cod-injection-architecture.md → v1.1.0 (3 edits: §8 decisions, §3.4 env
#     var check, §6 phasing-table 2.4-bis row)
#   - apply-cod.sh → v1.1.0 (--task-type / --variant flags; Layer-1 skip-rule
#     enforcement with exit 3; helpful fewshot-not-authored fallback message;
#     metrics log gains task_type + variant fields; backward compat preserved)
#   - 6/6 smoke tests pass: backward-compat, single-line resolution, fewshot
#     helpful-fail, 2× skip-rule rejection (arithmetic + code-generation),
#     bogus variant rejection
#
# Suggested commit (Jarvis production):
#   feat(token-compression): Phase 2.4 prep — apply-cod.sh v1.1.0 (--task-type
#   / --variant + skip-rule enforcement) + architecture v1.1.0 (decisions frozen)
#
# Phase 2 next steps (frozen design):
#   - Task 2.1.b: apply single-line CoD to 5 reasoning sessions; baseline capture
#     (autonomous; uses apply-cod.sh --task-type <X> --variant single-line)
#   - Task 2.4.a: cod-inject.sh UPS hook ✓ SHIPPED (this session, 2026-05-03 ~17:10Z)
#     - .claude/hooks/cod-inject.sh (7878B, 0755, mirrors jicm-gate.sh structure)
#     - Anchored prefix-tag regex `^\[task: ([a-z_-]+)\]` (architecture §8 Q1 frozen)
#     - JICM_COD_DISABLED=1 emergency kill switch (architecture §8 Q3 frozen)
#     - Layer-1 skip-rule short-circuit (arithmetic | code-generation |
#       creative-writing | tool-use-heavy → empty additionalContext + log line)
#     - Template resolution: prompts/cod-examples/<type>.md (fewshot variant) →
#       fallback to templates/chain-of-draft-single-line.txt (single-line variant)
#     - Extension-aware comment-stripping for .txt templates (awk leading-header
#       filter); .md emitted verbatim (markdown headers in body are signal)
#     - Per-event log: .claude/logs/cod-inject.log (rotated at 100KB)
#     - bash -n syntax OK; smoke tests 14/14 PASS across 7 cases
#       (skip-rule violation, valid tag with single-line fallback, untagged,
#       kill switch, malformed stdin, frontmatter rejected, leading-whitespace rejected)
#   - Task 2.4.b: cod-inject.sh registered in settings.json UPS chain ✓ SHIPPED
#     (User-authorized 2026-05-03; STAGE-1 DEPLOYED 2026-05-04T00:09:29Z)
#     - jq-inserted at index #2 (immediately after jicm-gate.sh, before
#       pre-clear-context-prep.sh + 8 other UPS hooks); UPS chain now 11 entries
#     - JSON jq-validated; no `bash` prefix (matches jicm-gate.sh shebang convention)
#     - Backup: .claude/settings.json.pre-cod-deploy-2026-05-03 (9226B → 9351B)
#     - Pre-reg sealed with deploy_timestamp=2026-05-04T00:09:29Z;
#       Stage-1 earliest_run=2026-05-06T00:09:29Z (deploy + PT48H);
#       Stage-2 earliest_run=2026-05-18T00:09:29Z (deploy + P14D)
#     - deploy_commit will be sealed in follow-up chore commit (hash unknown until commit creation)
#   - Task 2.4.c: extend cache-telemetry-extractor for usage.thinking_tokens ✓ SHIPPED
#     (this session, post-Stage-1-deploy)
#     - cache-telemetry-extractor-v2.py → v2.1; 4 new columns:
#       thinking_block_count, thinking_chars, thinking_tokens_est, output_tokens_visible_est
#     - usage.thinking_tokens is NOT exposed by Opus 4.X 1M API; counts characters in
#       message.content[].type=="thinking" blocks instead. thinking_tokens_est = chars // 4
#       (constant cancels in relative comparison)
#     - Validated: 140 turns from current session, 37 with thinking, 8,634 thinking_tokens_est
#       (~3% of 304K total output)
#   - Task 2.2: 5 per-task-type fewshot files ✓ SHIPPED (this session)
#     - prompts/cod-examples/{code-review,bug-diagnosis,planning,research,session-mgmt}.md
#     - Each self-contained: seed + format + Jarvis-shaped exemplar
#     - Token weights: 284-393 tokens via cod-inject.sh (12-17× heavier than single-line)
#     - Hook now resolves to fewshot variant for tagged prompts; verified via smoke test
#   - Task 2.1.b: pre-CoD baseline thinking-token distribution captured ✓ STRATIFIED COMPLETE
#     - v1.0 report: .claude/metrics/token-compression/phase-2-1-b-baseline-2026-05-03.md
#       (54 sessions × 14d, 34,334 turns, 796 substantive thinking turns;
#        analysis-class pooled: median=328 thinking_tokens_est; IQR=204-555)
#     - v1.1 stratified supplement: .claude/metrics/token-compression/phase-2-1-b-baseline-stratified-2026-05-04.md
#       (40 sessions classified across 5 task types, 790 substantive turns;
#        per-task-type medians: code-review=448, bug-diagnosis=335, planning=309,
#        research=285, session-mgmt=334; Stage-2 -50% targets pre-computed and frozen)
#     - Stratified stats JSON: .claude/scratch/phase-2-1-b/stratified-stats-2026-05-04.json (gitignored)
#     - Corpus CSV: .claude/scratch/phase-2-1-b/baseline-corpus-2026-05-03.csv (gitignored, 4.3MB)
#     - Methodological note: code-review (3 sessions / 47 turns) + research (4 / 92) under-sampled at session
#       level but per-turn coverage robust; per-turn is the actual stat unit per pre-reg
#     - Notable finding: code-review baseline median (448) materially elevated vs other 4 types (285-335);
#       aligns with taxonomy doc's "structured-checklist" CoD-fit prediction
#     - Open follow-up (NOT a Stage-2 blocker): re-estimate code-review/research baselines if more sessions
#       accumulate before 2026-05-18 verdict; document re-estimation timestamp, do not silently overwrite
#   - Stage-1 verdict draft due 2026-05-06T00:09:29Z (regression-catch axes only:
#     cache_hit_rate_dip_pp ≤ 5; eph_1h_adoption ≥ 80%; register_violations ≤ 5/100;
#     skip_rule_compliance = 100%)
#   - Stage-2 verdict draft due 2026-05-18T00:09:29Z (formal sign-off:
#     ≥3 of 5 task types meet -50% thinking-token reduction; quality ≥ 0.95)
#   - Task 2.4-bis (gated on STAGE_1_CLEAR for main-session): central
#     agent-prompt-builder for subagent CoD; own pre-registration delta
#   - Task 2.2: 5 per-task-type fewshot files (CONDITIONAL on Task 2.1.b
#     showing single-line misses ≥50% / ≥0.95 quality gate)
#   - Phase 1.1 Stage-2 PASS gate (2026-05-15) → unblocks Task 2.5 benchmarking
#
# === STEP 2 (HISTORICAL) — JICM v7.9 to completion ===
#
# Phases COMPLETE this session (Jarvis-Dev /Users/nathanielcannon/Claude/Jarvis-Dev/):
#   7.9.0  baseline doc + Stop-hook probe ✓ (.claude/metrics/jicm/v7-9-baseline-2026-05-02.md)
#   7.9.1  hook layer ✓ (jicm-gate.sh, jicm-stop.sh, jicm-precompact.sh, session-start.sh patch,
#          jicm-state-update.sh; settings.json wired; T1/T2/T3 PASS)
#   7.9.2  pluggable injection-backend interface ✓
#          - .claude/scripts/jicm-inject.sh (dispatcher, JICM_INJECTION_BACKEND env)
#          - .claude/scripts/jicm-inject-tmux.sh (4-entry tmux backend; mirrors v7
#            jicm-watcher.sh:307-322; capture-pane fix: strip trailing blanks via awk
#            so tail -N returns content, not viewport padding)
#          - .claude/scripts/jicm-inject-pty.sh (placeholder; exits 2 in v7.9)
#          - .claude/scripts/dev/test-inject-backend.sh (PTY: PASS, tmux: 4/4 PASS)
#          NOTE: scratchpad's prior "User REJECTED" claim was incorrect — the writes
#          succeeded; only validation was outstanding, now done.
#   7.9.3  slim watcher rewrite ✓
#          - .claude/scripts/jicm-watcher.sh: 1559 lines / 55KB → 171 lines / 6726B
#          - 0 direct send-keys calls; 0 direct capture-pane code (1 grep hit is the
#            header comment only). All injection via jicm-inject.sh.
#          - .claude/scripts/jicm-watcher-legacy.sh preserved (55321 bytes, 1559 lines)
#          - .claude/scripts/jicm-config.sh NEW (4008B; v7.9 signal protocol additions:
#            JICM_STATE_HOOK_FILE, JICM_CLEAR_SIGNAL, JICM_RESUME_SIGNAL; token-primary
#            thresholds JICM_SOFT_TOKENS=300000, JICM_HARD_TOKENS=650000)
#          - Singleton guard via PID file; trap cleanup on EXIT/INT/TERM
#          - Bash syntax check OK; runtime smoke test deferred to 7.9.5 harness
#   7.9.4  status line v7.9 ✓
#          - .claude/scripts/jarvis-statusline-v8.sh patched: reads soft/hard token
#            thresholds from state, derives pct for display (User encoding directive)
#          - Model-id formatter bug fixed: [1m] glob class issue → escaped to \[1m\]
#            so "opus-4-7[1m]" renders as "opus-4-7·1M" not "opus-4-7[1m]·1M"
#          - 9 panels render: WATCHING/SOFT_NUDGE/HARD_HALT color-coded
#          - Graceful fallback when state file absent (defaults: WATCHING, 30%/65% ticks)
#          - settings.json statusLine block already points to script; no change needed
#
#   7.9.5  Stage-1 harness PATCHED (run #1 found test-design flaw; fix applied)
#          - .claude/scripts/dev/jicm-v7-9-stage-1-harness.sh (executable, syntax OK)
#            * Modes: --list, --verdict-only, T<n> selection, default-all
#            * T1 baseline state-write / T2 SOFT nudge / T3 HARD halt / T4 watcher
#              actuation / T5 malformed-stdin defensive
#          Stage-1 run #1 (2026-05-02 ~18:56Z): 2/5 PASS (T4, T5).
#            T1/T2/T3 FAIL — test-design flaw, NOT impl flaw. The gate hook's
#            JSONL parser correctly returns tokens=0 / model_id="" on the first
#            UPS of a fresh session because no `type:"assistant"` entry exists
#            yet. Single-prompt tests therefore can never satisfy the
#            threshold-bearing conditions. T4 PASS confirms watcher mechanics
#            are sound; T5 PASS confirms defensive stdin path works.
#          Fix v1 (2026-05-02 evening):
#            * +wait_for_assistant_turn() helper (polls JSONL for type=="assistant")
#            * +wait_for_state_condition() helper (polls state for arbitrary jq filter)
#            * +warmup_session_and_send() helper ("Hi" warmup → wait → test prompt)
#            * T1/T2/T3 refactored to use warmup pattern; verification switched
#              from wait_for_file+jq -e to wait_for_state_condition (catches the
#              SECOND state write, not the warmup's tokens=0 write)
#            * T3 clear-signal timeout 60s → 90s (absorbs Claude response latency)
#          Stage-1 run #2 (2026-05-03 ~01:40Z): 4/5 PASS (T1/T2/T4/T5); T3 FAIL.
#            T3 verdict: gate_ok=0 stop_ok=0; state still showed warmup's
#            tokens=0 / model_id="" — same shape as run #1 failure but
#            different root cause. Diagnosis from T3 session JSONL:
#            in Jarvis-Dev workspace, the warmup "Hi" prompt triggers
#            AC-01 autonomic behavior (Claude reads session-state.md,
#            current-priorities.md, runs git log, git status — multiple
#            tool_use loops before end_turn). Claude Code TUI QUEUES
#            prompts that arrive during a tool loop instead of firing
#            UserPromptSubmit; the queued test prompt eventually executed
#            but only AFTER the harness's 30s+90s timeouts elapsed.
#            T1/T2 run #2 also did AC-01 work but happened to finish
#            faster — the bug was always present, racing.
#            wait_for_assistant_turn was the wrong predicate: it returns
#            on the FIRST assistant entry (typically a tool_use), not on
#            full turn completion.
#          Fix v2 (2026-05-03 ~01:30Z, this session):
#            * +wait_for_idle() helper — polls JSONL until last assistant
#              entry's stop_reason ∈ {end_turn, stop_sequence, max_tokens}.
#              180s timeout (AC-01 in Jarvis-Dev can take 30-90s).
#            * warmup_session_and_send: replaced wait_for_assistant_turn
#              call with wait_for_idle. wait_for_assistant_turn helper
#              retained as a building block but no longer used in flow.
#            * Validated against T3's actual failed-run JSONL:
#              jq returns "end_turn" → wait_for_idle would have returned
#              0 → test prompt would have fired AFTER AC-01 completed.
#            * Updated USAGE comment: warmup ~50-150K tokens (full AC-01
#              work). Total Stage-1 ~$0.50-1.00 (was ~$0.30-0.60).
#            * bash -n syntax OK; 429 → 458 lines.
#          - .claude/metrics/jicm/v7-9-stage-1-result-template.md (verdict format docs)
#          - .claude/scratch/jicm-v7-9-test-runs/ directory (per-test JSON output)
#          - Verdict tag rendered automatically: STAGE_1_CLEAR / HALT / INCOMPLETE
#          AWAITING: User-driven re-run #3 to confirm STAGE_1_CLEAR (5/5 PASS).
#
# Phase 7.9.6 — SPLIT (per User decisions on 2026-05-03):
#
#   7.9.6a Production deploy of sensing layer (Approach B) — SHIPPED 2026-05-03T03:25Z
#          Stage-1 STAGE_1_CLEAR (5/5 PASS, run #3) confirmed by User ~02:00Z.
#          Hooks + statusline + session-start.sh resume-signal patch deployed.
#          v7.3 watcher untouched; sensing layer write-only-observation.
#          Files (full paths in scratchpad ~03:35Z entry):
#            - .claude/hooks/{jicm-gate,jicm-stop,jicm-precompact}.sh
#            - .claude/scripts/{jarvis-statusline-v8,jicm-state-update}.sh
#            - .claude/settings.json (statusLine + 4 hook insertions, jq-validated)
#            - .claude/hooks/session-start.sh (line 417 resume-signal patch)
#          Backups: settings.json.pre-v7-9-2026-05-03, session-start.sh.pre-v7-9-2026-05-03
#          Baseline: .claude/metrics/jicm/v7-9-stage-2-baseline-2026-05-03.md
#          Production commit: 57cb3ed (Jarvis Project_Aion).
#
#   7.9.6b Watcher swap (v7.3 → v7.9 slim) — SHIPPED 2026-05-03T04:46Z
#          User authorized Stage-2 demotion (gate → passive data-gathering)
#          and Approach C cutover (back-compat shim on slim watcher).
#          Approach C shim (Jarvis-Dev jicm-watcher.sh, 171→187 lines):
#            v73_shim_write_state() helper at line 100. Three call sites:
#              - Line 146: state=CLEARING before /clear injection
#              - Line 163: state=RESTORING before RESUME injection
#              - Line 172: state=WATCHING after cycle cleanup
#            Shim writes minimal `state: %s\ntimestamp: %s\nv79_shim: true\n`.
#          Production cutover sequence (this session):
#            - Backed up v7.3 → jicm-watcher-legacy-v7-3.sh (57574B)
#            - Backed up v7.3 config → jicm-config.sh.pre-v7-9b-2026-05-03 (2340B)
#            - Copied 5 v7.9 files: jicm-watcher.sh (slim+shim, 7807B),
#              jicm-config.sh (4008B), jicm-inject.sh, jicm-inject-tmux.sh,
#              jicm-inject-pty.sh
#            - Killed v7.3 PID 78594 (Ctrl+C → trap → PID file cleaned)
#            - Recreated tmux W1 with new-window; launched slim watcher
#            - Slim watcher PID 74731; log: "watcher v7.9 started",
#              "main loop (poll 1s, target jarvis:0, backend tmux)"
#
#   7.9.6c Remove Approach C back-compat shim — DEFERRED
#          Trigger: operational confidence (a few clean JICM cycles end-to-end
#          on slim watcher). Required before v8.0 to avoid carrying
#          back-compat baggage into the new architecture.
#          Scope:
#            1. Remove v73_shim_write_state() from jicm-watcher.sh
#            2. Re-gate session-start.sh on .jicm-clear-now.signal
#               (production line ~358 currently gates on .jicm-state state=CLEARING)
#            3. Retire .jicm-state file; remove from jicm-prep-context.sh
#               telemetry reads (lines 759-761)
#
# Stage-2 14d passive observation (DEMOTED to data-gathering):
#   Window: 2026-05-03T03:25Z → 2026-05-17T03:25Z
#   Role: informs v8.x design (e.g., unify .jicm-state + .jicm-state-hook.json?)
#   NOT a gate on 7.9.6b (SHIPPED) or 7.9.6c (gated on operational confidence)
#   Verdict doc target: .claude/metrics/jicm/v7-9-stage-2-result-2026-05-17.md
#
# Suggested commits (Jarvis-Dev side):
#   1. feat(jicm): v7.9 hook layer + backend abstraction + slim watcher + status line + Stage-1 harness
#      (already committed earlier; covers 7.9.0-7.9.5 v0)
#   2. fix(jicm-harness): warmup-prompt + assistant-turn polling so T1-T3 see populated JSONL
#      (covers fix v1 — incomplete; T3 still raced AC-01 queueing)
#   3. fix(jicm-harness): wait_for_idle (end_turn) so AC-01 autonomic work completes before test prompt
#      (THIS session — covers fix v2; resolves T3 queue race)
#
# === PHASE 0.5 BUNDLED EXECUTION — COMPLETE (prior session, pre-HALT) ===
#
# Per User-confirmed 4-step approved sequence (recorded in scratchpad):
#   1. Phase 0.5 to completion (THIS SESSION) ✓
#   2. JICM v7.9 to completion (Stage-1 deploy="complete"; Stage-2 14d passive)
#   3. Phase 0.2 refactor to leverage .jicm-state-hook.json
#   4. Phase 2 CoD initial work (2.1-2.4 prep; 2.5 gated on Phase 1.1 Stage-2 PASS)
#
# Phase 0.5 deliverables (ALL SHIPPED this session):
#   (a) Pipeline-telemetry extractor (Jarvis side):
#       .claude/skills/token-compression/scripts/pipeline-telemetry-extractor.py
#       19KB, 24-col CSV, engine-aware NULL handling, smoke-tested against
#       aifred-dev-postgres (35 rows from 7 closed tasks; classes
#       tool_only=7/brief=19/interactive=7/analysis=2; engines all ollama).
#   (b) Reviewer Claude-CLI route (AIFred-Pro-Dev side):
#       .claude/jobs/services/reviewer.py — +127/-16 lines, mirrors
#       executor.py:425-510 pattern. Default Ollama, opt-in Claude-CLI via
#       metadata.review_engine == "claude-cli" or REVIEW_ENGINE env.
#       Deployed at af73a46 on davidmoneil/AIFred-Pro:nate-dev.
#   (c) Phase 1.3.5 pre-registration:
#       .claude/metrics/token-compression/pre-registration-phase-1-3-5-reviewer-claude-route.yaml
#       deploy_commit=af73a46, deploy_timestamp=2026-05-02T23:04:12Z.
#       Stage-1 earliest_run=2026-05-04T23:04:12Z, Stage-2=2026-05-16T23:04:12Z.
#       New axis: cost_per_review_usd (Phase 1.3.5 introduces billable code path).
#   (d) David debrief — comprehensive project status:
#       Shared_Projects/Debriefs/AIFred-Pro/2026-05-02-pipeline-v2-and-token-compression-progress.md
#       Covers Pipeline v2, token-compression initiative, JICM v8, two-stage
#       gating, Project_Aion architecture, replace-or-evolve framing.
#
# Suggested commits (User pre-approved in scratchpad):
#   Jarvis side:        feat(token-compression): Phase 0.5 pipeline-telemetry extractor + Phase 1.3.5 pre-reg + David debrief
#   AIFred-Pro-Dev:     feat(reviewer): add Claude-CLI route mirroring executor pattern (token-compression Phase 1.3.5)
#   AIFred-Pro-Dev side already committed at af73a46 this session.
#
# === STEP 2 NEXT — JICM v7.9 to completion ===
#
# JICM v8 PORTABLE ARCHITECTURE — Jarvis-Dev PROTOTYPE COMPLETE (prior session, post-HALT resume).
#   Design doc: projects/project-aion/designs/jicm-portable-architecture.md (v1.0)
#   Audit doc: .claude/context/designs/jicm-v7-audit-2026-05-01.md
#   Prototype artifacts (Jarvis-Dev, ALL 0755):
#     - .claude/hooks/jicm-gate.sh (UserPromptSubmit; soft 30% nudge + hard 65% block)
#     - .claude/hooks/jicm-precompact.sh (PreCompact adjunct; sync prep before native compact)
#     - .claude/scripts/jarvis-statusline-v8.sh (NEW; 9 panels reading .jicm-state-hook.json)
#     - .claude/settings.json (UPDATED; statusLine + gate first in UPS + precompact 3rd in PreCompact)
#   JSON validated via jq -e.
#   AWAITING: User-driven validation in fresh Claude Code session at /Users/nathanielcannon/Claude/Jarvis-Dev/
#     Test 1: prompt → verify .claude/context/.jicm-state-hook.json written
#     Test 2: JICM_SOFT_PCT=1 prompt → verify SOFT_NUDGE additionalContext appears, .jicm-nudge-shown sticky flag set
#     Test 3: JICM_HARD_PCT=2 prompt → verify HARD_HALT decision:block with /clear instruction
#   Two-stage gating per pattern: Stage 1 (regression-catch on Jarvis-Dev, hours-48h) → Stage 2 (formal sign-off, 7-14d) → promote to Jarvis production.
#   Suggested commit: feat(jicm): v8 portable architecture (design + audit + Jarvis-Dev prototype)
#
# LOCAL MODEL SUITE 2026-Q2 — 5 deep-research agents IN FLIGHT (background; launched 13:42 MDT).
#   Targets:
#     .claude/scratch/models-vision-2026-q2.md
#     .claude/scratch/models-language-2026-q2.md
#     .claude/scratch/models-embeddings-2026-q2.md
#     .claude/scratch/models-image-gen-2026-q2.md
#     .claude/scratch/models-genomics-2026-q2.md
#   Already complete (pre-HALT): .claude/scratch/models-audio-video-2026-q2.md
#   Synthesis target on completion: projects/project-aion/designs/local-model-suite-2026-q2.md
#
# Two-stage validation gating PATTERN — COMPLETE (earlier this session).
#   Created: .claude/context/patterns/two-stage-validation-gating.md (v1.0.0)
#   Strictness: Recommended (applies to dev work with measurable behavioral effect)
#   Source: token-compression-experimental-design.md §10.4 generalized per User directive
#   Wired into:
#     - patterns/_index.md (Testing & Validation section; total now 52)
#     - psyche/capability-map.yaml (patterns block: pattern.two-stage-gating)
#     - psyche/nous-map.md (Validation category, notable-entry callout)
#     - patterns/milestone-review-pattern.md (composition section + v1.3.1 footer)
#     - patterns/self-evolution-pattern.md (core-principle step 6 references the gate)
#   Cross-references intact; ready to commit (User has not yet requested commit).
#
# Phase 3 JICM compression — STATUS CORRECTION (per scratchpad discovery):
#   Earlier "starter at compress-input.py — not wired" claim was STALE.
#   Phase 3.1 (NLP preprocessing) and Phase 3.3 (compression metrics) are
#   ALREADY SHIPPED and wired into jicm-prep-context.sh:412-439.
#   NLP_COMPRESS=true default. Last cycle metric: ratio 1.0 (input was
#   already de-duplicated structured prose).
#   REMAINING Phase 3 work:
#     - 3.2 Signal notation (NOT done; gate on 3.4 validation result)
#     - 3.4 Validation across 5 cycles (PENDING)
#   Phase 3 work is paused while Two-Stage Gating pattern was generalized.
#
# Token-compression Phase 1.1 (Jeeves-Brief) — INCOMPLETE under new protocol.
#
# Run report:
#   .claude/metrics/token-compression/phase-1-1-jeeves-brief-result-2026-05-01.md
# Pre-registration:
#   .claude/metrics/token-compression/pre-registration-phase-1-1-jeeves-brief.yaml
# (filed post-hoc, methodologically noted)
#
# Result under experimental-design protocol:
#   - Cache stability: PASS (Δ -1.93pp, within ±5pp; eph_1h adoption 100%)
#   - Register: PASS post-manual-review (raw 2/99 = 2.02/100 FAIL; both
#     hits are false positives — meta-mentions in quoted illustrative examples)
#   - Per-class brevity: PARTIAL on all 6 classes — zero ordinary post-deploy
#     sessions exist; all 3 post-deploy sessions tagged atypical_analysis
#     (and other classes); brevity comparison cannot be performed yet.
#   - Overall: INCOMPLETE
#
# Decision: HOLD. Do NOT promote to Phase 2. Sample window remains open for
# 3 ordinary post-deploy sessions per pre-registration sample_targets.
#
# Phase 0.3 extractor v2: COMPLETE
# Phase 0.4 quote-aware register filter: COMPLETE (commit 43adc5d).
# strip_quoted_for_register() strips fenced code, inline backticks, and
# double-quoted spans (ASCII + smart) before pattern matching. Validated:
# corpus-wide violations 636 → 608; targeted check 94c8971e turn 182 went
# 2 → 0; class shares unchanged. Manual-review burden eliminated for
# future register evaluations.
#
# Methodology going forward:
#   projects/project-aion/reports/token-compression-experimental-design.md
#   - §7.3 ordinariness placeholders updated with measured values
#     (interactive 27.01% replacing ~17%; code_dump 0.61% replacing ~9%)
#   - All future runs use this protocol
#
# Other token-compression Phase status:
#   Phase 0.2 cache telemetry capture: COMPLETE
#   Phase 0.3 extractor v2: COMPLETE
#   Phase 0.4 quote-aware register filter: COMPLETE
#   Phase 0.5 pipeline-telemetry extractor: COMPLETE (this session, 2026-05-02)
#     Smoke-tested against aifred-dev-postgres: 35 rows from 7 closed tasks,
#     intent-class distribution clean (tool_only=7, brief=19, interactive=7,
#     analysis=2), service routing consistent across 5 services per task.
#     Unblocks Phase 1.2/1.3 Stage-1/Stage-2 evaluation.
#   Phase 1.1 Jeeves-Brief: INCOMPLETE (Stage-1 interim 2026-05-03; Stage-2 formal 2026-05-15)
#   Phase 1.5 Alfred-Brief: SETUP COMPLETE — first clean pre-reg in family
#     (Stage-1 interim 2026-05-03; Stage-2 formal 2026-05-15)
#   Phase 1.2 Pipeline Executor Brief: PRE-REG FILED (post-hoc) — Stage-1/Stage-2 NOW UNBLOCKED via Phase 0.5
#   Phase 1.3 Pipeline Reviewer Brief: PRE-REG FILED (post-hoc) — Stage-1/Stage-2 NOW UNBLOCKED via Phase 0.5
#   Phase 1.3.5 Reviewer Claude-CLI Route: DEPLOYED 2026-05-02T23:04:12Z (af73a46)
#     PRE-REG FILED. New axis: cost_per_review_usd. Default Ollama, opt-in
#     Claude-CLI via metadata.review_engine. Stage-1 2026-05-04, Stage-2 2026-05-16.
#
# Two-stage gating (design doc §10.4):
#   Stage 1 (deploy+48h): regression-catch only (cache, register). NOT a
#     Phase-2 promotion gate. Unblocks orthogonal-stream work (Phase 2
#     CoD, Phase 3 JICM, Phase 5 dashboard) per §4.7 stacking rules.
#   Stage 2 (deploy+14d): formal pre-reg sign-off including per-class
#     brevity verdicts. THIS gates Phase 2 promotion.
#   Rollback semantics: parallel orthogonal-stream work survives Phase 1.x
#     rollback — only same-stream interventions must roll back together.
#   Phase 1.5 / 1.2 / 1.3: deployed on AIFred-Pro-Dev:nate-dev; can now
#     run under new protocol immediately (Phase 1.5 first clean run).
#   Phase 2 CoD: BLOCKED on Phase 1.1 full sign-off
#   Phase 3 JICM compression: starter at .claude/scripts/compress-input.py — not wired
#   Phase 4 pipeline COMPRESSION_MODE: not started
#   Phase 5 dashboard: scaffolding committed AIFred-Pro-Dev 8ee3f37; router not wired
#
# Reference plans:
#   projects/project-aion/reports/token-compression-implementation-guide.md
#   projects/project-aion/reports/token-compression-roadmap.md
#
# Background reminders still active:
#   trig_01EtBi9X7q42owtUCWzmSgLH (remote, 2026-05-04T03:00:00Z)
#   com.aion.token-compression-reminder (launchd, 2026-05-03 09:00 MDT)
# Both will check sample sufficiency on next firing.
#
# === LOCAL AGENT SCHEDULE ===
# Suggested local agent workflows (in lieu of /schedule routines) are queued at:
#   .claude/context/local-agent-schedule.md
#
# AC-01 should consult this doc on session start: any item with
# earliest_run ≤ now AND status == PENDING transitions to READY automatically.
# Current queue (as of 2026-05-02T22:35:00Z):
#   - READY    Phase 0.4 quote-aware register filter for extractor v2
#   - READY    Phase 1.5 Alfred-Brief first clean pre-registered run
#   - PENDING  Phase 1.3.5 Stage-1 verdict draft  (earliest_run 2026-05-04T23:04:12Z)
#              Action: run pipeline-telemetry-extractor.py against --source dev
#              with --since 2026-05-02T23:04:12Z, filter to service=review, write
#              Stage-1 verdict report at .claude/metrics/token-compression/
#              phase-1-3-5-reviewer-claude-route-stage-1-2026-05-04.md.
#              Axes per pre-reg: cache_hit_rate_dip_pp, eph_1h_adoption_min_pct,
#              register_violations_per_100_blocks_max, default_route_regression.
#   - PENDING  Phase 1.1 sample-sufficiency check  (2026-05-15T15:00:00Z)
#   - PENDING  Phase 1.3.5 Stage-2 formal sign-off  (earliest_run 2026-05-16T23:04:12Z)
#   - BLOCKED  Phase 1.1 final analysis  (gated on 3 ordinary sessions)
