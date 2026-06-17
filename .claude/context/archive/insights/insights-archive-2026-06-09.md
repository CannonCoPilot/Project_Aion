# Insights Archive — 2026-06-09
# Rotated: 2026-06-09T15:19:25Z (3 entries)

### 2026-05-19 [564220398683]

The `--exclude-dynamic-system-prompt-sections` flag is a strong second signal that the prompt-cache leak is real and Anthropic has shipped a mitigation for it. The flag exists for exactly this reason — sections like git-status mutate between invocations, breaking the prefix-hash cache key. Combining it with `--fork-session` may be additively beneficial: fork inherits the conversation, exclude-dynamic stabilizes the system-prompt prefix. Worth testing both in the same harness rather than just one.

### 2026-05-19 [df830b317384]

The cross-arm cache continuity is the more interesting signal: Arm B's seed (which has no parent — it's a fresh call) shows cache_read=26,092. That can only happen if Anthropic's edge cache layer matched the prefix across separate process invocations. So the prompt cache is **process-independent at the API edge**, not bound to a single CLI process. That overturns my mental model entirely and means the original "rebuild from scratch per cell" framing was inaccurate.

### 2026-05-19 [0fc910629984]

The cost numbers from the actual CoD runs corroborate this: math cells averaged $0.114, v1 Jarvis $0.228, v2 Jarvis $0.254. v2 Jarvis is ~2× math because v2 prompts are larger AND v2 baselines have extended thinking enabled (driving output tokens up). The volume problem is real; the per-call cache problem isn't.

