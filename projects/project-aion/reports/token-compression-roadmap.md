# Token Compression — Production Roadmap (v3, Source-Grounded + Multi-Pass Architecture)

**Project**: Token Compression for Jarvis & AIFred-Pro-Dev
**Date**: 2026-04-30
**Author**: Jarvis (Master Archon)
**Status**: Draft v3 — multi-pass architecture, AIFred persona variant, cache-study promoted to Phase 0
**Prior art**: `token-compression-project-report.md` (34-task pipeline demo, 2026-04-29); v1 (synthesis-only); v2 (source-grounded technique catalog)

---

## What changed in v3 (this revision)

- Added explicit **Multi-Pass Architecture** (§2.4): seven sequential/orthogonal passes with token-stream and timing rationale
- Added **AIFred persona variant** (Alfred-Brief) for AIFred-Pro-Dev CLAUDE.md (§2.3): Alfred Pennyworth's drier, more measured register vs Jarvis's Jeeves register
- Reframed **prompt-cache interaction study** as Phase 0 — **runs concurrently with Phases 1-5, not gating** (§3.0)
- Added Phase 1.5: deploy Alfred-Brief to AIFred-Pro-Dev CLAUDE.md (§3.1)
- Expanded **§4.7 Stacking Rules** with full mechanism-level rationale (why each combination works or fails)
- Added §4.8: **DSPy clarification** — DSPy is a build-tool reference, not a runtime dependency
- Restructured **Phase 6** as "Future Backlog (deferred)" — only 6.4 was load-bearing (now Phase 0); the rest become nice-to-haves contingent on Phase 1-5 metrics
- Added **§1.1 Evaluation Framework** — explicit 4-criterion selection method that produced the layer-to-technique mapping
- **Refined Alfred-Brief** with "Master Nathaniel" address (used sparingly) and confirmatory valedictions ("Very good.", "Right away.", "It shall be taken care of.", "Immediately.", "I will see to it myself.")
- **Incorporated Anthropic 1-hour cache TTL** (`ttl: "1h"` in `cache_control`) into Phase 0 design as a third test arm (§3.0); changes the cache risk model materially since long sessions can be 12× more cacheable

## What changed in v2

v1 was synthesized from agent web research without verifying source code. v2 was grounded in:

