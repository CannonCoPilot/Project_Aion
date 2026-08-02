# Insights Archive — 2026-07-13
# Rotated: 2026-07-14T01:31:27Z (8 entries)

### 2026-07-01 [59e30db92732]

I placed 6 blocks along the *main diagonal* with only 2 zero-cells between them. But Smith-Waterman tolerates mismatches: each 3-cell block accumulates H≈2.4, and a 2-cell gap only costs ~2, so H never resets to 0 — the optimal local path correctly chains all 6 into *one* alignment spanning [0,28]. That's correct SW behavior; my premise of "6 separate blocks" was flawed. Placing the blocks on an **anti-diagonal** (disjoint rows *and* cols, not chainable by one monotonic path) gives genuinely separate alignments.

### 2026-07-01 [45c9e4109698]

The recall numbers tell the story cleanly: word-overlap LSH sweep measured **0.102** recall (translations share content, not wording), while the cosine embedding sweep measured **1.0**. Same dial, same collection — the difference is entirely the metric's fit to the signal. The workbench surfaces both honestly, so a user sees *why* to reach for embeddings on a cross-translation corpus. That's the empirical payoff of the metric-congruence design: the tier doesn't just permit embeddings, it makes their advantage legible.

### 2026-07-01 [a6d816f45b3c]

The audit's credibility rests on a **self-refutation gate**: after 18 agents produced 70 findings, a second adversarial pass tried to *refute* each high-severity finding. Zero of the 8 highs were refuted (4 confirmed outright, the rest narrowed to "partial"). That asymmetry — many findings, but no false-positive highs — is what separates a trustworthy audit from an LLM that just enumerates plausible-sounding concerns. The report foregrounds that "0 high refuted" number precisely because it's the hardest metric to fake.

### 2026-07-01 [81e40d3b8093]

- **Root-cause clustering is the leverage here.** Of 109 findings, the ~30 highest-severity collapse into ~8 backend roots (graph over-merge, phyletic distance, embedding-DB split, p-values, atomicity, cl-math) and ~8 frontend roots (member labels, Compare auto-load, dotplot legend, empty-state CTAs). Fixing a root retires its whole dependent cluster.
- **Correctness before cosmetics, and in dependency order**: the graph-threshold fix must land first because the phyletic tree, near-dup clustering, block map, and conservation lane are all *downstream* of it — fixing them without it would be polishing degenerate data.

### 2026-07-01 [a73d27bd8b41]

Two robustness patterns worth noting here: (1) **`asyncio.to_thread` for CPU/IO-bound work in async handlers** — FastAPI runs `async def` handlers on the event loop, so a synchronous `sweep_pairwise` over millions of pairs would freeze *every* concurrent request until it finished; offloading to a thread keeps the loop responsive. (2) **acquire/try-finally-release** is the semantic equivalent of `async with semaphore` but avoids reindenting a 60-line body — the semaphore is held for the whole compute and always released, even on exception.

### 2026-07-01 [6239a01f9e34]

Half-open intervals `[s, e)` are the standard for text offsets precisely because they compose cleanly: adjacent spans `[a,b)` and `[b,c)` tile without overlap or gap, and length is simply `e - s`. The `<=` here broke that invariant — offset `e` belongs to whatever comes *after* this span, never to it. With contiguous spans the `bisect` already routed `off==e` to the next span, so the bug only bit when a real gap followed (the dropped-region case that should return `None`).

### 2026-07-01 [f9eb6b423046]

Two of these were **methodology-honesty** fixes in your genomics idiom, not cosmetics: (1) the cross-similarity manifest carries *no* metric field, so I derived the dotplot's domain label from `records[0].method` — the UI now refuses to assert a metric it can't verify. (2) The Diff view's "everything changed" on near-identical Bibles is a *frameshift* artifact: one extra verse-paragraph in Geneva shifts every downstream index, and a positional LCS diff cascades — exactly like a single indel wrecking a naive base-by-base genome comparison. The banner names the algorithm so you read that signal correctly.

### 2026-07-01 [d1333904058d]

This is exactly why your rule (score over identity for core-splitting) is the right call, and it's the ortholog/paralog problem in disguise:
- **Matt-translation-A vs Matt-translation-B** (shared *source*): the whole book aligns verse-by-verse — one long collinear diagonal → **high score** (~99–622 in the live 6-way run) AND high identity.
- **Matt vs Mark** (shared *content*, different source): only scattered synteny blocks (shared pericopes) align — short fragments → **low score** (~1.3–4.4) even though a shared story's *per-block identity can be as high as a translation's* (0.66–0.84, overlapping the same-book 0.58–0.86 range).

So **identity cannot separate them** — the discriminator you asked for. **Score can**, because it encodes *coverage* (how much of the two texts is collinearly alignable), which is precisely "shared source" vs "shared content." One nuance to bank for your refinement pass: raw score is length-proportional, so a *fixed* score threshold is collection-scale-sensitive; its scale-free cousin is **coverage** (aligned length ÷ text length), the bit-score-style normalization. I'll implement the `score` lever you specified now and flag coverage as the robust generalization.

