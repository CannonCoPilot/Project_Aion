# Cache Mechanics Study — Critical Self-Review

**Date**: 2026-05-23
**Reviewer**: Jarvis (self-review per Sir's directive)
**Scope**: v4 article, v5/v6 strip-effect, v5 H context-preservation, api_aware.md
**Standard**: Technical scientific peer review — methods, results, claims, completeness

---

## Overall Assessment

The cache-mechanics body of work constitutes a substantive empirical investigation of Claude Code's session and cache behavior under headless `claude -p` invocations. The work progressed through three phases: v4 (topology economics + article), v5/v6 (governance preservation under strip modes), and H (context preservation across topologies). The findings are internally consistent, externally actionable, and properly grounded in proxied API data.

**Strengths**: rigorous cost-guard framework, cross-validated findings (v4 Arm D confirmed by H topology D), Sir-enforced metric discipline (burn weight > tokens > $), methodological self-correction (stream-json for tool detection, Q4 false-positive caught).

**Weaknesses**: single-repeat limitation (n=1 per cell), untested confounds (cache TTL interaction with fork, concurrent fan-out at scale), and one persistent methodological gap (cost projections consistently overestimate).

---

## §1 Methods Review

### §1.1 Experimental design (SOUND)

The progression from v4 (broad survey) → v5/v6 (governance axis) → H (context axis) follows logical decomposition. Each arm has a clear research question, documented hypotheses, and pre-registered pass criteria. The v6 redesign (expanding from v4's limited E/F to a 5×7 matrix) was a justified response to v4's probe-set gaps.

### §1.2 Cost-guard framework (SOUND, minor overestimation bias)

The three-tier cost-guard system (pre-flight util check, per-cell `--max-budget-usd`, cumulative abort) is well-designed and prevented runaway costs. However:

- **Projection accuracy**: v6 projected $10.35, actual $5.44 (1.9× over). H projected $6.82, actual $7.50 (1.10× over). The projection model consistently overestimates. This is ACCEPTABLE for safety (overestimates are conservative), but the 1.9× overestimate in v6 nearly triggered a false abort (pre-flight #1 check failed, required raising the cap to $13 and re-checking).
- **Recommendation**: the topology-aware projection model proposed in v6 §9 should be implemented before any future experiments. The current single-rate model wastes headroom.

### §1.3 Evaluation criteria (MOSTLY SOUND, one gap)

Regex-based pass/fail evaluation is appropriate for factual-recall probes (A1-A5, Q1-Q5). The stream-json tool-detection method for C1 (MCP invocation) was a necessary fix over v4's silent json-format drop.

**Gap identified in H**: Q4's yes/no pass criterion (`\bno\b`) produced a false positive when the child refused with "No — I can't answer this." This was caught in post-hoc analysis and correctly documented in §6.1. For future work, yes/no criteria need refusal-exclusion patterns.

### §1.4 Scenario design (ADEQUATE, could be stronger)

H's two scenarios (Pinnacle Station, Stormcrest) are well-structured with distinct entities to avoid cross-scenario cache contamination. However:

- **Complexity ceiling**: 5 entities, 3 numeric values is moderate. High-complexity scenarios (20+ entities, nested relationships) are untested. The claim "context preservation is binary" (§6.7) may not hold at higher complexity.
- **Entity distinctiveness**: all names are Western surnames. A scenario with ambiguous or similar names (e.g., "Park" could be confused with a location) would stress-test recall quality. This didn't happen in practice — all responses were correct — but it's an untested confound.

---

## §2 Results Review

### §2.1 Core findings (WELL-SUPPORTED)

| Finding | Evidence quality | Cross-validation |
|---|---|---|
| Extend-then-fork saves ~6× per child | H data: D=$0.049 vs F=$0.305 | v4 Arm D showed 36% savings (less dramatic due to parent-cost inclusion) |
| `@`-imports survive system-prompt strip | v6: A1-A5 PASS in M-S/M-SF with 27K cw reduction | Consistent with CC harness architecture |
| MCPs propagate to `claude -p` children | v6: C1 PASS in all functional modes with stream-json tool evidence | Novel finding, no prior data |
| Plugins invisible in `claude -p` | v6: P1 FAIL in M-D control | Uniform across all modes; structural, not strip-related |
| `--bare` strips auth, not just content | v6: M-B returns $0 at zero tokens | Clean and unambiguous |
| No hidden state sharing between sessions | H: X=0/5 genuine passes | All X responses explicitly referenced lack of context |

### §2.2 Consistency check (PASSED)

- v4 Arm D (extend-then-fork saves on cache_write) → H topology D (6.2× per-child savings): **consistent**.
- v6 M-S cache_write ~44K → H topology X/Y/F cache_write ~45-46K: **consistent** (both are fresh-prefix patterns under default system prompt, which H doesn't strip).
- v6 boilerplate floor (cache_read=16,679 in M-S/M-SF) → H topology X/Y/F cache_read ~26K: **DISCREPANCY**. v6's M-S strips the system prompt (lower floor); H uses default mode (higher floor). The 10K difference is the Anthropic system prompt's contribution to cache_read. This is actually CONFIRMATORY of the strip-effect finding, not a conflict.

### §2.3 Burn-weight accounting (VERIFIED)

- v6: 28%→40% = 12pp for 31 cells at $5.44
- H: 66%→89% = 23pp for 31 cells (25 children + 6 parents) at $7.50
- H's higher pp/$ ratio (3.07 pp/$ vs v6's 2.20 pp/$) is explained by H running at higher base util (66% vs 28%) — Anthropic's util formula is likely nonlinear, with higher base util producing proportionally higher marginal weight per call.

**Possible concern**: the pp/$ ratio difference could also reflect time-of-day variation in Anthropic's load-shedding weights. Not testable with current data. Noted as uncontrolled variable.

---

## §3 Claims Review

### §3.1 Strong claims (WELL-GROUNDED)

1. "Extend-then-fork is 6.2× cheaper per child than plain fork" — directly measured, clean experimental design, large effect size.
2. "System-prompt strip removes ~27K of Anthropic-side content, not project content" — measured as cw delta (70,323 vs 43,746), mechanism explained by CC harness architecture.
3. "MCPs propagate to child processes regardless of system-prompt mode" — stream-json evidence with actual tool_use blocks captured.

### §3.2 Claims requiring qualification

1. **"Context preservation is binary (present or absent), not degraded"** (H §6.7) — true at n=1 for 5-entity scenarios. Cannot be generalized to high-complexity scenarios, long session chains (50+ turns), or near-context-window-limit conversations. Should be qualified as "for moderate-complexity operational briefings."

2. **"TTL=60min claim now SUSPECT"** (session-state.md) — v4 G probe showed cache miss at T+65min. v5 G prime fired but the full probe series was disrupted by a scheduler bug and cost overrun. The TTL claim lacks the multi-probe resolution originally planned. Currently supported only by a single T+65min miss — sufficient to say "TTL ≤ 65min" but insufficient to narrow the boundary.

3. **"Burn weight is composite, not linear in tokens"** (api_aware.md §1) — inferred from observing that two windows with similar token volumes produced different util% values. The inference is sound but the mechanism is unknown. Could be token-type weighting, request-count component, peak-rate component, or time-varying Anthropic-side adjustment. This is correctly labeled as "composite" without specifying the formula, which is appropriate.

### §3.3 Potentially overreached claims

1. **v4 article §1.1**: "Max-plan Claude Code subscribers receive the 1-hour tier automatically via a server-side feature flag." This was the prevailing understanding at time of writing, but v5 G's incomplete data means the actual TTL boundary is unverified for the current platform state. The claim should be softened to "empirically observed to be longer than 5 minutes but the exact boundary is not yet characterized."

2. **H §6.5 hypothesis**: "the extension turn's --resume call establishes the parent's prefix in cache as a SINGLE-SESSION prefix." This is a plausible inference but NOT tested. An alternative explanation: cache registration has a timing delay, and the extension turn merely provides enough elapsed time for the parent's cache to stabilize. A sleep-then-fork experiment (topology F with a 5-second delay between parent and fork) would distinguish these hypotheses.

---

## §4 Completeness Review

### §4.1 What was completed

| Arm | Status | Quality |
|---|---|---|
| v4 A-D (topology economics) | COMPLETE (3 repeats) | Strong — cross-validated by H |
| v4 E/F (tool-use under strip) | SUPERSEDED by v5/v6 | v6 is the authoritative result |
| v4 G (TTL probe) | PARTIAL — single T+65 miss | Insufficient for boundary characterization |
| v4 H (format-constrained context) | SUPERSEDED by v5 H redesign | v5 H is the authoritative result |
| v5/v6 E/F (strip-effect matrix) | COMPLETE (31 cells) | Strong — 5 modes × 7 probes |
| v5 G (TTL boundary series) | PARTIAL — prime fired, probes disrupted | Needs re-run |
| v5 H (context preservation) | COMPLETE (31 cells, 1 repeat) | Adequate — would benefit from repeat 2 |

### §4.2 Outstanding gaps

1. **G arm**: TTL boundary unresolved. The v5 design called for T+1, T+5, T+25, T+55, T+65 probes. Only the prime was successfully fired. Re-run needed in a fresh window with the corrected scheduler.

2. **Hook propagation**: v6 §8 item 2. Do UserPromptSubmit, SessionStart, etc. fire in `claude -p` children? Untested.

3. **Environment variable inheritance**: v6 §8 item 3. Implicit MCP dependencies (e.g., LiteLLM keys) may or may not propagate.

4. **Plugin functional test**: P1 (plugin awareness) uniformly failed, but it tested AWARENESS, not CAPABILITY. Plugins might be loaded and functional but invisible to the model's self-report. A capability test (try to use a plugin feature) is needed to distinguish these.

5. **Concurrent fork pressure**: H §8 item 2. D with 10+ parallel forks simultaneously — does cache eviction occur?

6. **Cache-timing hypothesis for D vs F**: H §3.3 item 2. Is the extend-then-fork advantage about session-depth or about cache-stabilization timing? A timed-fork experiment would resolve this.

---

## §5 api_aware.md Review

The document has evolved from a report-style artifact to a rules-and-maps operational document per Sir's directive. Current state (285 lines) is well-structured:

- §0 (first principles) correctly establishes the three-tier metric hierarchy
- §1-§4 (platform, headers, data flow, surfaces) provide orientation without excess prose
- §5-§6 (call signatures, window archetypes) are reference material
- §7-§9 (rules) now incorporate v6 and H findings with quantified evidence
- §10 (self-awareness) + §10.1 (empirical grounding) enforce the discipline layer

**One concern**: the document is force-loaded and now 285 lines. Each line costs tokens on every turn. Consider whether §5 (call signatures) and §6 (window archetypes) could be moved to an on-demand reference file, since they're used for postmortem attribution rather than live decision-making. Estimated savings: ~30 lines / ~800 tokens per turn.

---

## §6 Verdict

| Criterion | Rating | Notes |
|---|---|---|
| Methodology | **4/5** | Sound design, single-repeat limitation acknowledged |
| Results integrity | **5/5** | Internally consistent, cross-validated, no data fabrication |
| Claims calibration | **4/5** | Two claims need qualification (see §3.2, §3.3) |
| Completeness | **3/5** | G arm incomplete, 4 open gaps from v6 §8 |
| Documentation | **4/5** | Clear findings docs, api_aware.md well-structured |
| Practical utility | **5/5** | Directly actionable: extend-then-fork, strip-cost savings, MCP propagation |

**Overall**: The work is **sound, actionable, and honestly documented**. The primary weakness is completeness — G arm and several v6 open questions remain. These should be queued as future work rather than blocking the current findings.

**Recommended next actions** (prioritized by information density):
1. G arm re-run (TTL boundary) — highest-value missing data
2. Repeat 2 for H arm with Stormcrest scenario — statistical confidence
3. Timed-fork experiment (D vs F timing hypothesis) — mechanism explanation
4. Hook propagation test — operational safety

---

*Self-review conducted 2026-05-23. Standard: technical scientific peer review. Total corpus: ~2,100 lines across 5 documents + 2 scripts.*
