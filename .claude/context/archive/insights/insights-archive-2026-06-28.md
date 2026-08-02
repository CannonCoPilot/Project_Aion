# Insights Archive — 2026-06-28
# Rotated: 2026-06-28T22:13:24Z (1 entries)

### 2026-06-14 [73e737dfcac4]

**Why the original approach failed**: The fundamental issue was treating all four metrics identically — paragraph-level pairwise distance. Embedding-based metrics (cosine, Jaccard on embedding dimensions) work at paragraph level because they capture *semantic* similarity across 2560 dimensions where function words have negligible weight. But token-level metrics (word overlap, edit distance) need to operate on units where individual words matter — sentences of 5-30 words, not paragraphs of 50-500 words. At paragraph scale, every pair shares dozens of function words, making the Jaccard numerator meaningless.

The stopword removal is equally critical: in KJV English, "ye", "unto", "thou", "the", "and" appear in virtually every verse. Without removing them, word overlap measures English grammar frequency, not content similarity.

**What's still missing** (for a future iteration): LASTZ-style local alignment would use the sentence-level similarity scores as a *substitution matrix* and run Smith-Waterman to find extended aligned regions — sequences of multiple sentences that correspond between different parts of the text. This would reveal structural parallels like the Sermon on the Mount's tripartite formula ("Ye have heard it said... but I say unto you...") as contiguous aligned blocks rather than isolated sentence pairs.

# Insights Archive — 2026-06-28
# Rotated: 2026-06-29T00:15:32Z (2 entries)

### 2026-06-14 [653a28554254]

**Sliding window in action — boundary resolution improvement:**

The coarse pass found chunk 0 ("The quick brown fox jumps over the lazy dog and") matching chunk 3 ("the dark night sky over the mountains. The quick brown"). These 10-word non-overlapping chunks only partially captured the repeat.

The sliding window refinement extended both boundaries to reveal the full repeated passage: *"The quick brown fox jumps over the lazy dog and"* appears in both regions, plus surrounding context. The refinement operates at 1-word stride, so boundary precision improved from 10 words to 1 word — exactly the 10× improvement we expected.

The key design choice: we only slide at the **endpoints** of each alignment (forward from end, backward from start), keeping the cost linear in the alignment length rather than quadratic in the text size.

### 2026-06-14 [587843f0ac62]

**What the alignments reveal about Jekyll & Hyde:**

The 3 deduplicated alignments tell a meaningful story:
1. **Alignment 1** (identity=0.508): Two narrative passages about characters being "blotted out" / hidden — a thematic echo of Jekyll's dual nature and concealment motif
2. **Alignment 2** (identity=0.418): Copyright boilerplate near the end — these are near-duplicate legal text, exactly the kind of structural repeat the tool should catch (and the user noted in the pre-clear session)
3. **Alignment 3** (identity=0.416): Two scenes asking about "the door" / "the place" — recurring motifs around the mysterious door to Jekyll's laboratory

The sliding window refinement expanded alignment 1 from 185→257 chars and alignment 2 from 186→247 chars, capturing more of the actual matching region. These are the kind of sub-chunk boundary improvements that matter for close reading.

# Insights Archive — 2026-06-28
# Rotated: 2026-06-29T02:09:53Z (1 entries)

### 2026-06-14 [6fdacc0a3359]

**Multi-agent adversarial review design:**

This workflow applies three quality patterns from different angles:
1. **Adversarial code review** — 4 dimensions (correctness, security, performance, architecture), each trying to *refute* that the code is correct
2. **SME stakeholder review** — 4 domain experts (computational linguist, bioinformatics alignment expert, data visualization specialist, digital humanities scholar) each evaluating through their professional lens
3. **Playwright UI verification** — agents actually drive a browser against the running app, taking screenshots and verifying real behavior matches expected behavior

The adversarial pattern is key: each reviewer is instructed to *find problems*, not confirm correctness. Combined with the perspective diversity of 4 different SME lenses, this maximizes the chance of catching issues that a single comprehensive review would miss.

# Insights Archive — 2026-06-28
# Rotated: 2026-06-29T03:27:36Z (3 entries)

### 2026-06-14 [1ee828bfb3db]

**Architecture of what was built in this session:**

The self-similarity system went from a single-metric paragraph-level comparison to a multi-resolution, multi-metric LASTZ-style alignment engine with four-direction search. Here's the data flow:

```
Text → _chunk_text(cs) → Chunks → ┬─ _embed_chunks → Cosine/Jaccard matrices
                                    ├─ _word_overlap_matrix (w/ repeat masking)
                                    ├─ _edit_distance_matrix (w/ repeat masking)
                                    └─ Per-metric _lastz_align → Parallel + Antiparallel alignments
                                    
Stored as: signals/self_similarity_cs{N}/{metric}.bin + alignments_{metric}.json

Multiple chunk sizes → Manifest tracks available_chunk_sizes → Frontend instant switching

All matrices → boundary_detection.py → DI + Insulation → 3-state HMM Viterbi → Domain boundaries
```

The key architectural decisions:
- **Per-chunk-size directories** (`self_similarity_cs7/`, `cs11/`, `cs15/`) enable multi-resolution caching
- **Per-metric alignments** mean cosine similarity finds different structural repeats than edit distance does
- **Antiparallel alignment** (the chiasmus detector) is unique to text analysis — genomics rarely needs this
- **Repeat masking** accelerates computation by skipping formulaic phrases, then unmasking for final scoring
- **The HMM boundary detector** aggregates evidence across all metrics × all chunk sizes for robust domain finding

### 2026-06-15 [12339e80c76e]

**Performance optimization patterns applied:**

The track toggle fix demonstrates a key React performance pattern: **selector-level granularity**. Instead of subscribing to `useTrackStore(s => s.tracks)` (entire object, new reference on any mutation), components now use `useTrackVisibility(name)` which returns a single boolean. This converts O(N) re-renders to O(1) — only the toggled track's components re-render.

The server-side semaphore (`asyncio.Semaphore(3)`) is the async equivalent of a thread pool max-workers cap. It prevents CPU saturation from concurrent matrix computations while still allowing I/O-bound operations (embedding fetches, file writes) to proceed concurrently. The auto-run jobs are serialized within the semaphore to avoid 3 simultaneous O(n²) computations.

### 2026-06-15 [7fecc8f3e8fd]

**The three critical bugs share a common pattern**: they're all cases where the UI promises more than the backend delivers silently. E1 shows 4 checkboxes but sends 1 metric. E3 masks repeats for cosine but silently unmasks them for later metrics. E2 sizes the canvas once but never updates. In each case the user sees correct-looking UI but gets incomplete results — the most dangerous class of bug because it's invisible.

