# Insights Archive — 2026-07-04
# Rotated: 2026-07-04T07:16:37Z (6 entries)

### 2026-06-18 [966849e1697a]

The Clear Quran's verse numbers are present but formatted **"88. They say…"** (number-period-space, run inline). The verse detector's regex expects `N Text` or `N:M Text` — a number followed directly by a period (no digit after) breaks it, so it matches nothing → vd=0 → no translation overlay. The 1,785 "1:1"-style hits are cross-references in notes, not verse markers. And there are zero "Surah"/"Chapter" headings to anchor surah segmentation. So idx 23 fails for *two independent reasons*: an unhandled verse format **and** the sparse-heading segmentation gap.

### 2026-06-18 [c37187f024c8]

The `mask_as` mechanism delivers the toggleable-layer intent with zero score cost. **idx 10: masked 0.50→0.75** (Irenaeus and the other attribution-less ancient works now mask), **idx 20: 0.06→0.63** (its 79 patristic chapters mask) — both composite-unchanged. Novels (0/2/9) and the study Bible (idx 11) are byte-identical (the gate requires a "Translation" attribution or "Elucidations", which a study Bible's "Scripture" overlay doesn't trip). And idx 17/18 stay conservative — the gate doesn't fire on them — which matches your call to not chase the redundant poorly-formatted copies.

### 2026-06-18 [4eb2be69dc94]

- **idx 33 is a textbook rubric mirage** (composite 100, but broken): all **6 detected "chapters" carry identical metadata `{'number': '108', 'name': 'An Appendix...'}`** — the detector found only references to the *final* chapter heading and stamped every boundary with it. The real 108-chapter structure is undetected; the whole work is one `body` blob [1249–256960]. Coverage 100 is the canvas illusion (body covers everything), exactly like Edgar Huntly (8) and Schaff (18).
- **idx 29 confirms FIX #2 did not generalize**: there are **zero `chapter` sections** — Asad's surah headings don't match the Khattab `N. Name\n( Arabic)` pattern, so no surahs segmented. Worse, `front_matter` swallows the first **1.33M chars (43%)** and a single `body` blob covers 1.77M more, with appendices mis-ordered mid-document. The 26 `translation` regions are actually Asad's *footnotes* ("1 It is to be borne in mind..."), not surah text.

### 2026-06-18 [200c4b5d33d7]

