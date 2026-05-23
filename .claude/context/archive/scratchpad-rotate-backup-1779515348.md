# Scratchpad — Short-Term Working Memory

**Purpose**: Transient details needed within this session or the next 1-2 sessions. Force-loaded via CLAUDE.md. Survives /clear and JICM compression.

**Rules**:
- Write here for: credentials locations, active paths, custom functions, transient gotchas, session-specific commands
- Do NOT write here for stable facts (use MEMORY.md) or work progress (use session-state.md)
- Entries should have dates; prune when stale (AC-08 maintenance + scratchpad-rotate hook)
- **Keep under 80 lines (~2K tokens) to limit force-loaded token cost.** Older entries auto-rotate to `archive/scratchpad-YYYY-MM-DD.md`.

---

## Active Notes

_(Older entries auto-rotated to /Users/nathanielcannon/Claude/Jarvis/.claude/context/archive/scratchpad-2026-05-16.md on 2026-05-16T22:31:56Z.)_

### 2026-05-18 — Phase 2C Memory wiring 7/7 LANDED
Committed `4f4724a` (+ follow-ons `a508cc1`, `0952fa7`, `aaf720c`) pushed to origin/main. Watcher PID 13001 running new code. Detail: session-state.md + commit log. Design: `projects/project-aion/designs/current/memory-system-wiring-v2-2026-05-16.md`.

### 2026-05-18/19 — Phase 2 CoD experiment status

**HEADLINE** (preliminary, n=3 paired Jarvis, n=21 paired math): CoD sign-flips. Math: −22% text / −30% thinking (compression). Jarvis (single_line): **+67% text / −100% thinking** — thinking-block suppressed, output inflated. Full writeup: `.claude/scratch/phase-2-stage-2-rerun/CALIBRATION-FINDINGS-v2.md`.

**Key methodological discovery**: `claude -p --output-format stream-json --include-partial-messages --verbose` exposes thinking vs text content[] blocks separately; cl100k_base tokenizer gives per-block token estimates.

**Scheduler bug**: harness concurrency=4 partitioned v2 baselines vs comparisons across sonnet/opus → 0 strict within-model pairs in 20-cell sample. Completing v2 should fix.

**Progress checklist**:
- [x] `harness/analyze.py` written (strict+pooled pairing)
- [x] `CALIBRATION-FINDINGS-v2.md` written (supersedes v1)
- [ ] calibration-v2 completion (30 more cells, deferred per Sir; ~$3-5)
- [ ] pre-registration revision (`pre-registration-phase-2-cod.yaml`)
- [ ] roadmap §3 revision

### 2026-05-23 — v5 cache-mechanics in flight, v4 article corrected

**v4 article** (`projects/project-aion/reports/claude-code-cache-mechanics-2026-05-22.md`, 940+ lines): substantial post-hoc correction landed. Unit bug (×100 fraction→percent), metric reframe (%Usage > time > tokens > $), Arms restructured around RQ pairs (A-vs-B, C-vs-D, E-vs-F), new §3.2.1 (authoritative quota signal), new §5.4 (unified rate-limit headers + status transitions), plots refreshed (9 plots, professional polish, new plot 09 status-timeline pulled from proxy DB). UNCOMMITTED. v4 §4.3 TTL finding now SUSPECT — see v5 G below.

**Alfred-Dev dashboard** `bab577a` COMMITTED on `feature/personas-rebuild`. UsagePage.tsx refactor (tiered y-axis + through-origin regression + y=x sustainable line). NOT PUSHED.

**v5 design** at `projects/project-aion/designs/current/cache-mechanics-v5-arm-redesigns.md`. Three arm redesigns (G/E-F/H). Sir-approved.

