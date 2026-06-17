# Insights Archive — 2026-06-16
# Rotated: 2026-06-16T14:19:15Z (3 entries)

### 2026-05-23 [9ca2e4221cb0]

**Different abort path**: util gate passed (27% < 50%), but the **projection vs cumulative-cap** guard fired. Projected $10.35 vs 0.85 × $12 cap = $10.20 — fail by 15¢. The 85% safety multiplier was calibrated for v5's 24-cell design; v6 has 31 cells, so projection naturally exceeds.

**Two architectural options**: (1) bump cap to $13 (recalibrate safety margin), or (2) drop a probe to lower projection. Option 1 preserves experimental coverage and is the conservative move — the per-cell guard and cumulative-abort still fire on actual overspend.

### 2026-05-23 [52ff29c37ea8]

Script is alive (PID 36438) with claude subprocess executing M-S/A3 cell. Log is empty because Python buffers stdout — output flushes at script exit, not per-print. The `ps` snapshot is my real-time progress signal until the run completes.

### 2026-05-23 [0f88b193fada]

**v5 probe-set audit revealed a hidden naming-mismatch trap**: v5 used `TR1/TR2/TR3` IDs for T-R cells (probing MCP catalog + invocation, NOT A1/A2 identity/CLAUDE.md as the v6 fold-in plan assumed). The `T-N` cells in v5 DO have A1/A2 IDs and serve as valid fold-in. Had I trusted Sir's "fold in M-D/M-S/M-A A1+A2" directive without checking, the synthesis would have either (a) silently used wrong data, or (b) failed to find A1/A2 cells in T-R and missed the fold-in entirely.

**Lesson generalized**: cross-version data fold-ins need a probe-ID audit before the merge step, not after.

# Insights Archive — 2026-06-16
# Rotated: 2026-06-16T21:01:47Z (4 entries)

### 2026-05-23 [94ab4b4b440f]

The launcher diff reveals two significant changes from the last committed state (`0a8742f`):
1. **Model downgrade**: Opus 4.7 → Opus 4.6 (1M) — dropped `--effort max`
2. **Thinking controls added**: `CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING=1 MAX_THINKING_TOKENS=16000` + output bumped to 64K

These are uncommitted changes to the launcher script, meaning you manually edited it since the last session.

### 2026-05-23 [a5355d9b6248]

**The resume logic worked correctly — the problem is upstream of it.** The launcher's default path (line 532–551) reads `.current-w0-uuid`, finds the JSONL, and passes `--resume <uuid>`. But `--resume` ties to a specific model. When you changed the `CLAUDE_BASE` from `claude-opus-4-7[1M]` to `claude-opus-4-6[1M]`, Claude Code cannot resume a session started on a different model — it silently creates a new session instead, which generates a new UUID, which then gets written to `.current-w0-uuid` by the restart loop or by Claude Code itself.

### 2026-05-23 [9f16ba77fa57]

**Critical review of H arm design before implementation:**

The v5 design doc specifies 62 cells (31×2 repeats) at ~$9-12. At 62% util already, that's a potential 25-30pp addition pushing to 87-92% — right at the `allowed_warning` threshold. Three design concerns:

1. **Repeat value**: Two repeats of the same scenario template adds statistical power, but the marginal information from repeat #2 is low if repeat #1 shows clear pass/fail patterns. I should implement repeat #2 as conditional — execute only if repeat #1 has ambiguous results.

2. **Topology X (null baseline)** is near-zero information: children with ZERO context will obviously fail Q1-Q5. Unless a pass occurs (hidden state leak), all 5 cells produce the expected "fail" at ~$0.15 each = $0.75 for confirming the null. Worth running once but not twice.

3. **`--fork-session` availability**: the v5 design assumed `--fork-session` exists. I need to verify this flag actually works in the current CLI before building cells around it.

### 2026-05-23 [78a01b0da8ca]

**H arm design revision (critical pre-implementation review):**

The original design has 5 topologies × 5 questions × 2 repeats = ~62 cells. After critical review:

1. **Topology D (extend-then-fork)** is the most interesting: it tests whether `--resume` + extension + `--fork-session` preserves context — the v3 "extend-then-fork" finding that underpins api_aware.md §9 rule #1. This is the highest-information topology.