- **idx 29 Asad — the structure was never missing.** The EPUB heading track cleanly exposes all 114 surahs as a 3-line group: `L1 "THE FIRST SŪRAH"` + `L2 "Al-Fātiḥah(The Opening)"` + `L3 "Mecca Period"`. The detector failed because its chapter/division recognizer keys on **digits/Roman numerals** and can't read **English ordinal-word** heads ("THE FIRST SŪRAH"). With 0 divisions recognized, `body_start` fell through to the gap heuristic and landed at **1,331,960 — past all 114 surahs** — swallowing 43% as front_matter and dumping the rest into a 1.77M body blob. The fix can *use the existing track* rather than text-scanning. That's lower-risk than the Khattab case.
- **idx 33 Enoch — opposite failure.** Heading track exposes only **3 boundaries** (Introduction / Abbreviations / "The Book of Enoch"); no chapters. Real structure is inline `N.␠␠␠M.` (chapter.verse — **104 matches ≈ Enoch's 108 chapters**). FIX C's `^Chapter N` caught only **6 stray prose mentions** of chapter numbers from the Introduction, mislabeling all 6 as "Chapter 108." Same N.M. family as the idx-23 verse-format gap.

### 2026-06-18 [bb6462f164ea]

The EPUB has only **6 boundaries, and they're misanchored**: the nav links for "Chapter 8. Appendix" (@1023), "Chapter 9. Endnotes" (@1044), and "Chapter 1. Introduction" (@1145) all resolve to a **front TOC fragment** clustered at offsets 1023–1145, *not* to where those chapters actually are in the body. Compounding it, two titles collide with matter-type keywords — `_classify_heading` checks `_APPENDIX_RE`/`_INTRO_RE` before the chapter regex, so "Chapter 8. Appendix" → `appendix` and "Chapter 1. Introduction" → `introduction`, leaving only one item classified structural. That's why my run-of-3 suppression never fired.

### 2026-06-18 [6b9dd9654fe1]

The **114 chapters are correct** — this Penguin edition reproduces the **1830 text** with its original ~114 long chapters (not the modern 239-verse-chapters), so 100 coverage is genuine, not a mirage. **But the 15 books are missing** — `by_type` has no `book` type. The Book of Mormon's books (1 Nephi, 2 Nephi, Jacob, …Moroni) don't segment, so chapter numbering restarts per book (multiple "CHAPTER I") with no book grouping to disambiguate them. The book headings sit unrecognized — "THE FIRST BOOK OF NEPHI" doesn't match `_BIBLE_BOOK_NAMES` (a Genesis/Exodus lexicon) and apparently no structural regex either.

# Insights Archive — 2026-07-04
# Rotated: 2026-07-04T08:39:20Z (7 entries)

### 2026-06-18 [5243542295b9]

**The whole fix turned on one structural fact, validated before editing:** in a table of contents, book entries are separated by *their own chapter listings*, so book markers alone never look like a "compact run" to the TOC-dropper — but the interleaved book+chapter stream does. Simulating the offsets first (rather than coding then debugging) confirmed the merge-then-drop approach would leave exactly the 14 real body books, and let me catch a regex grouping bug (`FOURTH\s+` vs `(?:…)\s+`) on paper instead of in a failing eval.

**Regression safety came from reachability, not from careful tuning:** because the recovery block is gated on `n_struct < 5`, the three works with real `book` tracks (idx 10/16/20) can't execute it at all. "Provably unreachable" is a stronger guarantee than "tested and didn't change" — the byte-identical book counts (73/5/7) just confirmed what the control flow already forced.

### 2026-06-18 [7cdc58027d2b]

**The rubric mirage struck again — and semantic review caught it.** idx 30 scored a clean 100.0 (coverage 100, 0 flags), yet was silently missing chapter XXV: its text was absorbed into chapter XXIV, so the "body canvas" covered the gap and the rubric saw nothing wrong. This is the third instance of the same trap (idx 8 Edgar Huntly, idx 18 Schaff). The lesson the PROGRESS log keeps re-teaching: a 100 means "locally well-formed," not "correct" — only reading the spans against the source finds the missing structure.

**A deferred fix found its anchor.** On idx 40 I'd identified the matter-word collision but *declined* to fix it — a `_classify_heading` reorder is a core-path change, and fixing it on a single pathological work risks a blind regression. By waiting until idx 30 (a clean, well-understood novel) drove the same bug, I gained a trustworthy regression anchor: the fix could be validated against a work whose correct output I fully understood, and the eval-all then confirmed it *also* improved idx 40 (+0.2) with zero collateral. Patience converted a risky edit into a safe one.

### 2026-06-18 [79580eaa8d33]

**The rubric scored idx 32 at 96.7 while the entire novel was mis-masked.** Coverage read 100% because the tiny 170-char glossary "body" was fully covered — the 664K-char novel sitting in `front_matter` contributed nothing to the "uncovered body" metric. This is the most extreme rubric-mirage yet: a near-perfect score on a near-total masking failure. It's exactly why the protocol mandates reading spans (`review.py` / direct section dumps), not trusting the composite — and why I dump `body_start` and section spans on every "100-but-suspicious" work now.

**Knowing when *not* to fix is part of the discipline.** A body_start heuristic is the single most load-bearing derivation in the layout — every front/body/back boundary flows from it. A narrow "ignore a lone trailing numeral" guard might pass eval-all on 28 cached works yet regress one of the ~70 uncached ones. Against the user's hard "no cross-textual regression" constraint, that asymmetric risk argues for a flagged, well-specified hand-off over an autonomous edit.

### 2026-06-18 [4292667e6c72]

**Optimizing a metric sometimes means fixing the metric.** When the descriptive-title fix dropped idx 32's metadata score to 0, the naive move would be to make chapters carry fake numbers to satisfy the rubric. Instead the rubric was wrong: it credited only `number`, ignoring `name`, despite its own stated criterion being "do elements carry structured metadata?" A named chapter *is* metadata-rich. Fixing the measurement (number OR name) is legitimate precisely because it's a superset — it can only raise scores, so it cannot hide a regression in any other work. Knowing the difference between fixing a metric and gaming one is what keeps that move honest.

**Tightening a detector after it over-fires is normal, not failure.** `detect_toc_headings` initially fired on Infinite Jest's opening fragments and a scholarly anthology. Rather than abandon it, three targeted gates (last-resort-only, skip-scholarly, substantial-titles) narrowed it to exactly the case it's for. A new detector's first regression sweep is where you learn its true boundary conditions.

### 2026-06-18 [e9e8ea256983]

- **idx 62 Pistis Sophia (100) is GENUINE** — 148 real chapters (Pistis Sophia has exactly 148), front matter (preface/intro/bibliography) and body cleanly split. True-100, no work needed.
- **idx 42 OT Pseudepigrapha (100) is a RUBRIC MIRAGE** — only **3 chapters** detected, with "chapter 3" spanning **1.9M chars (76% of the doc)** as one blob. It's the same Eerdmans scholarly-anthology class as idx 4/48 (many constituent pseudepigrapha, each "A new translation and introduction by…"), but `detect_scholarly_markers` isn't firing — 3 stray "Chapter N" headings from one constituent work suppress it. Coverage 100 hides gross under-segmentation.
- This re-confirms the core lesson: **semantic review catches what the rubric cannot.**

### 2026-06-18 [954304f83a77]

- **Why `nohup` + `disown` here**: A bare `&` would die when this Jarvis-dev session terminates. `nohup` ignores HUP, `disown` removes it from the shell's job table — the sleeper survives even if W11 is closed or my Claude Code session ends. Critical for a 4-hour delay where my session won't be alive the whole time.
- **Two-step send-keys (text then Enter)** is the canonical gotcha from MEMORY.md — combining them via `-l` or a single send-keys call mangles input. The 0.5s gap between text and Enter is empirically tuned for tmux's input buffer to flush.
- **macOS `sleep` vs `at`**: `sleep 14400` is robust as long as the Mac doesn't suspend. `at` would survive sleep/wake but requires `atrun` enabled (off by default on macOS). For this 4h window with the Mac likely awake (Sir is actively working), `sleep` is the simpler correct choice.

### 2026-06-18 [211567728d8c]

- **PPID=1 confirms detachment worked**: When a process's parent dies and `init` (PID 1) adopts it, that's proof `nohup`+`disown` did their jobs. If PPID still pointed at my shell, the worker would die with this session. PPID=1 = bulletproof.
- **Target-by-name (`aion:Jarvis`) vs by-index (`aion:0`)**: Indexed targeting (`aion:0`) is fragile — if Sir reorders windows, the trigger fires into the wrong pane. Name-based targeting is self-correcting because tmux looks up the window by its current name. The script will still find W0:Jarvis even if it ends up at index 7.
- **Risk window**: If the Mac suspends for more than a few minutes during the 4h, the sleep continues from where it paused (monotonic-ish on wake) but real wall-clock fires later than 04:32 MDT. If Sir needs exact wall-clock fire, `at`/`launchd` would be more robust — but at the cost of more setup. For "approximately 4h from now," sleep is fine.

# Insights Archive — 2026-07-04
# Rotated: 2026-07-04T10:06:55Z (6 entries)

### 2026-06-18 [35e6d0d86568]

- **Wakeup gap caught me asleep**: My ScheduleWakeup fired ~8.5h late instead of ~3min late — likely Mac suspend swallowed the timer. This is exactly the risk I just flagged for the 4-hour Jarvis trigger script. The good news: Sir's manual prompt re-anchored me. The bad: a *fully autonomic* loop on a laptop that sleeps is unreliable. For mission-critical fires, `launchd` with `StartCalendarInterval` survives sleep correctly.
- **Phase A succeeded end-to-end without my supervision**: The repaired backend completed all 7 tickets, produced 10 docs (3 more than the 7 originally specced — suggests reviewer asked for supplementals), pin auto-rolled, daemon auto-rolled, chain windows cleaned up. The whole self-healing fortress ran without anyone watching for 6+ hours. That's the strongest possible validation of the 6 root-cause fixes from yesterday.
- **Seed/daemon both rolling cleanly under load is the architecturally important signal** — earlier in the session a daemon roll meant crashing. Now it means the system handled at least one `/compact` cycle gracefully. The autonomic spec actually works.

### 2026-06-18 [3a03fdb00ff5]

**The two triggers are deliberately independent failure domains.** The CronCreate job lives in the harness scheduler (survives a JICM session restart via `durable:true`), while the bash timer is an OS-level detached process that injects directly into tmux — mirroring exactly how the JICM Watcher nudges this window. If the harness restarts and drops in-memory state, cron's disk persistence covers it; if the Claude process itself wedges, the external bash process still fires. Redundancy means *no single point of failure*, which requires the mechanisms not share infrastructure.

### 2026-06-18 [fd001f2209cc]

idx 34 is a **Spanish edition** whose EPUB boundaries land **mid-word**, and the single leading letter happens to be a Roman numeral: `"Ilustración"` → header `"I"` + chapter `"lustración…"`; `"Christ-cross-row"` → `"C"` + `"hrist…"`; `"May-pole"` → `"M"` + `"ay-pole"`. So 8 spurious chapters (I/C/M/V read as numerals 1/100/1000/5) fragment the body, and the real chapters aren't in the track. This is the same **boundary-extraction / mid-word** class as idx 38 — rooted upstream in `server.py`, a different subsystem from the layout.py detector work — so it deserves its own focused cycle rather than a rushed partial fix.

### 2026-06-18 [8261d5fc872a]

- **The translation-masking question recurs here**: the Book of Jasher is a rendered ancient Hebrew text, but this popular edition has *no* scholarly apparatus — no "Translated by" attribution, no scholar's intro, no Elucidations. So the `mask_as="translation"` gate (which keys on those signposts) correctly doesn't fire, leaving the chapters analyzable (conservative-A).
- This is the *same* open A/B policy question as the attribution-less ANF chaptered volumes (idx 20) and the Book of Mormon: should a plainly-chaptered ancient text with no apparatus be masked as translation? That's a user policy call, not an objective bug — so per the established posture, I flag it and leave the conservative-A result rather than building a broad heuristic unilaterally.

### 2026-06-18 [085bd81dba85]

- The rubric is **all precision, no recall.** It can verify that everything it found is correct, but it has no term for *"did I find everything?"* — because recall requires an **independent ground truth** the rubric never consults. Coverage is a recall impostor.
- This is *exactly* why every mirage this session — idx 8, 18, 33, 42, 64 — scored 100 while broken. They're not separate bugs; they're one structural blind spot wearing different hats. The body canvas absorbs the missing structure, and the score stays high.

### 2026-06-18 [8049587b42cf]

- **The rubric is a proxy you actively distrust and refine against. The structural contract is ground truth you want to trust and hold the proxy to.** Folding a trusted reference into a distrusted proxy muddies which is which — you lose the ability to say "the ruler is fixed; the thing being measured moved." Keep the ruler out of the measurement.
- A pure-separate design has a fatal flaw and a pure-integrated design has a different one: if recall lives *only* in a separate pass, the refinement loop has no reason to improve it (it optimizes the rubric, and recall isn't in the rubric). If recall is *fully* folded into the composite scalar, Goodhart bites — a high precision term averages away a low recall term, and the mirage scores well again. The hybrid has to defeat *both* failure modes.

# Insights Archive — 2026-07-04
# Rotated: 2026-07-04T15:18:04Z (3 entries)

### 2026-06-18 [39cd5c4fcddb]

**An under-structured work and an under-*detected* work are indistinguishable to the rubric — both present as "a few big sections, coverage 100."** Pilgrim's Progress (genuinely flat) and Edgar Huntly (richly structured but missed) score *identically* today. So the single most load-bearing component in the whole plan is a **positive test for structural absence** — proving "no sub-body structure exists here" rather than inferring it from "we found none." Without it, your fall-forward principle silently degrades back into a fallback. This is why I wired the discriminator explicitly into A3 and made LOW-STRUCTURE an *earned verdict*.

### 2026-06-18 [095c6da568f1]

Two distinct editorial-summary sub-forms, both currently mis-handled:
- **Douay**: book-level argument ("THE BOOK OF GENESIS / This book is so called from its treating of the GENERATION… until the death of JOSEPH") *and* a chapter-level summary ("Genesis Chapter 1 / God createth Heaven and Earth… in six days") sitting between the chapter line and verse 1.
- **Geneva**: the killer case — the chapter argument is itself *numbered* ("11 God created… 3 The light and the darkness, 8 The firmament…"), so the verse detector reads those range-refs as verses. Then real verse 1 follows. This is a whole **mask type the taxonomy lacks** — and the rubric is structurally blind to a *missing type*, since it only scores what's defined.

### 2026-06-18 [5220b7d3da36]

- The schema is **derivation-driven**: `DEFAULT_MASK_BY_TYPE` is computed as `{t: t not in _UNMASKED_TYPES}`, so masking policy is a *single* source of truth — adding a type to `_UNMASKED_TYPES` is the only lever, and the API type-list test stays consistent automatically. This is why the expansion only had to touch four collections, not a dozen call-sites.
- The naming collision is real architecture, not pedantry: `verse` already names scripture-overlay machinery (`detect_verse_regions`, `_VERSE_BODY_*`). Reusing it for a section *type* would make two different concepts share a token — a latent bug magnet. `poetry` keeps them orthogonal.
- A section-type schema is effectively an **append-only contract** (it's persisted into every ingested work's layout and the frontend color/label maps). Renaming after commit means a migration, which is why this is worth one confirmation now rather than churn later.

# Insights Archive — 2026-07-04
# Rotated: 2026-07-04T15:55:50Z (2 entries)

### 2026-06-18 [ffab7d84e0d9]

- **`order.json` is the index authority, and it's append-only by necessity.** Every diagnostic (`work-N.json`), every baseline number, and every PROGRESS.md reference is keyed to a work's *position* in `order.json`. The file is only regenerated if it's absent (`harness.py:58`). If I let it regenerate against the current 115-EPUB tree, all indices 0–98 would reshuffle and silently invalidate the entire session history. So LDS Scriptures must be **appended** (→ idx 99), never a full regen.
- The cache matches by **basename** (`meta["source_file"] == epub.name`, `harness.py:90`), so an already-ingested work is reused even across folder moves — meaning most gold works are likely already in `ws/` and won't re-ingest.

### 2026-06-18 [c78cc901764c]

- The cache check doubles as a **gold-set completeness audit**: of the 15 gold idx, 11 were already cached from the eval-all runs, but 70/86/100 were gaps. Charlotte Temple (footnotes+endnotes+epistolary) and the Emma alt-format edition are *exactly* the new-type/same-work-diff-format exemplars the gold set exists to cover — so they'd have been silently missing from any annotation pass. Auditing before annotating is what keeps "fall-forward" honest.
- Ingest is serialized on purpose: `ingest_file(..., overwrite=True)` writes per-work slug dirs, and a heavy multi-volume ingest plus a concurrent one would contend on CPU/extraction (and possibly the MLX embed service). Cheap to wait, expensive to debug a half-written project.

# Insights Archive — 2026-07-04
# Rotated: 2026-07-04T21:40:27Z (1 entries)

### 2026-06-18 [d3dacd935bc3]

- idx 100 vs idx 5 is the **same-work-diff-format discriminator you designed the gold set to expose**, caught live: two editions of the Douay-Rheims, one segmented into 2,643 elements, the other into 73 — both scoring a perfect 100. The composite literally cannot tell them apart, because coverage is the "canvas illusion" (the top-level `body` tile covers 100% of both). This is the regressional+extremal Goodhart bite made concrete.
- idx 19 scoring 70 (not 100) is the *opposite* tell: the rubric correctly registers low coverage, but the reason isn't "low structure" — it's structure *present and undetected* (an epistolary novel read as one prose blob). That's exactly why the **structure-presence test** has to be a separate gate axis, not folded into coverage.

