# Insights Archive — 2026-06-08
# Rotated: 2026-06-08T07:04:48Z (2 entries)

### 2026-05-19 [c0a1f3428613]

The JICM checkpoint is written *before* /clear, so by definition it captures pre-clear state. Work done *after* resuming lands in the scratchpad but may not reach a new checkpoint if the session ends without another compression cycle. This is the structural lag documented in self-corrections 2026-05-06: the compressor "reads commit cadence as forward momentum" but can also lag when work completes in a short post-resume burst before another clear.

### 2026-05-19 [66a4a1ca3a50]

The three-source reconciliation pattern here mirrors the DF protocol (REFL-027/028): bridge state file ≈ scratchpad, live DFHack probes ≈ git log, DB registry ≈ JICM checkpoint. Same trust hierarchy — live objective record beats cached summary. The scratchpad's "pending commit" clause served as a useful hint that commits were imminent, even though by resume-time they were already done. This is the designed interaction: scratchpad captures intent, git captures execution.

# Insights Archive — 2026-06-08
# Rotated: 2026-06-08T18:14:19Z (4 entries)

### 2026-05-19 [9e7de62510d7]

The session-state survived the context clear intact via force-loading — exactly the design intent. The scratchpad's "pending commit" wording was written mid-session before the commit run and never rotated. This is the expected lag between scratchpad (written as work progresses) and session-state (updated at checkpoints). The JICM checkpoint, by contrast, was compressed at an earlier point still — before even the scratchpad's latest entry.

### 2026-05-19 [e25b1984200b]

**Math arm complete — 28/28 cells, $3.20, ~3.5 min wall.** And math_06 baseline came in at 11,346 tokens — turns out the compound-interest problem with extended thinking generates enormous reasoning chains naturally. CoD compression on math_06 actually IS substantial:

| Condition | output_tokens | Δ vs baseline |
|---|---|---|
| baseline | 11,346 | — |
| single_line | 9,434 | −17% |
| fewshot | 3,809 | **−66%** |
| jeeves_cod | 6,780 | **−40%** |

The earlier insight about jeeves_cod "output explosion" was wrong — I didn't have the baseline yet. Fewshot CoD shows 66% compression on this problem. **Calibration-v2 now starting** — 4 subprocesses active on Jarvis-class prompts.

### 2026-05-19 [b765074b94ca]

The headline that came out of this analysis is sharper than the original session's framing: **CoD doesn't just fail on Jarvis tasks, it inverts**. The `single_line` directive **suppresses the thinking block entirely** (-100% thinking tokens on all 3 Jarvis pairs vs only -30% on math) but **inflates visible text by 44% median**. Net effect for Jarvis tasks: fewer total tokens routed through thinking, more tokens billed for output, no net compression. The math arm shows ~30% compression on both axes — a coherent shrinking. The Jarvis arm shows a redistribution, not a compression. That's a more interesting and more dangerous finding for any future "always-on CoD" proposal — billing impact could go the wrong direction.

### 2026-05-19 [d86f23a2a23e]

The Anthropic prompt-cache TTL is 5 minutes — but cache lookup is by exact-prefix hash. Two facts compound the leak here: (1) each `claude -p` boot rebuilds the system-prompt prefix from disk, and even if the bytes are identical, a fresh process gets a fresh cache key in some routing modes, so subsequent calls within the 5min window don't always hit; (2) the harness's concurrency=4 fans out parallel cold-cache calls, meaning the first cell that should "warm" the cache races with the next three — none of them benefit from each other. Serial execution would help, but only weakly compared to a session-fork approach where the prefix is provably the same conversation.

