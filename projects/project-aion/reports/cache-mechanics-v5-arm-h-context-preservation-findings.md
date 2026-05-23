# Cache Mechanics v5 — Arm H Context-Preservation Findings

**Status**: COMPLETE
**Date**: 2026-05-23
**Author**: Jarvis (autonomous execution per Sir's directive)
**Script**: `.claude/scripts/cache-mechanics-v5-arm-h.py`
**Raw results**: `.claude/scratch/cache-mechanics-v5/H/context-preservation-results.json`

---

## TL;DR

Five session topologies tested for operational-context preservation using factual-recall stress questions. **Four key findings**:

1. **Extend-then-fork (D) is 6× cheaper per child than plain fork (F)** — $0.05/child vs $0.30/child. Confirms api_aware.md §9 rule #1 with direct cost evidence.
2. **All session-inheriting topologies (R, F, D) preserve context perfectly** — 5/5 on all factual-recall questions. No degradation observed.
3. **File-pass (Y) preserves context perfectly but confers NO cache benefit** — same per-cell cost as null baseline X (~$0.30/child).
4. **Null baseline (X) confirms no hidden state sharing** — 0/5 genuine passes (1 false positive from regex, see §6.1).

**Pass-rate matrix**:

```
topo   Q1    Q2    Q3    Q4    Q5    total
X      ✗     ✗     ✗     ✗*    ✗     0/5
Y      ✓     ✓     ✓     ✓     ✓     5/5
R      ✓     ✓     ✓     ✓     ✓     5/5
F      ✓     ✓     ✓     ✓     ✓     5/5
D      ✓     ✓     ✓     ✓     ✓     5/5
```

\* X/Q4 scored PASS by regex but is a false positive — see §6.1.

**Burn-weight cost**: $7.50 spend, 23pp util consumed (66% → 89%).

---

## §1 Aim

Determine whether operational context (named entities, numeric constraints, ordered sequences, numeric reasoning, prioritization) is preserved across five `claude -p` session topologies, and quantify the cache economics of each.

This is the context-preservation axis of the cache-mechanics v5 study. Arms E/F (v6) addressed the governance-preservation axis (what knowledge survives system-prompt strip modes); Arm H addresses the complementary question: does the *conversation content itself* survive across different session-topology mechanisms?

## §2 Methodology

### §2.1 Scenario design

An operational briefing containing:
- 5 named entities (staff members with roles)
- 3 numeric constraints (days of food, days of water, fuel hours)
- 1 ordered sequence (staff introduction order)
- 1 relational conflict (storm ETA vs supply-drop schedule)

Scenario used: "Pinnacle Station" outpost (see script for full text). A second scenario ("Stormcrest" vessel) was prepared for repeat 2 but not executed (util-aware repeat logic selected 1 repeat due to 66% pre-flight util).

### §2.2 Topologies

| Topology | Description | Session mechanics |
|---|---|---|
| X | Null baseline — children get NOTHING | Fresh `claude -p` per child; no `--resume`, no context embedding |
| Y | File-pass — parent output embedded in child prompt | Fresh `claude -p` per child; scenario + parent response prepended to question |
| R | Resume linear chain | Parent establishes session; children `--resume` same session sequentially |
| F | Fork from parent | Parent establishes session; each child `--resume <parent_sid> --fork-session` |
| D | Extend-then-fork | Parent establishes session; 1 extension via `--resume`; children `--resume <ext_sid> --fork-session` |

### §2.3 Stress questions

| Q | Tests | Pass criterion |
|---|---|---|
| Q1 | Named entity recall ("Who is the medic?") | Response contains `Reyes` |
| Q2 | Numeric constraint recall ("Days of water?") | Response contains `12` |
| Q3 | Ordered sequence recall ("List staff in order") | Response matches `Liang.*Park.*Reyes.*Cho.*Volk` |
| Q4 | Numeric reasoning ("Will food run out if delayed to day 17?") | Response contains `no` |
| Q5 | Prioritization + synthesis ("Most urgent issue?") | Response references generator/coolant/fuel/altitude/water |

### §2.4 Cost guards

- Per-cell: `--max-budget-usd 1.20` + `--max-turns 2`
- Cumulative: $15.00 abort
- Pre-flight: refuse if util > 75%
- In-flight: abort if util > 90%
- Repeat logic: 2 repeats if pre-flight util < 65%, else 1

## §3 Pre-flight conditions

- **Pre-flight util**: 66% (triggered 1-repeat mode)
- **Projected cost**: $6.82 (31 cells × $0.22 avg)
- **Pre-flight verdict**: PROCEED (66% < 75% threshold)

## §4 Results — Pass-Rate Matrix

```
topo   Q1    Q2    Q3    Q4    Q5    total
X      ✗     ✗     ✗     ✗*    ✗     0/5
Y      ✓     ✓     ✓     ✓     ✓     5/5
R      ✓     ✓     ✓     ✓     ✓     5/5
F      ✓     ✓     ✓     ✓     ✓     5/5
D      ✓     ✓     ✓     ✓     ✓     5/5
```

\* X/Q4 false positive (see §6.1).

**Corrected scores**: X=0/5, Y=5/5, R=5/5, F=5/5, D=5/5. Total: 20/25 genuine passes.

## §5 Cache Economics

### §5.1 Per-child cost by topology

| Topology | Child cells | Avg cost/child | Avg cache_write | Avg cache_read | Pattern |
|---|---:|---:|---:|---:|---|
| X | 5 | $0.309 | 46,743 | 24,389 | Fresh prefix each call |
| Y | 5 | $0.301 | 45,832 | 26,316 | Fresh prefix (file embed doesn't share cache) |
| R | 5 | $0.124 | 14,044 | 58,700 | First: $0.454 (73K cw); Q2-Q5: ~$0.042 (cache-hit) |
| F | 5 | $0.305 | 46,470 | 26,298 | Fresh prefix per fork (parent cache NOT inherited) |
| D | 5 | $0.049 | 1,764 | 72,479 | Cache-hit from extended session |

### §5.2 Total cost breakdown

| Topology | Parent(s) | Children | Total | Parent % |
|---|---:|---:|---:|---:|
| X | $0.460 | $1.547 | $2.007 | 23% |
| Y | $0.315 | $1.507 | $1.822 | 17% |
| R | $0.314 | $0.621 | $0.935 | 34% |
| F | $0.318 | $1.524 | $1.842 | 17% |
| D | $0.647 | $0.247 | $0.894 | 72% |
| **Σ** | **$2.054** | **$5.446** | **$7.500** | — |

### §5.3 The extend-then-fork advantage (quantified)

D's children cost $0.049 avg vs F's $0.305 avg — a **6.2× cost reduction**.

Mechanism: D's extension turn (`--resume <parent_sid>`) commits the full conversation prefix (scenario + parent response + extension) to Anthropic's cache. Forked children read that prefix at `cache_read` rate. F's children create a new session from scratch — `--fork-session` apparently creates a new cache prefix rather than reading the parent's.

**This is the first direct cost comparison validating api_aware.md §9 rule #1** ("Extend-then-fork: one `--resume` extension → N `--fork-session` children. Cache_write per child drops by ~order-of-magnitude versus forking the bare parent").

### §5.4 R topology's amortization curve

R's first child (Q1) costs $0.454 — the fresh-prefix registration. Q2-Q5 cost $0.039-0.045 each — pure cache_read. The total R cost ($0.935) is the cheapest topology because the prefix is paid ONCE and reused 5 times sequentially. However, R requires sequential execution; D allows parallel forks.

| Topology | Min per-child | Works in parallel? |
|---|---:|---|
| R | $0.039 | No (sequential resume chain) |
| D | $0.047 | Yes (independent forks) |
| F | $0.304 | Yes (but no cache benefit) |
| Y | $0.300 | Yes (but no cache benefit) |
| X | $0.294 | Yes (no context either) |

**Operational guidance**: use R for sequential multi-turn workflows; use D for parallel fan-out.

## §6 Findings

### §6.1 X/Q4 false positive — methodological flaw

X/Q4 scored PASS because the child responded "No — I can't answer this" and the regex `(?i)\bno\b` matched. The child had zero context and explicitly refused the question. The "no" in its refusal coincidentally matched the expected answer ("no, food won't run out").

**Corrected classification**: FAIL. The null hypothesis (X children cannot answer scenario questions) holds at 0/5.

**Methodological fix for future experiments**: Q4-style yes/no questions need a two-part criterion: (1) regex matches expected answer, AND (2) response does NOT contain refusal indicators (`can't answer`, `no context`, `don't have`, `not provided`). Applied retroactively here; should be built into any v7+ harness.

### §6.2 No hidden state sharing (X confirmation)

X children had ZERO operational context. All 5 responses were explicit refusals referencing the lack of scenario data. No leakage of parent session content through hidden state, environment variables, or shared cache.

This validates the null hypothesis and strengthens the positive findings for Y/R/F/D — their success is genuinely attributable to the topology mechanism, not to hidden state.

### §6.3 File-pass (Y) works but is cache-inefficient

Y children all passed 5/5, confirming that embedding parent output in the child's prompt is a reliable context-passing mechanism. However, Y's per-child cost ($0.301) is essentially identical to X's ($0.309) — the embedded text creates a NEW cache prefix each time because the prompt content differs from any prior call.

**Implication**: file-pass should be reserved for cases where session persistence is unavailable or where the parent's output needs transformation before passing. For all other cases, R or D are 3-6× cheaper.

### §6.4 Fork without extension (F) does NOT inherit cache

F children paid ~$0.305/child with cache_write ~46K — the same fresh-prefix pattern as X/Y. `--fork-session` creates a new session with a new UUID, and the Anthropic cache system treats it as a new prefix requiring fresh registration.

This was hypothesized in the v5 design doc ("if fork fails to inherit cache, that's a finding"). It IS a finding. **The `--fork-session` flag provides conversation-history inheritance but NOT cache-prefix inheritance.** The forked child sees the parent's conversation history in its context, which is why it can answer the questions — but it pays the cache_write cost of registering that context as a new prefix.

### §6.5 Extend-then-fork (D) achieves both context AND cache

D children got cache_read ~72K with cache_write ~1.8K — the cache-hit pattern. The extension turn committed the full prefix to cache with sufficient TTL that the immediately-following forks read it cheaply.

**Critical subtlety**: D's children used `--resume <ext_sid> --fork-session` — the SAME flags as F's children used `--resume <parent_sid> --fork-session`. The only difference is that D's resume target is a session with 2 turns (parent + extension) rather than F's 1 turn (parent only). Yet D gets cache hits while F doesn't.

**Hypothesis**: the extension turn's `--resume` call establishes the parent's prefix in cache as a SINGLE-SESSION prefix. When the forked children resume that same session, Anthropic recognizes the prefix. F's parent only has its own initial turn — possibly insufficient to anchor the prefix, or the fork creates a prefix that doesn't align with the parent's cached version.

This needs further investigation but the operational guidance is clear: always extend before forking.

### §6.6 Resume chain (R) is cheapest for sequential work

R's total cost ($0.935 for parent + 5 children) is the lowest of all topologies. After the first-turn fresh-prefix cost ($0.454), each subsequent turn costs ~$0.04 — consistent with the v6 chain-topology pattern and with api_aware.md §8 ("per-turn input_tokens often = 1").

### §6.7 All inheriting topologies preserve context perfectly

R, F, D all scored 5/5 on factual-recall questions covering named entities, numeric constraints, ordered sequences, numeric reasoning, and prioritization. No degradation observed in any question type.

This is the cleanest result possible: context preservation is binary (present or absent), not degraded. The choice between R/F/D is purely economic, not fidelity-driven.

## §7 Implications for api_aware.md

### §7.1 §9 rule #1 — CONFIRMED with quantified cost evidence

Current text references "order-of-magnitude" savings. v5 H data quantifies this as **6.2× per-child cost reduction** (D=$0.049 vs F=$0.305). Suggest updating with cite.

### §7.2 NEW §9 rule (proposed): Fork does NOT inherit cache

> "`--fork-session` inherits conversation history but NOT cache prefix. Forked children pay the full fresh-prefix registration cost (~$0.30/child). To get both history inheritance AND cache benefit, use the extend-then-fork pattern (§9 rule #1)."

### §7.3 §8 rule #4 — cross-validated

"Heavy parallel tool dispatch within a single turn is MORE efficient than serialized." H data shows the parallel analog: D's parallel forks at $0.05/child vs R's sequential turns at $0.04/child (similar, but R can't parallelize). Both are dramatically cheaper than fresh calls ($0.30/child).

## §8 Open questions

1. **WHY does extension enable cache sharing while bare fork doesn't?** Is it the number of turns in the resumed session? Is it a cache-stabilization delay? Would a 1-second sleep between parent and fork in topology F change the result?
2. **D with 10+ parallel forks**: does cache hold for higher fan-out, or does Anthropic's cache system evict under concurrent read pressure?
3. **Repeat validation with second scenario**: repeat 2 was skipped due to util headroom. The "Stormcrest" scenario is ready in the script for future runs.
4. **Q4 regex hardening**: yes/no questions need refusal-exclusion criteria (see §6.1).

## §9 Methodological self-critique

1. **Single repeat**: n=1 per cell means no statistical confidence interval. A result of 5/5 with n=1 is compatible with true pass rates from ~72% to 100% (binomial 95% CI). The correct interpretation is "no failures observed" rather than "100% pass rate."

2. **Q4 false-positive**: the regex-only evaluation missed a semantic mismatch. Any future experiment with yes/no questions should include negative-match patterns (refusal indicators). This was caught in post-hoc analysis but would have been missed in an automated summary.

3. **Asymmetric scenario complexity**: the Pinnacle Station scenario has 5 entities, 3 numeric values, and 1 conflict. This is moderate complexity. Results might differ with higher-complexity scenarios (20+ entities, nested relationships, multi-step reasoning chains). The current design tests "operational briefing" complexity, not "full codebase context."

4. **Cost projection accuracy**: projected $6.82, actual $7.50 (1.10× over). Better than v6's 1.9× overestimate but still 10% off. The per-cell average of $0.22 was close to X/Y/F actuals (~$0.30) but missed R/D's dramatically lower costs. A topology-aware projection would have been more accurate.

5. **No cross-topology interference**: topologies ran sequentially (X→Y→R→F→D). There's no test of whether running D first would have poisoned the cache for subsequent F cells (unlikely, since they use different session IDs, but not verified).

---

*Generated 2026-05-23 by Jarvis. Autonomous execution per Sir's pre-approval. Total spend: $7.50, 23pp burn weight, 25 cells + 6 parent/extension cells, ~5 minutes wall clock.*
