# Insights Archive — 2026-07-11
# Rotated: 2026-07-11T17:58:32Z (3 entries)

### 2026-06-29 [02c770c2d846]

Wave 0 already has a **"safe-reuse triad," and the endpoint is its missing third leg:**
- `resolve_layers` (requirements.py) — *implicit* binding: kind-keyed, sole-survivor/newest-by-mtime, fail-loud. Used by `repeat_mask`.
- `resolve_explicit_bundle` (bundles.py) — *explicit run-time* binding: path-direct by label, `_assert_coherent` checks `chunk_layer_id` + `analyzable_digest`. Used by self_sim's `extract`.
- The new endpoint — *explicit display-time* discovery: enumerate + join the persisted layers so a human can *make* the explicit choice the binder will later enforce.
Per Sir's P7 decision-1 ("fully explicit references; binder validates coherence, not auto-discover"), the endpoint must **enumerate options, never auto-select**.

### 2026-06-29 [9246a6413522]

The deepest alignment question isn't the JSON shape — it's **whether the endpoint encodes self_similarity's needs or the *consumer contract's* needs.** Vision §3.3 + P7's "family of methods" framing both argue the latter: the thing being selected is "a coherent set of layer bundles for a layer-consumer," and self_sim is just the first consumer. Option C lets you commit to that semantics while keeping the route honest about who uses it today.

### 2026-06-29 [a2eb658f6c02]

- This endpoint is the **read-side of the dependency system** (vision §3.3). We already have two of three legs of the "safe-reuse triad": `resolve_layers` (implicit, kind-keyed, fail-loud) and `resolve_explicit_bundle` (explicit, run-time, path-direct). The endpoint is the missing third leg: **explicit *display-time* discovery** — enumerate bindable options, never auto-select.
- Because every future layer-consumer (the P7 method family, plus Wave-1 analyses that declare `layer_requirements`) needs the identical "which compatible layers can I bind?" view, a **consumer-neutral payload** means Wave-1 inherits its input-selector for free. That's why route-scope vs payload-shape are worth separating.
- The capability descriptors already carry the join keys (`chunk_layer_id` for size-selective joins; `chunk_analyzable_digest` for coherence), and the `stats` blocks are already in every manifest — so a rich, validated payload is essentially **free to assemble server-side**.

# Insights Archive — 2026-07-11
# Rotated: 2026-07-11T23:38:04Z (4 entries)

### 2026-06-29 [b6d940182c15]

The `params.py` cleanup is the subtle one: Python's `raise ... from e` preserves the exception *chain*, but the original code threw away the converter's message and substituted a generic `"must be {type_name}"`. Because `inputs` uses a *function* (`_parse_inputs`) as its "type", the old error read "must be _parse_inputs" — useless. The fix re-surfaces the converter's own `ValueError` text (guarded against empty messages) so a malformed `inputs` payload tells the user exactly which key is missing. This is the boundary-validation principle in practice: error quality at the system boundary (HTTP params) is a feature, not decoration.

### 2026-06-29 [92b02208764d]

- The JICM checkpoint and the scratchpad disagreed on a single point: the checkpoint froze at "reading the suite result," the scratchpad recorded the result. When two restored-state artifacts conflict, the **more recent + more specific** one (scratchpad: explicit exit code + test breakdown) is the better witness — but git is the only *ground-truth* witness, which is why I checked it first.
- The acceptance bar for a "seam-lift" pre-stage is unusually strict: not just "tests pass" but **byte-identity** of self-comparison outputs, with only *additive* manifest keys allowed. That's the contract that lets the future cross-text feature (P10) plug in without touching existing readers.

### 2026-06-29 [2d4654ca83de]

- **Estimate route deviation (flagged):** the plan wrote `/embedding/{label}/estimate`, but cost estimation happens *before* the embedding layer exists, so I keyed it on the **chunk** label: `/embedding/estimate?chunk_label=…`. The literal path can't apply pre-run.
- **Filter scope (flagged):** only a text-query filter is implemented. Structural filters (book/chapter/element-type) need a sections-track join the chunk layer doesn't carry — deferred, noted in code.
- **Test-caught bug:** the histogram silently dropped float-error-induced out-of-range distances (counts undercounted pairs). Fixed by clipping to the cosine domain `[0,2]` — a real production fix, not just a test patch.

### 2026-06-29 [9c3b8c15393c]

- **Reuse over re-implementation** was the throughline: `_yules_k`, the token regex, `STOPWORDS`, `detect_repeats`, and all six validators are *called*, not forked — so the new surfaces can't drift from the originals. The integrity report's injected-violation test enforces this: it corrupts the masked set and asserts the report catches it.
- **Leaf-module discipline:** `analysis/` takes the function-word set by *injection* rather than importing `tracks.repeats`, so it stays dependency-free of the track system (no cycle) while still reusing the one shared `STOPWORDS`.

# Insights Archive — 2026-07-11
# Rotated: 2026-07-12T01:18:18Z (1 entries)

### 2026-06-29 [0d29a8617b8d]

