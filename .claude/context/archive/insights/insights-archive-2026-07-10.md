# Insights Archive — 2026-07-10
# Rotated: 2026-07-10T17:09:11Z (2 entries)

### 2026-06-26 [0e490f6c8b58]

- **This is a genuine model mismatch, not just missing code.** The CLI `analyze` is "run everything with sensible defaults," but a chunk layer has *no* sensible default mode — choosing `word` vs `verse` vs `slide` is the analysis. The two models don't reconcile by adding a default; they reconcile by giving the CLI a *single-track-with-params* surface (mirroring the HTTP per-track endpoint), which is a small design choice you should weigh in on.
- **Pre-existing, not introduced here:** the layer tracks already required params at P2 commit1 (969ea6d), so the CLI skip behavior predates my rename — I only changed the param name in the skip message.

### 2026-06-28 [7389afde4c6e]

- **`set_mask_override` is a mask-*profile* hook, not an interval hook.** It takes per-type/per-section keep/mask *toggles* (`MaskOverrideRequest`), and the one raw-interval channel into the excised set (`extra_masked`) is hardwired to the verse layer (`project.py:299`). So my "natural injection point, reuse for free" claim was overstated — and the line was wrong (`1016`/`project.py:198`, not `1027`).
- **The substrate underneath is still genuinely reusable — that part held.** `masked_intervals(extra_masked=…)` → `_complement_spans` → `OffsetMap` already unions and remaps arbitrary disjoint spans. So pre-chunk hiding reuses the coordinate *math* unchanged; what it actually needs is new *plumbing* to feed repeat intervals into `extra_masked` (an interval field on the override + a branch, or a dedicated `ChunkingTrack` hook).
- **This is why the verification pass earns its keep.** "Reuses an existing hook for free" vs. "reuses the coordinate path but adds plumbing" is a real difference in P8's effort estimate — the kind of thing that should be honest in a plan before a human commits to it.

# Insights Archive — 2026-07-10
# Rotated: 2026-07-10T19:05:25Z (1 entries)

### 2026-06-28 [286245a51220]

- **The P8 mechanism text now states the honest cost split:** "no new coordinate *math*" (the `masked_intervals(extra_masked=…)` → `_complement_spans` → `OffsetMap` path genuinely remaps arbitrary disjoint spans) **but new interval-injection *plumbing*** — because `extra_masked` is hardwired to the verse layer at `project.py:299` with no caller-interval channel. That math/plumbing distinction is a real difference in P8's effort estimate, which is exactly what a plan should be honest about before a human commits.
- **The distinct-layer property still falls out for free:** a repeats-hidden run chunks an excised view, so its `analyzable_digest` (already in the label, `chunking_track.py:171/189`) differs automatically — the hidden and un-hidden chunkings coexist as content-addressed siblings with no special label-casing.

# Insights Archive — 2026-07-10
# Rotated: 2026-07-11T00:41:08Z (1 entries)

### 2026-06-28 [621e064f8b04]

- **The verification pass's "new plumbing, not free reuse" correction proved exactly right.** The coordinate *math* (`masked_intervals → _complement_spans → OffsetMap`) was reused untouched, but the repeat intervals genuinely needed a new injection channel — the `extra_masked` parameter — because the existing one was hardwired to the verse layer. Had the docs still said "reuse an existing hook for free," I'd have gone looking for a hook that wasn't there.
- **The equivalence test is the load-bearing one.** `test_matches_self_similarity_inline_at_default` proves `repeat_mask` flags *exactly* the chunks `self_similarity`'s inline pass flags — that's what lets P7 later consume this layer instead of masking inline, with confidence the behavior is preserved.
- **One real regression surfaced and was a stale test mock**, not a logic bug: a monkeypatched `masked_intervals` lambda had the old arity. The fix mirrored the new signature — a good signal that the param change rippled exactly as far as expected and no further.

# Insights Archive — 2026-07-10
# Rotated: 2026-07-11T01:32:02Z (1 entries)

### 2026-06-29 [4d620f5d0d46]

- The redesign's blast radius is contained exactly where the layer boundary moved: every failure is an *interface* mismatch (old param names at the HTTP edge), not a *logic* error. That's the signature of a clean refactor — the new core (`extract`, bundle resolution, matrices) is correct; only the request-forwarding seam lags.
- My `params.py` chaining change is confirmed harmless here: these failures come from the `unknown parameter` path (params.py:93), which I didn't touch — distinct from the converter path I improved.