2. **The `--fork-session` flag requires `--resume` or `--continue`** — it forks from an existing session. So topologies F and D both need a parent session first.

3. **Budget recalibration**: v6 showed per-cell cost of ~$0.17-0.31. H cells are simpler (factual recall, no MCP invocation) so should trend toward $0.15-0.20. 31 cells × $0.18 ≈ $5.58 for repeat 1. At 62% util, this is feasible.

4. **Scenario freshness**: each repeat should use a DIFFERENT scenario to avoid confounding cache-hit with genuine context preservation. If repeat 2 uses the same prompt, the cache prefix matches and the model might "remember" from cache, not from session state.

# Insights Archive — 2026-06-16
# Rotated: 2026-06-16T22:36:59Z (1 entries)

### 2026-05-23 [40a9bd221323]

**Pre-execution self-review of H arm script:**

1. **Topology F concern**: `--fork-session` with `--resume` forks FROM the parent session. Each child Q1-Q5 gets a fork of the same parent state. This is the correct design — each question is an independent branch, not contaminated by siblings.

2. **Topology R concern**: `--resume` on the same session means Q1-Q5 are SEQUENTIAL in the same session. Q2 inherits Q1's answer. This is different from F/D where each child is independent. The design document intended this, but it means R tests "cumulative session recall" while F/D test "snapshot recall." Both are valid but different.

3. **Q4 pass criterion**: For scenario 1, "will food run out?" → No (30 > 17). Pass regex is `\bno\b`. For scenario 2, "how many hours does Kim have?" → 36. Pass regex is `\b36\b`. Both are simple enough to avoid false positives.

4. **Cost projection**: $0.22 × 31 = $6.82 per repeat. At 62% util, one repeat is safe (~7pp). Two repeats (~14pp) would push to ~76% — still safe below 85%.

# Insights Archive — 2026-06-16
# Rotated: 2026-06-16T23:53:21Z (5 entries)

### 2026-05-23 [6b45fb0fef78]

Priority triage here follows a classic life-support hierarchy: consumables → power → personnel health. Water sits above food because dehydration kills in days while caloric reserves can be stretched; power sits above the medical issue because generator failure cascades into water purification, heat, and comms loss — turning a mild case into a severe one.

### 2026-05-23 [8fb17b6d7bcc]

Priority ordering here follows a classic risk-triage heuristic: **time-to-failure × severity × reversibility**. Water (12d supply, irreplaceable physiology, ~6d gap if storm slips the drop) outranks power (48hr fuel BUT leak diagnosis in progress, generator is *backup*) which outranks medical (mild, monitored, trending). Note how the storm's day-10 onset compresses every timeline — it's the forcing function behind issue #1's urgency.

### 2026-05-23 [1efbc6bdd62b]

Triage priority follows the "what kills you first" rule: life-support failure cascades faster than supply attrition, and supply attrition faster than personnel medical issues that are already under clinical management. Generator → water → drop slip is the canonical cold-environment outpost decision tree.

### 2026-05-23 [5ad3125955f8]

Criticality ranking here isn't about rank or general value — it's about who holds an irreplaceable function against the next 10–14 days of failure modes. The metric is: if this person were incapacitated tomorrow, how much closer does the worst-case scenario get? Specialists owning active failure points outrank generalists; coordinators outrank those whose domain isn't currently stressed.

### 2026-05-23 [a91efc02ba1d]

**The cache-mechanics corpus now has two independently validated operational rules:**

1. **Extend-then-fork** — v4 showed 36% window savings, H arm measured 6.2× per-child cost reduction. The mechanism: `--resume` + extension commits the prefix to cache; `--fork-session` alone creates a new prefix that doesn't inherit cache. For parallel fan-out, always extend first.

2. **System-prompt strip is governance-safe** — v6 showed that `--system-prompt` removes ~27K of Anthropic boilerplate (32% per-cell savings) but leaves all project `@`-imports, MCP access, and skill awareness intact. A free optimization for cost-sensitive headless work.

Both are now encoded in api_aware.md as operational rules, grounded in empirical evidence, and ready for use in future headless harness design.

