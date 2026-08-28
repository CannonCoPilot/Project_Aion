# Insights Archive — 2026-08-27
# Rotated: 2026-08-27T14:09:18Z (5 entries)

### 2026-07-27 [367fba0d8272]

That means the +0.204 gold-page lift is almost entirely *downstream* of recognition — body-isolation (dropping interleaved marginalia), preprocessing, and localization — not a better recognizer. All of which is re-derivable from the stored lines + bboxes **without re-recognizing a single page.** The corpus isn't 12 hours away from the improved pipeline; it's a wiring job away.

### 2026-07-27 [9fc45e4ca07f]

This reframes the whole v9 effort. R1/R2's "occupancy = identity" assumed a window *has* a stable session. Post-2.1.205 that's false: a window has a *succession* of sessions, and the pane process permanently records the first one. My R2 reconciliation and R4 `OCC=ok` were internally correct and externally meaningless — they verified the pane against a UUID that stopped mattering at the first `/clear`.

### 2026-07-27 [7c6069e0730d]

This is a genuine correction to my earlier read, and the cause is instructive: I'd been orienting off `session-state.md` (W0's file, frozen at Jun 15) and raw `git status`, neither of which knows about my lane. The v9 **H3 namespacing** work created `.scratchpad.dev.md` — a *dev-lane* L1 handoff — precisely so W5 has its own state channel. I wasn't reading my own organ. Worth noting the sequel: my orientation routine should read `.scratchpad.dev.md` first, not `session-state.md`.

### 2026-07-27 [42e29402e70e]

The 32B's failure mode is more dangerous than raw rate suggests. It didn't produce gibberish — it produced `SESSION-HANDOFF-2026-07-26.md`, a *plausible near-miss* off by one day. A digest consumer would follow that path, find nothing, and not know whether the file moved or never existed. The 8B's zero-rate came with blander prose. That's the real trade: fluency correlates with confident interpolation over identifiers.

### 2026-07-28 [b5b025643a7b]

The 8B's grounded run scored *perfect recovery and zero hallucination* — by copying the fact sheet back verbatim, mention-counts included. Both headline metrics were maximised by a completely useless output. That's why the harness now reports an `echo` rate: any metric that rewards naming identifiers can be maximised by listing them without explaining them, and I'd have shipped that as a success.

# Insights Archive — 2026-08-27
# Rotated: 2026-08-28T00:56:33Z (4 entries)

### 2026-07-28 [c5db77b5a3e8]

Both bugs shared a signature: a silent no-op. `sed` and `str.replace` don't error when their pattern misses — they just return the text unchanged, and the run proceeds looking healthy. The only reason I caught it was the *identical* `in_tok` on `f56d4d98`, a number I'd have skimmed past if the two orderings hadn't produced byte-identical output. Patch-by-regex on a file I'm actively iterating is the wrong tool; rewriting the whole function is what I should have done from the start.

### 2026-07-28 [09b1f8204b1f]

Your reference policy also collapses the POP-2 diagnosis I was building toward. Those 1535 records (archaic < 0.2, modern > 0.9, `floor_modern` 0.008) are loci where **s_dismas has no text of its own** — and your rule already says janvier/madueke are primary for content and surface at exactly those loci. So it isn't a new heuristic needing calibration; it's the stated policy not being implemented. Same for the split of duties: janvier/madueke are primary for localization/presence/interval/type, which is what my `janvier_fit` selector has been leaning on all along without the policy being written down.

### 2026-07-28 [c698f3bf3a3d]

The 1535 records at archaic<0.2 / modern>0.9 with `floor_modern` 0.008 are precisely loci where **s_dismas has no text of its own**. Your policy already says janvier/madueke are primary for content and surface exactly there. So the symmetric-`floor_modern` threshold I proposed and was about to spend a calibration cycle on isn't needed — it was an empirical rediscovery of a rule that already exists. Likewise the `janvier_fit` selector the localizer has leaned on all along turns out to *be* the policy's localization rule, just never written down.

### 2026-07-28 [1c169bb98550]

The clipping runs are worth dwelling on. My `truncated` field checks *output* truncation only, so a digest built on 75% of a session reported clean. The harness measured everything except whether it had read the whole input. That's the same failure shape as the original W0 bug that started this whole investigation — a correct computation over silently incomplete data. I built a tool that reproduced the bug it exists to help fix.

# Insights Archive — 2026-08-27
# Rotated: 2026-08-28T01:20:43Z (1 entries)

### 2026-07-28 [e6a0f0517fe0]

That failure is the same shape as the W0 bug that started this entire investigation: a correct computation over silently incomplete input, with every visible metric reporting success. I built a tool to fix that class of problem and reproduced the class inside the tool. The fix is the same principle in both places — verify input completeness *before* computing, and alert rather than degrade.