- This cleanly explains the 3/4 pass pattern: the band lanes (chunk/repeat) render from **static** `/data/.../signals/*.json` files the old server still serves, so coexist/toggle/overlay/reorder prove live. The embedding lane, scatter, integrity badge, and profile dashboard all need P3/P4 **routes** the stale process lacks — so they're verified by vitest (against the shipped contract) but can't render against this server without a restart.
- Restarting the demo server is shared-infra that may be Sir's live demo (KEEP-AS-DEMO) — not something to do unilaterally. The honest report is: FR-13 plural band rendering proven in-browser; P3/P4-dependent views proven by unit test pending a server refresh.

# Insights Archive — 2026-07-11
# Rotated: 2026-07-12T01:50:47Z (1 entries)

### 2026-06-30 [02ba2a7bfa15]

The split between "what's proven live" and "what's vitest-only" maps exactly onto **static files vs. dynamic routes**: anything served from `/data/.../signals/*.json` works against any server version; anything behind a P3/P4 route depends on the process being current. That's a useful operational tell — the frontend is correct, the *running process* is behind.

# Insights Archive — 2026-07-11
# Rotated: 2026-07-12T03:17:13Z (6 entries)

### 2026-06-30 [8d5f49c76962]

- The `palimpsest serve` CLI auto-kills the prior instance via a pidfile (`~/.palimpsest/serve-{port}.pid`), so the restart was atomic — no manual kill, no orphaned port. The "exit 143" notification was just SIGTERM to the old stale process, exactly as designed.
- The lane endpoint returning **196 bytes = 49 float32** confirms the embedding layer's on-disk vector DB is intact across the restart — the geometry the frontend needs is real, not a fixture.

### 2026-06-30 [a0b9c8f73a15]

