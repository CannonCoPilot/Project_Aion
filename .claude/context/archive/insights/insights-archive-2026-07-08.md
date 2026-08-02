# Insights Archive — 2026-07-08
# Rotated: 2026-07-08T06:14:38Z (3 entries)

### 2026-06-24 [d6880661a96b]

The most valuable correction this session wasn't code — it was the audit's *root cause*. The original report called `parent_id=0%` a nesting bug and made W1 "depend on W2." Introspection showed the spans already nest geometrically, so W1 could be done by pure span-containment (no `parent_id` at all), and W2 collapsed to a one-line lazy backfill. Verifying the hypothesis before building saved an entire false dependency.

### 2026-06-24 [8b7bc9ebfcce]

`setPointerCapture(pointerId)` redirects all subsequent pointer events for that pointer to the capturing element until release (auto-released on pointerup). This is the canonical fix for "drag drops when cursor leaves the element." A subtlety: once captured, `e.target` becomes the capture element, so `closest('svg')` would return null mid-drag — that's why I capture the svg in a ref at pointerdown and reuse it, rather than re-deriving it from each event's target.

### 2026-06-24 [e94d2760fd0a]

- **BUG #1 (slowness)**: appendix-0002 derive — 186,537 chars, 1,409 verses — completed in **1.03s** end-to-end (HTTP + collection link included). Pre-fix was 5.22s; the spaCy re-segmentation is gone.
- **BUG #2 (stream)**: 14 **monotonic** progress events `[4→96%]` across the real phases (scan→assemble→segment→ingest→layout→verses→tracks→finalize→elements), terminating in exactly one `done`. `char_count=186537` matches the documented value exactly — the pre_normalized alignment holds on real data.

# Insights Archive — 2026-07-08
# Rotated: 2026-07-08T15:09:18Z (2 entries)

### 2026-06-24 [6475254eb736]

I split on *conceptual* boundaries, not file count: the subtext work (W1–W5 + slowness + progress streaming) is genuinely intertwined across `derive.py`/`server.py`/`SubtextWizard.tsx`, so forcing it into sub-commits would have required hunk surgery and left neither half independently test-green. The overview-bar pointer-capture fix is unrelated, touches one isolated file, and earned its own commit. Both points in history are green.

### 2026-06-24 [768e15332a05]

Wave 0 is unlike waves 1–5 in a crucial way: the substrate has **no tunable analytical knobs** to migrate onto the G1 `ParameterizedTrack` rail. Its "rebuild" isn't about exposing parameters — it's about making the **coordinate model and masking pipeline explicit, single-sourced, and verifiable**. The D1–D4 audit kept tripping over this layer being *implicit* (the remap contract, hidden masking constants, analyzable-vs-original coordinate confusion). Harden it now and every later wave migrates onto trusted ground instead of re-deriving coordinate assumptions.

# Insights Archive — 2026-07-08
# Rotated: 2026-07-08T22:50:56Z (5 entries)

### 2026-06-24 [133a88819f23]

- **The italic styling on the Closing note paragraph came from a targeted CSS selector** I included earlier: `h2#closing-note + p { font-style: italic; color: #2a2a2a; }`. Pandoc's heading-ID slugify converts "Closing note" → `closing-note` automatically, so the rule attached without any extra markup needed in your markdown. The reader's eye registers that change of register — italic + slightly softer ink — as "this is a personal note, not data" without you having to label it explicitly.
- **The em-dash + bold name + middle-dot + plain email line at the end** ("— **Nathaniel Cannon** · nathaniel.cannon@gmail.com") reads as a signature rather than another bullet. Small touch but it lands.
- **No "page 12 of 12" indicator** is the only loss vs. the failed footer attempt. For a 12-page document delivered electronically (where the reader sees the page indicator in their PDF viewer anyway), this is a minor concession. For a printed handout you'd want page numbers — let me know if that scenario matters and I'll wire up a working footer (the cleanest path is `pip3 install weasyprint` which respects `@page @bottom-center { content: counter(page) }`).

### 2026-06-24 [763a795c1ba3]

