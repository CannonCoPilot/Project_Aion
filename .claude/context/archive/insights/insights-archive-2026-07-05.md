# Insights Archive — 2026-07-05
# Rotated: 2026-07-06T05:34:09Z (4 entries)

### 2026-06-18 [d775fbb83364]

- **The premise didn't hold, so I'm falling forward, not back:** none of the 11 dropped files contains all four works — in LDS publishing the KJV Bible is *always* bound separately from the Triple Combination, so a single-file "Quad" essentially doesn't exist digitally. But four-work *coverage* is already achievable: `LDS_eng.pdf` gives BoM+D&C+PoGP, and the corpus already holds KJV/Bible members (idx 97 Holy Bible, plus Douay 5/100, Geneva 6).
- **PDF is a different beast than EPUB for this pipeline.** Two consequences visible already: (1) extraction injects artifacts — soft-hyphens (`com­\nmanded`), hair-spaces, and footnote-anchor letters fused into words (`a church`, `b kingdom`); (2) `ingest_file` gets *no* nav `sections` from a PDF (project.py:339-342), so the layout detector loses its EPUB heading scaffold and must recover structure from text alone. That's a harder case — but it's exactly the "adapt to another format" + structure-presence stress test, so it's valuable gold.

### 2026-06-18 [f74ccaeaf4d5]

- The verifier is doing double duty: it's both the *satisfaction check* for this review and the **ground-truth half of the A3 gate**. By cross-checking each annotation's `mask` against `DEFAULT_MASK_BY_TYPE`, it closes the loop with the schema I committed earlier — if anyone later flips a masking default in `layout.py`, the gold instantly flags the divergence. The taxonomy and the gold can't silently drift apart.

### 2026-06-18 [39553b913555]

- What the gold makes undeniable: across scripture, epistolary, and poetry, the detector exhibits the *same three failure modes* — **mis-typed** (Dickinson poems→chapter), **undetected** (Frost/Correspondent→one blob), **mirage** (Challoner/LDS score ~100 while grossly mis-segmented). The gold set now *quantifies* each (expected 589 vs typed-as-chapter, expected 96 vs 1, etc.), which is exactly the recall signal the scalar composite is blind to.
- I deliberately left Geneva's and LDS's `expected_count` null rather than assert a plausible-but-unverified number — the gold's authority depends on every figure being earned from the text (Douay's 1334, Dickinson's 589, Cummings's 84 all are). A fabricated count would be the very Goodhart trap we're escaping.

### 2026-06-18 [c1ef9c80a5af]

- The sharpest tension in the plan: **A3 wants to start (it'll prove the gold's value), but B1 must not (it'll propagate the gold's errors).** A3 is safe to build now precisely because it only *reads* the gold to produce a metric — if the metric looks wrong, that's diagnostic. B1 is unsafe because it *bakes* the gold into a model. So "build A3, gate B1 on ratification" isn't arbitrary ordering — it follows from which steps consume the gold reversibly vs irreversibly.