- This is the payoff of the static-vs-dynamic split I noted earlier: the *same frontend code* that could only render band lanes against the stale server now renders all five view types against the current one — confirming the code was correct all along and the gap was purely the running process. The fix was operational (restart), not a code change.
- All 5 P5 Done-criteria are now verified **in-browser**, not just by unit test: reachable sub-tabs + layer manager (#1), descriptor-driven plural rendering with a 3rd lane kind (#2), coexist/reorder/toggle/overlay (#3), the P4 integrity report (#4), and the full test green (#5).

### 2026-06-30 [8812d52a6ef3]

- The load-bearing correctness decision in P6 was the **coordinate remap**: chunk offsets live in *analyzable* space, structural sections in *original* space. Comparing them naively would have produced plausible-but-wrong alignment fractions — the kind of silent bug that survives "looks green." I proved the remap is real (analyzable `2152 → original 4304`, landing near genuine section starts) before trusting any alignment number.
- Two flagged deviations, both choosing lower blast-radius over the plan's letter: a small zero-dep svg `Heatmap` instead of reusing the Characters-coupled `CooccurrenceHeatmap`, and a binned-polygon violin (no KDE dep). The multi-element-type violin is unit-proven on a fixture since the demo's only chunk layer is single-type.

### 2026-06-30 [297fa20c4e07]

- The **JICM checkpoint** (LLM-compressed via qwen3:8b) claims the current task is validating *track-toggle perf / keyboard.ts* fixes with "315 backend + 21 frontend tests" and latest commit `12c9df4` — but that mirrors a **stale session-state from ~June 15** (the file itself flags "last updated 21119m ago ≈ 14.7 days").
- The **scratchpad** (hand-maintained ground-truth ledger, updated 2026-06-30) tells a coherent, *much more recent* story: Wave-0 P5/P6 complete, committed `44e7e36`, **pushed** to origin/main, all of P1–P9 done.
- When a compressed memory conflicts with a primary source, I trust the primary source — and verify both against the actual git state rather than guessing.

### 2026-06-30 [dff70fe30e98]

- Reference-free reshapes the **ontology**, not the primitives. The pairwise alignment (an `OffsetMap` edge between two texts) is still the atom — but instead of collapsing everything onto one root axis, those pairwise edges *assemble into a graph*, and the graph becomes the canonical corpus object. Any single-text "root" view is then a **projection computed from the graph on demand**, not the ground truth. So I keep `DotplotView`/`OffsetMap` as the edge engine and add graph construction + graph viz on top.
- This makes the **Circos chord plot and the graph/bubble view primary** (not the secondary "advanced mode" I'd filed them under), and demotes the UCSC/JAX root-backbone browser to one selectable lens. It's more build (graph storage + a viz with no existing component), which your "higher cost" pick accepted.

### 2026-06-30 [f4d0e084563f]

- The reference-free decision lands cleanly because the plan makes the graph an *assembly* problem, not a new alignment algorithm: **C2 builds the pairwise edge, C3 assembles edges into the graph.** The genuinely new build is the graph viz (Circos/bubble), which no existing component covers — I've flagged it as the top risk and scoped it apart from the `DotplotView`/`OffsetMap` reuse.
- Two risks I want on your radar from the plan's register: the `O(N²)` corpus pair-cost (mitigated by ANN/MinHash candidate-generation before exact scoring, never a silent cap) and embedding-space incompatibility across members (fail-loud + explicit reconcile, never silent cross-model similarity).

# Insights Archive — 2026-07-11
# Rotated: 2026-07-12T04:09:14Z (7 entries)

### 2026-06-30 [76dd5f741b65]

- The plan cites FR-7/13/18/19/21/22 with no definitions in this vision doc — that's *correct*, not a dangling reference: those are Wave-0 substrate FRs (resolver, lane loop, Operand, seam-lift, cross-alignment, candidate→exact) that the collections tier consumes. The "non-goal: don't re-derive Wave-0 machinery" is what makes those cross-tier citations legitimate rather than scope creep.
- The recall-dial framing resolved your ANN concern structurally: by making candidate-generation *optional and dimension-driven* (small matrices stay exhaustive) with a forced-exhaustive escape, the speed knob can never silently drop a weak-but-real similarity — pruning is always reported. That's the difference between a performance optimization and a correctness hazard.

### 2026-06-30 [7386d61f3084]

- **Why aligned components are never singletons**: in a collection of distinct members, every alignment record links a *query* member to a *different target* member, so every edge crosses members. Thus every connected component touches ≥2 members → core or shell. Singletons can only arise from the *gaps* — paragraph regions that no cross-member alignment covers. That makes the partition clean and the classification provably exhaustive over each member's paragraph space.
- **Why paragraph coordinates suffice for the root projection**: records are paragraph-indexed, so projecting a passage onto a chosen root means reading off that component's anchor in the root member — no character-space `OffsetMap` needed at this tier (that's a C4/C5 refinement for sub-paragraph precision).

### 2026-07-01 [9a30a5a76935]

The turn's real work wasn't the render — it was making the fixture *honest*. The conservation lane was collapsing to one uniform "core" segment. Root cause was two committed-pipeline constraints interacting: `word_overlap` is raw Jaccard on `.lower().split()` (shared function words glue every paragraph), and `smith_waterman` needs `min_length=2` with `score = sim*2−1`. So a meaningful fixture requires **≥2 identical paragraphs per shared block** (to clear min_length) separated by **≥2 token-disjoint paragraphs** (2×−1 cancels the block's +2 buffer and resets the SW diagonal). Fixing the *data* to the engine's real constraints — rather than touching committed engine code — gave genuine core(1.0)/shell(0.667)/singleton(0.333) variation and real unaligned intervals for liftover's "dropped" path.

### 2026-07-01 [702ad33aaa6d]

The DR hierarchy is `book → section (chapter container, kept) → {header, heading[=chapter argument], chapter[=verse text], footnotes}`. The **actual gospel text lives in `chapter`-type sections** (`"1:1. The book of the generation..."`), while chapter arguments (`heading`), running heads (`header`), and `footnotes` are all `mask=true`. So **`extraction_types=["chapter"]` restricted to `include_container_ids=[book-0047, book-0048]`** yields exactly the Matthew+Mark verse text — editorial summaries and footnotes correctly excluded — with verse numbers preserved-but-masked and `remap_verses` re-coordinating `verses.jsonl`. That's precisely Sir's "actual Gospel text contents of chapters and verses."

### 2026-07-01 [494c16775ea9]

- **Complete + correct**: Matthew ch.1–28 (1070 verses) + Mark ch.1–16 (677 verses) = 1747, books = {Matthew, Mark} only, text runs from Matthew 1:1 to Mark 16:20. Chapter arguments ("genealogy of Christ") and other books (Genesis/Apocalypse) are absent.
- **Verse-number masking works**: reference has `"1:1. The book of..."`; analyzable_text drops the `"1:1."` token → `"The book of..."`. The 11,188-char reference/analyzable gap ≈ 1747 verse-number tokens.
- **One check needs disambiguation**: "husband of Mary" appears in the reference — but that's legitimately **Matthew 1:16** ("Joseph the husband of Mary"), not the footnote leaking. I need a footnote-*unique* phrase to confirm footnotes are truly excluded.

### 2026-07-01 [9f81b88ab552]

`chapter-verse` = **verse text** (`"The book of the generation of Jesus Christ the son of David…"`), `chapter` = **arguments** (`"1 That Jesus is that Messiah…"`), while `midtx`/`midtx1`/`midtx2` = **cross-reference apparatus** (`"a Luke 3:23"`, `"1 Chron. 2:5"`, `"CHAPTER 1"`) — i.e. Geneva's marginal footnotes. So the correct filter strips `second_scripture`/`fn-sub`/`fn_line`/`midtx`/`midtx1`/`midtx2` and keeps `chapter-verse`/`chapter`. This yields *cleaner* text than even the gold ingest (which left these cross-refs in), and keeping `split_003` restores Matthew 27-28.

### 2026-07-01 [753832a84931]

The "Mt28 risen MISSING" is a **check-phrase error, not missing content** — and the evidence proves it. Back in the parent-ingest check, "He is not here, but is risen" was found @3,850,707, which is *past* LUKE's start (3,709,835) — that phrasing is **Luke 24:6**, not Matthew 28. Geneva's Matthew 28:6 reads "for he is risen." So the child *correctly excludes* it (Luke isn't in Mt+Mk). This is actually corroborating evidence that Luke is properly excluded, alongside the explicit Luke/John/Genesis absence checks.