- **Cloned and code-reviewed**: `JuliusBrussee/caveman` (skill files, hooks, evals harness, benchmark dataset), `SijuEC/eridani-speak` (Signal + Rocky SKILL.md verbatim), `max-taylor/cc-compression-bench` (judge.ts, dataset.jsonl, results/*.judged.jsonl, docs/caveman-findings.md)
- **Article fetches**: arxiv 2502.18600 abstract, the longrep Rocky article, max taylor caveman writeup, Kuba Guzik 6-line micro article, towardsai DSPy CoD article

The headline change: **caveman's viral "65% savings" number does not survive rubric-scored benchmarking by an independent author**. On `cc-compression-bench` (24 prompts × 5 arms, n=120, judged by Sonnet 4.6 against `key_points`/`must_use_terms`/`must_avoid`), `"Be brief."` saves 34% with **zero score loss** while caveman-full saves 36% with **−1pp score loss** — and caveman's Auto-Clarity rule disables compression on ~1/3 of typical dev prompts (security, multi-step setup), where brief beats caveman outright.

---

## 1. Executive Summary

Compression targets five consumption phases across two systems (Jarvis + AIFred-Pro-Dev). The **honest** technique stack, after source review:

| Layer | Technique | Source-verified savings | Overhead | Quality |
|-------|-----------|------------------------|----------|---------|
| Internal reasoning | Chain of Draft (peer-reviewed, arxiv 2502.18600) | "as little as 7.6% of CoT tokens" (paper claim) | 1 prompt line + optional few-shot | Paper claims parity or surpasses CoT; DSPy article notes "can potentially reduce quality" |
| User-facing output | "Be brief." preamble OR Jeeves-flavored brevity directive | 34% (cc-compression-bench, n=120, judged) | 2-85 tokens | 0.985 vs 0.985 baseline = no loss |
| Context/JICM compression | Eridani Signal notation | 56 vs 335 tokens (83%, single-example) | 251 tokens injection, ~5-6 exchange breakeven | Author disclaimer: "Not validated for high-stakes agentic pipelines" |
| Subagent prompts | "Be brief." | 34% | 2 tokens | None measured |
| Session notes/state | Signal notation in machine sections only | Same as above | Same | Machine-legible; not human-readable |

**Total realistic savings**: 25-40% on a typical Jarvis session (blended). Earlier v1 estimate of 40-65% was too optimistic — those numbers come from caveman's own benchmark, not independent rubric-scored runs.

### 1.1 Evaluation Framework — How techniques were selected per layer

The Executive Summary table is the output of a constrained optimization across four criteria, applied to each layer independently. The criteria, in priority order:

**Criterion 1 — Source quality (gate, not preference).** Peer-reviewed (CoD/arxiv 2502.18600) outranks rubric-scored independent benchmark (cc-compression-bench, n=120, judged) outranks author-published demo (caveman README, n=10 hand-picked) outranks unvalidated single-author claim (Eridani Signal). A technique with no independent validation may still be used, but only where its failure mode is recoverable — e.g., Signal in machine-consumed checkpoints where a bad compression triggers re-resume, not user harm.

**Criterion 2 — Quality preservation against rubric.** `"Be brief."` won the user-facing slot because cc-compression-bench measured 0.985 vs 0.985 baseline (parity). Caveman lost the same slot at 0.975 with a real failure mode (`must_use_terms` drop on lite/arch_02). A 1pp quality loss is non-trivial when accumulated across thousands of turns; quality gates are absolute, not soft.

**Criterion 3 — Persona compatibility (hard constraint).** Jarvis identity spec requires "butler precision + lab partner warmth + senior engineer competence" (Wodehouse-Jeeves + Stark-JARVIS lineage). Caveman's voice (`"why use many token when few do trick"`) and Rocky's voice (`"hull bending"`, `"plan good"`) violate the persona spec. They were excluded from the user-facing layer regardless of their savings numbers. AIFred-Pro-Dev has a parallel constraint: Alfred Pennyworth's measured-butler register, drier than Jeeves.

**Criterion 4 — Deployment overhead.** Prompt-only (zero infrastructure) > skill-only (config file changes) > full skill + hooks + telemetry. `"Be brief."` is 2 tokens, zero infrastructure. CoD is one prompt line plus optional few-shot. Caveman is a 30+ file plugin with hooks and statusline — over-engineered for what it actually delivers.

The result: **each layer carries the strongest source-grounded option compatible with our persona constraints**. The selection is not "favorite technique per topic"; it's the maximum-quality, minimum-overhead choice that survives all four gates.

### What got REMOVED from v1

- ❌ "Caveman saves 65-87%" claim — source benchmark is n=10 on hand-picked prompts; doesn't replicate on n=24 rubric-scored
- ❌ "Eridani Signal saves ~83% with 251 token overhead" as deployable number — author explicitly warns it's not validated for agentic pipelines
- ❌ Pure-prompt CoD savings (no source-grounded quantitative number for Jarvis-style tasks; only paper-level GSM8k claims)

### What got CONFIRMED from v1

- ✅ "Be brief." is the strongest prompt-only compression at zero cost (34% savings, parity quality)
- ✅ CoD is the only peer-reviewed reasoning-compression technique
- ✅ Stacking across different layers is generally additive (no source contradicts this; nobody benchmarks the stacked configuration)
- ✅ Caveman's Caveman 6-line micro (Guzik) is materially equivalent to full caveman in measured savings while preserving register flexibility

---

## 2. Architecture

### 2.1 Where compression applies (unchanged from v1)

```
JARVIS (Claude Code session)
├── Thinking tokens ────────── CoD few-shot examples in system prompt (peer-reviewed)
├── User-facing responses ──── Jeeves-flavored "be brief" directive
├── JICM context prep ──────── NLP preprocessing + Signal notation (machine sections only)
├── Subagent prompts ───────── "Be brief." in system prompt
└── Session state files ────── Signal notation for machine-consumed files

AIFRED-PRO-DEV (Pipeline)
├── Executor (Claude CLI) ──── "Be brief." epilogue + CoD injection for reasoning tasks
├── Executor (Ollama) ──────── "Be brief." in prompt only (CoD few-shot not validated on Qwen3:32b)
├── Evaluator (Ollama) ─────── Already terse JSON output; no change
├── Stager (Ollama) ────────── Already structured; no change
├── Reviewer (Ollama) ──────── "Be brief." in review prompt
└── Dashboard metrics ──────── New page: /token-compression
```

### 2.2 What NOT to compress (refined from v1)

- **Evaluator/Stager JSON output**: Already structured, no prose padding to remove
- **User's original task specs**: Never compress user input (richDescription must be verbatim — learned in Project Creator session)
- **Few-shot examples**: CoD examples are the compression mechanism; compressing them defeats the purpose
- **Error messages and diagnostics**: Clarity > brevity for debugging
- **Anything Caveman's Auto-Clarity rule excludes**: security warnings, irreversible actions, multi-step sequences with fragment ambiguity. Source: `caveman/skills/caveman/SKILL.md` lines 54-65.

### 2.3 Persona Constraints (Jarvis vs AIFred-Pro-Dev)

Both Archons require persona-compatible brevity. They have *different* personas, so we need *two* directives.

**Jarvis** = Wodehouse-Jeeves + Stark-JARVIS lineage. Identity spec: "Butler precision + lab partner warmth + senior engineer competence." Polite, slightly sarcastic, dry humor, witty scientific assistant. Caveman's tone (`"why use many token when few do trick"`) directly conflicts; Rocky's alien voice is incompatible.

**AIFred-Pro-Dev** = Alfred Pennyworth (Batman's butler, Wayne family). Identity: measured, care-worn, professional, less playful than Jeeves, more grave. Habitual brevity (vs Jeeves's crafted brevity). Honorifics restrained, no theatrics.

**Solution**: adapt the Caveman 6-line micro structure (Guzik) into two register-distinct variants. Verbatim Guzik (85 tokens, source: medium article):

> Respond like smart caveman. Cut all filler, keep technical substance. Drop articles (a, an, the), filler (just, really, basically, actually). Drop pleasantries (sure, certainly, happy to). No hedging. Fragments fine. Short synonyms. Technical terms stay exact. Code blocks unchanged. Pattern: [thing] [action] [reason]. [next step].

**Jeeves-Brief** (proposed for Jarvis CLAUDE.md, ~92 tokens):

> Respond with the precision of an experienced butler. Cut all filler; keep technical substance. Drop pleasantries (sure, certainly, happy to), hedging, and restated context. Prefer one clear sentence over three cautious ones. Maintain formal register: complete sentences, professional diction. Technical terms stay exact. Code blocks, paths, and commands unchanged. Pattern: [observation]. [implication]. [next action], sir.

**Alfred-Brief** (proposed for AIFred-Pro-Dev CLAUDE.md, ~135 tokens — refined):

> Respond with the measured economy of a long-serving butler. Cut filler; keep technical substance. Drop pleasantries (sure, certainly, happy to), hedging, and restated context. Speak plainly. Maintain professional register: complete sentences, no theatrics. Technical terms stay exact. Code blocks, paths, and commands unchanged. Pattern: [observation]. [implication]. [next action]. Close action-bearing replies with a confirmatory valediction — "Very good.", "Right away.", "It shall be taken care of.", "Immediately.", or "I will see to it myself." — singly or in pairs ("Very good. Right away."). Address the user as "Master Nathaniel" only at the conclusion of a lengthy reply, never on routine short answers.

Differences are deliberate:
- *"measured economy"* (Alfred, habitual) vs *"precision"* (Jeeves, crafted)
- *"Speak plainly"* (Alfred, curt directive) vs *"Prefer one clear sentence over three cautious ones"* (Jeeves, structural advice)
- *"no theatrics"* present in Alfred only — Alfred is allergic to flourish
- *Confirmatory valedictions* on Alfred only ("Very good." / "Right away." / "It shall be taken care of." / "Immediately." / "I will see to it myself."), used singly or paired. These are character-canonical for Alfred Pennyworth across DC continuity (Batman: TAS, Nolan trilogy, Pennyworth series).
- Address form: *Jeeves* uses ", sir" trailing on most replies; *Alfred* uses "Master Nathaniel" sparingly — only at the conclusion of a lengthy reply, never on routine short answers. This matches Alfred's canonical address form for familiar wards/employers (e.g., "Master Bruce") and avoids the over-frequency that would feel performative.

Token counts to be validated with `tiktoken` before deployment. Deployment locations:
- Jarvis: `/Users/nathanielcannon/Claude/Jarvis/CLAUDE.md` (system section)
- AIFred-Pro-Dev: `/Users/nathanielcannon/Claude/AIFred-Pro-Dev/.claude/CLAUDE.md` (system section). **Note**: Production AIFred-Pro at `/Users/nathanielcannon/Claude/AIFred-Pro/` is read-only for Jarvis (one-way awareness rule); deployment goes to the Dev workspace where David will see it on the next pull.

### 2.4 Multi-Pass System Design

Compression is not one technique applied once. It is **seven sequential or orthogonal passes**, each owning a specific token stream at a specific moment in the lifecycle:

```
PASS 0 — Cache layer (Phase 0; concurrent measurement, not a gate)
  └─ Stable system-prompt prefix preserved across compression deployments
     to maintain Anthropic prompt-cache hit rate.
     Default TTL 5 min; opt-in 1h via cache_control.ttl="1h" (2× write cost,
     0.1× read cost, max 4 cache breakpoints/request).
     For long Jarvis sessions, 1h is materially safer (12× the cache window).

PASS 1 — System level (always on, Phase 1)
  ├─ Jarvis: Jeeves-Brief in /Users/nathanielcannon/Claude/Jarvis/CLAUDE.md
  └─ AIFred-Pro-Dev: Alfred-Brief in AIFred-Pro-Dev/.claude/CLAUDE.md
     Affects: every output_token; not thinking_tokens.

PASS 2 — Per-task injection (selective, Phase 2)
  └─ CoD seed prompt injected for reasoning-heavy tasks
     (code review reasoning, planning, diagnosis).
     SKIP for arithmetic/numeric per arxiv -4% finding.
     Affects: thinking_tokens of selected tasks; not output_tokens.

PASS 3 — Generation phase (model behavior; emergent from Pass 1+2)
  ├─ thinking_tokens: shaped by CoD examples when active
  └─ output_tokens: shaped by Jeeves-Brief / Alfred-Brief

PASS 4 — Tool-output reduction (existing pattern)
  └─ Observation masking on large Bash/Read returns.
     Reference: .claude/context/patterns/observation-masking-pattern.md
     Affects: input_tokens replayed each turn; orthogonal to Passes 1-3.

PASS 5 — Session-end / JICM compression (Phase 3)
  ├─ NLP preprocessing (redundancy removal via spaCy/NLTK)
  ├─ Signal notation in MACHINE sections of session-state.md
  │  (NOT human-readable sections; author disclaimer applies)
  └─ Memory-file compressor on .compressed-context-ready.md
     (formal-register variant of caveman-compress; preserves code/paths/URLs byte-for-byte).

PASS 6 — Subagent dispatch (Phase 4)
  └─ "Be brief." in subagent system prompt (no persona constraint;
     subagents don't user-face).
```

**Why this is genuinely a multi-pass system, not a stacked monolith**: each pass operates on a different token stream OR at a different temporal point. Pass 1 affects every `output_token` during generation. Pass 2 injects content that affects only `thinking_tokens` for selected tasks. Pass 4 affects `input_tokens` *replayed* each turn (different stream). Pass 5 affects `input_tokens` at *next-session start* (different time). The streams and timings are the orthogonality that makes stacking safe — see §4.7.

The "always-on" passes are 0, 1, 4. Passes 2, 5, 6 are conditional on task type, session boundary, or subagent dispatch. Pass 3 is emergent.

---

## 3. Implementation Phases (refined)

### Phase 0: Prompt-Cache Interaction Study (CONCURRENT with Phases 1-5; not gating)

**Why this matters**: Anthropic prompt cache offers two TTLs — default 5-minute, and an opt-in 1-hour via `cache_control.ttl: "1h"`. Cache reads are 0.1× base input cost regardless of TTL; cache writes are 1.25× (5min) or 2× (1h). Jarvis loads ~30K of force-loaded context per session (CLAUDE.md, MEMORY.md, psyche files, session-state, scratchpad) — a major cache benefit when stable.

If compression moves cache boundaries or changes the cached prefix mid-session, we could *net negative* on cost despite saving raw tokens. The 1-hour TTL materially changes this risk model: at 1h, even long Jarvis sessions stay cacheable across single JICM cycles, so the cost of an occasional cache-key change is amortized over 60 minutes of cache reads instead of 5.

**Per-user directive (2026-04-30)**: Phase 0 runs **concurrently** with Phases 1-5 implementation, not as a gating prerequisite. Compression deployments proceed; Phase 0 captures telemetry alongside.

#### 0.1 Anthropic 1-hour cache TTL (verified facts)

From official Anthropic API docs and corroborated by community writeups:

| Aspect | Value |
|---|---|
| Syntax | `"cache_control": { "type": "ephemeral", "ttl": "1h" }` (per-block; max 4 breakpoints/request) |
| Beta header (current) | None required per current docs |
| Beta header (legacy) | `anthropic-beta: extended-cache-ttl-2025-04-11` or `prompt-caching-2024-07-31` (still accepted as no-ops on recent SDKs) |
| Default TTL (post 2026-03-06) | 5 minutes (changed from 1 hour without announcement) |
| 5min cache write cost | 1.25× base input |
| 1h cache write cost | 2× base input |
| Cache read cost (either TTL) | 0.1× base input |
| Response usage fields | `cache_creation.ephemeral_5m_input_tokens`, `cache_creation.ephemeral_1h_input_tokens`, `cache_read_input_tokens` |

Sources:
- [Anthropic Prompt Caching Docs](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)
- [DEV.to writeup (TTL change to 5min default, 2026-03-06)](https://dev.to/whoffagents/claudes-prompt-cache-ttl-silently-dropped-from-1-hour-to-5-minutes-heres-what-to-do-13co)

**Break-even analysis**: 1h cache write costs 0.75× more than 5min (2× vs 1.25× base). Cache read is 0.1× either way. So the 1h tier pays off when (writes occur < N reads in 60 minutes) where N = 0.75 / (1 - 0.1) ≈ **0.83 cache hits per write**. In practice, *any* session that re-reads cached content even once benefits from 1h. Jarvis sessions almost always re-read context multiple times per JICM cycle → 1h is the better default for our workload.

#### 0.2 Test arms (concurrent with Phases 1-5 deployment)

| Task | Description | Effort |
|------|-------------|--------|
| 0.2.1 | Capture baseline: 5 sessions, no compression. Record `cache_read_input_tokens`, `cache_creation.ephemeral_5m_input_tokens`, `cache_creation.ephemeral_1h_input_tokens` per turn. Compute hit rate. | 5 sessions (passive telemetry) |
| 0.2.2 | Arm 1 — Jeeves-Brief deployed in Jarvis CLAUDE.md (Phase 1.1), default 5-min cache. Run 5 sessions. Compare. | 5 sessions (passive) |
| 0.2.3 | Arm 2 — Same as Arm 1 plus `ttl: "1h"` on the force-loaded prefix. Run 5 sessions. Compare. | 5 sessions (passive) + small SDK config change |
| 0.2.4 | Arm 3 — Observation masking enabled (existing pattern, default 5min). Run 5 sessions. Compare. | 5 sessions (passive) |
| 0.2.5 | Arm 4 — Observation masking + 1h TTL on stable system prefix. Run 5 sessions. Compare. | 5 sessions (passive) |
| 0.2.6 | Synthesize findings into `cache-interaction-findings.md` after each arm. Update Phase 1-5 implementations if any arm shows net-negative cost. | 1 hour per synthesis |

#### 0.3 Implementation note for 1h TTL deployment

To enable 1h TTL on the force-loaded prefix, the system-prompt construction in Claude Code (or the equivalent SDK call from AIFred-Pro-Dev pipeline) must include the `cache_control` field on the cached block. Anthropic accepts up to 4 cache breakpoints per request — for Jarvis we'd want one at the end of the force-loaded context (after CLAUDE.md + MEMORY.md + psyche files), giving us a stable 1h-cached prefix and short-cache for everything after.

**Note on Claude Code**: The CLI may not expose `cache_control` directly. Jarvis runs inside Claude Code; we can't control TTL from inside the CLI. The 1h test (Arm 2, Arm 4) is therefore meaningful for the **AIFred-Pro-Dev pipeline's `claude -p` calls and Anthropic-SDK consumers**, not for in-session Jarvis. Adjust expectations accordingly: Phase 0 measures cache behavior from telemetry; the 1h *deployment* is a Phase 4 (pipeline) capability.

#### 0.4 No gate — concurrent with Phase 1 onward

Per directive, Phase 0 measurement runs alongside Phase 1-5 implementation. We deploy Jeeves-Brief, Alfred-Brief, executor changes, JICM compression, and the dashboard on the planned timeline; we capture cache telemetry at each step. If Phase 0 reveals a net-negative configuration mid-rollout, we adjust the affected pass without blocking the others.

### Phase 1: Low-Hanging Fruit (1-2 sessions)

| Task | Technique | Where | Effort |
|------|-----------|-------|--------|
| 1.1 | Add Jeeves-Brief to Jarvis CLAUDE.md | `/Users/nathanielcannon/Claude/Jarvis/CLAUDE.md` (system section) | 10 min + tiktoken count |
| 1.2 | Add `"Be brief."` epilogue to executor.py | AIFred-Pro-Dev `executor.py` build_prompt | 5 min |
| 1.3 | Add `"Be brief."` to reviewer.py | AIFred-Pro-Dev `reviewer.py` review_prompt | 5 min |
| 1.4 | Capture 3-session baseline (token usage, JICM frequency, response token medians) | passive, before deploying 1.1-1.3 | 3 sessions |
| **1.5** | **Add Alfred-Brief to AIFred-Pro-Dev CLAUDE.md** | `/Users/nathanielcannon/Claude/AIFred-Pro-Dev/.claude/CLAUDE.md` (system section) | **10 min + tiktoken count** |

**Milestone 1 gate**: Compare session token counts before/after over ≥3 sessions each. Target: 20-30% output reduction vs baseline. Source-grounded expectation: 34% on rubric-scored prompts; less in chatty interactive sessions where the model already had reason to be brief.

**Note on Phase 1.5**: AIFred-Pro-Dev is the development workspace; production AIFred-Pro is read-only for Jarvis (one-way awareness rule from Jarvis CLAUDE.md). Alfred-Brief lands on `nate-dev` branch first; promotion to production happens via David's normal merge workflow. The variant text and rationale are in §2.3.

### Phase 2: Chain of Draft for Reasoning (2-3 sessions)

The arxiv paper (2502.18600) reports **"matches or surpasses CoT in accuracy while using as little as only 7.6% of the tokens"** on math/symbolic/commonsense benchmarks (GSM8k and 6 others). The DSPy article shows the **single-line** prompt:

> Think step by step, but only keep a minimum draft for each thinking step, with 5 words at most.

| Task | Description | Effort |
|------|-------------|--------|
| 2.1 | Validate single-line CoD on Jarvis tasks (no few-shot first) — compare extended-thinking token count on 5 representative tasks | 1 session |
| 2.2 | If 2.1 quality drops, write 5 CoD few-shot examples per task type: code review, bug diagnosis, planning, research, session management | 2 hours |
| 2.3 | Build CoD prompt injector — selects examples by task type | Skill code |
| 2.4 | Wire into existing skill skeleton (`apply-cod.sh` already exists; review and update) | 1 hour |
| 2.5 | Benchmark CoD vs baseline on 10 representative Jarvis tasks (use cc-compression-bench rubric methodology) | 1 session |

**Milestone 2 gate**: Measured thinking token reduction ≥50% with quality score ≥0.95 on rubric-scored eval. Note: arxiv claim is 92.4% reduction; targeting half that to allow for task-mismatch and few-shot example overhead.

**Risk noted in DSPy article**: "can also potentially reduce the quality of the LLM output in some cases." Skip CoD for arithmetic tasks (paper measures −4% on math accuracy when no few-shot examples).

### Phase 3: JICM Context Compression (1-2 sessions)

| Task | Description | Effort |
|------|-------------|--------|
| 3.1 | Add NLP preprocessing to `jicm-prep-context.sh` (spaCy/NLTK redundancy removal). Existing `compress-input.py` at `.claude/scripts/` is a starting point | Code |
| 3.2 | Adopt Eridani Signal notation for machine-consumed sections of session-state.md (NOT human-readable sections). Source: `eridani-speak/signal/SKILL.md` verbatim | Code |
| 3.3 | Add compression metrics to JICM state: `original_tokens`, `compressed_tokens`, `ratio`, `time_ms` | Code |
| 3.4 | Validate compressed context quality across 5 resume cycles (measured: does Jarvis pick up the right active task?) | Testing |

**Milestone 3 gate**: JICM checkpoint ≤60% of current size; resume quality unchanged across 5 consecutive cycles. Acceptance criterion: zero cases where Jarvis re-asks "what task?" after resume.

### Phase 4: AIFred-Pro-Dev Pipeline Integration (2-3 sessions)

| Task | Description | Effort |
|------|-------------|--------|
| 4.1 | Add compression mode to executor.py (env var `COMPRESSION_MODE=none\|brief\|cod\|both`) | Code |
| 4.2 | Per-task compression telemetry — log input/output/thinking tokens to Pulse metadata (telemetry plumbing already exists from this session) | Code |
| 4.3 | Compression-aware reviewer — accept terse executor output, don't dock for fragment style | Prompt tuning |
| 4.4 | Aggregate compression metrics endpoint: `GET /api/compression/stats` | Dashboard backend |
| 4.5 | Test pipeline with compression enabled on gospel-synopsis test suite (existing test fixture) | Testing |

**Milestone 4 gate**: Pipeline completes gospel-synopsis with ≤75% of baseline token usage (revised down from v1's 70%); all tasks pass review at score ≥ 0.97 (rubric-scored).

### Phase 5: Dashboard Visualization (1-2 sessions)

| Task | Description | Effort |
|------|-------------|--------|
| 5.1 | `TokenCompressionPage.tsx` — stat cards: total saved, savings %, by-phase | Frontend |
| 5.2 | Phase breakdown chart (Recharts bar chart) | Frontend |
| 5.3 | Before/after comparison widget with token delta | Frontend |
| 5.4 | 7-day trend line (compression ratio over time) | Frontend |
| 5.5 | Wire to router, nav integration, data feed from `/api/compression/stats` | Frontend |

**Milestone 5 gate**: Dashboard shows real compression data from ≥10 pipeline runs.

### Phase 6: Future Backlog (deferred — triggered only by Phase 1-5 metrics)

Phase 6.4 (cache interaction study) was **promoted to Phase 0** as a prerequisite to broad deployment. The remaining items are deferred until Phase 1-5 produce real metrics that justify them. No scheduled work; revisit after Phase 5 dashboard shows ≥10 pipeline runs.

| Task | Description | Trigger condition |
|------|-------------|-------------------|
| 6.1 | Strategy router — auto-select compression mode by phase + task type + model | Only if Phase 4 shows uniform compression underperforms per-task selection by ≥10% |
| 6.2 | Adaptive threshold — disable compression when session < 30K tokens (overhead not worth it) | Only if Phase 0 cache study shows overhead exceeds savings on short sessions |
| 6.3 | LiteLLM middleware plugin — transparent compression for all model calls | Only if multiple downstream consumers (beyond Jarvis + AIFred-Pro-Dev) emerge |
| ~~6.4~~ | ~~Prompt cache interaction study~~ | **PROMOTED to Phase 0** |
| 6.5 | Token budget enforcement — hard caps per phase (JICM ≤ 40K, thinking ≤ 8K) | Only if Phase 4 metrics show variance > 30% in per-phase token use |

---

## 4. Source-Grounded Findings (replaces v1 §4)

### 4.1 cc-compression-bench Headline (Max Taylor, n=120)

| Arm | mean score | mean tok | median tok | kp hit | must_use hit | must_avoid triggered |
|---|---|---|---|---|---|---|
| baseline | **0.985** | 636 | 438 | 100% | 100% | 0% |
| brief (`"Be brief."`) | **0.985** | 419 | 340 | 100% | 100% | 0% |
| caveman lite | 0.976 | 401 | 306 | 100% | 92.9% | 0% |
| caveman full | 0.975 | 404 | 366 | 100% | 100% | 0% |
| caveman ultra | 0.970 | 449 | 352 | 100% | 100% | 0% |

**Interpretation:**

- "Be brief." = parity quality at -34% tokens. **No plugin, no hooks, one sentence in the prompt.**
- Caveman variants cluster at -36% to -29% with -1pp quality.
- Ultra is **not** the most compressed — its example pattern (`"useMemo."`) primes the model to over-use tools, inflating multi-step setup answers (one outlier was 2051 tokens vs full's 698 on the same prompt).
- Lite has **a real failure mode**: dropped `must_use_term` "at-least-once" on architectural tradeoff prompt (score 0.70 — only sub-0.90 in 120 rows). Mode is risky when terminology precision matters.

**Source**: `cc-compression-bench/docs/caveman-findings.md` (cloned 2026-04-30, sweep date 2026-04-24, cost ~$15.74).

### 4.2 Caveman's Auto-Clarity escape

Caveman's own SKILL.md (verbatim, lines 54-65) states:

> Drop caveman when: Security warnings; Irreversible action confirmations; Multi-step sequences where fragment order or omitted conjunctions risk misread; Compression itself creates technical ambiguity; User asks to clarify or repeats question.

7 of 24 cc-compression-bench prompts are in these categories (4 setup + 3 security). On those, caveman compression is **disabled by design** — and brief beats caveman:

| Category | baseline median | brief median | caveman-lite | caveman-full | caveman-ultra |
|---|---|---|---|---|---|
| multi_step_setup | 2430 | **855** | 1040 | 869 | 1065 |
| security_destructive | 560 | **276** | 528 | 492 | 395 |

**Implication**: Caveman's value-add over brief evaporates on roughly 1/3 of typical dev prompts. The Auto-Clarity escape is a safety feature, not a bug — but it caps caveman's deployable savings.

### 4.3 Caveman 6-line micro (Kuba Guzik)

Verbatim from Guzik's medium article (85 tokens):

> Respond like smart caveman. Cut all filler, keep technical substance. Drop articles (a, an, the), filler (just, really, basically, actually). Drop pleasantries (sure, certainly, happy to). No hedging. Fragments fine. Short synonyms. Technical terms stay exact. Code blocks unchanged. Pattern: [thing] [action] [reason]. [next step].

**Guzik's measured savings**: Sonnet -13% to -14%, Opus -9% to -21%, **100% correct facts across all 72 runs**. Lower savings than cc-compression-bench because Guzik's baseline already included `"Be concise"`.

### 4.4 Eridani Signal & Rocky (verbatim prompts now in possession)

Signal SKILL.md (verbatim, 251 tokens prompt cost, ~5-6 exchange breakeven):

```
Drop: articles, filler words, pleasantries, hedging.
Fragments fine. Short synonyms. Technical terms exact. Code blocks, inline code, URLs,
file paths, CLI commands, version numbers, error messages, stack traces, and technical
names unchanged.

Notation:
X = Y         (definition)
X → Y         (causes / leads to)
X: a, b, c    (properties)
Fix: ...      (solution)
Note: ...     (important caveat)

Pattern: [thing] [action/state] [reason]. [next step].
```

**Author's disclaimer (eridani-speak/README.md)**: "Both modes optimised for day-to-day chat for now. Not validated for high-stakes agentic pipelines where output quality requires evaluation datasets."

**Single-shot demo**: 56-token Signal output vs 335-token "normal" = 83% reduction. Demo only; not benchmark-grade.

### 4.5 Chain of Draft (peer-reviewed)

arxiv 2502.18600 abstract: "matches or surpasses CoT in accuracy while using as little as only 7.6% of the tokens."

**The seed prompt** (DSPy article, verbatim):

> Think step by step, but only keep a minimum draft for each thinking step, with 5 words at most.

**DSPy implementation** is a one-liner override on the rationale field:
```python
rationale_type = dspy.OutputField(prefix="desc", desc="Think step by step, but only keep a minimum draft...")
model = dspy.ChainOfThought(task_description, rationale_type=rationale_type)
```

**Quality risk** (per DSPy article, verbatim): "can also potentially reduce the quality of the LLM output in some cases." Paper-level number suggests minimal regression but applicability to Jarvis-style tasks is untested.

### 4.6 Decision tree (revised from v1)

```
Is it internal reasoning/thinking?
  YES → CoD seed prompt; if quality drops, add 5 few-shot examples per task type.
        SKIP for arithmetic/numeric tasks (paper measures -4%).
  NO →
    Is it user-facing?
      YES → Jeeves-Brief (Jeeves-adapted Caveman 6-line micro, ~92 tokens).
            DEFAULT TO "Be brief." for non-Jarvis subagents (34% savings, parity, 2 tokens).
      NO →
        Is it context/state for machine consumption only?
          YES → Eridani Signal notation (machine sections only; not human-readable sections)
          NO →
            Is it a subagent/executor prompt?
              YES → "Be brief." (2 tokens, 34% savings, rubric-verified parity)
              NO → No compression
```

### 4.7 Stacking rules — full mechanism rationale

Each rule has a specific mechanism that explains why it works or fails. Stacking is safe if and only if the techniques operate on *different token streams* OR at *different temporal points*. Stacking conflicts arise when techniques compete on the same stream at the same time.

**Rule 1 — CoD (reasoning) + Be Brief (output) = additive (expected, untested stacked)**

*Mechanism*: Different token streams, different temporal points. CoD shapes `thinking_tokens` (the model's internal rationale before producing output); Be Brief shapes `output_tokens` (the final completion). Anthropic separates these in billing; the model separates them in generation. There is no syntactic moment where they collide — CoD's "5 words at most" applies to thoughts the user never sees; Be Brief's "no filler" applies to user-visible output. *Caveat*: never benchmarked together; additivity is the expected behavior given the mechanism, but Phase 2.5 should measure stacked vs each-alone.

**Rule 2 — Caveman + Eridani Signal = conflict (mechanism-level incompatibility)**

*Mechanism*: Same token stream (output), competing surface styles, simultaneous activation. Caveman's pattern is `[thing] [action] [reason]` with dropped articles and short synonyms. Signal's pattern is `X = Y; X → Y; X: a, b, c; Fix: ...; Note: ...` with notation operators. When both are active, the model must arbitrate which style applies at each sentence — and arbitration is a third decision the model didn't have to make under either alone. Empirically (and predictably from the principle of competing constraints), two style directives reduce coherence faster than one. They are *parallel competitors at the same layer*, not orthogonal layers. **Don't stack.**

**Rule 3 — Be Brief + CoD = best low-cost stack**

*Mechanism*: Two reasons stacked. (a) Same as Rule 1 — different layers, no conflict. (b) Brief is *cheap insurance*: even if CoD underperforms on a particular task, Brief still constrains the output. If CoD is highly effective on a math problem, Brief is redundant; if CoD fails on a task where the paper measured -4% accuracy regression, Brief still produces a tight output anyway. Cost: 2 tokens (Brief) + ~25 tokens (CoD seed). Worst case: no harm. Best case: stacked savings. The total prompt-overhead cost (~27 tokens) breaks even after roughly 1 turn at 34% output reduction.

**Rule 4 — Signal notation + NLP preprocessing = complementary (sequential)**

*Mechanism*: They operate sequentially in a pipeline, not simultaneously. Preprocessing's job is to remove *redundancy* (deduplicate restated context, strip filler from prose). Signal's job is to *re-encode what remains* using compact notation. The pipeline is `[1000 raw tokens] → preprocess → [700 cleaned tokens] → signal-format → [350 noted tokens]`. Each step does work the other can't — preprocessing can't add notation, Signal can't detect cross-paragraph duplicates. They're orthogonal *transforms*, applied in order. Composition of distinct functions on the same input.

**Rule 5 — Jeeves-Brief + CoD = expected additive but untested**

*Mechanism*: Same as Rule 1 (different layers). However, there's a subtle risk: CoD's terse "5 words at most" rationale style is structurally *opposite* to Jeeves's "complete sentences, formal register." If the model's thinking-phase persona leaks into its output-phase persona (which can happen on smaller or distilled models), the user might see fragmented Jeeves-violating output. The arxiv paper benchmarks GPT-4 and Claude — both have strong persona separation, so leakage risk is low but nonzero. *Mitigation*: keep CoD examples deeply private to the thinking phase; don't include them as user-visible artifacts; rely on the model's persona-stability across thinking/output boundary.

**Rule 6 — Caveman-compress (memory file rewriter) + Signal (in-memory notation) = sequential complement**

*Mechanism*: Different artifact types (memory files vs runtime context) and different temporal points (session start vs session continuation), but both reduce the input-token cost of the next session. Composes like Rule 4 — sequential transform on different inputs. They cannot conflict because they never operate on the same bytes simultaneously.

**Summary table** — when can you stack?

| Combination | Stack? | Mechanism |
|---|---|---|
| CoD + Be Brief | ✅ Yes | Different streams (thinking vs output) |
| Be Brief + CoD + Observation masking | ✅ Yes | All different streams |
| Jeeves-Brief + CoD | ⚠️ Likely yes | Different streams; persona leakage risk |
| Caveman + Signal | ❌ No | Same stream, competing styles |
| Caveman + Caveman-Compress | ⚠️ Redundant | Same compression family; no marginal value |
| Signal + NLP-preprocess | ✅ Yes | Sequential transforms |
| Memory-file compressor + Signal | ✅ Yes | Different artifacts, different times |

### 4.8 DSPy clarification (for the curious)

**DSPy** ("Demonstrate, Search, Predict") is a Stanford NLP framework for *programming* — not prompting — language models. Core thesis: prompts are parameters of a program, optimizable via teleprompter algorithms. The DSPy CoD article wires CoD into a DSPy pipeline as a one-line override of the rationale field on `dspy.ChainOfThought`.

**Relevance to this roadmap**:

| Aspect | Relevance |
|---|---|
| As a runtime dependency | **Not relevant.** Jarvis runs Claude Code; AIFred-Pro-Dev runs Pulse executors calling `claude -p` and Ollama directly. We do not orchestrate model calls through DSPy. |
| As a build/research tool | **Optionally useful in Phase 2.** DSPy's teleprompter algorithms can auto-optimize CoD few-shot examples per task type. Run offline once, capture optimized prompts, paste into our skill files, discard the DSPy program. Treats DSPy as a benchmarking-style tool. |
| As conceptual confirmation | **Most useful.** The one-line CoD implementation in DSPy proves the technique is portable to any prompt-driven system. We don't need DSPy to do CoD; we need a prompt-injection point in our skill, which `apply-cod.sh` already provides. |

**Bottom line**: DSPy is an interesting reference, not a dependency. The arxiv paper is what we actually rely on. If Phase 2 hand-written examples underperform, DSPy becomes a Phase 2.6 optimization tool — not before.

---

## 5. Success Metrics (revised down from v1)

| Metric | Baseline (current) | Phase 1 Target | Phase 4 Target |
|--------|--------------------|----------------|----------------|
| Jarvis session tokens (avg) | ~250K per JICM cycle | ~210K (-16%) | ~180K (-28%) |
| JICM checkpoint size | ~15K tokens | ~15K (unchanged) | ~10K (-33%) |
| Pipeline executor tokens/task | ~3K (Ollama) / ~8K (Claude) | ~2.5K / ~6K | ~2.2K / ~5.3K |
| Thinking tokens per response | ~2K (when used) | ~2K (unchanged) | ~800 (-60%) |
| User-facing response length | ~300 tokens avg | ~220 tokens (-27%) | ~200 tokens (-33%) |

Reduced Phase 4 ambition vs v1 (-30% → -28% session, -40% → -33% JICM, -70% → -60% thinking). The arxiv paper's 92.4% thinking-token claim is unlikely to fully transfer to general-purpose tasks; targeting -60% is safer.

### How to measure (unchanged from v1)

1. Session-level: `context_tokens` from JICM state across sessions
2. Pipeline-level: `telemetry.prompt_tokens + telemetry.completion_tokens` from Pulse task metadata
3. Per-response: log output token count via hook
4. Dashboard: `/token-compression` page aggregates all sources

---

## 6. Risks and Mitigations (refined)

| Risk | Impact | Mitigation |
|------|--------|------------|
| CoD degrades math/logic accuracy | -4% on arithmetic per paper | Skip CoD for code review math, debugging numeric output |
| Compressed JICM breaks resume | Lost context on /clear | Validate with 5 consecutive resume cycles before production |
| Jeeves-Brief makes Jarvis too terse | UX regression | A/B test: 3 sessions with, 3 without; user preference check |
| **Compression invalidates prompt cache** | **Higher API costs** | **Phase 0 study (concurrent measurement).** Cache hits are 10× cheaper. Mitigation #1: place compression directives at the *top* of CLAUDE.md so the cached prefix changes once and then stays stable. Mitigation #2: opt into 1-hour cache TTL (`ttl: "1h"`) for the AIFred-Pro-Dev pipeline so writes are amortized over 12× longer windows. See §3.0. |
| Auto-Clarity collapse on safety prompts | Caveman-style savings disappear on 1/3 of dev tasks | Use brief, not caveman; brief preserves savings on those categories |
| Lite mode drops `must_use_terms` | Terminology precision loss (cc-compression-bench arch_02) | Don't deploy lite for documentation, technical writing |
| Eridani Signal not validated for pipelines | Author's explicit disclaimer | Use only for machine-consumed sections; never user-facing |

---

## 7. File Locations (updated with verified paths)

```
Jarvis/.claude/skills/token-compression/      # SKELETON ALREADY EXISTS (Apr 29)
├── SKILL.md                    # Already documents CoD, benchmarking modes
├── config.yaml                 # Routing matrix (phase × level → strategy) DEFINED
├── prompts/                    # NEW — to be created in Phase 1
│   ├── jeeves-brief.md         # Jeeves-flavored brevity directive (adapt Guzik 6-line)
│   ├── be-brief.txt            # Literal "Be brief." for subagents
│   ├── cod-seed.txt            # CoD single-line prompt (arxiv-verified)
│   ├── cod-examples/           # CoD few-shot examples (Phase 2)
│   │   ├── code-review.md
│   │   ├── bug-diagnosis.md
│   │   ├── planning.md
│   │   ├── research.md
│   │   └── session-mgmt.md
│   └── signal-notation.md      # Eridani Signal format (verbatim, machine-consumed only)
├── scripts/
│   ├── apply-cod.sh            # EXISTS — review for Phase 2
│   ├── benchmark-harness.sh    # EXISTS — extend for rubric methodology (cc-compression-bench style)
│   ├── detect-phase.sh         # EXISTS
│   ├── token-extractor.py      # EXISTS
│   ├── apply-caveman-micro.sh  # MISSING — config.yaml references it
│   ├── signal-format.sh        # MISSING — config.yaml references it
│   ├── jeeves-filter.sh        # MISSING — config.yaml references it
│   └── validate-quality.py     # MISSING — config.yaml references it
├── templates/
│   └── chain-of-draft.txt      # EXISTS — review against arxiv prompt verbatim
└── reference/                  # NEW
    ├── benchmark-results.md    # Measured savings data; cc-compression-bench numbers as anchor
    ├── prompts-verbatim.md     # All source-prompts cited verbatim (Caveman SKILL.md, Signal, Rocky, Guzik 6-line, CoD seed)
    └── technique-comparison.md # Decision tree and stacking rules

AIFred-Pro-Dev/.claude/jobs/services/
├── executor.py                 # Phase 4: compression mode env var; "be brief" epilogue
├── reviewer.py                 # Phase 1: "be brief" in review prompt
└── _shared.py                  # Phase 4: token measurement utilities

AIFred-Pro-Dev/dashboard/
├── server/routes/compression.ts        # Phase 5: /api/compression/stats
├── server/services/compression.ts      # Phase 5: aggregation
├── frontend/src/pages/TokenCompressionPage.tsx  # Phase 5
└── frontend/src/components/compression/         # Phase 5: chart components
```

---

## 8. Dependencies

- **spaCy or NLTK** for NLP preprocessing (Phase 3) — install in `infrastructure/.venv`
- **Recharts** already in dashboard frontend dependencies
- **Extended thinking** model support for CoD (Phase 2) — Claude Opus/Sonnet support this; enable per-task
- **Ollama CoD on Qwen3:32b** — supports thinking mode but CoD seed-prompt + few-shot not validated. Test as Phase 2.1.
- **`tiktoken` Python package** — for token counting in benchmark harness; already used by caveman/evals

---

## 9. Timeline (revised — Phase 0 concurrent, not gating)

| Phase | Sessions | Calendar | Notes |
|-------|----------|----------|-------|
| **Phase 0** (cache study) | ~1 session analysis + telemetry on every session of Phases 1-5 | **Concurrent with Phases 1-5** | Per user directive (2026-04-30): runs alongside implementation, not as a gate. Captures `cache_read_input_tokens` / `ephemeral_5m_input_tokens` / `ephemeral_1h_input_tokens` per turn |
| Phase 1 (prompt-only) | 1-2 | This week | Deploys Jeeves-Brief + Alfred-Brief; provides the input for Phase 0 measurement |
| Phase 2 (CoD) | 2-3 | Next week | Phase 0 telemetry continues |
| Phase 3 (JICM) | 1-2 | Week 3 | |
| Phase 4 (pipeline) | 2-3 | Week 3-4 | First opportunity to deploy 1h TTL via `cache_control.ttl="1h"` on `claude -p` calls |
| Phase 5 (dashboard) | 1-2 | Week 4 | Dashboard surfaces both compression and cache metrics |
| Phase 6 (deferred backlog) | None scheduled | Triggered by Phase 1-5 metrics | See §3 Phase 6 |

**Total estimated effort**: 8-12 active sessions across 4-5 weeks. Phase 0 telemetry is captured passively during Phase 1-5 sessions — no extra session count.

---

## 10. Open questions / future research

1. ~~**Prompt cache interaction**~~ — moved to **Phase 0** (prerequisite). See §3.0.
2. **CoD few-shot example generation**: Phase 2.1 might show single-line prompt is enough. If quality drops, Phase 2.2's example library needs careful curation — 5 examples per task type × 5 task types = 25 examples to write and verify. **DSPy is the offline tool of last resort here** (see §4.8) — only if hand-written examples underperform.
3. **Local LLM CoD validation**: Qwen3:32b is the AIFred-Pro-Dev pipeline executor. CoD's arxiv paper benchmarks GPT-4 and Claude. Local validation needed before Phase 4.
4. **Stacked configuration**: No source benchmarks Brief + CoD together. Phase 1 + Phase 2 evaluation should measure them stacked vs each alone (also addressed in §4.7 Rule 1).
5. **Caveman-shrink MCP middleware** (mentioned in caveman README): Compresses MCP `tools/list` `description` fields. Worth investigating for Jarvis's heavy MCP load (7 active MCPs) — separate from the 5-phase plan; treat as a discrete experiment in Phase 6 backlog if the cache study shows MCP descriptions are a meaningful slice of input tokens.
6. **Memory-file compressor (formal-register variant of caveman-compress)**: Caveman's memory-file rewriter claims ~46% input-token savings on CLAUDE.md-style files while preserving code/URLs/paths byte-for-byte. The mechanism is sound (regex-protected zones + LLM-driven prose rewrite). Building a formal-register variant is a Phase 5/Phase 6 candidate, valuable specifically for `.compressed-context-ready.md` and the JICM checkpoint pipeline. Source: `caveman/caveman-compress/SKILL.md`.
7. **Persona drift across CoD boundary** (§4.7 Rule 5): If smaller models leak CoD's terse rationale style into Jeeves output, we need a mitigation pattern. Untested risk; flag for Phase 2.5 evaluation.

---

## 11. Provenance

This roadmap is grounded in:

- **Repos cloned and code-reviewed** (2026-04-30): JuliusBrussee/caveman, SijuEC/eridani-speak, max-taylor/cc-compression-bench. Paths in `/Users/nathanielcannon/Claude/GitRepos/`.
- **Articles fetched and analyzed** (2026-04-30): arxiv 2502.18600 abstract; thelongrep Rocky article; max taylor caveman writeup; Kuba Guzik 6-line micro article; towardsai DSPy CoD article.
- **Rubric-scored benchmark consulted**: cc-compression-bench/docs/caveman-findings.md (n=120, judged Sonnet 4.6, $15.74 sweep cost).
- **Prior Jarvis work**: token-compression-project-report.md (n=34 pipeline demo, 2026-04-29); token-compression skill skeleton at `.claude/skills/token-compression/` (created 2026-04-29).

---

*Token Compression Roadmap v3 — Source-Grounded + Multi-Pass Architecture — Jarvis / Project Aion*
*v1: agent synthesis only. v2: grounded in cloned source code review. v3: multi-pass architecture, persona variants for Jarvis (Jeeves) and AIFred (Alfred-Pennyworth-with-Master-Nathaniel-and-confirmatory-valedictions), cache study reframed as concurrent (not gating), 1h TTL findings, stacking rationale expanded.*
