# Insights Archive — 2026-06-10
# Rotated: 2026-06-10T23:40:53Z (4 entries)

### 2026-05-19 [b4e8f13264b3]

The Prompt Cache Performance panel's "Cold-start (145)" markers tell the story: every `-p` invocation registers as a cold-start event from the cache layer's perspective even when the prefix matches (cache reads still happen, but a fresh request boundary is created). At 12,297 requests captured and 145 cold-starts visible in the window, the bursts pack many requests close together — small per-call quota impact times burst-rate = the steep visible slope. The fix has to attack request *volume* or per-call *raw* input size, not the cache hit rate (which is already optimal).

### 2026-05-19 [2460e5aa9653]

Three arm shapes are needed to disentangle the question:
- **Arm A (independent)** simulates today's CoD harness — fresh session per cell, baseline burn pattern
- **Arm B (star fork)** is the proposed Option 2 refactor — N children forking from a single seed
- **Arm C (chain fork)** is a more extreme pattern where each cell descends from the previous, testing whether context depth helps or hurts the cache. If cache_read climbs across the chain, deeper inheritance compounds the discount. If it falls, accumulated context drifts the cache key.

Identical user prompts across cells maximize cache-prefix hit rate so any *difference* between arms is attributable to the fork strategy, not prompt variance.

### 2026-05-19 [e1a192cd1af2]

The original hypothesis behind Option 2 was that forking would preserve cache. The data shows the opposite mechanism: the Anthropic edge cache is already keyed by **prompt-prefix bytes alone**, not by session id — so independent sessions with identical prompts already cache-hit (Arm A cells 2-10 all show `cache_read=33K, cache_creation=0`). When you `--fork-session`, you create a new session boundary, which the cache layer treats as a **new cache scope** — the first fork pays a full $0.21 cache_creation to re-warm. The fork doesn't preserve cache for the workload pattern we have; it discards it.

### 2026-05-19 [2c385274ee63]

The smoke cell shows 23,595 tokens of cache_creation even after stripping the ~33K CC default. That residual is the *corpus prompt itself* (`cr_03` is a substantial code-review prompt with embedded code) plus the directive and style-suppression preamble. The CoD experiment intentionally uses large realistic Jarvis-shaped prompts — that's the experimental signal. The strip removed ~10K of *overhead* (Jarvis identity, capability map, hooks); what remains is the actual content under test. This is the correct trade-off: we cut overhead, not signal.

# Insights Archive — 2026-06-10
# Rotated: 2026-06-11T01:57:32Z (3 entries)

### 2026-05-19 [2064acda21f0]

This unlocks the right approach entirely. The Pulse API serves data **captured from Anthropic's own response headers** by the reverse proxy at :9800 — meaning the `unified_5h_utilization` value comes from Anthropic itself, sampled on every API call. We don't need to read a chart; we can query the proxy capture database directly for utilization samples across the probe windows and compute the slope ourselves. This is far more accurate than visual reading.

### 2026-05-19 [6e8b8c1155cf]

The token-delta column shows the most revealing detail: cum_tokens advanced **3,996 in H vs 3,926 in L** — essentially identical (1.02× ratio). Yet utilization advanced 3× more during H. That proves the proxy's `req_tokens` field (input + output, both non-cached) is NOT what Anthropic's quota counter is measuring. Anthropic must be summing something closer to billed-equivalent cost server-side, and exposing only the percentage as a public counter. The proxy can't see Anthropic's math — but our paired-burst design backs it out.

### 2026-05-19 [56cb1c7a53af]

Reading the calibration matrix construction reveals a deeper truth about the prior "scheduler bug": **the 50-cell calibration subset was never designed for paired analysis.** The matrix enumerates 36 unique `(model, condition, layer)` combinations with prompts cycling through — each `(prompt, layer, model)` tuple appears with only ONE condition. There's no within-cluster pairing possible by design. Math controls have proper pairing because the math corpus uses identical prompts across all conditions; the Jarvis arm would need the FULL 1,044-cell matrix to support strict-pair analysis. The "scheduler bug" framing was a misdiagnosis — it's a calibration-subset scoping limitation. Worth flagging in the consolidated findings.

# Insights Archive — 2026-06-10
# Rotated: 2026-06-11T05:48:15Z (2 entries)

### 2026-05-19 [190f50b8567a]

The window-first-request timestamp (14:09:04Z) reveals what 76% utilization actually represents: this is the cumulative spend across **everything** today — the entire interactive Claude Code session you and I have been working through, plus all the harness/probe runs we deliberately fired. Per the F5 finding the redux alone should account for ~30% of that (it was ~$8 of billed cost vs a probe-derived ~$0.27 per 1% slope). The rest is the interactive conversation cost itself — every turn in this conversation, especially the long debrief writeup, contributes. The cache_read column shows 22.5M tokens read from cache lifetime-in-window — that 10× discount alone is what's keeping us under 100%.

### 2026-05-19 [f14c9ea9a0e6]

The `.claude/scratch/` gitignore split is doing real work here: it keeps the
50-cell calibration JSONLs, the per-cell probe artifacts, and the iterative
FINDINGS scratch out of git history while the *summary* debrief at
`projects/project-aion/reports/...` becomes the durable cross-session record.
That's why the scratchpad's "uncommitted work" list looks longer than the
git status — items like runner.py and FINDINGS files live under scratch
permanently. The commit is just the synthesis surface, not the experiment.

