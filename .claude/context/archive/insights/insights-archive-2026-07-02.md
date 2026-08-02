# Insights Archive — 2026-07-02
# Rotated: 2026-07-02T15:01:22Z (2 entries)

### 2026-06-16 [f47148369cfa]

The version matcher uses a **title signature** that normalizes volume wording and converts roman numerals *after structural words* to arabic — so "Ante-Nicene Fathers, **Vol_ I**", "**Vol. I**", and "**Volume 1**" collapse to one signature, while **Volume 1 ≠ Volume 3** stays distinct. Verified against your real Ante-Nicene folder: all three Vol-1 editions matched the import; Vols 3/5/6/II and the 10-volume sets correctly stayed `new`. The parsed title/author it extracts also feed the Step-1 search filter (#14) and accordion grouping (#15), so that frontend work is now unblocked.

### 2026-06-16 [d5693dcb11b0]

- The visual proof that this is now a *view* and not a *dialog*: the chrome is **structural** (a persistent header bar that owns the back/close affordances) rather than **floating** (an ✕ stuck in the corner of a panel hovering over a dimmed page). That distinction is what the requirement was really after — the import flow now feels like a destination you navigate to, not an interruption.
- Notice the empty lower half on Step 1 — that's expected and *intentional headroom*. A file picker doesn't need to fill 940px, but Steps 2/3 (the reader-like text view #19 and bigger overview #21) now have that whole region to expand into. #13 created the canvas those later tasks paint on.

# Insights Archive — 2026-07-02
# Rotated: 2026-07-02T17:43:36Z (3 entries)

### 2026-06-16 [67f4b5d401f4]

- I bundled by **subsystem in dependency order** (backend → wizard → reader) rather than trying to reconstruct exact edit chronology — when changes arrive intermingled in one working tree, dependency order is the honest approximation of "chronological-conceptual," and it keeps each commit independently reviewable.
- The biggest risk in a "commit everything" request is the **untracked-but-unignored** trap: `imports/` (983 MB) and `.claude/` weren't in `.gitignore`, so a careless `git add -A` would have pushed a gigabyte of copyrighted EPUBs. Staging by explicit path + a gitignore-first commit prevents that class of accident.

### 2026-06-16 [d0f8db96886c]

- The checkpoint had a **header/body mismatch**: the LLM-enriched "Current Task / Remaining" block was generated from a mid-task snapshot, while the captured conversation tail below it recorded the *successful push*. When these disagree, the raw conversation log + live `git` state are authoritative over the summarizer's framing — which is why I verified `rev-list` before touching anything rather than blindly "resuming."
- The work lives in a **standalone repo** (`CannonCoPilot/palimpsest`), distinct from this Aion monorepo — a `git add -A` here would never have reached it. The explicit-path staging discipline noted in the checkpoint was doing real work guarding the 983 MB `imports/` corpus.

### 2026-06-16 [3009e0e134c5]

- The removal commit reports **1,414,759 deletions** — that's *line* count, not files. The 68 P&P artifacts include large `tracks/*.jsonl` and `signals/*.json` analysis outputs where each annotation/segment is its own line, so a small file count carries an enormous line-delta. Worth noting because a reviewer skimming the stat line might mistake this for a catastrophic source deletion rather than the removal of generated demo data.
- I staged both commits with `--diff-filter` verification (68 deletions, 0 non-deletions; 2 adds, 0 strays) *before* committing. Verifying the staged set against an expected shape is cheap insurance against the classic `git rm -r` footgun where a glob or path typo sweeps in more than intended.

# Insights Archive — 2026-07-02
# Rotated: 2026-07-02T18:29:09Z (1 entries)

### 2026-06-16 [7bc7d0a96732]

- The most architecturally interesting change is the **`state/seed-model` file pattern**: instead of trying to keep `AION_MODEL` env-var propagation in lockstep across 5 entry points (launcher → seed window → executor.py → pipeline-watcher.py → bridge), the launcher now *writes* the model to one canonical state file and all downstream Python/shell readers fall back to it. That eliminates a whole class of "X doesn't see AION_MODEL because it was spawned before the export" bugs.
- The telemetry-policy change in `proxy.py`/`jsonl_parser.py` (always `cost = None`) is the codebase finally enacting the **"Anthropic Cost Headers" + "Fallbacks Are Failures" feedback memories** in MEMORY.md — no more guessed dollar values. The new `PROXY_DEBUG_ALL_HEADERS` env var is a smart diagnostic to verify the "no dollar header exists" claim empirically rather than assert it.
- Side effect of the policy change: `MODEL_PRICING` + `_compute_cost` in proxy.py are now dead code. They aren't removed, just orphaned — possibly preserved for future plan-based pricing modes, or just unfinished cleanup.

# Insights Archive — 2026-07-02
# Rotated: 2026-07-02T23:46:47Z (1 entries)

### 2026-06-16 [ceb009aab01a]

- **Root cause**: `project.py` derived the project ID as `_make_slug(title or source_path.name)`. The ID *is* the directory name, so the same file under different title-presence produced different IDs — and the only guard checked the *new* slug, never noticing the same `source_file` already existed under another slug. That's how two `the-mysteries-of-udolpho` projects (one title-slug, one filename-slug) coexisted.
- **The fix is dedup-by-identity, not dedup-by-name**: now the slug is deterministic from the source *file* (independent of title), and before creating a project, `ingest_file` removes *any* existing project with the same `source_file` — even under a legacy slug. Re-import is a clean replace; a title difference can never spawn a duplicate again.
- **Uploads were a hidden trap**: they ingest from a random temp path, so identity tracked `tmpXXXX.epub`. I threaded the original `file.filename` through as `source_name` so uploads get the real identity too.

# Insights Archive — 2026-07-02
# Rotated: 2026-07-03T00:29:19Z (1 entries)

### 2026-06-16 [431735416e1b]

- The restart was safe to do mid-session because the backend ran with **no `--reload`** — your old process kept serving stale code until I explicitly replaced it. I launched the new one detached (`nohup … & disown`) so it inherits init as parent (PPID 1) like the original and survives this session ending.
- The two fixes are genuinely independent (frontend interaction vs. backend data-integrity), so they're separate commits — each reviewable and revertable on its own.

# Insights Archive — 2026-07-02
# Rotated: 2026-07-03T05:05:21Z (5 entries)

### 2026-06-17 [5ae256181028]

- JICM checkpoints are lossy snapshots. The LLM compressor captured a mid-session TODO and froze it as "current task," but the scratchpad (transient L1 memory, written later) shows that TODO was resolved. When two memory tiers disagree, the finer-grained, later-written one usually wins — and my standing guidance is to **verify empirically rather than trust either blindly**.
- The genuinely open item per the scratchpad is a *decision*, not a bug: the Palimpsest repo's `main` is 2 commits ahead of `origin/main` and was never pushed.

### 2026-06-17 [625dec069593]

- `git rev-list --left-right --count origin/main...main` → `0 2` cleanly proves the branch diverges only by being *ahead* (0 behind, 2 ahead) — so a push is a clean fast-forward with zero risk of clobbering upstream. That's the kind of check worth doing before proposing a push.
- A push is a shared-state, hard-to-reverse action, so I won't do it unprompted even though the work itself is finished and verified — that's a confirm-first boundary.

### 2026-06-17 [9b64a29d76e4]

- 821 chapters → 807 headers: 14 chapters weren't carveable (heading boundary not separable, e.g. `head_end == section end`), so they fall back to the old full-span behavior with no header — exactly the safe degradation the carve guard provides. No chapter was lost or zero-lengthed.
- The "identical masked intervals" check is the key safety proof: because the header window already masked the heading, moving the chapter's *start* to that same boundary changes which element is labeled the heading, not which bytes are masked.

### 2026-06-17 [9930231ea38c]

- Two distinct bugs compounded: a *classification* gap (book-prefixed chapter headings) and a *localization* bug (raw vs normalized offsets). The harness made them separable — fixing classification first exposed the precision crash that revealed the offset drift. This is why data-driven scoring beats eyeballing: the precision metric pinpointed the second bug.
- The offset fix lives in `ingest_file`, so it benefits *every* book and the live app — but it means all works must be re-ingested to re-baseline.

### 2026-06-17 [4a6f376c0adc]

- The Detect pipeline (`detect_layout_sections`) is **heading-driven**: it only creates sections at heading boundaries from the EPUB track or segmenter. It has no concept of "this *run* of body text is scripture vs. that run is commentary."
- Both remaining translation investments need something the pipeline lacks: a **content-scanning pass**. Verse-density (inv. 3) must scan body text for verse-dense regions; Octapla version-blocks (inv. 2) must scan for inline version labels. Neither is a heading — so this is a genuinely new detection mode, not a tweak to `_classify_heading`.
- That's why empirical inspection matters before coding: I need to see the actual Study Bible / Octapla text layout (verse numbering, paragraph structure) before designing heuristics, rather than guessing.