**v5 G (TTL multi-probe)**: prime fired 00:08:51Z (sid 94a7e5c4-016b-4b42-86d2-fef3b6a78f67). T+1 probe used --resume --fork-session = WRONG DESIGN. Probe miss expected REGARDLESS of TTL because prefix-mismatch (probe sends prime+response+probe vs prime's prefix). v4's §4.3 finding has the same flaw. SCRIPT FIXED for fresh-call probes (.claude/scripts/cache-mechanics-v5-arm-g.py:cmd_probe, no --resume/--fork-session). Manual test confirmed: fresh `claude -p PRIME_PROMPT` returns cache_read=26,673 (boilerplate + partial commit). 4 remaining probes (T+5/25/55/65) DEFERRED to next window. Re-prime needed.

**v5 E/F (strip-effect)**: started, STOPPED at ~50% completion due to cost overrun. M-D mode default-prompt responses verbose without max_tokens cap; cells ran ~$0.7-1.2 vs estimated $0.18. Need: add max_tokens limit + tighter prompts before re-run. Partial cells visible in proxy DB (timestamp 00:10:30-00:14:05).

**v5 H (context preservation)**: NOT STARTED, deferred to next window.

**Empirical IDE-vs-experiment burn rates (proxy DB, 2026-05-22 to 23):**
- **Pure IDE work** (audit + plot rewrite + design doc, 22:00→00:08:51Z, 130min): 17% → 54% util = **0.28%/min sustained**. 49 heavy turns ($0.58 avg, 98.8% cache_read), 32 short calls ($0.39 avg). 81 calls, $42 total.
- **IDE + claude -p experiments** (v5 period, 00:08:51→00:25Z, 16min): 54% → 85% util = **1.94%/min sustained**. 30 experiment cells ($0.91 avg, 62% of cost) + 20 IDE turns ($0.72 avg, 33%) + 18 short calls ($0.12 avg, 5%). ~$44 total.
- **Ratio**: scripted `claude -p` mixed work burns ~7× faster than pure IDE. Article §5.4/§5.6 should report both regimes.

**Quota state**: 85% / `allowed`. ~11pp to allowed_warning. Window resets 2026-05-23T02:20Z (~20:20 local tonight).

**Resume protocol (next window)**:
1. Re-prime G v5 with fresh-call design (already in script); schedule 5 background probes
2. Modify cache-mechanics-v5-strip-effect.py: add tight output constraints + max_tokens — re-run E/F
3. Run H v5 (script not yet written — see design doc for spec)
4. Aggregate v5 data; integrate into article §4.3, §4.4, §4.5
5. Commit v4 article + v5 harness + all plots; push Project_Aion → origin/main
6. Push Alfred-Dev nate-dev/feature-personas-rebuild dashboard commit upstream

### 2026-05-19 → 2026-05-21 — Token-compression + cache-mechanics investigation COMPLETE & COMMITTED

**Canonical docs (tracked)**:
- `projects/project-aion/reports/token-compression-and-quota-mechanics-debrief-2026-05-19.md` — original consolidated debrief (5 findings) + 2026-05-21 amendment header pointing forward to v3
- `projects/project-aion/reports/fork-cache-validation-v3-findings-2026-05-21.md` — v3 redesign + 6 findings; **canonical for cache mechanics**

**v3 supersedes v2 fork-cache claims**: v2's identical-prompt design conflated prefix-key cache with session inheritance. v3 (4 arms × 3 repeats = 57 cells, $8.98, 7m13s) discriminates them cleanly.

**Most actionable v3 finding**: **extend-then-fork** pattern. For N parallel sub-jobs from a parent, run ONE `--resume` extension on the parent first, THEN fork all N children via `--fork-session`. Empirical (Arm D vs Arm C): forks after a resume-extended parent cost $0.03 each; forks of an unextended parent cost $0.25 each. ~8× cheaper per fork.

**Cache mechanism (v3 corrected understanding)**: Anthropic places `cache_control` markers before each new user message. Hits require byte-exact match to a previously-committed cached endpoint. Floor is ~17K (tool schemas, even with `--system-prompt` strip). "First call in any new branch" pays ~$0.25 registration tax; established calls in same branch cost ~$0.03.

**Reusable harnesses**: `.claude/scripts/{validate-fork-cache,validate-fork-cache-v2,validate-fork-cache-v3,probe-quota-discount}.py` — all committed.

### 2026-05-23 night — E/F v6 deconstruct-and-rebuild + force-load doc committed; v6 execution AWAITING WINDOW RESET

**Committed** in `008e413` `feat(psyche): api_aware.md force-loaded + v5 harness cost-safety guards`:
- `api_aware.md` (279L, rules-and-maps form, §10.1 empirical-grounding amendment)
- CLAUDE.md @-import (Platform infrastructure awareness section)
- `cache-mechanics-v5-strip-effect.py` budget guards (--max-budget-usd, cumulative abort, pre-flight)
- Companion memory `feedback_empirical_grounding_for_claims.md` in `~/.claude/projects/.../memory/`, indexed in MEMORY.md

**Sir directed deep deconstruct of E/F + rebuild**. Findings:
- Partial-run E/F cost overrun (2.1× budget) was NOT verbose-output as prior scratchpad had assumed. ACTUAL drivers: (a) fresh-UUID-per-cell cache_create tax (~$0.26-0.46/cell × 21 T-N cells), (b) MCP C2 probes ~$0.78 (MCP-schema-load), (c) M-A defeats prefix cache (cache_read=0 per cell).
- `--output-format json` drops tool_use blocks (script known but still used it); v6 fixes with stream-json.
- `--max-tokens` does NOT exist on `claude -p` (prior scratchpad recommendation untethered to CLI surface — caught by §10.1 discipline).
- `--max-budget-usd` IS real (confirmed via `--help` + live test); fires as `error_max_budget_usd` but doesn't refund already-paid cache_create cost.
- `--max-turns` confirmed real, used in v6.
- `--system-prompt-file`, `--append-system-prompt-file`, `--bare` all confirmed via Anthropic docs §"System prompt flags".
- Post-008e413 fresh-cell baseline ~**$0.46** (not $0.26) — api_aware.md force-load adds ~34K cache_create tokens, itself a finding worth a §6 note.

**E/F v6 design** (Sir-confirmed all four choices Q1-Q4):
- 5 modes: M-D, M-S (inline), M-SF (file), M-A (append), M-B (--bare)
- 7 probes per chain: A1 (identity), A2 (CLAUDE.md), A3 (guardrails), A4 (MCP awareness), A5 (pulse-ops skill description specificity), P1 (pyright-lsp plugin awareness), C1 (mcp__jarvis-rag invocation via stream-json)
- Fold-in M-D/M-S/M-A A1+A2 from existing `strip-effect-results.json` (regex-based, valid carry-over)
- T-N controls for new modes only (M-SF, M-B)
- Built: `.claude/scripts/cache-mechanics-v5-strip-effect-v6.py` (412L), `v6-system-prompt-file.txt`
- Projected: $10.35 / 31 cells / ~5pp burn weight; cumulative cap $12.00; per-cell cap $1.20 + --max-turns 3
- The init-event from stream-json exposes the actual tool/MCP/skill/plugin registry per mode — ground-truth correlator against probe responses

**E/F v6 EXECUTION BLOCKED**: pre-flight refused at util 90% (LOWER bound, cache_* excluded). Real likely 95%+. Window reset at `2026-05-23T07:20Z` (~2h from script-run-time 05:16Z). cost-state `alert_level: "warn"`, 5h rate 23.67 USD/h, recent 5min rate 40.31 USD/h (accelerating).

**Autonomous retry loop scheduled** per Sir "hold the course steady onward": ScheduleWakeup at 1800s intervals re-checks util via burn-rate-curve. The script's own pre-flight (50% threshold) is the safety gate; only fires when util drops.

**Wakeup log**:
- W1 fired 23:48 local (05:43Z): util **96%** (rose from 90%), rate_5min=$0, alert_level=ok. Re-armed +1800s. NB: rolling-5h-window is asymmetric — old activity ages OUT slowly while THIS conversation's prior turns aged INTO the trailing window. Per §10.1 grounding: util doesn't drop monotonically until ~10:43Z (when the original 02:20Z-window's last activity clears). The 07:20Z "window_reset" is the formal status-boundary, not necessarily where util drops sharply.
- W2 armed 00:19 local (06:19Z). Watcher arrived this turn before W2 fires — context-heavy refresh is taking over the loop.

**Post-refresh resume protocol**: After /clear + context restore, re-fire the autonomous loop by re-issuing the wakeup prompt manually. The same `python3 .claude/scripts/cache-mechanics-v5-strip-effect-v6.py` is the entry point. Pre-flight will still gate execution. The script + design + carry-over plan all live in this scratchpad block for a fresh-context Jarvis to pick up.

**On resume** (wakeup or Sir return), the loop will:
1. Re-check util via `curl http://localhost:8800/api/v1/usage/burn-rate-curve`
2. If util < 50%: `python3 .claude/scripts/cache-mechanics-v5-strip-effect-v6.py`
3. Parse `strip-effect-v6-results.json`, build pass-rate matrix, fold-in carry-overs
4. Write synthesis to `projects/project-aion/reports/cache-mechanics-v5-strip-effect-v6-findings.md`
5. Update v4 article §4.4 with the new findings

**Carry-over fold-in** (6 valid cells in `strip-effect-results.json`): M-D/A1✓, M-D/A2✓, M-S/A1✓, M-S/A2✓, M-A/A1✓, M-A/A2✓ all PASS.

### 2026-05-23 evening — api_aware.md drafted (Sir-directed), COMMITTED in 008e413

**Status**: api_aware.md at `.claude/context/psyche/api_aware.md` (279 lines, rules+maps doc) drafted per Sir's directive after he flagged my $-to-token-to-burn-weight back-calculation chain. Force-load import added to CLAUDE.md but uncommitted. Awaiting Sir's commit nod when context refresh completes.

**Sir-coined terminology**: "burn weight" = Δ unified_5h_utilization (pp). Approved. Used throughout new doc.

**Three-tier metric hierarchy enshrined in §0** (burn weight > tokens > $). NO-CONVERSION rule with zero exceptions. Cross-tier derivation produces plausible-looking numbers that mislead. Companion memory `feedback_empirical_grounding_for_claims.md` NOT YET WRITTEN — pending Sir's nod.

**Uncommitted files**:
- NEW: `.claude/context/psyche/api_aware.md` (279 lines)
- MOD: `CLAUDE.md` (+3 lines, `@`-import under new "Platform infrastructure awareness" section)
- MOD: `.claude/scripts/cache-mechanics-v5-strip-effect.py` (+29/-7, `--max-budget-usd 1.50` + cumulative abort + pre-flight check)

**v5 session data captured** (in `.claude/scratch/cache-mechanics-v5/`):
- G/prime.json + probe-T01.json + probe-T05.json (3 of 5 probes; T+25/55/65 killed mid-stream per Sir burn-rate concern). Both fresh-call probes returned cache_read ≈16,679 = boilerplate-floor, suggesting fresh-call probes don't see prime-specific cache at all — itself a methodology finding.
- EF/strip-effect-results.json (24 cells, $8.97 cost, ~27pp burn weight). Pass-rate matrix uniform across modes (A1/A2/C1 pass, B1/C2 fail everywhere). `tools=[]` in every cell → `--output-format json` drops tool_use; need stream-json. Captured in api_aware.md §7 rule #2.

**Empirical observations grounding the new doc**:
- 35-window survey: 4 windows hit 100% util in last 18d; saturated windows have cache-hit% 80-96%; idle windows >95%.
- Headers `rl_tokens_limit/remaining/input_remaining/output_remaining` ALL NULL on recent Max-plan traffic. Unified composite is the only quota signal.
- `unified_fallback_pct = 0.5` constant on current Max plan.
- `unified_representative_claim = 'five_hour'` in 100% of recent rows; 7d never binding.
- Status thresholds: allowed (0-90%), allowed_warning (90-100%, 2.5% of 14d calls), rejected (100%+, 0.24%).

**Code-analyzer agent report (synthesized into doc §3/§4)**: all surface paths verified with line numbers. Statusline `api%` is wall-time efficiency NOT util; `cache%` is ephemeral-1h adoption NOT hit-rate; cost-anomaly-watcher `window_5h.elapsed_seconds` is age-of-oldest-row NOT Anthropic window elapsed; burn-rate-curve `cumulative_tokens` excludes cache_read+cache_write.

### Reference paths (stable across sessions)

- Jarvis credentials: `.claude/secrets/credentials.yaml`
- Pulse API: `localhost:8700` (prod), `localhost:8800` (dev)
- Reverse proxy: `localhost:9800`
- Live watcher PID file: `.claude/context/.jicm-watcher.pid`