- **What "stuck" can mean in this stack** (mapping symptoms to likely causes):
  1. **Watcher process died** — PID 93964 (the patched one) is gone, no auto-trigger fires. Tells via `pgrep -f jicm-watcher`.
  2. **Watcher process alive but loop is blocked** — `refresh_state_from_jsonl` is hanging on a huge JSONL or syscall. Tells via the watcher's log timestamps stalling.
  3. **Loop running but state file is stale** — the `state_age > 300` guard in my patched `check_autonomous_threshold()` will *skip firing* if the state file hasn't been updated by `jicm-state-hook.sh` recently. This is the most likely culprit if the HUD shows a stable but old number.
  4. **JICM_CLEAR_SIGNAL exists from a prior fire that never got consumed** — patched code returns early if signal exists, so the watcher stops firing until the JICM session ack consumes the signal.
  5. **HUD reads a different state file than the watcher writes to** — historically the HUD has had bugs reading from `.compressed-context-ready.md` rather than the live JSONL count.
- **My patched code's specific guard order matters here**: `signal exists → return early` → `cooldown not elapsed → return` → `state file age > 300s → return`. Any of those three early-exits will look like "stuck" from the outside.
- **First three things to check, in order of cheapness**: (1) `pgrep -fa jicm-watcher` to confirm the daemon is alive; (2) `ls -la .claude/context/.jicm-state-hook.json .claude/context/JICM_CLEAR_SIGNAL` to check state file freshness and signal-file presence; (3) `tail` the watcher log for the most recent lines.

### 2026-06-24 [56874d5ab54f]

Wave 0 differs from waves 1–5 in a way that should shape how we walk it: the substrate has **no tunable analytical knobs** to migrate onto the G1 `ParameterizedTrack` rail. So its "rebuild" isn't parameter exposure — it's making the **coordinate model and masking pipeline explicit, single-sourced, and verifiable**. The D1–D4 audit kept tripping over exactly this layer being *implicit* (the remap contract, hidden masking constants, analyzable-vs-original confusion). Harden it now and every later wave migrates onto trusted ground instead of re-deriving coordinate assumptions.

### 2026-06-24 [854e8e5bb680]

The fragile seam is `_complement_spans` (`project.py:148`). It *assumes* its input is sorted, disjoint, and in-bounds — but never checks. The producer (`layout.masked_intervals`) does guarantee that today by construction (its final merge), so the pipeline is correct *now*. But this is the exact "silent coordinate corruption" the D1–D4 audit warned about: if any future edit to the masking core ever emits a malformed set, `_complement_spans` would quietly produce wrong *kept* spans — and **every** analysis would silently analyze the wrong text with no error. Contract-hardening means making that pivot self-defending.

### 2026-06-24 [d4e8a07f6ec6]

- This piece closes the loop on the masking piece: `_complement_spans` *produces* ordered-disjoint kept spans, and `OffsetMap.__init__` *consumes* them — the two construction sites (`analyzable_text` and `derive`) both feed it that exact contract. Hardening both ends means the kept-spans invariant is now guaranteed at production *and* checked at consumption, so the coordinate spine can't be silently fed a malformed partition from either direction.
- The enforcement folds into the loop `__init__` already runs to build `base`/`child_len`, so it costs nothing extra — the validation rides along the same single pass over spans.

# Insights Archive — 2026-07-08
# Rotated: 2026-07-09T03:07:20Z (2 entries)

### 2026-06-24 [f6082ecc4308]

- Chunking sits exactly one step *past* the substrate→analysis boundary: it's the **first consumer** of the analyzable text + OffsetMap. Its offsets live in analyzable space and must round-trip to original — but unlike segmentation/verse/element/OffsetMap, its **output is trusted, not contract-validated**. A chunker emitting an out-of-bounds or unordered chunk would silently poison `segment_offsets`; G4's remap only catches *misplaced known keys*, not bad coordinates *inside* a declared field.
- There's a latent architectural question hiding in "owned by self_similarity": embeddings are an expensive, reusable asset computed per-track and cached per-run. A second embedding-based track today would have to *duplicate* the invocation logic.

### 2026-06-26 [643c01bf2c50]

The two highest-value catches were both "plausible but wrong" facts that a design doc would have propagated into implementation: (1) the CLI parity gap was **real** but I'd cited `cli.py:125` when the offending `extract()` call is at `:193` — and it appeared 4× in the most-actionable phase; (2) I'd claimed `@dnd-kit` was "installed but unused, free for this," when it's actively load-bearing in `TrackPanel.tsx`. This is exactly why an independent code-grounded pass matters: an author re-reading their own doc tends to re-confirm their own assumptions, whereas the reviewer checks the claim against ground truth.

