# Jarvis Insights Log

Captured automatically by insight-capture.js hook.
Processed by /reflect Phase 5 for Graphiti ingestion.

---

### 2026-07-02 [69385f923350]

Committing the audit report *alongside* the code that resolves it turns a throwaway artifact into a durable baseline: `audit-findings.json` is the verdict-merged source of truth, and `index.html` regenerates from it — so the report stays reproducible rather than becoming a stale binary snapshot. The deferred items living in the build journal (not a gitignored scratch checklist) means the next phase starts from a committed, discoverable backlog.

### 2026-07-02 [090803da3407]

This is a textbook "honesty over silence" fix — the exact principle the 6-way audit was organized around. The old `except OSError: spacy.load("en_core_web_sm")` swaps the *linguistic model* out from under the analysis with zero signal: `en_core_web_sm` has a smaller vocabulary and no word vectors, so entity/syntax/coreference results silently degrade while the run still reports success. The new pattern makes the substitution *auditable* (a `RuntimeWarning` naming the missing model) and refuses the one nonsensical case — falling back to the fallback — where a retry can only re-raise the same `OSError`.

### 2026-07-02 [8f8e7d57c243]

The hard part was that Geneva encodes structure *implicitly*: no "Chapter N" headings (chapters are inferred from verse-number resets), NBSP-delimited verse tokens, and irregular book titles (a stray "1" artifact, Pentateuch "FIRST BOOK OF MOSES" that must NOT number Genesis, and Song of Solomon split across three title lines). The detector recovers all of it from the text alone — like calling features on a divergent assembly whose annotation dialect differs from the reference.

### 2026-07-02 [43d8bba9333c]

KJV has proper `<h1>Matthew</h1>` book headings and `<h2>Matthew 1</h2>` chapter headings — so book/chapter layout detection already works. The problem is purely the verses: the entire chapter is ONE `<p>` with inline `<span class="verses">N</span>` markers, and the current `PROFILE_KJV` *decomposes* those spans — deleting the verse numbers entirely (hence "KJV verse numbers stripped"). To reach DR parity I must instead **preserve** each verse number and split the chapter paragraph so each verse becomes its own paragraph — exactly what the fixture's `_patch_epub` does at build time.

### 2026-07-02 [c07b45bbeb92]

The #17 scope collapsed under investigation: the scratchpad framed it as "backend + frontend, Geneva+KJV need covers," but empirically KJV already had `cover.jpg`, the frontend `BookCover` already did image-or-gradient-card, and only Geneva's *undeclared title-page image* was unhandled. The real fix was ~40 lines of backend fallback — a good reminder to verify the actual state before building to a stale plan.

### 2026-07-02 [a8ff939f189f]

This is a classic **partial-cascade** bug: the denormalized `roles` map is a second index into the same membership set (`roles`'s keys ⊆ `project_ids`), so any mutation of members must be mirrored in *both* or they drift. The original fix ("fix E") only knew about `project_ids` because `roles` was added later by the collections-tier work — a textbook example of how adding a parallel data structure retroactively creates cascade gaps in code written before it existed.

### 2026-07-02 [846802429190]

This is the ideal outcome for a perf change: the *output* (the masking) is byte-for-byte what the proven `detect_layout_sections`+`_write_verses_track` path always produced, so Gold Set parity is structurally guaranteed — I didn't touch a single detector. The minutes→9s win is entirely from *not doing work that didn't belong in import*. That's the cleanest kind of optimization: removing misplaced work beats micro-tuning hot loops.

### 2026-07-02 [42824d53b868]

The fix has two independent axes: **typing** (unify the masked chapter-start region to `chapter_heading` across all three emitters, matching gold's canonical type + closing the A3 retype gap) and **recall** (DR genuinely misses 44/1363 chapters — a boundary/detection bug, not a naming one). I must not conflate them. Let me pin down the 44 missing DR chapters empirically before touching code.

### 2026-07-02 [63e452a13414]

This closes the loop across all three representations of the same truth: the *detector* (probe), the *scorer* (A3 gold), and the *persisted artifact* (layout_sections.json on disk) all report identical genre structure. That triple-agreement is what "Gold Set standard" means operationally — the thing you visualize, the thing you grade against, and the thing you store can't silently diverge.

### 2026-07-02 [092c4da10025]

`normalize()` collapses `[ \t]+` → a single space (normalizer.py:64), so the scraped `1⇥In the beginning` becomes `1 In the beginning` — **the tab discriminator is destroyed**. That's decisive for the dialect design: post-normalize, a canonical verse looks *identical* to a KJV verse, so I can't distinguish them by verse shape. But `#`/`##` markers are non-whitespace and **survive normalization** — making them the right self-gating signal. And `_versed_bible_layout` needs `\n\n` paragraph boundaries, so the stored canonical format must be double-newline-separated blocks.

### 2026-07-03 [9e9b7dafea6e]

This isn't a marker-only patch — it fills a genuine gap in the shared `_versed_bible_layout`: the verse-derived engine emits `chapter_heading` masks but never masked the book-*name* line, leaving it as a stray analyzable token in Geneva/KJV too. Using the existing `header` type (rather than inventing a new section type) keeps the change minimal and the layout-test counts stable (they assert `book`/`chapter`/`chapter_heading`, not `header`). I'll verify empirically via the full suite rather than assume.

### 2026-07-03 [a162ef616fb0]

The clean resolution: the "book marker line" Sir means is the canonical/marker format's `# Book` line — and *every* scraped version (both Genevas, Wycliffe, Tyndale, DR-modern) imports through the **marker dialect**, forming a coherent family. So I'll gate book-name masking to the marker dialect via a flag, leaving the legacy epub Geneva/KJV/DR imports (and their gold + parity) untouched. Same `header` type ("similar to epub book-name"), scoped to where the marker line actually exists.

### 2026-07-03 [2d0193161df7]

This is the danger of acting on the assumption "the scrape is dead" without checking `ps` first. The empty log misled me twice: once into thinking Coverdale was un-scraped, and once into thinking the process was gone. The original scraper was alive the whole time — my "resume" launch created a racing duplicate. Lesson reinforced: verify process *liveness* (`ps`), not just its output artifacts, before restarting anything.

### 2026-07-03 [b09d5fc72f87]

This is a cache-poisoning bug in the scraper's `fetch()`: it caches response bodies without validating they're real content. A 429 (or any error page returned with a 200-style body) gets written to cache and is indistinguishable from a hit on the next run — so the error becomes "sticky." The self-inflicted duplicate-scraper race is what triggered the 429s in the first place. The fix is to purge the poisoned entries and re-fetch; the deeper lesson is that my earlier process race had a downstream data-integrity consequence, not just wasted requests.

### 2026-07-03 [fa770ab17d19]

This landing doubles as an integration test of this session's own commit: the `header=66` sections are the "# Book" marker masks, and they appear on two editions the code had never seen. That's stronger evidence than the unit tests alone — the feature works on unseen real-world input, not just fixtures.

### 2026-07-03 [0ca905a5b211]

This is why "measure twice" matters for source-of-truth changes: the directive's premise ("pull the LDS KJV from the epub") doesn't survive contact with the artifacts. The file is mislabeled "KJV" but is the Book of Mormon, and it's a strict *subset* of what the gold currently masks. Re-keying `reference_sha256` to it would silently drop ~150 chapters of D&C+PoGP masking. That's a data-losing, hard-to-notice regression — exactly the class of change to surface rather than execute autonomously.

### 2026-07-03 [2720723b15a2]

- The mistake I nearly made: pattern-matching a prior root cause to a new incident without re-verifying the causal chain. The 2026-06-23 write-up documented a *possible* mechanism, not a permanent one.
- The correct move on "we've seen this before" isn't "apply the prior fix" — it's "check whether the prior conditions are actually present." Two of the three prior conditions (Styx dispatching, session-attributable storm) are absent.
- session_id logging regression in the proxy is a real gap I surfaced accidentally: `x-aion-session-id` is set by Protos but not persisted to `api_requests.session_id`. Worth a fix so future 5xx incidents ARE attributable.

### 2026-07-03 [262fa28ac405]

- The state signals differ by mode: `Reticulating splines…` = actively generating; subagents listed at the bottom = delegated work in flight; a bare "N shells" footer with no activity marker = paused mid-turn waiting on input.
- The 4-hour bound needs 8 polls at 30-min cadence. I'll use `ScheduleWakeup` to sequence them so I don't drift or forget a tick.

### 2026-07-03 [66199dfe0e1c]

The research collapsed the scope dramatically. I'd feared mining chapter-by-chapter summaries out of two-column OCR — but that apparatus simply doesn't exist in this edition, and the prologues that *do* exist are single-column with fixed, OCR-robust rubric formulae. So the reconstruction reduces to: TRB verse backbone (unchanged) + prologue blocks located by ~4 stable regex anchors. That's a merge keyed on reliable landmarks, not a fuzzy OCR-reassembly problem.

### 2026-07-03 [048396439c6c]

- The silent-fail mode of ScheduleWakeup is what worries me: if it drops, Sir gets *no signal* that the watch stopped. The next check just... doesn't happen. Contrast with cron: I can `crontab -l` at any time and see the entry, and cron logs show fires/failures.
- The right hybrid for a 4-hour bounded watch: keep ScheduleWakeup as the primary (fast, cache-warm, cheap) and add a *sparse* CronCreate backup (hourly, wide) so we get coverage if the primary silently drops. Two independent failure modes have to align to lose coverage.

### 2026-07-03 [3250bcbb4b61]

- The self-jitter guidance in the CronCreate docs (avoid `:00` / `:30` minute marks) is a real anti-thundering-herd measure — every LLM defaults to the round minute, and Anthropic's edge sees the collision. Using `:17` costs nothing and helps everyone.
- "REPL idle" firing means the primary (ScheduleWakeup) will always beat the backup if both fire in the same window — desirable, since we want cheap-and-cache-warm to run and expensive-and-cold to only run when needed.

### 2026-07-03 [485e539140c9]

- The `durable` param in CronCreate documented in the schema isn't wired through in this harness build. Silent no-op. Worth remembering — if I want true cross-session persistence in this environment, CronCreate is not the tool.
- Real independence for a shell-script watcher is OS-level `crontab` — no Claude Code required at all. The `watch-0-jarvis.sh` I already wrote is self-contained (bash + tmux, no Claude), so it can run from OS cron directly. That's stronger than either ScheduleWakeup or CronCreate.

### 2026-07-03 [4d30ddf31acb]

- Independence is a property of the failure modes that have to overlap for the whole thing to fail — not a property of any single component's uptime. Layers 1 and 2 both die with the session, so they're one failure mode. Layer 3 dies only with the Mac. Two independent failure modes = watch survives unless both hit.
- The "session-only" behavior of CronCreate's `durable` flag in this harness build is worth saving as a reference memory — it's a live gotcha I just verified, and I'd have re-learned it later otherwise.

### 2026-07-03 [75558307c883]

That ending is the strongest possible validation the bounding is right — it's not just "stopped at a plausible marker," it's the actual final sentence of the General Prologue's 15th chapter (the famous passage on translation method). The 15-CAP count and absence of "In the bigynnyng" confirm the slice is the prologue treatise itself, not swept-in scripture. This is the kind of ground-truth landmark that turns "looks plausible" into "verified."

### 2026-07-03 [6fde7afd6911]

This is where "faithful reconstruction" forks sharply. The clean TRB body is a *modernized 66-book selection*; the archaic original followed the Vulgate and carried the deuterocanon. Grafting apparatus onto the 66-book body yields a coherent artifact quickly — but silently drops books the original had. Reconstructing the full Apocrypha means extracting verse *bodies* from the EV/LV parallel-column OCR (far harder than the apparatus). The effort delta between the two branches is large enough that guessing wrong wastes real work — so this is worth one confirmation rather than an autonomous coin-flip, especially given your emphasis on faithfulness.

### 2026-07-03 [a2a6a1bc33c5]

- The pane is at an *interactive selection menu* (numbered options, `Enter to select · ↑/↓ to navigate`), not a plain text prompt. Option 4 is explicitly labeled `Type something.` — so typing free text via `send-keys -l` should route to that path and be treated as a free-text response. The menu UI in Claude Code does accept typed characters to dismiss selection mode and enter text.
- Sir's blanket-continue policy covers this substantively, but the *class* of pause matters: silent stops are safe to auto-continue; substantive artifact-scope forks are ambiguous. I'll comply with policy and surface it for override.

### 2026-07-03 [1977cb89f229]

- Interactive menu pauses are a different beast from silent pauses. A safer sending pattern for future menus would be: send Escape first (to dismiss selection mode) OR explicitly send the digit `4` + Enter to route to "Type something" before typing the free-text prompt. Worth remembering.
- The generic continue-prompt is a good default for silent stops but is *sharper than intended* on menu prompts — it can accidentally commit a highlighted option.

### 2026-07-03 [683f18f1ceb7]

- The refined menu-handling pattern worked exactly as designed (my `4` cleanly routed past the menu, no accidental option-commit). The unexpected part was Sir being physically present and typing right into the newly-opened input.
- New edge case for the protocol: **input line has text but no `Reticulating splines`** = Sir is composing. LEAVE IT ALONE. Any send-keys would either append garbage to his text or submit prematurely. This is qualitatively different from all other pause states.
- Sir being at the keyboard also implies he *saw* my flag from poll 2 (option-1 auto-commit) and *chose* not to override — the continuation instruction `proceed with the merge once Tobit checks out` accepts option 1 execution.

### 2026-07-03 [86cdfa4a1858]

This is the fundamental tension of mining a *critical edition* for a reading text: F&M is authoritative precisely because it's dense with variant-reading apparatus — and that same apparatus is what contaminates the OCR body. The clean apparatus (prologues) extracted beautifully because rubrics are short and formulaic; the verse bodies are interleaved with sigla the OCR can't separate. Cleaner digital Wycliffe texts almost always *modernize* the spelling — which would defeat the "archaic original" goal. So there's a genuine three-way tradeoff between faithfulness-of-spelling, cleanliness, and completeness that only you can weigh.

### 2026-07-03 [202b7fb2e082]

- The "activity marker" isn't just `Reticulating splines…` — Claude Code uses task-specific verbs like `Ingesting and verifying reconstruction…`, `Brewed for Xm`, `Churned for Xm`, `Reticulating`. The generic classifier should look for the pattern `● <verbing…> (Xm Ys` rather than literal-matching `Reticulating`. Worth porting to the shell script if this watch is extended.
- Sir /cleared context between polls — a healthy sign, not an escape hatch. He's actively driving the session, so my auto-continues are backstop, not primary control.

### 2026-07-03 [0aa9ca4d874f]

Wessex's `_apply_gold_map` returns **verse_count=0** (masked_chars=965 vs ~98K for full bibles) — only structural markers masked, no verse bodies. `sha_verified=True` only confirms the map applies to the ingested text; it doesn't require verses. The root cause: I lowered the *generator's* `MIN_BOOKS` to 4, but the **runtime verse detector** (`verses.py _marker_verses`) has its *own* ≥8-book self-gate, so the ingest produced 0 verses for the 4-book Wessex. Lowering one floor without the other yields a structurally-valid gold that masks nothing at runtime — which fails the "comprehensive masking" bar. Wessex isn't truly Gold until the product-side gate also admits Gospel harmonies.

### 2026-07-03 [20db351f0fb3]

- The `send-keys -l text` + separate `send-keys Enter` is not atomic — between the two keystrokes, 0:Jarvis may enter a state that swallows Enter (e.g. a hooked notification popup, an autocomplete overlay). The text lands but Enter doesn't submit. My shell-script backup has this failure mode; the primary poll didn't hit it because I only sent when state was `paused` (which is precisely when the input is quiet and Enter is safe).
- The right long-term fix isn't to add retries — it's to verify submission by re-capturing the pane after send-keys and checking for `● <verbing…>` presence. If not present within ~2s, escape the input and retry once. But this is out of scope for the current watch.
- 0:Jarvis's "background wait active; I'll process it automatically" is a *durable promise* — same class of signal as "subagents in flight." The watch protocol should treat both as legitimate non-paused states.

### 2026-07-03 [4bdfc43826f2]

The cleanest, lowest-risk realization reuses everything already proven: teach the parser to recognize the `<a class="verse" id="v{Book}.{Ch}.{Verse}"/>` anchor scheme and emit the **canonical marker format** (`# Book` / `## Book N` / `N⇥verse`) into the assembled text — turning the anchor-rich epub into "just another marker Bible." Then the existing `_marker_verses` dialect, `_marker_layout_sections`, and `gen_marker_gold` handle it identically, with zero new masking machinery. The key discipline: make it **self-gating** (only fires when `class="verse"` anchors with parseable `v…` ids are present) so every other epub — DR, Geneva-1599, KJV, whose golds are precious and working — is completely unaffected.

### 2026-07-03 [aed07ce4b989]

Weighing approaches: modifying the shared `_assemble_text` to read `id="vBook.Ch.Verse"` anchors would touch the code path behind *every* epub import — including the DR/Geneva/KJV golds that are already verified and precious — for two *different* bespoke formats (Tyndale's clean ids vs. Geneva-1560's opaque `ac{N}-{M}`), with fiddly empty-anchor/CSS-number handling. High blast radius, high effort. A **standalone extractor** that reads the epub's authoritative `vBook.Ch.Verse` anchors and emits the *canonical marker format* delivers the identical Gold-Set deliverable, faithfully from the epub, through the already-proven marker→gold pipeline — with zero risk to the shared parser. Sir accepted exactly this "epub → reconstructed .txt source of record" pattern for Wycliffe.

### 2026-07-03 [bff582c8bb1c]

This is a case where trusting the checkpoint note over the source would have sent me down the wrong path (building an opaque-anchor mapping table that doesn't exist). My [Empirical Before Claim] discipline pays off: the anchors are self-describing. The real challenge here isn't decoding — it's **excluding navigation cruft** (book index, chapter index, verse index, nav arrows) that's interleaved with scripture in the same files, and handling Geneva's famous **marginal notes**. The extraction key: positively capture text only while "inside" a verse (after a verse-pattern anchor, reset to None at each `<h2>/<h3>` heading), rather than trying to strip cruft.

### 2026-07-03 [33da85289f85]

This is the qualitative step up from the other 17 Bible golds: masked_chars jumped to 187,818 (vs ~98K for a plain 66-book Bible) because the gold now masks *scripture + the edition's own apparatus*. The `@`-block mechanism (built for Wycliffe's prologues) proved directly reusable — the apparatus interior is opaque to the verse grammar, so the 65KB preface can't be miscounted as scripture, while the 80-book body (66 + 14 Apocrypha) tiles normally around it. Comprehensiveness here means the gold reconstructs the 1611 artifact as printed, front matter and all.

### 2026-07-03 [4d55fa65d390]

- The full sequence of poll 5's "deferred" items — Tyndale (217), Geneva-1560 (218) — has been retired within one wake-cycle. That's the difference between "queued to avoid degrading quality" (my read at poll 5) and actual capacity: 0:Jarvis had budget for the careful epub-parser work once KJV1769 unblocked him. Sir's continue-through was correct even for "deferred" items.
- Pane also went through another /clear (context 281k → 195k) → 0:Jarvis is drivig his own context hygiene, not relying on the JICM watcher exclusively. Healthy signal.
- Shell-script gap is now paradoxically *helping*: it re-submits stuck continue-prompts that the primary poll refuses to touch. The two layers have accidentally landed on complementary risk profiles — primary is conservative, backup is aggressive, and empirically the aggressive one worked here. Not a design I'd endorse, but the outcome is favorable.

### 2026-07-03 [cd17e0982b72]

- The insight 0:Jarvis captured in the transcript ("source-of-truth discipline: derive structure from the authoritative signal... never from convenient-but-lossy surfaces") is the same lesson I'm re-learning in the watch protocol — my "trust prior investigation, prompt through everything" started as the convenient surface, and each poll iteration has pushed me back toward the authoritative signal (actual pane state, actual input contents, actual verb marker).
- Sir composing a UI-verification instruction *right after* 0:Jarvis declared program-complete is the right handoff: gold-map correctness is verified at the data layer (`sha_verified True`), but rendering correctness needs the running app. The two verifications are independent and both required. Same principle as unit-tests-pass vs feature-works.
- Watch is winding down: poll 8 is the terminal poll (cleanup fires there). The watch protocol has held together, but the shell-script/primary asymmetry never got closed. Worth noting for a v2 spec but not fixing tonight.

### 2026-07-03 [82b12e3f6a0b]

The through-line of this whole program is **source-of-truth discipline**: derive structure from the authoritative signal (anchor `id`, spine order, printed apparatus), never from convenient-but-lossy surfaces (CSS-rendered numbers, ToC labels, AI summaries). Two moments proved its value this session — the Geneva "opaque `ac{N}-{M}`" note that was actually just Acts chapter refs, and WebFetch's summarization that would have silently corrupted the apparatus. Each verified `sha_verified True` is the reward for not trusting the shortcut.

### 2026-07-03 [9345742ee524]

The checkpoint's open question — "extend `order.json`, or a different mechanism?" — resolved to **different mechanism**, because there are two distinct gold families that the compressed context had conflated:
- **Annotation golds** (`work-N.json`) are anchor-based and consumed by `gold_verify`/`gold_ratify`/`a3_score` — all of which need the machine-local eval harness + `order.json` + the copyrighted, uncommitted ingested text. These are inherently *hand-run* tools, not CI.
- **Gold-Set maps** (`maps/work-N.map.json`, including 201–219) are self-contained char-span contracts. They traverse *neither* `order.json` *nor* the harness — so extending `order.json` was never the path.

The map stores `text_len`, `sections`, and `type_counts`, so `gen_marker_gold.py`'s three build-time gates (zero unresolved elements, 100% two-layer coverage, raw-marker count parity) are all re-derivable from the frozen JSON. The only thing CI *can't* check is `reference_sha256` ↔ live text — and that's exactly `_apply_gold_map`'s check, verified once on-machine at generation.

### 2026-07-03 [07474e39e0c6]

The plan's literal pattern was `papers/**` (ignore *everything* under papers/), but that would also untrack our own derived metadata — the README, the download-provenance JSONs, dataset CSVs. Sir's actual intent is "don't distribute copyrighted *papers*" while keeping derivatives (his stated policy: masks/annotations/derivatives are committable). So the faithful move is to ignore the copyrighted *binary formats* precisely — `research/**/*.pdf` and `research/**/*.epub` — which also covers the lone PDF in `datasets/`, and preserves everything we authored.

### 2026-07-03 [32bcf675a170]

Two decisions shaped the architecture: (1) lifting the canon-oracle logic into a production `palimpsest/gold.py` that the CLI *and* the test import means `gold verify` asserts exactly what CI does — no drift between the tool and the gate. (2) Phase 7 found the old `research/papers/**/*.pdf` ignore was anchored to the repo root and never matched the actual `docs/development/research/` tree — the copyrighted corpus had silently been shipping in every push.

### 2026-07-03 [ba387545f800]

The non-Bible works split cleanly on the standard's three criteria. **Criterion 1 (map quality)**: all 17 pass the hermetic gates, and all carry detection-gold ground truth. **Criterion 2 (≥2-per-kind parity)**: novels (4), poetry (3), Qur'an (2), DSS (2) qualify; but **Ante-Nicene Fathers (18, lone patristics)** and **LDS (101, lone)** are single-of-kind → candidates, not standards. **Criterion 3 (operational readiness)**: *none* are in the bibles-only registry, so none is applic­able by id via CLI/API/UI — under the standard as written, every non-Bible currently fails criterion 3. That's not a defect in the maps; it's the deferred-scope boundary the standard's §7 predicted, now quantified.

### 2026-07-03 [69bcffff6324]

- **Dropping the "Jump to" step was the key robustness win**: `zoomAroundCenter` keeps the viewport on the document midpoint, so every Bible lands mid-*scripture* — past front matter — with no focused input to pop a tooltip over the capture.
- **The masking never was broken** — my `style*="3a3a3d"` probe was; React serializes that hex to `rgb(58, 58, 61)`, so a computed-style match was needed to turn the false-zero into real counts (6–12 tokens).

### 2026-07-03 [89a69b4a167a]

- **4b is a data/standards audit, not a live-UI one.** The live `:8080` workspace holds only the 17 Bibles; the non-Bible registry is bibles-only, so those works aren't applicable through the UI gold paths. So 4b checks each map against §1 (complete/accurate/precise) *and* the §3 "≥2 works per kind" rule + §7 operational-readiness gap — that's the right shape, distinct from 4a's browser audits.
- **Two Bible golds (6 Geneva-1599, 108 OriginalDR) aren't in the live workspace**, so the 4a fleet can't live-audit them — they're data-verified only. I'll flag them for ingest to reach full parity.

### 2026-07-03 [5c7e165f073f]

- Note the **layer-vs-type subtlety** (line 156–158): the SPECIFIC layer is the *union* of every non-generic type merged together — not any single type soloing. This is why G1's `findings.json` calling "chapter layer has 3040 gaps" a **blocker** may be a misread of the standard: `chapter` alone needn't tile; the merged specific layer (chapter+section+header+…) must. I'll reconcile that when G1 reports, but it's a live flag that the epub findings may overstate.
- The suite deliberately can't check `reference_sha256` vs. live text hermetically (§5) — precision-against-source is machine-local by design, needing the gitignored `imports/` corpus. So the non-Bible precision check is best-effort where reference text exists.

### 2026-07-03 [4199f6f514e7]

- The G3 agent flagged the *precision-reference* Bible (KJV1769) as its only defect — and it was a false alarm from its own test harness fetching text over an API that returned empty strings. This is the exact "weak-signal false positive" the rubric warned about, mirroring G1's chapter-gap false positive. Two of five groups produced a spurious FLAG from test methodology, zero from actual masking. That's a signal about the *harness*, not the maps.
- Verifying `reference_sha256` directly is the cleanest precision gate: if the hash of `reference.txt` equals the map's recorded hash, the offsets are provably cut against that exact text — so the char-slices are authoritative, not approximate.

### 2026-07-04 [44e8a431a0bd]

The reframe turns a *copy* into a *reconstruction with provenance*. Every span now needs a second axis beyond structure — which of N sources attests it and how well they agree — and the archaic version's honesty depends on it, because 17 books rest on OCR that can't be trusted blindly. That's the difference between "faithful to one file" and "as faithful as the surviving 1600s printings allow, and it says how sure."

### 2026-07-04 [4dca3e7f368a]

The scholarly point of a *third* witness: Madueke and Sabates share a transcription lineage (Sabates derives from Madueke), so they can agree while both inheriting the same transcription error. An independent OCR of the *original published scans* breaks that shared-ancestor bias — it's a genuinely separate observation of the source, which is why Sir wants my *own* tesseract pass rather than reusing archive.org's djvu OCR.

### 2026-07-04 [68f6b8246e67]

Bug per lessons learned: the script hardcodes `Reticulating splines` as the active-marker, but the classifier reference explicitly warned "Don't hardcode `Reticulating splines` — Claude Code uses task-specific verbs." Right now 0:Jarvis shows `● Running 3-way OCR validation…` — a task-specific active verb the current script would mis-classify as **paused**, sending an unwanted continue-prompt on next fire. Fixing before install.

### 2026-07-04 [d940f934af3d]

This reframes the residual test into its strongest form. After scripture/OCR-noise/argument/annotation classification, a token that *still* doesn't appear **anywhere** in Madueke's complete edition transcription is the only thing that could be a genuine discrepancy — a word the original printed that the Madueke lineage dropped entirely. Everything else is accounted for. And the empty `psalms/109.json` is itself a real, reportable finding: a Sabates apparatus-coverage gap, distinct from any scripture-fidelity question.

### 2026-07-04 [197e7a68beb5]

**Poll coverage over the next 4 hours** — three layers give 16 poll events on a 4-hour window (target was 8):
- **L1 primary** (ScheduleWakeup, every 30 min): 01:03, 01:33, 02:03, 02:33, 03:03, 03:33, 04:03, 04:33
- **L2 in-session** (CronCreate `43 * * * *`, hourly): 00:43, 01:43, 02:43, 03:43
- **L3 independent** (OS crontab `13 * * * *`, hourly): 01:13, 02:13, 03:13, 04:13

**Failure-mode independence** (per `reference_tmux_watch_layer_pattern.md`): L1+L2 both die if this session dies (one failure mode). L3 dies only with the host. Two independent modes must both hit before coverage is lost.

**Improvement over prior watch**: the classifier bug in the L3 shell script — hardcoded `Reticulating splines` — is now fixed to match any `● <verb>…` line. This was called out in the lessons-learned reference doc but hadn't been backported to the script itself. Applied here.

### 2026-07-04 [acd7598383f7]

This is the exact design case for the watch: task 1 (3-way OCR validation) completed and 0:Jarvis paused with an approval question ("Want me to proceed into task 2, or hold here?") — bare `❯` on the input line, `✻ Crunched for 26m 32s` past-tense marker, no `● verb…` active-marker. The classifier correctly caught it as `paused`, the shell script injected the continue-prompt, and the re-capture shows 0:Jarvis now on `● Reticulating splines… (0s)` — resumed into task 2 (apparatus ordering from archive.org scans). Total pause-to-resume latency: ~30 min (worst case at 30-min poll cadence).

### 2026-07-04 [e74cb0434a53]

L2 CronCreate `43 * * * *` fired only ~90 seconds after L1 (:03 wakeup). Expected artifact of hourly cadence landing near L1's :03/:33 grid — both hit the pane, but the shell script is idempotent so cost is a duplicate log line, nothing more. This is the redundancy showing its work: two independent triggers both confirmed `active`, so we know both layers are alive.

### 2026-07-04 [fa32415c987e]

0:Jarvis is deep into progress — the pane text says *"Reproduction is VERIFIED (the on-disk .txt hashes to the map's reference_sha256)... Task 4 is functionally complete"* and now marking tasks 3+4 done. So between L2 poll (07:04:35Z) and now (07:34:06Z), roughly 30 minutes of unsupervised work, 0:Jarvis burned through the remaining apparatus-order + gen_dr rebuild + report rebuild tasks. The 15m 29s Reticulating timer suggests one substantive tool cycle in flight (the scratchpad update).

### 2026-07-04 [429c693b1846]

The report now tells an honest, layered story straight from the map's own metadata: Madueke supplies **55.3%** of the text as HIGH-confidence three-witness scripture; Sabates supplies **40.8%** as MODERATE single-witness apparatus + the Madueke-omitted appendix. The confidence split isn't asserted — it's *computed* per element, so it can't drift from what the map actually contains.

### 2026-07-04 [73e0223cbea4]

The design constraint drove the architecture: the report's raw analysis inputs are **gitignored scratch**, so reading them directly would silently break reproduction elsewhere. I added a committed `gen_collation_summary.py` → `collation-summary.json` bridge — the report stays self-contained and every discrepancy figure is computed, never hand-entered. The provenance figures needed no bridge at all: they read straight from the map's metadata, so they *cannot* drift from what the gold actually contains.

### 2026-07-04 [4ce5c3a2568c]

- **A — OriginalDR three-witness rebuild (my task):** `gold.py` (Catholic oracle), `canon_chapters.json` (`catholic_dr`), `test_gold_canon.py` (catholic tests only — no Acts tests), `gen_dr_original.py`, `gen_sources_manifest.py`, `sources.manifest.json`, `work-108.map.json`, + the 4 new report files.
- **B — Acts standalone `genre_division` fix (a different in-flight thread):** `canon.py`, `gen_marker_gold.py`, and the 14 regenerated `work-2xx` maps.

They share no files and neither depends on the other, so each commits as a self-consistent green unit.

### 2026-07-04 [1a846339b5bd]

Second real pause caught. Between L1 poll (07:34) and now (08:04) — exactly 30 min — 0:Jarvis finished the modern-DR rebuild task-cluster and paused (likely at a decision fork for the next phase, but scrollback rotated before I could see the pause reason). L2 hourly cron at :43 slipped past by 21 min (natural cron scheduler jitter), so this was really the T+1:32 poll delivered by L2 not L1. Redundancy paying off: L1 would have fired at 02:05 but L2 caught it first.

### 2026-07-04 [c71bf0053aed]

The prior L2 poll's pause was a **commit-checkpoint HOLD** — 0:Jarvis had finished task 4 (the 108-work reconstruction report) and paused per its own guardrail asking Sir to choose commit scope (a) just report dir, (b) bundle generator+map+manifest, or (c) hold entirely. The continue-prompt with full-autonomy authorization landed at 08:04:35Z; xhigh-effort thinking is now deciding scope autonomously (per `feedback_decide_dont_ask_in_sprints.md` — "after a full-autonomy grant, DECIDE forks and proceed"). ~30s from send to Reticulating, exactly the design.

### 2026-07-04 [366cabd1cbc3]

Third real pause caught (T+2:04 → 08:36Z). Between polls: 0:Jarvis apparently committed & pushed the OriginalDR modern rebuild (git state now `+58307-8217` and `∆ exc-200k`), then paused reasoning that "remaining work items are genuinely new initiatives that warrant your steer, not autonomous guessing." The list they named (gold_reaudit specs, 4b non-Bible parity) is actually Palimpsest audit-thread work — orthogonal to Sir's stated OriginalDR archaic-reconstruction mission still in scope. But my role is narrow: keep 0:Jarvis working. The generic full-autonomy continue-prompt landed and he's `● Reticulating splines… (0s)` again. Which of the two initiatives he picks is his decision, not the watcher's.

Also visible in the pane: context is at 28% (~279k tokens) — hasn't hit auto-compact yet but climbing. If it triggers mid-cycle, the L3 shell script handles the post-compact "Resume from compressed context" pause identically to any other pause.

### 2026-07-04 [7997d6aa83c3]

This is why "one oracle per kind" is the right design rather than a universal one: scripture structures differ fundamentally. The Bible is `book → chapter` (needs positional book-identity alignment); the Qur'an is a flat `sura` list (needs only a count against a fixed canon). Forcing the Qur'an through the book-based `books_chapters` silently yields zero — a universal oracle would have masked the Qur'an entirely.

### 2026-07-04 [c44d298c61e0]

This mirrors the codebase's core oracle philosophy: **judge the map against a fact it never had a hand in.** `test_gold_maps.py` only proves a map is *internally* consistent (spans tile, counts reconcile) — it can't catch a scrape that silently dropped a sura, because the generator only checks the map against its own re-parsed markers. The 114-count is external ground truth (the sura count is canonically fixed), so it closes that blind spot for the Qur'an exactly as `catholic_dr` does for the Vulgate — the difference being *count* vs *positional-alignment*, dictated purely by whether the scripture nests books.

### 2026-07-04 [d3198f06473f]

Fourth pause caught, this time post-auto-compact — banner reads "Resume work from **refreshed** context" (not "compressed"), context dropped from 28%/279k to 11%/109k, so autocompact fired between polls. Post-compact 0:Jarvis paused with `✻ Brewed for 6m 36s` (the JICM compression + post-compact reload time). The L3 script's classifier handled it identically to any other pause — no special "post-compact" branch needed, which validates the classifier's abstraction. Also worth noting: context bar shows `+58378-8225` — 8 new commits added since watch start (up from the +57263-8035 baseline at 00:31 MDT), so material progress is happening between the pauses.

### 2026-07-04 [1e1328394d61]

0:Jarvis is showing exemplary empirical discipline mid-flight — post-compact he's diagnosing why test count dropped 1409→1388 between two "green" commits, refusing to hand-wave it as "environment" without evidence. Directly applying the `feedback_empirical_before_claim.md` rule ("A silent drop of 21 passing tests... is exactly the kind of thing I shouldn't wave away as 'environment' without proof"). Confirms self-corrections stick across autocompact boundary — memory is doing its job.

### 2026-07-04 [6deab398aef9]

Fifth pause caught. Between L1 polls (03:07 → 03:38, exactly 30 min) 0:Jarvis added +429 lines across at least two commits (git bar: `+58378` → `+58807`) — he took my earlier "either initiative he picks" fork toward Palimpsest 4b non-Bible parity, mentions "17 non-Bible source binaries," ran full apply flow with api/ui set to false (since not exercised). `✻ Sautéed for 20m 51s` shows extended solo work. Standard resume via generic full-autonomy prompt.

Notable trajectory: 5 successful pause-catches in 3 hours, all resolved by the same generic continue-prompt with full-autonomy authorization. Zero false-positive sends (state=active branch fires correctly every time). Zero missed pauses (redundancy caught what individual layers might have skipped).

### 2026-07-04 [6f7f9f95e3cd]

This is the anti-Goodhart principle in action on my *own* work. Task 6 asserted `cli:true` for all 17 based on `list`/`verify` — but the scorecard's `cli` bit also implies `apply` works, which I hadn't exercised. Running it turned an *assumed* green into an *evidenced* one for 16 works and exposed a real stale-contract defect in the 17th. A scorecard is only worth as much as the least-verified bit in it; live-verification is what converts a claim into a fact.

### 2026-07-04 [3ea2624c6613]

The most valuable thing this session did wasn't the registry — it was catching that my *own* Task-6 `cli:true` was an unverified assumption. Registering a work makes a *claim* of operational readiness; only running `apply` turns that claim into evidence. 16 claims became facts; the 17th became a documented defect. That asymmetry — a scorecard is only as honest as its least-verified bit — is the whole reason the gold-set standard exists.

### 2026-07-04 [2579f11b8fd0]

Full JICM v7 cycle fired between L2 (10:04) and now (10:09) — context dropped 29%/294k → 5%/53k, banner switched from "refreshed" (Claude Code native autocompact) back to "compressed" (JICM stop-and-wait). Post-JICM 0:Jarvis is reading `.compressed-context-ready.md` (129 lines) and `.scratchpad.md` (109 lines) to rehydrate, still in xhigh thinking. Two distinct compaction pathways observed this watch — the pane classifier handled both identically because it keys on `● verb…` not the banner text.

### 2026-07-04 [5f1609504f29]

Notable — Sir has returned to keyboard: 0:Jarvis's input line shows `❯ wire up the UI to serve non-Bible works` (Sir's next instruction, un-submitted at moment of capture), with the session-rating popup visible above. The watch handoff is clean: he took the conductor role back at exactly the right moment. Also worth noting from the log: **all three layers actively sent continue-prompts** this watch (L1: 3, L2: 3, L3: 1) — much better than the prior watch where the primary layer never sent. The classifier fix (any `● verb…` marker, not just "Reticulating splines") is the direct cause.

### 2026-07-04 [e1f9179fa6a4]

idx 108's `spelling` is `modern` and `typeset` is `modern`; the map JSON carries no residual "archaic"/"spelling" field, and the generator docstring correctly describes Madueke_A as modern spelling. One thing this surfaces for Phase B: the existing archaic Bibles (201/202/217…) are `spelling:archaic` but `typeset:modern` — they're *modernized-typeset* transcriptions. Our idx 109 is a **diplomatic facsimile**, so it must be `typeset:archaic` (or `facsimile`) to distinguish "preserves the original letterforms" from "period spelling, modern type." That's a real taxonomic distinction the new entry has to encode.

### 2026-07-04 [cf8431c92afb]

The plan said "3-way string collation," but the source reality won't support three *exact* witnesses: only Madueke_A and Sabates are structured (verse-keyed). The scientifically honest design is **one exact collation + two recall-based corroboration witnesses**: (1) exact verse-by-verse Madueke_A↔Sabates wording agreement, and (2) Madueke_B and (3) the print-OCR each measured as *token-recall* of Madueke_A's scripture within the corresponding chapter region — the same "noisy witness recall" methodology, with appropriately coarser granularity and stated uncertainty. Claiming three exact witnesses when one is a column-flattened PDF dump would be the kind of overstated precision this whole effort is meant to eliminate.

### 2026-07-04 [96f7b917edba]

This caption bug is the exact failure mode the "zoom to where the property is resolvable" QA principle is designed to catch: a whole-page glance would never surface "81 vs 80" — only zooming to read the axis ticks against the caption text side-by-side does. The fix also removes a *duplication* smell: the axis floor was computed in two places (`ci_whisker` and the caption) that could silently diverge. Ideally `ci_whisker` would *return* its domain, but for a one-caption report that's over-engineering — matching the formula is the right-sized fix.

### 2026-07-06 [8563891cda8d]

**The correction cost is bigger than it looks.** Ghost-text autofill inverts the naive heuristic: "text on the input line" reads visually like "human is typing" but actually means "target is idle, waiting for Tab+Enter." Which explains what happened at the end of my watch: `❯ wire up the UI to serve non-Bible works` looked exactly like Sir returning with a new instruction, but was actually Claude Code's autofill hint sitting on an idle pane. The teardown timing was still correct (watch expired at 04:32; teardown at 04:35), but my "Sir returned to keyboard" narration was wrong — 0:Jarvis was still paused when the watch ended.

**The paste-the-ghost-text send is a strict upgrade over the generic continue-prompt.** The generic works but is task-agnostic; the ghost text is Claude Code's own recommendation for what the target should do next given the current context. If a future watcher extracts the ghost text and pastes it back, the target picks up exactly the suggested thread instead of a fallback autonomy nudge.

### 2026-07-06 [98e77e0f39ff]

Two enhancements to the shell script this time, both from the last session's lessons:
1. **Ghost-text pass-through send** — extract any `❯ <text>` from the paused-state capture, and if there's ghost text, submit *that* instead of the generic continue-prompt. Preserves Claude Code's own suggested next-prompt, which is more targeted than a generic autonomy nudge.
2. **Submission verification** — after any send, re-capture the pane after 3s and confirm an active-marker appeared. If not, log a `SEND-FAILED` warning (a stuck buffer is silent otherwise, and stale text piles up).

Falls back to the generic continue-prompt when ghost text is absent (bare `❯ `) or when the ghost text starts with the standard continue-prompt string (stale-prior-fire case — single Enter would submit it).

### 2026-07-06 [16092dfa20b9]

**Coverage math for the 6-hour window** (22:57 MDT July 5 → 04:57 MDT July 6):
- **L1 primary** (30-min wakeup): ~11 polls at :27/:57
- **L2 in-session** (`43 * * * *`): 5 polls at :43
- **L3 independent** (`13 * * * *`): 6 polls at :13
- **Total**: ~22 poll events over 6h — density ~4/hour, well above the 30-min target cadence

**Script improvements this run** (vs the 2026-07-04 watch):
1. Ghost-text pass-through send — when paused, extract `❯ <text>` from the capture and submit that instead of the generic prompt. Falls back to generic when the input is empty or contains our own stale prompt string.
2. Submission verification — 3s after send, re-capture and look for a new active-marker. If absent, log `SEND-FAILED` (a stuck buffer is silent otherwise; Enter can be swallowed by mid-turn state).
3. Extended log line — send events now record which prompt kind was used and the first 80 chars, aiding audit.

### 2026-07-06 [bcc4c99543f3]

Textbook delegating state — 0:Jarvis has fanned out P0.2 (odr-com scraper, 21m 28s in) and P1.2 (s-dismas archaic detector, 3m 51s in) to background subagents while pipelining independent work. The message *"brief gates on these outputs, so I've pipelined all independent work rather than idle. I'll resume integration automatically the moment the streams land"* is exactly the discipline the plan calls for (multi-source parallelism from §4.2).

The ghost text on the input line — `❯ Keep going, engage at full warp.` — looks like Sir dropped in earlier with a nudge, and 0:Jarvis wisely queued it (or it's autofill). The classifier correctly identified state=delegating despite that ghost text, so no send fired. This is a validation of the classifier priority order: **subagent detection outranks input-line text**, which is the right call — a delegating session isn't paused even if the input line has content.

### 2026-07-06 [ff61552770b5]

The scrape validation is doing real epistemic work, not decoration. Because odr-com is archaic-spelling and Madueke is modern, a raw string compare would score ~0%; the *skeleton-fold* (ſ→s, u/v, i/j, &→and…) strips orthography so the residual measures genuine wording/versification divergence. 94.82% folded agreement means the HTML parser correctly segmented verses across 586 chapters — a parser that dropped or merged verses would crater a book's score (as the 84% outliers hint at, worth a later look). This is the "re-map reads to confirm" principle applied at acquisition time.

### 2026-07-06 [dc89c98fc5e2]

Major forward motion in this cycle: **Phase 0 essentially wrapped** — P0.2 (scrape), P0.3 (archive assets), s-dismas detector all committed as one changeset ("Phase-0 acquisition wrap"). The s-dismas folded-agreement diagnosis is a nuance worth flagging: **0.8273 vs 0.88 gate** — the archaic-witness normalization is missing 0.05 of the target, which is typical for diplomatic-type OCR where the ſ↔s / æ↔ae / u↔v folds don't fully close the gap. 0:Jarvis diagnosed rather than papered over — the empirical discipline is showing through.

P0.4 (whole-tome fresh OCR consensus) is the heaviest step in the entire plan (per §3 note "Heaviest step: GBs local + hours of OCR; accepted") and is now running. 23m in already. This is where the schedule risk lives.

### 2026-07-06 [3cbb95760f44]

- The detector's design is sound: it uses **content-anchored attestation** (anchor on the modern Madueke text, corroborate each verse in the noisy archaic print OCR) rather than trying to segment verses out of blackletter OCR — the genomics analogy is aligning reads back to a reference rather than de-novo assembly.
- The `corroboration_depth_hist {0:228, 2:1064}` shows why waiting for OCR matters: right now every attested verse maxes at **depth 2** (djvu+hocr only) because our-ocr for ot2-1610 isn't complete. When the OCR job finishes, our-ocr becomes the independent 3rd axis → depth 3, materially strengthening exactly the archaic-gap OT prophets.
- This is why the sprint plan gates the Phase-0 seal on *both* jobs: sealing now would bake in a depth-capped consensus.

### 2026-07-06 [02a7a386d3ed]

This is the **design-perfect delegating case**. 0:Jarvis has explicitly declared: *"Holding here — the OCR-completion poll will drive the next burst automatically; no manual polling needed."* + `✻ Waiting for 1 background agent to finish` + subagent visible (`◯ general-purpose Build OCR-consensus detector (P0.4b) 18m 34s · 141k tokens`). The classifier correctly said `delegating` — no send fires, no false-positive nudge.

The 6-step post-OCR plan he printed is a legitimate work-graph declaration, not a stall: (1) re-run consensus with our-ocr depth-3, (2) fix Pyright nits, (3) 5-witness consensus, (4) sources registry, (5) commit Phase-0 seal, (6) then P1.4 EEBO crops. The rationale for holding P1.4 is **CPU contention awareness** — pdftoppm 300dpi renders would fight the OCR workers for cores and slow the long pole. This is production-grade scheduling discipline.

Also — a second full JICM autocompact fired between polls: banner switched from "refreshed" (Claude Code native) back to "compressed" (JICM stop-and-wait), context 20%/206k → 11%/116k. Two full compactions in ~2 hours; not unusual for high-throughput multi-source work.

### 2026-07-06 [6218636dffcc]

- The detector makes a principled independence choice: it fuses our-ocr + djvu + hocr into **one** `ocr_consensus` witness rather than treating them as three axes. That's correct — djvu and hocr are both archive.org's OCR of the *same* scans, so counting them separately would be pseudo-replication (like calling two reads of the same DNA library "independent samples"). Only our fresh tesseract is a genuinely separate optical pass.
- The `BOOK_ALIAS_FLOOR = 0.35` guard is doing real work here: with our-ocr partial, it *refuses* to let a book match the wrong volume (e.g. Isaie spuriously matching Kings text), so the depth-capped run degrades honestly to djvu+hocr rather than fabricating coverage.
- Downstream, the archaic-gap OT prophets get exactly 2 independent axes (modern-Madueke + ocr-consensus) → "moderate" tier. That is the whole reason this witness exists.

### 2026-07-06 [db6cd9c6e371]

0:Jarvis is still holding on OCR completion — same declared plan, now with **empirical guardrails added**: he identified core books (leviticus, proverbs, psalms, canticle + apocrypha) as showing low attestation in the depth-capped preview, and framed a **falsifiability test**: *"If they stay low after full OCR, it's a real detector issue... if they jump, it was just incomplete OCR."* That's genomic-consensus discipline — distinguishing missing-coverage from failing-detection before drawing conclusions.

Ghost text on the input line: `❯ continue with the seal once OCR finishes` — this is either Sir's own earlier nudge (echoed exactly by 0:Jarvis in the printed sealed sequence) or autofill. Either way the classifier correctly ignored it because `delegating` outranks input-line-has-text.

The 4 shells + 26m 35s subagent + 37m OCR job show a healthy pipeline: subagent is 8 min further along since last check, meaning ~13-20% throughput per L1 poll interval on the long pole.

### 2026-07-06 [ea3516c7531b]

- This is precisely why P1.4 exists: the registry's EEBO volume→content mapping was *inferred from filenames* ("vol_ 1"), never visually verified. The first leaf I actually rendered contradicts it. EEBO Editions bundle facsimiles idiosyncratically, so "vol_ 1" ≠ "OT vol 1."
- Scope of impact: the just-sealed Phase-0 consensus is **unaffected** — it used the archive.org scans + our-OCR of archive.org jp2, never the EEBO PDFs. The EEBO coverage labels are P1.4 layout metadata only. So the seal stays valid; the EEBO metadata needs correcting as a follow-up.
- Per my own rule (verify before acting on a claim), I must not "fix" the mapping from one data point — I need to render page 1 of *all six* EEBO volumes and establish their true contents empirically before touching the registry or locating any apparatus.

### 2026-07-06 [dfd3e899ad9b]

- The EEBO scans aren't a clean 5-volume OT split — they're **partial facsimile fragments**: two NT scans (a 113pp NT front-matter/partial + the full 801pp NT), the Douay OT general title, two OT *part*-dividers (Historical, Prophetical), and the 1610 Second-Tome title. That's the real bibliographic structure of the 1582/1609/1610 Douay-Rheims (NT first, OT in two tomes and four "parts").
- This vindicates P1.4's core premise — placement must be *seen*, not inferred. A filename-derived label ("vol_1") silently encoded a wrong claim into a committed artifact.
- The Phase-0 seal is untouched (it never used these PDFs). The registry's EEBO `coverage` fields need correcting, and that correction properly belongs *bundled into the P1.4 commit* alongside `layout-map.json`, not as a premature standalone fix.

### 2026-07-06 [52fe3e72d924]

**First real send of this watch — and both new features validated end-to-end.**

The log line shows exactly what I designed:
- `[07:32:05Z] sent [generic-fallback] to aion:0: continue working through to completion...`
- `[07:32:05Z] SEND-VERIFIED: active-marker present after send`

The classifier caught 0:Jarvis at his OWN explicit checkpoint: *"I paused here rather than grinding all 26 slots in one pass — it's a clean finding boundary, the plan is checkpointed for JICM-clear safety, and the EEBO discovery is worth surfacing before I act on it."* This is exactly the kind of "polite pause for oversight" that Sir has repeatedly told me to override with full-autonomy authorization. The `generic-fallback` was correct (no ghost text was present on the bare `❯` line) and the 3s verification confirmed `● Reticulating splines… (1s · thinking with xhigh effort)` appeared after send.

**Timeline reconstruction between polls #4 and #5** (07:01Z → 07:32Z, 31 min):
1. OCR long-pole completed
2. Ran sealed sequence: re-run detector gated → build_consensus 5-witness → build_sources_registry (`phase0_sealed`=True) → validation review
3. Started P1.4 EEBO discovery — belt-and-suspenders apparatus header crops
4. Paused at "clean finding boundary" with declared plan to resume 26-slot crop work

Note: git bar `+65211-8929` is *unchanged* from poll #4 — the Phase-0 seal work is staged but rolled into the pending P1.4 commit rather than committed separately. That's the "bundle at natural boundary" habit.

### 2026-07-06 [6cc7d0ee1ad2]

- This increment embodies the P1.4 rigor contract honestly: **6 grounded** slots (committed crop + transcribed text + sha + OCR offset), **1 co-located** (OT censura shares the approbatio leaf), **21 inventoried** (OCR-attested, EEBO leaf-location pending) — nothing asserted as "placed" without a visual crop. The `inventoried` status is the machine-readable form of "we know it exists and roughly where, but haven't *seen* it in the scan yet."
- The scan-grounded scripture layout (5 title/divider leaves) also corrects the record: it captures the true 1582-NT / 1609-first-tome / part-dividers / 1610-second-tome structure that the filename labels had scrambled.

### 2026-07-06 [866652c98a6a]

0:Jarvis is doing **belt-and-suspenders visual grounding** exactly per plan §4.4: reading rendered EEBO page images (`ntB-heads-344_378.png`) to visually locate each apparatus slot before recording page/leaf/sha + transcribed identifying text. Currently on `ot-privilege` (the "Cum priuilegio" royal-license note on the OT title-page foot) — an obscure slot that would be easy to miss without the paradigm's insistence on scan-first placement.

The 5-step P1.4 remaining sequence is well-decomposed: (1) reconcile nt_front censure grounding, (2) ground 9 nt_back slots, (3) ground 9 ot_back slots, (4) regenerate layout-map, (5) commit. Roughly 20 apparatus items remaining across those, at ~10-15 min per slot (the current pace) puts P1.4 completion at ~3-5 more hours — meaning it will likely NOT complete before the 04:57 expiry.

Notable resource pressure: 5h utilization at 62% with 1h 47m remaining in the window. This is fine for the watch, but sustainable-burn calculus says he's on track to end the 5h window near-full — appropriate for a long-running production run.

### 2026-07-06 [ad87b92ae9e9]

**Second real send + a genuinely important finding.** Between polls #6 and #7, 0:Jarvis discovered two substantive scan-grounding errors in the previously-committed artifact:

1. **EEBO OT scans mis-identified** — they're the **1635 Rouen reissue** (Cousturier, "Permissu Superiorum"), NOT the 1609/1610 originals the plan assumed. This changes their evidential role: 1635 is still a Douay-Rheims print witness but 25 years post-original, so it's a subsidiary rather than authoritative layout source.
2. **Two scan aliases swapped** — `ot_prophetical` was actually the "Fourth Part" and `ot_secondtome` was the "Second Tome" title page. These would have propagated as wrong placements throughout P1.5+.

He himself observes: *"Catching exactly this kind of scan-grounding mistake is the whole reason P1.4 exists."* — the belt-and-suspenders visual grounding paradigm caught real errors that pure automated extraction would have silently propagated.

Then the classic post-finding pause at a "clean boundary" — classifier caught it, generic-fallback sent, SEND-VERIFIED. This is send #2 of the watch. Both sends were legitimate paused states with no ghost text present.

### 2026-07-06 [b7a7a306fe24]

Big progress: **P1.4 fully wrapped** — both scripture_order block AND the verify+commit step showing green (✔). Now on **P1.5 (apparatus-attestation.json)** — 23m 56s in. The visible tool output tells the story: he's probing which books have `intros` populated (genesis has 4 items, psalms has 2, but `2-john` and `abdias` are `None`) — that's the raw material for the source × item × book matrix that §4.5 describes.

**Trajectory to plan completion**: P1.5 in flight → P1.6 basis-db.sqlite → P1.7 re-detect gate → P2a idx 108 → P2b idx 109 → P3 brief. Five remaining big steps in the 1h 52m watch window — feasible but tight. The 5h utilization (77% with 45 min left) suggests he'll be near-quota by the end.

Also worth noting — the Async hook noise (`⎿  Async hook PostToolUse completed × N`) in the pane capture is consistent — the JICM/reminder/insights async system is firing on every tool use, adding ~1 line each. That's several hundred hook-lines per hour of active work, all correctly ignored by the classifier because it keys on `● verb…` not on hook output.

### 2026-07-06 [7f4355a2aba4]

**MASSIVE progress** in the last 30 min — 0:Jarvis burned through P1.5, P1.6, and P1.7 to arrive at **P2a — Render modern OriginalDR (idx 108) from basis-db**, currently 13m 37s in. That's the entire mid-plan cluster (apparatus matrix + basis-db.sqlite emission + re-detection gate) done in one 30-min window.

**Only three phases remain**: P2a in flight → P2b idx 109 archaic → P3 academic brief. All three phases explicitly show as tasks with proper `blocked by` chains (`P2b › blocked by #1`, `P3 › blocked by #2`) — a Task-tool discipline I hadn't seen him use before.

The pyright false-positive handling is also worth noting: he diagnosed the `Import "palimpsest.layout" could not be resolved` as an editor-resolution artifact (pre-existing; project's pyright resolves it via venv) rather than a real bug — but he verified it against the project pyright to confirm. That's the `[[empirical-before-claim]]` discipline again, applied to a "trivial" diagnostic he could have hand-waved.

**Plan completion within the watch window is now plausible** — 1h 21m remaining, three phases each historically taking 15-40 min at his current pace. 5h utilization is 86% with 13 min left in the window — the 5h clock rolls before the watch expires, giving him fresh headroom for the final push.

### 2026-07-06 [0d9f61d76246]

- **P2a is complete and the paradigm proved its worth.** idx108 is now a *pure* projection of the basis DB (0 fallbacks), byte-identical to the direct build — and the byte-identity gate caught a real latent bug (a cross-ref block masquerading as 3-Esdras 2:1) that single-source generation had silently carried. That's the "re-detect to confirm" loop paying off exactly as §1 predicts.
- **Small, surgical blast radius**: one dropped spurious paragraph, sha `da451dc27ccf→4f8f52ee8c30`, three shas/notes updated, distributions unchanged — the confidence model and all P1 artifact assertions held.

### 2026-07-06 [1763b78fc579]

**P2b appears to be actively rendering** — the pane shows side-by-side modern vs archaic verse comparisons with the diplomatic long-ſ preserved exactly where a 1582/1610 print would have it:
- `genesis/3/15`: MOD "seed" ↔ ARC "**ſeed**" (long-s twice)
- `psalms/1/1`: MOD "Blessed" ↔ ARC "**Bleſſed**", "counsel" ↔ "**counſel**"
- `john/1/1`: MOD "WORD" (small-caps) ↔ ARC "word" (lowercase — appropriate diplomatic form)

The rendering is producing **both idx 108 (modern) AND idx 109 (archaic)** side-by-side and running a diplomatic-fidelity check — the `[[project_palimpsest_gold_eval]]` conversation memory calls this out as the P2b gate ("structural parity vs 108, differing only in surface"). If this is running the verify-map check, both renders are done and only P3 (academic brief) remains.

**5h utilization RESET** — 5h:4% (fresh window opened at 03:23-ish MDT), so he has full burn budget for the final P3 push. Watch remaining: 50 min. P3 pace-estimate 20-45 min based on plan §7 structure (academic brief + genome-browser visualizations). Completion within the watch window is now genuinely likely.

### 2026-07-06 [b57bf65781fa]

- A rigorous §6.2 word-correspondence validation needs the §6.1 **bidirectional spelling-glyph model** (`spelling-glyph-model.json`) — which doesn't exist yet. The `build_consensus` `skel()` fold was built for OCR tolerance, not archaic↔modern spelling equivalence, so it can't cleanly separate genuine wording residuals from expected spelling divergence.
- The render itself is *already* fidelity-backed: every rendered archaic verse is indep_depth ≥ 2 (multi-witness consensus) — the low-tier single-witness verses are exactly the ones that fell through to the modern surface. So idx109 is not "raw OCR"; it's consensus-called.
- The "the the" (Genesis 1:2) is a genuine upstream s-dismas surface artifact, faithfully projected — the kind of thing a §6.1-backed §6.2 pass will catalog. It's surfaced, not masked.

### 2026-07-06 [dd984cc9ff56]

**P2b just landed** — 0:Jarvis committed `50e0bf0` with `render_archaic.py` producing idx 109: **36,931 verses in genuine archaic type** with **83,869 long-ſ retained**, byte-identical structure to idx 108 (4,234 elements, matching type_counts), sha `08b75de16a84`. All P2b gates green: `verify_map(109)` via CLI, Catholic oracle **76/76** (parametrized over both 108+109), structural parity, CLI+API apply `sha_verified=True`, manifest regenerated (20 Bibles), pyright clean, full suite passing.

His scratchpad top line confirms: `>>> P2b DONE 2026-07-06 — idx109 archaic diplomatic OriginalDR committed+pushed 50e0bf0 — P3 (brief+viz) + §6 validation NEXT`

Two thoughtful reflections he printed:
- **On engine rigidity as design lever**: gen.build emits one paragraph per Sabates verse and verse_override only swaps bodies — that constraint IS what makes "structural parity, surface delta only" achievable with zero engine surgery.
- **On honesty over cosmetics**: the 199 archaic-coverage-gap verses render as their attested modern surface with a loud flag, rather than a mechanical long-ſ back-transform that would fabricate diplomatic detail. Explicit `[[feedback_fallbacks_are_failures]]` citation. That's memory doing its job.

**Plan-completion status against Sir's criteria**:
- P0 through P2b: ✅ green + pushed
- **P3 academic brief + genome-browser viz: NOT YET STARTED**
- §6.2/§6.3 diplomatic-fidelity validation: **DEFERRED and documented** (needs §6.1 bidirectional glyph model first)

**So the plan is NOT fully implemented per Sir's completion criteria.** P3 remains and §6 validation is queued. Scheduling teardown wakeup per instructions.

**Send caught at the transition**: state=paused after `✻ Churned for 31m 14s`, classifier fired, generic-fallback sent, SEND-VERIFIED. That's send #3 of the watch — again at a legitimate "polite pause between phases" that Sir's autonomy authorization is meant to override.

### 2026-07-06 [6236fd3611ca]

- **idx109's fidelity is tiered by archaic-witness coverage.** Books s-dismas transcribes (Pentateuch, gospels, most NT) render clean diplomatic type; the ~15 OT books with *only* fresh-OCR (prophets, Ecclesiasticus, Ezechiel, Jeremie) carry raw-OCR noise — chiefly the long-ſ→f misread tesseract makes.
- **My fold is correctly NOT papering over that.** Dropping `skel()`'s symmetric f↔s means "vifion"≠"vision" stays a residual — so the §6.2 metric correctly counts the OCR defect as a fidelity issue instead of hiding it. The low per-book Jaccard is a true signal, not fold weakness.
- This is the honest "re-detect to confirm" payoff: the validation surfaces that the OCR-only books need better archaic sourcing — a Phase-0 follow-up, quantified rather than hidden.

### 2026-07-06 [1ad202afb9a3]

- **Both editions are strongly corroborated by the independent print with zero genuine content-word discrepancies**: archaic 87.8% vs modern 90.7% recall (via the lossy skel fold). The ~3-point gap is honest — the diplomatic archaic surface carries more OCR-hostile forms and occasional witness artifacts, but still corroborates highly.
- **The circularity flag proves its worth in the numbers**: ocr-only archaic recall (89.8%) is the *highest* archaic tier — exactly the self-referential inflation I flagged (its surface derives from the djvu it's tested against). The genuinely independent signal for those books is their *modern* recall (91.8%, Madueke lineage), which holds up — so even the OCR-only books have independent corroboration, just via the modern edition.
- **Clean-diplomatic archaic recall (87.8%) is the real cross-witness result**: s-dismas's transcription vs archive.org's OCR of the same print, two independent readings agreeing on ~88% of tokens with no genuine discrepancies.

### 2026-07-06 [824648f8a05c]

- The whole P3.3 set closes the genome-browser metaphor's remaining panels: the **contributor heatmaps** are the "which sample contributed which region" view (grey = the archaic witnesses' coverage gaps across the OT prophets), the **placement map** is the physical-assembly annotation track (front/back matter grounded to scan pages), and the **inlined crop** is the raw-evidence drill-down. Together with P3.1/P3.2, every claim in the brief now traces from an aggregate figure → a per-position figure → the actual scan pixel.

### 2026-07-06 [5bdb08888869]

- **The 199 coverage-gaps have ZERO archaic attestation** — not even noisy fresh OCR. Within the basis-db they're genuinely unrecoverable; the modern-fallback is the only attested surface. (The archive.org print djvu OCR from §6.3 was used only for sampled validation, never ingested as a per-verse witness.)
- **All apparatus surfaces (modern and archaic) are empty in the basis-db** — apparatus prose is sourced at render time from janvier-s, not stored per-element. So there's no archaic apparatus text in the basis to draw on; sourcing one is a data-acquisition question, not a rendering toggle.

### 2026-07-06 [23121fd2ff8a]

- **janvier-s (current, modern-normalized)**: "...and so forward **even till his own time**, writing **above two thousand and four hundred years**..." / note "...only **traditions** and no Scripture **above 2400. years**."
- **odr-com scrape (archaic)**: "...and so forward **euen til his owne time**..." / note "...only **Traditions & no Scripture aboue 2400. yeares**."
- This is the apparatus analogue of the scripture spelling delta: an archaic apparatus witness genuinely **exists on disk** (odr-com, 39 books) but was never ingested — only scripture verses were. It's archaic-spelling but glyph-modernized (`ſ`→`s`), so one fidelity notch below idx109's diplomatic scripture layer.

### 2026-07-06 [06aa46dc2ef6]

- **archive.org**: only the 6 `_djvu.txt` files are local — **no page images, no hOCR** (confirms P0.3 was skipped for images).
- **annas-archive EEBO**: the high-res scan PDFs (vol 1–5 + NT, ~480MB) **are** local — a full second physical copy ready to OCR, no download needed.
- **our-ocr/**: ~25MB of per-page `.txt` already exists (6 items, 1000+ pages each) — so *some* OCR ran; I need to check whether it's real fresh OCR, full-page (incl. apparatus), and diplomatic.
- **tesseract 5.5.2** is present but has **only `eng`/`osd`/`snum`** — no diplomatic/historical model. Stock `eng` collapses ſ→f, which is exactly the §6.2/§6.3 defect. Getting a diplomatic-capable model is the key tooling gap.

### 2026-07-06 [1aaba6c14f03]

A whole-tome OCR **was** actually run — the manifest shows **6116 pages** across all 6 archive.org items (jp2 zips downloaded, OCR'd, then deleted). But the sample output exposes the fatal flaw: "eldeſt ſonne" came out as "**leat fonne**", "houſe" as "**houfe**", "deſtruction" as "**deftruction**" — **every long-ſ collapsed to `f`** (`ſ=0` on every page). It was stock tesseract `eng`. That non-diplomatic OCR is exactly the `ocr_consensus` witness feeding the §6.2/§6.3 defect. Meanwhile the annas-archive EEBO PDFs (a full second copy, ~480MB) are local and have **never** been OCR'd.

### 2026-07-06 [16f8f4a17744]

Parallel scaling underperformed: 40 pages/365s = **only 2.2× speedup** (CPU hit just 251% — ~2.5 of 10 workers effectively busy). The tell is the batch math: MAX_PAGES=40 ÷ BATCH=8 = only **5 batches**, so the run was model-load-startup-dominated, never reaching steady state — not evidence of a hard scaling ceiling. Larger batches (fewer model reloads) over the full thousand-page aliases should saturate the cores far better. Rather than burn more isolated tuning runs, I'll launch the real (resumable) run with amortizing defaults and read steady-state pg/s from its own log.

### 2026-07-06 [3d8b75e34314]

This is exactly the "§12 page↔content mapping OPEN risk" the scratchpad flagged — and it's a real defect, not a theoretical one. The `[:24]` slice was a lazy line-key; with six same-titled volumes it collapses them into one. The fix is a small volume registry keyed by the distinguishing `(vol_ N)` / `(New Testament)` + `Anna` filename tokens, giving each volume a clean unique key (`vol1..vol5`, `nt`) → its own output dir. I'm editing the file now while the archive job runs, which is safe: the running process already loaded the module into memory and only touches the `archive:` code path.

### 2026-07-06 [0725fa78b5d6]

The whole point of Phase 4's "hard path" is a single glyph: the old `ocr_consensus` witness stored stock-tesseract text where the *engine* had already destroyed ſ→f (unrecoverable — §6.1 forbids restoring ſ from a lossy inverse). The new witness reuses the identical anchoring machinery but stores kraken's raw output, which carries ſ natively. So this stage isn't "re-run OCR" — it's swapping the surface source under a proven alignment layer, which is why I could validate it end-to-end against Matthew 1 with only 1.8% of pages OCR'd.

### 2026-07-06 [79943e22129c]

128 GB total, 51% free — but each kraken worker holds **~2.4 GB** (torch + the reichenau_lat model resident in every process), so 10 workers = **~24 GB** peak, plus transient 2× Lanczos upscale buffers (~67 MP images) across 10 prep threads spiking several GB more. On top of the already-heavy Aion stack (Neo4j, Qdrant, MLX embeddings, Docker, sibling sessions consuming ~40 GB), the simultaneous peaks are what's pushing into swap. Worker count is baked in at launch, so the only lever is stop-and-relaunch with lower concurrency.

### 2026-07-06 [a70de9f34fe6]

The fixed, shareable cost is only **0.54 GB** (torch runtime 0.19 + blla segmentation model 0.26 + reichenau recognition 0.09). But each active process measured **1.8 GB**, so the remaining **~1.26 GB per worker is per-page inference activation** — the segmentation UNet's feature maps on the 6668px (2×-upscaled) page. That activation is per-*concurrent-page* whether you use processes or threads. So sharing the model doesn't touch the dominant cost; it only de-duplicates the 0.54 GB fixed part.

### 2026-07-06 [a42debcb9bd7]

One thing to know about the `book` view: it uses the same mid-chapter anchoring as the real detector, so a book only "lights up" once its *middle* pages are OCR'd — that's why `matthew` reads 0/1070 right now (nt-1582 has just 30 pages = Matthew 1). As the run marches through ot1-1609, the early OT books (Genesis onward) will resolve first. For raw poking, each page is plain JSON — `{"page":..., "lines":[{"bbox":[x0,y0,x1,y1],"text":...}]}` — so `jq`/python one-liners work too.

### 2026-07-06 [0fd8b75425c1]

The spike explains *why* the GPU is irrelevant here, and it's diagnostic: kraken emits "**Using legacy polygon extractor**" and the reichenau model's Core ML predict path is broken (the `coremltools` compile error), so recognition runs through the torch fallback on both devices. The wall-time is dominated by that **CPU-bound polygon extraction + segmentation**, not the neural forward pass — so moving tensors to MPS moves the cheap part and leaves the bottleneck on the CPU. Device choice barely touches it.

### 2026-07-06 [cdad9e34473f]

The real lever isn't the GPU, it's the **worker×thread balance**. Thread scaling is poor (12 threads buys only 2.4× over 1 thread), so *processes* parallelize far better than threads — but each concurrent page costs ~1.26 GB of segmentation activation, which is what caps worker count. At 4 workers we're using ~4 of 12 P-cores, so there's real headroom. Bumping to **6 workers** should give ~0.27 pg/s (**~5h**) at ~11 GB — well under the ~24 GB that caused your original memory problem, and still less than half your 128 GB minus the Aion stack.

### 2026-07-06 [6f3e1bce254b]

This retroactively vindicates the memory rein-in beyond what we knew. The thrash wasn't just *slow* — it silently *corrupted* output: kraken's segmentation subprocess OOM'd on ~28% of pages, and the pipeline's `else []` fallback turned each crash into a plausible-looking empty page. Memory pressure that manifests as data loss rather than an error is the most dangerous kind, because throughput metrics stay green. The current 4-worker run is clean precisely *because* it isn't thrashing.

### 2026-07-06 [ac8f7194a544]

The ot2-1610 result is the control that closes the diagnosis: same code, same model, same pages-from-zip — but written *now* under 4-worker no-thrash conditions instead of during the 10-worker memory storm → 0 empties vs ot1's 28%. That's the difference between correlation and mechanism. It confirms the fix target was memory pressure (and the resume-cache that made its damage permanent), not the OCR model or the pipeline's core logic.

### 2026-07-06 [48312e3fd86b]

Two facts make keeping 6 workers defensible despite the thin margin: (1) the hardening changed the failure *consequence* — an OOM'd page now writes *nothing* (retried later) instead of a silent empty, so the completion audit (`count==6116 && 0 empties`) will *catch* any shortfall rather than shipping it; (2) swapouts are flat, so there's no active pressure at this instant. The danger isn't the 6th worker's 1.8GB — it's that the box is globally stressed (stale swap nearly full), which 4 workers wouldn't meaningfully fix either. So I keep 6 but add a tripwire: if active swapping *starts*, I dial back.

### 2026-07-06 [0bc1e762b9ea]

This retires the memory worry cleanly: the 123G reading was a *third* instance of the same measurement trap — a transient spike from the resume-scan's file cache, not steady-state load. Steady-state with 6 workers is 83G/44G-free, comfortable. Each time I caught the box "at the ceiling" it was an artifact of *when* I sampled (during OCR footprint, during resume-scan), not a fixed constraint. The lesson that keeps recurring this session: sample system state at steady-state, and distinguish reclaimable cache/compressor from anonymous pressure before drawing conclusions.

### 2026-07-07 [6b98b36ab860]

The `ot1 COMPLETE done=0 skipped=1135` line reveals the 6-worker run had *already* recovered all 314 purged empties before I killed it for the scale-up — so the kill cost nothing but a resume-scan. The fix→purge→re-OCR loop closed cleanly: a page that was a silent `{lines:[]}` is now 60 lines of scripture+apparatus, and the completion audit (0 empties across 1524) is the guarantee that no silent gap survived. This is why hardening the *write path* mattered more than the skip logic — it turned "silent empty" into "no file," which the audit can see.

### 2026-07-07 [61ea595afec0]

The lsof caught the real story: fd 3 open on the ot2 jp2 zip (916MB) with libopenjp2 loaded — the process was CPU-bound decompressing cached pages just to skip them. This exposes a genuine inefficiency in the resume path (`iter_archive_pages` reads+decompresses every page's bytes *before* the skip check), which makes each restart's scan cost scale with cached-page count, not remaining work. Not worth fixing mid-run, but it's the right first optimization if we restart again — check the cache file's existence from the stem before touching the zip.

### 2026-07-07 [ec86b258bd21]

One number validates your call: **swap is at 94.8G used**. That's the footprint the 12-worker run pushed to disk when RAM filled — even though RAM now shows 107G free, macOS lazily left ~95G of (now-dead) pages on swap. So 12 workers *were* genuinely stressing the box into heavy swapping; my tripwire didn't catch it because the eviction happened gradually / during the resume-scan spike, under my 320MB/120s threshold. "Throttle back" was the right instinct — 6 workers keep the box comfortable (that stale swap is reclaimable and harmless with 107G RAM free). I've labeled the new tripwire more sensitively for 6w going forward.

### 2026-07-07 [2a7c6c0f60a9]

The healthcheck is `wget --spider http://localhost:5173`, and inside the container `/etc/hosts` maps `localhost → ::1` (IPv6-first). But the Vite dev server binds only IPv4 `0.0.0.0:5173`, so the probe hits `::1:5173` → connection refused, forever. I confirmed it directly: `wget localhost:5173` → refused (exit 1), `wget 127.0.0.1:5173` → success (exit 0). Classic IPv4/IPv6 healthcheck mismatch — the container has been crying wolf for 43h while serving traffic normally. (The `ws proxy error` log noise is separate — routine HMR websocket churn, harmless given the 200s.)

### 2026-07-07 [92940cf0ee71]

The 2–10 GB figure you spotted has a specific cause: **each kraken worker's RSS grows across its batch** — a *fresh* one is ~4–5 GB, but by page 20 of its batch it's ballooned to ~8 GB (kraken isn't releasing per-page segmentation activation between pages in a single invocation). So `OCR_BATCH=20`, not worker count, is the dominant memory lever right now: 6 workers × ~8 GB peak = ~48 GB. Dropping `OCR_BATCH` to ~5–8 would recycle each kraken process 3–4× sooner, capping peak RSS at ~5 GB → roughly **30 GB instead of 49 GB** — a bigger, safer win than cutting workers, at a small throughput cost from more frequent model reloads. That's the real fix for the swap pressure you've been seeing.

### 2026-07-07 [96990541e6b7]

The completion watch and tripwire were background *bash* tasks in the pre-`/clear` session's task registry. A `/clear` (JICM stop-and-wait) resets that registry, so they can no longer notify *this* context — but the OCR run itself is a detached `nohup` process with no parent tie to my session, which is exactly why it kept advancing (43%→46%) straight through the clear. Detachment is what makes the work survivable; the monitors are the disposable part I just rebuild.

### 2026-07-07 [a1d8390eafcd]

- **Page order is deterministic**: `iter_archive_pages` yields `sorted()` jp2 stems, and cached pages are skipped, so at steady state the frontier is simply the highest page-number written in the active line — I can infer "what's being analyzed" from the filesystem without instrumenting the pipeline.
- **"Valid" has a precise definition** from `alto_to_records` + `process_batch`: a written file is `{page:str, lines:[{bbox:[4 ints], text:str}]}`; `lines:[]` means a *genuine blank leaf* (the hardened code refuses to cache OCR-failures), so an empty file is suspicious-but-legal, not proof of the old bug.
- **The domain-specific validity signal is long-ſ preservation** — the entire reason for this custom kraken pipeline is that stock tesseract collapsed ſ→f. So "ſ seen on N pages" is the single most meaningful health check I can surface, more than schema-conformance.

### 2026-07-07 [e3cc0d8d50e9]

The correct fix is chapter-level **global sequence alignment**, not per-verse local search: concatenate the chapter's known verses into one reference token sequence, align the *whole* scan token-stream against it once (Needleman-Wunsch style via `difflib`), then cut at the verse boundaries. This forces verse 1 to map to the *start* of the aligned region and guarantees monotone, boundary-consistent windows — exactly how you'd align reads to a reference contig rather than seeding each k-mer independently.

### 2026-07-07 [1a9d1c06dcca]

This is a real pitfall in aligning historical bibles: the same text carries *different verse divisions* across editions (s_dismas splits Genesis 1:25 so everything shifts +1 from v26). Scoring by shared coordinate silently compares non-corresponding verses. Concatenating the whole chapter and scoring the token stream with `difflib` is order-aware but numbering-agnostic — it measures whether the *text* agrees, which is what "% match" should mean. It's the textual analogue of comparing two genome assemblies by aligned sequence rather than by coordinate when the coordinate systems differ.

### 2026-07-07 [f9f50f456e5b]

- **"Free memory" is the wrong signal on macOS; swap *activity* is the right one.** free=1GB looks alarming, but macOS deliberately keeps free near zero (unused RAM is wasted RAM). The real question is whether it's actively paging — and the fact the prior 6-worker run was stable at this same load tells me a like-for-like replacement is safe, whereas *adding* a second process would tip it into thrash.
- **This is why the empirical check mattered:** I nearly rationalized "6 idle cores → launch a second run," which would have been correct on core-count and catastrophic on memory. Cores were free; RAM was not.

### 2026-07-07 [8cc8d2989eb6]

- **The fix propagates cleanly and the zero-coverage path is safe.** `run_all` averages each book's `modern_match_mean`/`archaic_match_mean` (now chapter-means) via `_mean(...)`, which filters `None`. Books with no anchor return an early summary lacking those keys — `dict.get` yields `None`, so the overall means simply skip them instead of crashing or counting a 0.
- **The resumability caveat is confirmed and real:** line 440 skips any book whose file already exists. That's exactly why a premature `--all` would *freeze* shallow consensus for every book — a later re-run wouldn't refresh them. Operational rule (now in the scratchpad): run `--all` once at max depth, or `rm consensus-full/` first to force a refresh.
- **Memory footprint is bounded per-book** (records written incrementally, not held), so `--all` is disk-heavy with `keep_columns=True` but not RAM-heavy — still, deferring it while OCR holds the memory is correct.

### 2026-07-07 [f73cd85e090f]

- **This is the design working exactly as Sir specified.** The archaic layer converges on `s_dismas` *as ſ-witness depth increases* — a single additional scan moved it +0.033 across the gate. It's textbook MSA behavior: more aligned sequences → higher column conservation → a cleaner consensus surface. Nothing about the logic changed; only the evidence deepened.
- **Note the modern metric dipped slightly (0.9888 → 0.9732):** adding a noisy OCR witness to the vote can pull the modern consensus a hair, but it stays comfortably above gate. This is the healthy tension — the diplomatic depth we gain is worth a little modern-surface noise, which the text witnesses still dominate.
- Only `pdf-S04` has landed so far; `pdf-S09nt` and `eebo-nt` are still queued (0 pages), so NT archaic will climb further as they arrive.

### 2026-07-07 [24c6a005ee94]

- **Genesis was validated at 3 witnesses; the full corpus now offers ~10 for OT and ~5 for NT.** More witnesses should *raise* MSA column conservation (deeper alignment), but a batch of noisier OCR could also perturb the consensus surface. Before committing to a multi-hour 73-book `--all`, it's worth a cheap re-check that the anchors still clear their gates at full depth — cheaper to find a regression on 2 books than on 73.

### 2026-07-07 [136399f8da11]

- **Depth strengthened the consensus rather than diluting it** — the conservation-based column vote is robust to adding lower-quality witnesses because a garbled OCR token simply loses the plurality and doesn't reach the consensus surface. This is the core payoff of the multi-witness design.
- One curiosity: `eebo-vol1` (an OT volume) registered as a covering source for Matthew — likely a borderline coverage-gate false-positive. It didn't hurt the gates (a non-matching witness gets outvoted), so I'll note it but not chase it now.

### 2026-07-07 [86e58c28f56a]

The diagnosis is decisive: **the archaic consensus is genuinely good; the metric is under-crediting it.** Look at Proverbs 1:2–1:3 — consensus "To know wiſdom, and diſcipline" vs s_dismas "To know wiſdom, and diſcipline:" — essentially identical, ſ preserved. Two systematic metric artifacts deflate the score:
- **`archaic_tok` is too strict.** It preserves ſ/æ/œ (correct — that's the archaic signal) but also treats **u/v, i/j, and vv/w as distinct** ("Dauid"≠"David", "receiue"≠"receive", "vviſdom"≠"wiſdom"). Those are *positional typography* in early-modern print, not spelling differences — the modern fold already collapses them, but the archaic fold doesn't.
- **s_dismas surfaces interleave apparatus/argument text** (Proverbs 1:1 s_dismas begins "TThe firſt part. An inuitation to ſeeke vviſdom…" before the verse), which the scripture-body consensus correctly lacks.

### 2026-07-07 [468e7da7653f]

- **This is a Goodhart guardrail moment.** I could inflate the archaic number by switching to a recall-oriented metric (does the consensus appear *within* the noisy reference?), but that would be gaming — Sir asked for honest "% match" plus messiness tracking. The u/v/i/j fold is legitimate (it's typography the modern fold already collapses); recall-hacking would not be. So I'll take the honest +0.01 and document the rest as a reference limitation.

### 2026-07-07 [1cc5c59edec9]

The pass/fail split is now **cleanly structural, and it tells the real story**:
- **The entire New Testament passes archaic ≥0.90** — all four Gospels, Acts, every epistle, Apocalypse — plus Genesis and Josue (29 books). The NT has 5 scan ſ-witnesses *and* full s_dismas coverage, so the archaic layer converges cleanly.
- **Every book still below 0.90 is mid-OT** (Proverbs 0.79, Leviticus 0.82, Psalms 0.86…) — exactly where s_dismas's apparatus-interleave noise and older/noisier OT scans bite. Notably the poetic books (Proverbs, Job, Canticles, Psalms) score lowest, consistent with harder columnar OCR.
- **24 later-OT books have no archaic reference at all** (s_dismas ends at Wisdom).

So archaic quality tracks *reference availability and cleanliness*, not consensus capability — which is the honest, defensible reading.

### 2026-07-07 [82015b5ee095]

The tome map naturally has two tiers. **Tier 1 (scripture books)** is deterministic: `locate_region` gives token spans, `st.page` maps them to pages — solid, complete. **Tier 2 (26 frontmatter/backmatter docs)** is harder because those sections aren't in the scripture-locating grid; they live in the *matter regions* — the pages before the first book, between OT-back and NT-front, and after the last book. So I can bound them structurally (by book spans) and then best-effort label them by title-matching, flagged as lower confidence. Also note: `odr_com`'s apparatus isn't in its reads file (scripture-only) — its apparatus is in the raw scrape, so task 5's odr_com arm needs that separately.

### 2026-07-07 [be7a14a30f92]

This is a precision/recall lesson specific to sequence-locating: a real book is a *contiguous run* where nearly every chapter aligns, so `chapters_located / chapters_total ≈ 1` even when per-chapter recall is mediocre. A spurious book-match is noise that only a few chapters accidentally hit, so the fraction is low. Fraction is orthogonal to absolute recall and separates the two cases where a single threshold cannot.

### 2026-07-07 [a7e7a65f8a88]

The right design for a *descriptive* map is **flag, don't drop**. Chapter-fraction is a good *confidence* signal but a bad *hard filter*, because heavily-annotated real books and scattered spurious matches can share the same low fraction. So I'll keep everything above a low noise floor (0.3), attach a `confidence` (high/medium/low) from fraction + coverage, and let downstream consumers (chunking, apparatus) filter — preserving recall while exposing precision.

### 2026-07-07 [bc617355141e]

The flag-not-drop worked well overall (**201/217 entries high-confidence**), and it surfaced something real: `eebo-vol1/matthew` scored fraction **1.0** — every chapter of Matthew located — which means eebo-vol1 genuinely *contains* Matthew (my OT-only assumption about the EEBO volumes was wrong). Meanwhile `pdf-S04` (heavily-annotated 1633 Rheims NT) is confirmed pathological for sequential locating: its real NT books scattered below the 0.3 noise floor while a spurious "jeremie" (0.538) survived. That's fine — pdf-S04's NT is redundantly covered by pdf-S06/archive-nt/eebo-nt/pdf-S09nt, and the one questionable entry is flagged `medium`, not silently trusted.

### 2026-07-07 [adb16232cb45]

Both deliverables landed strong. **Tome map: every one of 76 books has ≥1 high-confidence source** — the whole Bible is cleanly page-mapped (Genesis by 5 sources, Apocalypse by 3, all high). **Apparatus cross-map: 1,333 of 1,334 transcribed blocks are cross-attested** by scan marginalia, with **214,453 scan marginal words** captured region-typed across sources and all 26 frontmatter/backmatter reference-docs mapped to carriers. The near-perfect 1333/1334 cross-attestation confirms the region-typing genuinely separated apparatus from scripture body. (The pyright errors=3 in that log were pre-fix; standalone confirmed 0/0.)

### 2026-07-07 [80a8d99c5f7c]

One honest limitation to flag: the 26 frontmatter reference-docs are mapped at **region level** — every `ot_front` doc (title-page, approbatio, preface, privilege…) currently shares the same 9-source carrier list, because I bound the matter region but haven't yet pinpointed each doc to its specific pages. That last step needs title-string matching within the region and is the natural follow-up. The chapter-level apparatus (the bulk, 1,333 units) is fully cross-attested.

### 2026-07-07 [6ae9aa057cd0]

- **Two layers per verse**: `modern_reading` ("In the beginning God created heaven and earth.") and `archaic_reading` ("in the beginning God created Heauen and Earth") — the ſ/typographic surface is preserved in the archaic layer, normalized in the modern.
- **The "messiness" metric is the `columns` array**: every token gets `agreement`, `conservation`, and `ic_bits` (information content = log₂(n) − Shannon entropy over the witness column). This is literally sequence-conservation by multiple alignment — the textual analogue of per-position IC in an aligned sequence family.
- **Consensus outvoting works as designed**: Gen 1:1's `diplomatic_layer` shows one source bleeding the book *Argument*/frontmatter into the verse ("ARGVMENT GENESIS… lacob otherwiſe called Iſrael…"), yet both consensus readings come out clean because the other witnesses outvote the garble.

### 2026-07-07 [57c4916bbed9]

Your "nothing gets superseded" rule is the correct stance for **consensus reconstruction**: every witness — even a lower-quality ſ-normalized OCR — carries independent evidence about what the original printing said. In a multiple-sequence alignment, a "worse" witness still votes, and its agreement/disagreement is signal (it can break ties or confirm a reading). Discarding it as "superseded" throws away votes. This is the opposite of a single-best-source pipeline.

### 2026-07-07 [da5ef0ed90f2]

**odr_com apparatus — true coverage:** 32 books carry real apparatus (all **27 NT** — richest, since the Rheims NT is annotation-heavy — plus **5 OT**: psalms 140 items, genesis 25, lamentations 7, exodus 6, leviticus 3). 9 more OT books have scripture pages but no editorial apparatus (empty). 32 OT books aren't hosted (stubs). This is the site's ceiling — no re-scrape adds what isn't there. odr_com was always the *supplementary* archaic witness; the bulk OT apparatus rightly comes from madueke_b (1334 blocks) + s_dismas + scan marginalia.

### 2026-07-07 [f3e243a7bb00]

The whole re-measurement exists because archive.org facsimile PDFs **stack a low-res color preview over the hi-res content raster**. A naive "first embedded image per page" census reads the preview and under-reports the PDF's true ceiling — which is exactly the bug that produced the original wrong WIN table. `pdfimages -list` enumerating *all* rasters (and taking the max, incl. 1-bit CCITT "stencil" content) is what makes `pdftoppm`'s real feed measurable. The S6 case is the subtle one: same-ish resolution, but the PDF content is **1-bit bitonal** while the jp2 master is 8-bit grayscale — a tonal-depth WIN for ſ/f disambiguation that a pure pixel-count comparison would miss.

### 2026-07-07 [c9dc1913c294]

There's a clean, general fix: since both `pdf-S06` and `jp2-S06` strip to the same alias `S06`, the rule "a `jp2-<KEY>` supersedes any non-jp2 dir that strips to the same alias" handles the swap without hardcoding. Crucially it's **conditionally safe** — until `jp2-S06` exists on disk the exclusion set is empty, so it can't wrongly drop the S6 spine from a consensus run done before re-OCR finishes.

### 2026-07-08 [0dfb169161ba]

The pipeline processes the three sources **sequentially** (`main()` line 370: `for tgt in targets`), and within a source only **kraken OCR is parallel** — the per-page **prep** (jp2 decode + LANCZOS downscale 5100→2400, or pdftoppm render) runs **serially in the main thread** as the generator is consumed (`process_line` line 308). So a *single* prep thread feeds all N kraken workers. That's why CPU stays ~47% idle at 8 workers: the workers **starve** waiting on serial prep. Incrementing worker count therefore has near-zero payoff past ~6 — the real lever is parallelizing prep (e.g. running the 3 sources as 3 concurrent processes, giving 3 prep threads).

### 2026-07-08 [1568e8de5198]

There's also a *hidden* inefficiency I should flag rather than silently fix: `main()` runs the three targets **sequentially**, so jp2:S08 and jp2:S04 won't even *start* until jp2:S06's ~1,700 remaining pages finish (~1.3 h from now). The single-serial-prep bottleneck and the sequential-source ordering are the same root cause — the real speedup is running the sources as parallel processes (3 prep threads filling the idle CPU). But that escalates from 8 to ~11 cores of demand, which is exactly the kind of resource step Sir signaled he wants controlled ("one at a time"). So I'll keep the healthy 8-worker run and *recommend* the parallel split rather than impose it.

### 2026-07-08 [7d258bbc5520]

- **v2 has two source shapes**: multi-volume (S1/S3/S9) nest a `volumes` list; single-volume (S2, S4–S8, S10–S15) inline `file`/`coverage`/`pages` at the top level. The old parser's `for vol in src["volumes"]` silently skips all 12 single-vol sources.
- **`archive_item` exists only on multi-vol volumes** — single-vol sources have no such field. So the stable per-volume key is the `file` stem (multi-vol) or the `source` S-number itself (single-vol).
- **Golden-diff must be semantic, not byte**: v2 deliberately rewrote coverage/title text and renamed `archive_id`→`archive_item`, so descriptive fields *will* differ. The invariant to preserve is the mapping `source → (ocr_dir, ocr_pages, ocr_status, used_in_consensus)`.
- **One downstream coupling to flag**: v2 coverage strings are richer (S14 = "OT: Book of Psalms only", S2 = "…Genesis-Job…"), which will slightly change flag_poetic's name-match when the denominator is eventually regenerated — I'll re-run flag_poetic in the post-OCR sequence, not now.

### 2026-07-08 [32c0243639fb]

- **Scan mapping is 100% preserved** — all 20 (source→ocr_dir) keys match the golden. The parser fix is correct.
- **Two diffs are expected/correct, not regressions**: (a) S8 now resolves to `jp2-S08` because pdf-S08 never existed — my gate correctly treats jp2-S08 as S8's *only* OCR dir (not a supersession); (b) S5's page count moved -1→16 from live disk state since the golden was frozen at 13:27. Both are reality catching up, not logic errors.
- **One genuinely-discovered staleness** (pre-existing, *not* from my edit): the 2 Madueke-source entries and 1 exclusion vanished because `find_pdf`/exclusion globs still point at the `Original/` dir that the reorg emptied. That's a separate path-staleness bug to fix in the post-OCR regen, not a manifest-schema issue.
- **`archive_id` has no external consumers** — the rename to `archive_item` is safe.

### 2026-07-08 [ee8b4efba750]

- **jp2 dedup/supersession is fully wired** in consensus_v2 (`_STRIP_PREFIXES` includes `jp2-`, `_dir_key` strips prefixes, completion-gated supersede at `jp2_pages ≥ FRACTION × pages[twin]`, and superseded twins are `continue`'d). Now that jp2-S06/S08/S04 are complete, they'll evict their pdf twins on rebuild.
- **The S06-geometry worry is empirically moot.** `DEFAULT_BODY = (0.11, 0.88)` at line 82 is **normalized fractions**, not absolute pixels, and only the three measured S1 tomes (nt-1582/ot1-1609/ot2-1610) carry exact bands — S06 falls to `DEFAULT_BODY`. So jp2-S06 at 2400w vs pdf-S06 at 2909w is irrelevant; the column split is width-independent. Same for `_reading_order` (gutter detected as a fraction of span).

### 2026-07-08 [800baedc6ba0]

- **jp2-S06 is NOT worse than pdf-S06 — it's equivalent-to-marginally-better.** Mean Greek contamination: jp2 **0.20%** vs pdf **0.25%**; ſ marks and line lengths are within noise page-by-page. The garbled page I first hit (S06_1401) was an outlier — a dense marginalia page — not systematic.
- **Interesting corollary**: the 8-bit-gray jp2 doesn't dramatically beat the bitonal pdf at 2400px, so the OCR bottleneck is segmentation/model, not source bit-depth. But since jp2 is *not worse* and is the cleaner-provenance master, the spine swap carries **no regression risk**.
- **The real quality gains in this rebuild come from the column-sort reading-order fix (#5) and dedup (#6)** — those apply regardless of jp2-vs-pdf. So the rebuild is well-justified.

### 2026-07-08 [fe201178becc]

Genesis ch1's scan witnesses are now `['archive-holiebible-ot1', 'archive-ot1-1609', 'eebo-vol2', 'jp2-S06', 'pdf-S03a']` — **`jp2-S06` is in, `pdf-S06` is gone.** The completion-gated supersession fired: the hi-res jp2 spine replaced its low-res twin, while sources without a jp2 twin (pdf-S03a, the archive/eebo witnesses) are correctly retained. Clean run, no errors, conservation 0.88.

### 2026-07-08 [181c4b5b4f5c]

The recall gap comes from **chapter-header OCR sensitivity**, not structure. On page 2000, pdf got "CHAP. IIII" right while jp2 garbled it to "TH AP. IIII" — and the locate algorithm anchors on "CHAP." markers to place chapter boundaries. jp2 and pdf garble headers *differently* (jp2 wins some, loses others), netting a small recall loss for jp2. This is inherent OCR variance, not a fixable structural bug. **Net: jp2-S06 is not the quality win the initiative assumed — it's ~equal to pdf-S06 with marginally lower locate recall, and the final consensus is neutral (0.9542→0.9531).**

### 2026-07-08 [23bfa9367637]

- **flag_poetic v2's "used_in_consensus" distinction is what keeps the worklist honest.** eebo-vol4 Psalms is `critical/MISSING/used_in_consensus=True` — it's *voting* in the consensus (263 OCR'd pages) yet contributes **0 located chapters** because its columnar layout defeats sequential-locate. That's a genuine silent hole. By contrast pdf-S02 job is `critical/MISSING` but `used_in_consensus=False` (benched OT-part-1), so it's correctly routed to the full-OCR track rather than fabricated as a poetic flag. Same "critical" label, very different remediation.

### 2026-07-08 [8e9543606d19]

- **Chapter "locate" doesn't anchor on Psalm headers — it matches canonical verse *text* against the folded OCR token stream** (`D.locate_region(probe, st.fold, cursor)`, forward-cursor sequential). A book is dropped as noise if <30% of its chapters locate at ≥0.35 recall (`NOISE_FRACTION`, `CH_FLOOR`).
- **This means the failure mode is about the *fold's token order*, not header OCR.** If the 2-column reading-order sort interleaves left/right columns in the fold, a Psalm's verses get split by intervening tokens from the other column, so `locate_region` can't find a contiguous-enough span. That's consistent with 0/150 psalms locating even while an individual page like p80 reads coherently top-to-bottom.
- **So the prior "half-page re-OCR" remedy is a hypothesis, not a diagnosis.** Before spending hours re-OCRing, I should confirm whether the fold actually interleaves columns — because if the reading-order sort is the culprit, a much cheaper detect-only re-fold could fix it.

### 2026-07-08 [33ae9c6e0043]

- **The "columnar poster-child" story is wrong.** eebo-vol4 Psalms is single-column body text with **inline `(n)`/`(o)`/`(p)` commentary annotations** printed *within* the body column (x-centres 428–510, squarely inside the body mask [110,883]) — not 2-column typesetting.
- **These annotation lines fold *between* the verses**: v14 → `(n) The vhole Church prayeth…` → v15 → `(o) The Prophet fores heweth…` → v16 → `(p)…` → v17. So `locate_region`'s sequential verse-text match sees each Psalm's verses split apart by commentary tokens, recall craters below `CH_FLOOR` 0.35, <30% of psalms locate, and the whole book is dropped as noise → **0 located**.
- **This kills the prior remedy.** Half-page L/R re-OCR would bisect the single body column and *still* contain the inline annotations — wasted hours. The correct, cheap fix is **detect-side**: recognize `(x) …` annotation lines and separate them from the verse fold (route to apparatus), then re-fold and re-test locate. No re-OCR unless the verse OCR itself proves inadequate.

### 2026-07-08 [af08f6f299d5]

Two grounding facts sharpen the plan:
- **Identity is token-level today, not character-level** (`consensus_v2.sim()` uses `difflib` on tokens). Your char-level requirement is a real, additive change — not a reuse.
- **Body/marginal separation already exists but is geometry-only** (`load_stream` masks by x-centre band `DEFAULT_BODY 0.11–0.88`). That's *why* the eebo-vol4 `(n)/(o)` footnotes still pollute: at x-centre 428–510 they sit *inside* the body band, so a purely geometric mask can't catch them. Contiguity-based localization needs a **content** signal (parenthetical-marker lines) on top of geometry. The fix is precisely locatable.
And the four book-level gates to remove are named: `consensus_v2` `COVER_FLOOR` (L40/L360), `build_tome_map` `NOISE_FRACTION` (L150), `detect_our_ocr` `BOOK_ALIAS_FLOOR` (L86).

### 2026-07-08 [a960b20a42b0]

- **Modern identity** must fold archaic OCR ("The Prophete Dauid") hard enough to match modern Janvier ("The Prophet David") — that's exactly `spelling_glyph_model.fold_diplomatic`'s job (strip silent-e, u/v↔, collapse doubles → a modern-neutral *skeleton* where archaic and modern of the same word collapse identically). It measures **content captured**.
- **Archaic identity** must do the opposite: a *light* fold (ſ→s for the metric, vv→w, u/v/i/j typography) that **keeps** archaic spelling (Prophete≠Prophet), so the OCR must match s-dismas's diplomatic surface. It measures **surface fidelity**.
Same word, two folds, two different questions. Using the aggressive skeleton fold for both would collapse the distinction and let garbage pass the archaic gate.

### 2026-07-08 [46eb2eff214d]

Note what the A/B also reveals: *before* the fix, `detect_book` already attested 70 chapters at probe_recall 0.72 — well above the old 0.35 floor. So Psalms wasn't dropped by `BOOK_ALIAS_FLOOR` at all; it was laundered to "0 located" *downstream* by `build_tome_map`'s `NOISE_FRACTION` book-drop. That's the smoking gun for why removing the book-level gates matters independently of the contiguity fix — two different gates, two different failure modes, both hiding the same recoverable data.

### 2026-07-08 [b6ee0e73cfe4]

The key realization: the double-bind design *already contains* the correct replacements for everything these floors were doing. Presence/absence belongs to the **source-index** ("ought-to-contain"), garbage-rejection belongs to **per-verse `ATTEST_THRESHOLD`** and **char-identity in qc_audit** — never to a recall floor. So the floors weren't protecting quality; they were a redundant layer whose *only* unique effect was the ability to launder a mangled-but-present book to zero. That made them pure liability. `book_coverage()` survives, but demoted to a **recorded signal** (`coverage_recall`), never a branch.

### 2026-07-08 [122269fe1df0]

The two folds are deliberately opposed. The modern fold collapses spelling variation to test *meaning recovered*; the archaic fold preserves spelling to test *surface fidelity*. That's why a faithful archaic OCR passes **both** (content matches modern Janvier via the skeleton; surface matches archaic s-dismas via the light fold), while a modernized transcription would pass modern but *fail* archaic — which is exactly what you want, because the deliverable's archaic layer (idx109) must reproduce the diplomatic surface, not a clean-up. The self-check at the bottom of the file proves the discrimination is real (`archaic-vs-sdismas − archaic-vs-modern ≥ 0.05` per differing word, compounding at chapter scale).

### 2026-07-08 [0fc85e8964e8]

So your idea #1 ("lift all sources into the same structure so matching is a coordinate 1:1") is **already done for scripture across all transcribed sources**, and OCR emits into the identical schema. The liftover you're asking about isn't a build-from-scratch — it's a *promotion*: make the skeleton-keyed reads the authoritative artifact and attach per-cell scores to them. The genuinely unbuilt part is **apparatus/marginalia** (only `madueke_b` currently carries `apparatus_blocks`) — which is also the harder coordinate problem, more below.

### 2026-07-08 [89491a15ec99]

In your terms this is a **pangenome presence/absence matrix**: skeleton loci are the core genome, novel OCR spans are accessory insertions, missing reference cells are low-depth/deletion calls. The anti-laundering property falls out for free — there is **no book-level cell to drop**. A mangled verse is a low-identity row (→ re-OCR worklist), never a silent absence; a source is never accepted/rejected wholesale. This is the structural version of the "record, don't drop" fix we just made, generalized to the whole corpus. It's the thing to build forward to, and qc_audit's `coverage-audit.json` *is* this table.

### 2026-07-09 [e6f2df7eb8e9]

Deleting a superseded number is not enough — a builder greps for `0.85` and uses whatever they find. The durable fix is to leave a *tombstone* ("the stale 0.85 was a pre-QC-framework relic") so the next reader understands the number is dead, not merely absent. That's the documentation analog of a deprecation shim: the old symbol still "resolves" to an explanation instead of silently vanishing.

### 2026-07-09 [3c40902cec19]

The whole sprint was an exercise in **separating decision from execution**. Everything folded here is *specification* — the docs now say precisely what the code must do (activate `edit_ratio`, exclude gaps from plurality, enforce the cross-lineage floor), but the §11 hold means not one line of `char_identity.py` / `consensus_v2.py` was touched. That discipline is what lets a plan survive a context clear: the next session resumes from an unambiguous contract instead of half-applied code.

### 2026-07-09 [0664ff6c8a8a]

The manifest already carried per-volume content `sha256` — the generator just wasn't threading it into the witness record. This is the ideal fix: propagate an existing *real content hash* rather than fabricate an archive-id proxy. The critique (C4) was right that the schema needed unifying *first* — S1/S3/S9 carry `volumes[]` (multi-hash) while S2/S4/S5/S6/S8/S10–S15 are flat (single hash), so the witness-level sha256 must roll up deterministically (single→itself, multi→hash-of-sorted-hashes, a mini Merkle root) to give one join-stable value per witness.

### 2026-07-09 [335637544e78]

This is the difference between an *identity* metric and a *completeness×identity* metric. `difflib`'s ratio is `2·M/(len₁+len₂)`; if the OCR side is missing verses, the extra unmatched modern text drags the ratio down even when every character the OCR *did* produce is perfect. So a whole-chapter concat conflates "how faithful is the text?" with "how much of the chapter did we capture?" — two axes the QC contract may want separated. I need to quantify which axis is driving the sub-0.90 scores before concluding the scans "fail identity."

### 2026-07-10 [320ac135b584]

The flips reveal *why* archaic-preeminence matters, concretely: e.g. `psalms/130 · S14` scores modern 0.882 (fails the old modern gate) but archaic 0.903 (passes) — a faithful 1582 reading that simply diverges from Janvier's modern edition. The old AND-gate would have discarded a *good* witness; the new gate keeps it. That's the "right yardstick vs. excused failure" principle showing up in the actual numbers, not just the design doc. The report also surfaces `genesis/8` having no archaic reference at all in the baseline — exactly the gap the odr_com backfill (task 8) is meant to close, and now visible for Sir to direct.

### 2026-07-10 [bf2208ddf2ee]

The Janvier `conf-front` is the **Confraternity revision (1941, Challoner-Rheims)** — "Nihil Obstat / Imprimatur: Bishop of Paterson", no mention of Rheims 1582, Cardinal Allen, or Gregory Martin. It is a *different work* from the original 1609–1610 Douay-Rheims whose front matter (title-page, approbatio, preface, privilege, censura) the physical scans S1–S15 actually contain. Scoring original-DR OCR against Confraternity text would be measuring against the **wrong standard** — precisely the kind of laundering the No-Silent-Degradation guardrail forbids. So front/back-matter cannot piggyback on the existing Janvier reference; it needs its own faithful reference.

### 2026-07-11 [d01c3eaa29f0]

This is a classic **multi-source state reconciliation** problem. Three state records disagree: the JICM checkpoint (LLM-compressed, lags), the scratchpad LATEST block (hand-authored, most current), and the filesystem (ground truth). Per my "Empirical Before Claim" discipline, filesystem mtimes are the tiebreaker — and they confirm the scratchpad, not the checkpoint. Trusting the checkpoint would have made me redundantly re-run a completed 90-second audit.

### 2026-07-11 [557e215aa3f8]

This is precisely the zsh word-splitting trap: `for book in $ALL` iterates once over the whole string in zsh, but 76 times in bash. The robust fix isn't to fight the shell with `${=ALL}` — it's to move the expansion into Python via an `"all"` sentinel, so argument handling never depends on shell field-splitting. I'll also add a `QC_OUT` override so full-scope writes to its own file and can't clobber the validated pilot artifact again.

### 2026-07-11 [e4aa4afb33e8]

The clobber is legible right in the artifact: `scope_books: ["genesis exodus leviticus ... 4-esdras"]` — a list with **one** element that is the whole slug list. In bash, `for book in $ALL` would have split on `$IFS` into 76 words; in zsh, unquoted `$ALL` stays a single word, so `argv` was length-1 and matched no skeleton book. Moving the expansion into Python (`argv[0] == "all"` → read slugs from `skeleton.json`) removes the dependency on shell field-splitting entirely — the fix lives where the data lives.

### 2026-07-11 [bbe6a805d83f]

The fix also embodies a defense-in-depth principle worth noting: the `all` sentinel removes the *cause* (shell field-splitting), while `QC_OUT` contains the *blast radius* (a bad run can no longer overwrite a validated artifact). Fixing only the sentinel would have been sufficient to make this run correct, but the output-isolation guard means any *future* mis-invocation degrades to "wrote a junk sidecar file" instead of "destroyed the authority." That's the difference between correcting an error and making the error class non-catastrophic.

### 2026-07-11 [b311aaada5e4]

This verse-content defect is fundamentally a *layout-extraction* problem — pdftotext's linearization puts the decorated initial in an inconsistent stream position, and argument-vs-scripture can't be reliably separated from the flat text layer alone (both are prose; the argument even wraps to lowercase lines). That's precisely what §12 P4R.B "layout-aware re-OCR" exists to solve. It is distinct from the chapter-heading structure defect, which *was* solvable from the text layer and is now fixed.

### 2026-07-11 [40010ddbef4f]

The −18 archaic-pass delta is the *right* direction. Before the splice, some genesis-26/psalms-52 scan-verses false-passed against a wrong or backfilled reference (the misnumbered "chapter 25", the severed psalm heading). Now they score against the faithful 1610 archaic surface — which is stricter — so a few correctly flip pass→fail. A truer reference that *lowers* the pass count is strengthening the re-OCR case, not degrading it. `modern` stayed flat because the splice only touched archaic (s_dismas) reads.

### 2026-07-11 [f6070f35b51f]

Adding john was a clean scope test: because the report generator is data-driven off `skeleton.json` (not a hardcoded book list), the only code change needed was one line in `PILOT_BOOKS` — the audit, rollups, testament grouping, and all figures absorbed the 5th book automatically. The faithfulness proof is that john's 413 archaic passes showed up as *exactly* +413 in the report's global count. That decoupling of scope-config from render-logic is what makes "confirm each iteration" cheap to iterate.

### 2026-07-11 [1fec58284da9]

The banner is the highest-leverage change of the whole batch, because it closes the loop on *why* v5 "didn't look like an update." The delta logic keys on `input_sha256`: when the audit JSON is byte-identical (a report-code change like v6), it says "presentation-only"; when the audit data changes (a splice or a new book), it shows the verse/book deltas. So from now on, one glance at the top tells you both *which* version you're on and *whether the underlying numbers moved* — a stale tab becomes self-evident instead of silently misleading.

### 2026-07-11 [8999ca179c41]

The load-bearing design decision was the *union*: `expected_witnesses ∪ actually-attesting`, not just one or the other. Filtering purely on "does it attest" would have hidden an expected source that failed to localize at all — silently erasing a real coverage gap. Filtering purely on "expected" would have dropped a source that unexpectedly *does* attest. The union hides only what's both **not expected and not present** — the genuinely spurious gray rows — while keeping every real gap visible. That's the No-Silent-Degradation line drawn precisely: a missing witness that *should* be there stays on screen as a gap; one that was never supposed to be there disappears.

### 2026-07-12 [200c354792ee]

Two raw-count comparisons are **scope-confounded**, and Sir specifically asked for *rates* and *proportions* for exactly this reason:
- **v4→v5** flagged "REGRESSED" — but the pass *rate* only dropped because adding John enlarged the denominator with a hard book. That's a scope change, not a quality regression.
- **v7→v8** flagged apparatus_worklist 2→3 as "regressed" — but the worklist grew because we *added* the NT preface to tracking, i.e. more coverage, not worse quality.
So raw counts across a changed universe aren't like-for-like. I'll drive verdicts off rates/proportions (per Sir's list) and explicitly flag scope changes so a scope expansion is never mislabeled as a regression.

### 2026-07-12 [f5cee998216c]

- The SKILL.md project-binding (line 85) reads `Projects/palimpsest/core/.scratch/...` — but a future session invoking this skill runs from `/Users/nathanielcannon/Claude/Project_Aion`, where that relative path resolves to a non-existent `Project_Aion/Projects/...`. A skill's "one non-negotiable gate" pointing at an unresolvable path is a silent trap.
- This is exactly why the "verify a named path before recommending it" rule exists — the skill *reads* complete, but a path claim is only true relative to a specific cwd, and skills get invoked from the primary working dir.
- Absolute paths are the fix for cross-directory reference docs: no cwd ambiguity, resolves identically from any Archon session.

### 2026-07-12 [aaff92ff2e1b]

- A skill or reference doc "reading complete" is not the same as "correct" — a path claim is only true relative to a specific cwd, and skills are invoked from the primary working dir, not from wherever the deliverable lives.
- The stale checkpoint is the useful lesson here: JICM captured intent-in-progress, so the right resume move was to **check disk reality first** rather than re-execute the TODO list and duplicate finished work.

### 2026-07-12 [b66697c0cccc]

- Two distinct repos share the `Claude/` parent: `Project_Aion` (my cwd, where the skill lives) and `Jarvis`. The lock error surfaced Jarvis's git-dir because a background watcher process was committing there — a good reminder that in a multi-Archon workspace, git write-locks can appear from processes you didn't start.
- The guardrail "investigate the lock holder, don't delete it" paid off: had I force-removed it, I could have corrupted an in-flight watcher commit. Waiting cost seconds and the lock cleared itself.

### 2026-07-12 [9493d40707d1]

- A single git diff *hunk* can contain multiple independent logical changes. Here the `@@ -50,13 +53,14 @@` hunk holds three: the P2-envelope edit, the AI_OCR line, and the execution-envelope edit. "Commit the P3 wiring" means committing *one added line* out of that hunk.
- `git add -p` needs interactive stdin (unavailable here), so the clean non-interactive tool is `git apply --cached` with a hand-built patch whose context lines match HEAD. The context lines I'll use (P3-harness line, P4 line) are unchanged vs HEAD, so the patch applies to the index without pulling in the neighboring edits.

### 2026-07-12 [2fb99341f84b]

- **Full verify contract green**: pyright 0/0, `node --check` rc=0 on the 2 MB inline script, faithfulness recompute shows the HTML embedded rung-0 summary EXACTLY equals `diag-reocr/index.json` (5 counts + 9 records + gate string all match). The v9 → v8.1 empirical comparator correctly flagged this as "NO EMPIRICAL CHANGE (PRESENTATION-ONLY)" — v9 adds a sign-off surface, no rescoring.
- The empirical version-compare module Sir installed in v8.1 is now paying off: it says the plain truth about what changed, so a presentation-only v9 can't masquerade as an empirical gain.

### 2026-07-12 [4045ffa5fdfb]

- Kraken's default `blla` found only **2 generic "text" regions** — it does NOT type marginalia/header/verse-rail separately. So region suppression can't come from kraken's region labels; it has to come from geometry.
- The current x-band heuristic (0.11–0.88) correctly kicks out the left signature word `Abralam.` (x=0.07) but **fails on the running header** `GEN ES 1s.` (x=0.46, horizontally centered → wrongly kept as body). The header is distinguishable by *y-position* (top of page), not x. That's the concrete rung-1 fix.
- One coremltools warning fired on model load, yet recognition produced clean text — so inference used a working path. I'll verify the recognizer isn't silently degrading before trusting a score.

### 2026-07-12 [99b3620eaf42]

- On **Genesis** (1667×2342), Surya typed all 3 running-header fragments as `PageHeader` — *including the centered "GENESIS" at xc 0.46* that the fixed x-band (0.11–0.88) structurally could not suppress — and it boxed the **right-margin apparatus** ("Her father hauing perhaps...") as a *separate* Text region from the main body column (xc 0.45), plus the bottom watermark as `Picture`/`PageFooter`.
- On **Psalms** it cleanly typed header/footer/watermark; on the **degraded Matthew** scan it found body blocks + a `SectionHeader` but no header/footer (degradation-limited).
- The key shift: Surya groups *lines into regions*, so body-vs-margin becomes "pick the body region among ~3 boxes" (robust) instead of "which of 50 lines by x-position" (the band that failed). Body and marginalia share the `Text` label, so selection among Text boxes is still geometric — but now by region area/centrality, which is exactly the per-layout fix.

### 2026-07-12 [f9cf398bd694]

- **The layout lever is real**: on the same image with the same recognizer, Surya body-region selection beats the fixed x-band by **+0.0205** (0.5499 → 0.5704), measured through the audit's own `detect_book` scorer. Surya dropped 9/50 lines (running header + right-margin apparatus + watermark) and preserved ſ. The redesign direction is validated.
- **But it's small, and resolution bites**: my re-OCR of the *downscaled 1667w diag raster* scores 0.55–0.57, which is **below the existing full-res OCR's 0.6153** for the same Genesis S1. So re-OCR only pays off at *full resolution* — and even then, the layout lever (+0.02) can't close a 0.62→0.90 gap that is **recognition-dominated**, not layout-dominated.

### 2026-07-12 [fb1edcba56e5]

- At 300 DPI: baseline 0.5228, surya 0.5177 (Δ **−0.005**). Higher DPI did **not** help, and the layout lever flipped sign — so on a single page the ±0.02 "lever" is within noise, not robust.
- More important: my kraken+reichenau re-OCR scores ~0.52–0.57 *content identity* regardless of DPI. The **recognizer is the ceiling**, not layout or resolution.
- But I've been comparing kraken-vs-kraken — I never scored the **existing diplomatic OCR** through this same single-page path. The "existing = 0.6153" figure is from the full audit (all pages, different verse set), so it's not a clean comparison. I must fix that before concluding.

### 2026-07-12 [8f97b87e501a]

- The earlier "0.6153 existing" was a *different verse set* (full audit, all pages). On the actual page, existing OCR is 0.5506 — so Surya re-OCR genuinely **beats existing by +0.020**, measured apples-to-apples. The layout lever is real and positive.
- **But it's ~0.02 against a 0.35 gap to the bar.** Existing≈0.55, re-OCR≈0.57, bar=0.90. The gap is **recognition-dominated**; the reichenau recognizer ceilings ~0.55 content regardless of DPI (300 DPI was *worse*). Layout and DPI are not the levers to 0.90 — a stronger recognizer and/or multi-witness consensus are.

### 2026-07-12 [ef7856660071]

- **Wrong recognizer for the language**: `reichenau_lat` is a *medieval Latin* model, but this text is *early-modern English* ("I beseech thee, and doe mercifully with my maister Abraham"). A Latin language-model/letterform prior on English is a systematic error source — not an intrinsic ceiling.
- **Likely input mismatch**: kraken warns these are *legacy* models (expect binarized, fixed line-height ~48px input). I feed un-binarized grayscale, and 300 DPI being *worse* than 150 is the classic signature of line-height/scale mismatch, not a recognition limit. Both are fixable pipeline faults, not ceilings.

### 2026-07-12 [026ff70a34fe]

- The **well-aligned verses recognize beautifully**: v18=0.980, v24=0.976, v21=0.955, v16=0.917, v14=0.907. Example v18 OCR "Vho anſwered Drinke my lord And quickly she let dovne the tankard vpon her arme and gaue him drinke" vs REF — near-perfect, ſ intact. **reichenau is NOT the ceiling.**
- The **low-ratio "verses" are a measurement artifact**: e.g. `[v17] ratio=0.224` pairs OCR about "the daughters of the inhabiters" (real Genesis 24:13 content) against a REF "againe he digged other welles" — which is **Genesis 26:18**, a different chapter. My single-page `detect_book` hack has no surrounding pages to localize with, so it smears the page's OCR across verse slots in chapters 24/25/26/30/11 and scores good OCR against unrelated refs.
- So "~0.55, recognition-bound" was **my harness mis-aligning**, not the recognizer. On correct alignment this page is ~0.85–0.98 — near/above the 0.90 bar.

### 2026-07-12 [12a23354115a]

- **Alignment-free, the OCR body is 0.8171 identical** to Genesis 24:12–31 (ſ 55/60 preserved) — vs the 0.5704 "per-verse" mean. The recognizer is doing ~0.82, not ~0.55.
- The per-read drift proves it: OCR of Genesis 24:13 got assigned to the `26/17` slot (oracle best-match 24/13); 24:24 content landed in `30/21`; etc. My **single-page `detect_book` had no neighbouring pages to localize with, so it scattered good OCR across wrong-chapter verse slots** — fabricating the low scores.
- So "recognition-bound / need consensus or vision-LLM" was **my measurement harness failing**, not the model. Real gap on this page is 0.82→0.90, and the user's instinct (adapt per-page, iterate configs) is exactly the right lever to close it.

### 2026-07-12 [2bbc60357f50]

- The user's "take the best config per page" is powerful but needs a *selection signal*. On gold/pilot pages we can select by score against the reference; on the **full work** (no reference) we'd need a reference-free proxy — dictionary-word rate, LM perplexity, or **multi-config agreement** (run N configs as pseudo-witnesses, per-line majority vote). That last option unifies per-page adaptation *and* the consensus lever.

### 2026-07-12 [806e64c8fbc9]

- **Removing every space changes the score by +0.0013 (nil).** So the 0.82→0.90 gap is *not* word-fusion/missing-spaces — and since `fold_archaic` already folds ſ/u-v/i-j/æ/vv, it's not a typography-fold artifact either. **The last "it's just a scoring artifact" hypothesis (a) is refuted.**
- The residual gap is **genuine recognition loss**: glyph substitutions plus a **162-char (~6%) length deficit** — dropped short words / partial lines. That points at recognizer + segmentation levers (rung-2/3), not more normalization tuning.

### 2026-07-12 [8631e692219a]

- I'll transcribe *line-by-line as printed* (not verse-by-verse) so the segmentation ground truth is usable to fine-tune the line splitter. Verse boundaries are marked with the printed `†` glyph the edition uses.
- I'll flag ANY glyph I'm not 100% sure of with a `⟨?⟩` marker rather than silently guess — that's the whole point of a "perfect" reference (uncertain-flagged is honest; silently-guessed pollutes the training set).
- The right-margin has a small annotation (marked with `‖` in body, expanded in margin). I'll transcribe both and preserve the linkage.

### 2026-07-12 [9af613026e0f]

- **Existing OCR is 0.8955 (fold-archaic) / 0.8819 (raw surface) against my perfect transcription** — near the 0.90 bar! The sweep reported 0.8163 vs s_dismas, but that was mostly measuring **s_dismas-vs-printed-page divergence**, not OCR-vs-page accuracy.
- **s_dismas itself only agrees with the actual printed page at 0.8670** — the reference we've been chasing 0.90 against is only 87% faithful to the 1609 print. **The 0.90 bar was structurally unreachable against s_dismas** by ANY recognizer, because s_dismas isn't the printed page.
- **This vindicates your entire ask.** The reason to bench against MY perfect transcription is exactly this: the "reference" (s_dismas) has its own ~13% divergence from what's actually printed. That divergence was being falsely attributed to the recognizer.

### 2026-07-12 [2dabeeff71b6]

This decomposes the "0.82→0.90 gap" I was going to spend weeks on:
- **verse-span error** (v12-31 vs v12-30 on-page): **+0.034** (0.8163 → 0.8502)
- **reference-vs-page divergence** (s_dismas ≠ actual print): **+0.045** (0.8502 → 0.8955)
- **actual recognizer gap** (OCR vs the true printed page): **0.045** (0.8955 → 0.90)

So of the "0.083 gap" I was measuring, **only 0.045 was the recognizer** — the other 0.038 was s_dismas + verse-span not being the printed page. The recognizer is *much* closer to bar than the sweep suggested.

### 2026-07-12 [c875fcdf83dc]

- A static `file://` page **cannot write to disk** — the browser sandbox forbids it. So a one-click "submit → file I can read" needs a tiny local server with a POST endpoint. I'll use Python's stdlib `http.server` (no Flask dependency) bound to `127.0.0.1` only.
- I'll make it **locus-parameterized** from the start (dropdown over all ground-truth files), so the same tool serves all 15+ pages as I add them — not a throwaway for one page.
- Correction granularity = **per-line editable fields** pre-filled with my reading. That matches my GT's line structure, which is also what I need for line-level recognizer alignment later. Plus a glyph palette (ſ æ œ † ‖) so you can type archaic characters easily.

### 2026-07-12 [a3591acac319]

- **Why a server and not a static file:** browsers sandbox `file://` pages from writing to disk, so a one-click "submit → file I can read" is impossible without a local endpoint. The stdlib server binds `127.0.0.1` only (not exposed to the network), and the raster/GT/submit paths are all containment-guarded under the project dir.
- **Why per-line fields:** your corrections land keyed by `line_index`, which is exactly the structure I need later to align each corrected line to its raster crop for recognizer fine-tuning. The review UI and the training-data format are the same object.
- **The tool is already general:** the locus dropdown reads every file in `ground-truth/`, so as I add Psalms 118, Matthew 26, etc., they'll just appear in the same page — no rebuild.

### 2026-07-12 [fa548a1e089f]

- **s_dismas has an error my GT caught**: it inlines `eloquia` *into* verse 103 ("more eloquia then honie"), but on the page that's a **left-margin Latin gloss** (`* elogia`) keyed to "wordes", not verse text. My GT separates it correctly — a concrete case where the reference is wrong and the human-reviewed GT is right.
- **The tool can't show this page's apparatus yet.** Psalms 118 has a rich `apparatus[]` (italic annotations, Nun/Samech section markers, signature) and a `catchword` — structures Gen 24 didn't have. The current `gt_review.html` only renders `body[]` + `marginalia[]`, so you'd be blind to the annotation uncertains (`reidie`, `diſplaſed`, `bridleth`).

### 2026-07-14 [831ff2a559cf]

- **The state file lies about recency.** `session-state.md` was last written 2026-06-15 (Palimpsest), but git shows a full month of newer work since — the live thread is **OriginalDR** (a custom-OCR reconstruction effort) plus a batch of **JICM/Nexus infrastructure** commits. When state files and git disagree, git wins; the stale doc is itself a hygiene signal in my domain.
- **Domain split matters here.** The scratchpad's entire tail is OriginalDR OCR (seg_v2, consensus rungs, ground-truth) — that's **W0's product work**, not mine. My W5 lane is the *infrastructure underneath it*: JICM watcher, hooks, skills, Nexus control-plane. The recent `645b00f fix(jicm): autonomous hard-threshold trigger` and the Nexus hardening commits are the ones in my lane.

### 2026-07-15 [df78949ceb14]

The strongest methodological result of this batch isn't any single page — it's that **the w/vv choice is a per-volume, per-face property of the physical type-case, resolvable by zooming one capital `W`.** A solid single-sort capital proves the font owns a lowercase `w`, so vv-looking lowercase is a *cut*, not a digraph. That single test now disambiguates the whole corpus (NT-1582 vs OT-1609/1610) and is exactly the kind of volume-level prior the re-OCR ladder can key on. Each GT file records the regime in `layout_note` + `glyph_regime_resolved`, so it's training signal, not just a transcription.

### 2026-07-15 [9cbb03d9d2a5]

The prune targets are entries that got **superseded by the work just completed**, not arbitrary old lines:
1. **Fork option (A)** ("extend GT to more layouts") — that *was* this task; it's now done, so the fork collapses to just (B), the consensus rung.
2. **The old glyph rule** ("real `w` in body, footnotes use vv") — now refined and partly corrected by the volume-scoped finding; keep the pointer, drop the superseded specifics.
3. **The 2-exemplar GROUND TRUTH list** — subsumed by the 25-loci COMPLETE block; compress to just the distinction that matters (which 2 are Sir-reviewed vs. 23 first-pass).
The freshest blocks (COMPLETE, corrections, glyph finding) stay intact — pruning removes the *replaced*, not the *recent*.

### 2026-07-15 [21293ecd495f]

Each requested skill now has concrete evidence, which is what makes a CV credible rather than a keyword-stuffed list:
- **Pipeline validation** → Oncomine triple data-quality gate + FDA-submission standards; Bayer GCKD "gates that exit non-zero on violation"; Natera `setdiff` lossless-join validation.
- **Proteomic ETL** (the one I was worried about) → *genuinely supported*: the Bayer GCKD renal panel is **protein biomarkers** (NGAL, galectin-3, osteopontin, copeptin, MR-proANP), plus STRING/PPI + Reactome protein-interaction ontologies in the Knowledge Graph. I'll frame it honestly as protein-biomarker/interaction work, not mass-spec.
- **Real-world data** → the Optum engagement is *explicitly* CDISC SDTM/ADaM-modeled real-world evidence.
- **Ontology mapping/enrichment** → Eli Lilly OMOP CDM (SNOMED↔ICD-10-CM via OHDSI/Athena) + the 20-ontology Clinical Knowledge Graph.
- **Unstructured-data harmonization** → Natera free-text/PHI fields → relational schema; NLP free-text→coded-concept.

### 2026-07-15 [28e46640505a]

**Two dispatch surfaces to Alfred, and they compose.** (1) *Pulse tickets* labeled `agent:aifred` are the **durable** coordination substrate — Nexus's 5-min cron dispatcher routes them, and they give me a queryable monitoring surface via the Pulse MCP. (2) The **Protos pane** (`aion:1`) is a *live, idle* Alfred seed session at its input prompt with bypass-permissions on — the **immediate** execution channel. The robust pattern is: I create precise tickets (I've done the recon, so Alfred doesn't re-derive), then hand the live seed session the mission pointing at those tickets to coordinate/execute.

### 2026-07-15 [ffa66108be41]

Notice Alfred **independently chose** to handle SW-1 directly rather than delegate it — "destructive file ops warrant care." That's the right instinct: the folder move is the one irreversible step (source deletion), so it stays with the coordinator, not a fire-and-forget subagent. My briefing's "verify byte-for-byte before deleting source" guardrail reinforced that.

### 2026-07-15 [ddb10e121399]

**The validation did its job — it caught a real failure.** Fixing the crash-loop and lifting the pause was necessary but *not sufficient*: the ticket never leaves `staging:wait`, and no managed executor spawns. The evaluation→queue→execute promotion stage is broken (compounded by the missing `pulse` CLI). This is a genuine debugging project, not a one-liner — exactly the kind of thing "validate first" exists to surface before real work is trusted to it.

### 2026-07-15 [c04fe2ecc64e]

This is the third deliberate off-switch. The Nexus autonomous system was shut down through **multiple independent, intentional mechanisms** around the same time: the `.nexus-paused` sentinel (Jun 19) *and* a `launchctl disable` on every agent. That belt-and-suspenders pattern is a strong signal the shutdown was **deliberate**, not an accident — you can't `bootstrap` a disabled service (hence the EIO error); it must be `enable`d first. The plists lint clean, so nothing is broken — they're just switched off on purpose.

### 2026-07-15 [8d49348da428]

**The flood is stale, and I triggered it.** All 15 `systems-engineer` load-failure notifications are dated **Jun 19–20** — they sat *pending* (undelivered) for 27 days because the delivery infra was down. When I loaded the dispatcher ~20 min ago, it drained that queue → Keryx/Telegram fired all 15 at once. They're now marked `delivered` (0 pending), so no *new* real failures — but I need to confirm the delivery isn't looping, and fix the **root cause**: the `systems-engineer` persona directory **doesn't exist** (task `AION-dda8ac46` was routed to a non-existent persona → `prompt_load_failed` → fell back to default).

### 2026-07-15 [bc77a64d3cf3]

**One root cause, several dependent symptoms.** (1) **Ollama down + loopback-bound** → every LLM-gated stage fails ⇒ staging-revert + review-thrash (the Jun 19 incident) — **fixed**. Secondary/independent gaps: (2) review has no backoff cap, so a *persistent* Ollama failure thrashes rather than parks; (3) Flask clobbers the logger to WARNING, hiding heartbeats; (4) dashboard delivery URL is `:8600` not `:8701`; (5) `pulse` CLI missing for some personas; (6) evaluator can assign a non-existent persona.

### 2026-07-15 [9cb8b1272444]

The validation confirms the Ollama outage was the whole story: with it restored, the state machine — which was well-built all along — advances cleanly through every gate. The Jun 19 "reviewer thrash" was review reverting `completed:no` on every Ollama failure; with Ollama healthy, review returns a verdict once and closes.

### 2026-07-15 [486223d256a8]

The Jarvis-dev (W5) `claude` command currently has **no `--model` flag** — so it inherits the CLI default rather than `AION_MODEL`. To put *this window* on Fable 5 I must add `--model '${AION_MODEL}'` explicitly, not just change line 55. The same `--effort high --add-dir…` fragment appears **4×** (both the add-to-existing and fresh-create paths, each with resume/session-id variants), so one `replace_all` fixes them together. And `~/Claude/Projects` + `~/Claude/GitRepos` are *outside* cwd, so they need explicit `--add-dir` grants (alfred is already under cwd).

### 2026-07-16 [d73a1ccfdd10]

One behavior to expect on restart: the launcher will `--resume` W0's existing conversation, which was recorded under Opus. Resuming it with `--model claude-fable-5` is fine — Claude Code honors the `--model` override and continues on Fable 5 — but the prompt **prefix cache resets** on the model switch (a one-time cost, not an error). If you'd rather start W0 clean on Fable 5, launch with `--fresh`.

### 2026-07-18 [71822359565b]

The roadmap is a *buildable-spec* document: every Phase 0/1 item carries an **acceptance criterion that proves it** (honoring No-Silent-Degradation), and it explicitly holds itself to "a fresh session could build Phase 0 from this without asking a question." My session's work maps directly onto **0.3(c)** — "Namespace JICM state + durable-state per lane (W0 vs dev)" — whose acceptance criterion is "*W0 state provably uncontaminated across a mixed session.*" I proved exactly that (W0 checkpoint md5 byte-identical across a dev prep run). And **0.3(d)** — the `refresh --fire` actuator — is now built and gated. The honest move, which the document itself demands, is to update it to reflect verified reality.

### 2026-07-18 [c3a83cd32edc]

**0.3(b) is a robustness fix, not an overflow bug.** W0 runs Fable-5, and `jicm-gate.sh` has no `*fable-5*` arm — so it falls to the `*) WINDOW=1000000` default. But **1M is Fable-5's actual window**, so the default is *accidentally correct*: W0 is **not** at risk of overflowing before JICM fires. What remains is legibility/robustness — JICM *defaults* to 1M rather than *recognizing* Fable-5, and the model extraction can whiff to `<synthetic>` (which I saw live). The fix is to add an explicit `*fable-5*|*mythos-5*` arm and harden the model-id extraction so the window is derived from a real model string. Valuable, but **not urgent** — it doesn't gate anything the way I feared.

### 2026-07-18 [0392471ee9f7]

**The `<synthetic>` tail also zeroes the token count** — and this is almost certainly why W0's state read `tokens:0` earlier. The usage extraction (`jicm-gate.sh:112`) takes the *last* assistant message's `.message.usage`, but a synthetic tail message has no `usage` → `null` → **tokens=0**, so JICM goes blind to W0's real context size exactly when a synthetic message lands last. My model-extraction fix skips synthetic; the usage extraction must do the same, or the model reads right while the tokens read zero.

### 2026-07-18 [937f50412153]

The w/vv call turned out to be **three faces, not two**: roman body=`w`, italic=`w` (NT) / `vv` (OT), and **display titling caps=`VV`** (a distinct fount with no W). The trap is that a roman w-sort is physically *cut* as two overlapping v's, so at high zoom it looks identical to genuine `vv` — over-zooming past ~5× at 400 DPI just pixelates and proves nothing. The reliable test is a capital-W at 2–5× gestalt.

### 2026-07-18 [35766678dd90]

Sound scratchpad pruning drops **completed-work narrative and delivery manifests** (recoverable from disk/git/provenance) while keeping **forward plan + live infra + "don't re-derive" findings**. The stale material here: the per-locus GT manifest, KEY CORRECTION #1/#2 (now baked into GT provenance), the tool-hardening blow-by-blow (now in the code), and the argument-p104 apply narrative. The one live decision-point buried in that block — *roman-lowercase w/vv awaiting Sir's ratification* — gets promoted up into DURABLE FINDINGS so it survives the prune.

### 2026-07-18 [063d206730b6]

**Two prior design generations are in tension, and reconciling them IS the design.** The v8 doc argues JICM should become *thin per-session hooks + prep script, no watcher, no tmux* — because (it claims) the hook stdin payload carries a full `context_window` object, making per-session sensing native. It even pre-identifies my exact namespacing fix (§6: "per-session state files via `session_id` suffix"). **But** the *current, working* `jicm-gate.sh` header explicitly says the opposite — "context_window is NOT in any hook event's stdin; the JSONL transcript is canonical." And critically, v8 admits **a hook cannot invoke `/clear` programmatically** — so v8 relies on a *human* to clear, which is impossible for autonomous chains/Protos. That's precisely why the tmux send-keys actuator (my `jicm-self.sh`) is non-negotiable for the multi-session/chain requirement.

### 2026-07-18 [af3174114ef4]

The current Claude Code hooks doc confirms hook stdin carries **only** `session_id`, `transcript_path`, `cwd`, `hook_event_name`, `permission_mode` (+ `prompt` on UserPromptSubmit, and notably **`model`** on SessionStart) — **no `context_window`, no token count** anywhere. So the v8 design's founding premise ("read context_window from hook stdin, delete the watcher") was **wrong**; the working v7.9 `jicm-gate` is right to parse the JSONL transcript. The upside: each session's UserPromptSubmit hook receives *its own* `transcript_path`, so **per-session sensing is already native** — the only fix is namespacing the output by `session_id` (which the v8 doc itself flagged as the multi-session fix). And v8's fatal limitation — **a hook cannot invoke `/clear`** — is exactly why the tmux send-keys actuator I built (`jicm-self.sh`) is non-negotiable for autonomous chains/Protos.

### 2026-07-18 [b6955bb53aa8]

The keystone that makes this whole design safe is one function: `jicm_key_paths`. Because `key=w0` returns the *exact* legacy paths, every subsequent generalization — the gate writing `JK_STATE`, the actuator preparing `JK_COMPRESSED` — is automatically a no-op for W0 until we deliberately migrate it in Phase 3. The unified system and the untouched-W0 guarantee coexist through a single conditional.

### 2026-07-18 [791780d96e5d]

Your genesis-16 hand-pass is the proof: the **same word is set both ways on one page** — `law`/`lawful` is `w` in some lines and `vv` in others, and L43 keeps `vvere` but changes `vviues→wiues` on a *single line*. The compositor just grabbed whichever sort was in the case. So there is **no lexical or positional rule** — an OCR must classify each w-glyph **visually by stroke connectivity** (joined = `w`, gapped = `vv`) and must **not** dictionary-normalize, or it erases the genuine-`vv` minority you preserve.

### 2026-07-18 [98c0b4f34a7e]

**Two migration seams I must sequence carefully.** The dev lane's *working* signal/checkpoint paths (`.jicm-clear-now.dev.signal`, `.compressed-context-ready.dev.md`) differ from what `jicm_key_paths dev` now returns (`jicm/signals/clear-now.dev.signal`, `jicm/checkpoints/dev.compressed.md`). The actuator (step 1) writes the *new* paths; `session-start.sh` (step 3) must read the *new* paths. They move together — and because live-fire stays **gated** in Phase 1, there's no window where a half-migrated dev lane fires against mismatched paths. This is why the phase order (actuator → session-start → *then* canary-fire) is a safety property, not just tidiness.

### 2026-07-18 [045abf2e96d4]

This is the classic `${v:+X}${v:-Y}` trap. I wanted "basename if set, else `<unresolved>`". But `:+` yields `X` when set **and** `:-` yields the *variable's value* when set (`:-` only substitutes `Y` when **unset/empty**). So for a set variable both halves expand: basename **+** full path. The fix is a plain `if`. It's display-only (the real `TRANSCRIPT` var is correct — the cycle fired the right paths), but in a project whose whole thesis is *legibility*, a lying status line is worth fixing.

### 2026-07-18 [78a74a044bd1]

This is the *intended* consequence of the finding-1 fix, not a regression. My harness2 "unknown session" test fired `gate` with **no** `JARVIS_WINDOW` and **no** role, and asserted it namespaces to `session_id`. But the finding-1 fix *deliberately* maps unset-window-non-dev → `w0` (the recovery path — a W0 session resumed outside the launcher has no `JARVIS_WINDOW` but is still W0). In the Jarvis hook domain (only w0 + dev exist), an unset-window non-dev session *is* W0, so routing it to the legacy file is correct — and matches pre-v9 behavior. The test's expectation is what's stale: a *genuine* stray needs an explicitly-set non-zero window (`JARVIS_WINDOW=7`), which doesn't occur in this domain. The real anti-contamination invariant (**dev** never touches W0) still holds.

### 2026-07-18 [f15021c94112]

The scans are **mostly clean** (only 12/109 genuinely degraded), so OCR is failing on **structure, not legibility**. The dominant mode is **M1 apparatus-bleed** (65% — marginalia, cross-refs, and annotation blocks invading the verse stream), with **M3 long-ſ→f glyph error** as the near-universal secondary. The references (s_dismas/odr_com) are faithful where aligned (~0.8–0.95), so the low pilot pass-rate is **genuine OCR failure routed to layout-aware re-OCR (rung 1)**, not measurement noise.

### 2026-07-19 [e5d9b206f951]

Part 1 and Part 2 dovetail here: because `align_coords` re-cuts to canonical verse boundaries, my transcription only needs accurate **line text + approximate verse tags** — the aligner snaps the precise cuts. That's why a name-list page (where verses run mid-line through the "children of X" chain) is now tractable as gold: I capture the lines faithfully, the aligner handles the coordinates.

### 2026-07-20 [d8758b942cee]

The actuator, when it fires, sends `/clear` into a **live** Claude Code session via `tmux send-keys`. That's a decapitation-capable action with high-consequence failure modes: fire mid-stream and tmux *enqueues* `/clear` as literal text (corrupting the session); mis-resolve the transcript and you clear the *wrong* session; resume from a stale checkpoint and you lose work. My 54 harness assertions validate the *logic* — but they use **stubs**. They can't reproduce the real TUI's idle/busy timing, the live transcript's `stop_reason` cadence, or the real `session-start` re-injection. So there's exactly one thing left that only a live run can prove.

### 2026-07-20 [432ac19f2ba0]

**Firing is double-gated**, which makes "staged gated" a hard property rather than a convention. The supervisor fires via `jicm-actuate.sh <key> --fire` — so **both** locks must be open before a single `/clear` reaches a live session:
1. the supervisor's env-gate (`JICM_SUPERVISOR_ACTUATE=1` — *autonomy enabled*), and
2. the actuator's `--canary` code-gate being deleted (*mechanism validated*).

Right now **both are shut**: default is sense + GC + log-only, and even if someone sets `JICM_SUPERVISOR_ACTUATE=1` today, the harness confirms it hits the actuator's still-closed gate and logs `ACTUATE-BLOCKED` — loudly, never a silent no-op. So the supervisor is safe to run and observe immediately; it simply narrates what it *would* clear. And W0 is excluded entirely (the legacy watcher keeps owning `aion:0` until Phase 3).

### 2026-07-20 [30d42521b380]

This is exactly what Sir's report is *for*. The reOCR flags firing on the whole curated set isn't a bug — it's the honest baseline: the current per-source *archive* OCR sits at 0.67–0.85 verse-match to gold, well under the 0.90 bar, which is the entire reason the re-OCR program exists. The heatmap is a **worklist** — cells start flagged and flip to PASS as re-OCR improves each source. Scoring raw per-source OCR against the gold (not the noisy reference reads) is precisely the axis Sir specified — and it's a different, harsher, more truthful axis than qc_audit's reference-based scoring.

### 2026-07-20 [1c84671019d4]

The state file is **fresh** (ts 0m ago) but it's tracking a **51-hour-stale transcript**. W0's session `f56d4d98` last wrote its transcript on **Jul 17 19:56** — ~3080 minutes ago — with all-zero usage. So the watcher's periodic refresh keeps re-reading that dead transcript every ~15s, stamping `tokens=0` with a fresh mtime, while the `SOFT_NUDGE`/`pending=HALT` is **stale leftover** from when the session was last alive (>2 days ago) — a clear that armed but never fired (no Stop event ever came, because the session went idle/dead). This is *not* the synthetic-tail blindness; it's a **stale/abandoned session** that JICM is nominally "tracking" but which has had no activity for two days.

### 2026-07-20 [5b35386de082]

W0 is **live and over threshold**: pid `99185` (`JARVIS_WINDOW=0`, opus-4-8 1M), and its own statusline reads **`38% 382.7K … idle`** with `@Resume work from compressed context` sitting in the input line — i.e. **382.7K tokens, past both the 250K soft and 300K hard thresholds**, doing OriginalDR/OCR work. But the JICM state file is tracking a **different, dead session** (`f56d4d98`, transcript stale 51h, tokens=0). So JICM's brain is pointed at a corpse while the live W0 quietly sailed past the clear threshold. The `@Resume…` ghost-text in the input line is the tell: a prior clear cycle injected a resume nudge that **never got submitted** (the known autofill-needs-Tab+Enter failure), so W0 has issued no `UserPromptSubmit` since — the gate hasn't re-pointed the state at the live session.

### 2026-07-20 [effa8ca7a950]

The elegant reuse here: matter intervals are the verse-analog, so I can feed the GT's `intervals[]` as the "reference verses" straight into `align_coords.realign` — the *same* boundary-mapping machinery that re-cuts OCR to canonical verse coordinates now re-cuts a source's OCR to paragraph/row coordinates. One alignment engine serves both scripture verses and matter paragraphs; the only new pieces are deriving intervals from `body[]` and content-locating a section within a source's page stream (no verse anchors to lean on).

### 2026-07-20 [bcdc2b807252]

The agent's intervals surfaced a mapping I need for E5b: matter sections carry `citation`/`gloss` intervals (the margin apparatus). Sir's rules map cleanly onto matter — the section is the "book", its **paragraphs** are the "verses" (E4/E5a-analog: per-interval + combined), and its **margins/citations/glosses** are the "apparatus" (E5b: scored *combined*, mirroring "all apparatus combined"). So the matter scorer needs two pools, not one flat SCORE_KINDS list — noting it now so the scoring run reflects Sir's rule structure rather than a flattened approximation.

### 2026-07-20 [3bd75d95de27]

This exposes a flaw in *my* over-rigid seeding ("render ONLY pages 15–16"). Sections don't respect the page hints I recovered — they spill. The agent's honest truncation-flag (No-Silent-Degradation working in the sub-agent) is the signal to fix my dispatch phrasing: give the **start** page and instruct "follow the section to its true end even across page boundaries," never "only these pages." I'll correct that going forward and complete this section's p17 tail myself (small — keeps agent spend down).

### 2026-07-20 [b791f11478e6]

A frugality problem I need to fix now: each completed agent dumps its full ~15–20K-token GT into *my* context via the completion notification. Across ~18 remaining sections that's ~300K+ tokens of JSON I don't need in-context (I harvest from disk anyway). The fix: have agents **Write the GT to a file themselves and return only a short summary**. That keeps completion notifications tiny and directly serves Sir's overspend concern. I'll update the shared brief so all remaining agents do this.

### 2026-07-20 [30cab27bf470]

Paragraph-grain intervals are **too coarse for a 0.90-per-interval threshold**. A verse is ~20 words, so 0.90 edit-ratio is a sensible bar; a matter paragraph is ~300 words, where even 5% OCR error drags the whole-paragraph ratio below 0.90 — so every paragraph fails regardless. The flag itself is correct (raw matter OCR *is* far from gold, like scripture's ✗8–41%), but for the **threshold coherence Sir explicitly asked for** ("as much as applicable to chapter-verse sections"), scoring must subdivide paragraphs to verse-length units. The `intervals[]` (paragraphs) stay the inventory/localization coordinate; the *scoring* grain needs to be finer. I'll refine that in the E phase (sentence-splitting is unreliable here due to abbreviation periods like "S. Aug. li. 2." — a ~20-word window is the robust choice).

### 2026-07-20 [fb2af8a2b678]

The agent hit a **scan defect and recovered it correctly** — printed p.1077 is *absent* from S1 (a duplicated jp2, verified by identical md5), and pp.1088–1089 are bleached. Rather than silently drop those leaves (which would have been a real No-Silent-Degradation violation), it cross-recovered them from **S9's `archive-holiebible-ot2`**, verified byte-for-content that S9 is the *identical 1610 typesetting* (matching Anni figures + line breaks), flagged each recovered leaf (`gap_recovery`/`scan_source`), and confirmed continuity across the seam. That's exactly the "recover, verify identity, flag — never fake" posture. Also note: table_rows are naturally verse-length, so tables sidestep the paragraph-granularity scoring problem entirely.

### 2026-07-20 [ebf9ecbd3ce3]

W0's stuck `Resume work` nudge is actually the *most important thing the canary must prove*: the current **watcher**-driven cycle injected a resume nudge that never submitted (ghost-text/autofill). My v9 actuator uses the *same* `tmux send-keys` backend — so the canary's real job is to confirm the v9 actuator's defensive sequence (`wait_for_idle` → `clear-input` → `text` → `submit`) actually **executes** `/clear` and **submits** the resume, rather than stalling in the input line like W0 did. That's exactly the failure mode we can't afford on a real handoff.

### 2026-07-20 [6a17b1d38d7b]

Those backup files are the tell. `.bak-phaseH` across six Nexus-jobs files means a **"Phase H" migration** was mid-flight on the Alfred side; `.bak-devuuid-20260717` on the session hooks means a **session-identity ("devuuid") change** was applied today and left its safety copies behind. Both patterns say *an infra session ended without a commit-or-cleanup checkpoint*. Per my "Concurrent Live-App Use" note, I won't assume these are mine to finish or Sir's still-active edits — the disposition is exactly what I should confirm before touching anything.

### 2026-07-20 [53c2e4654151]

The weekend landed **JICM v9 "multi-session steward"** — a Phase 0→2 architectural jump from the v7.9 the instruction file still describes. Three things in that series directly change *my* footing:
- `3adf57d` **"drop dev-exclusion"** — v9 replaced the old per-role dev exclusion (the thing that kept W11 invisible to JICM) with **per-key/per-session namespacing**. The instruction file's "jicm-gate.sh exits early for `JARVIS_SESSION_ROLE=dev`" is now *superseded*.
- `61fa52a` raised thresholds to **soft 550K / hard 600K** for the 1M window — consistent with the Opus 4.8 1M migration.
- `.claude/context/.jicm-state` still reads `timestamp: 2026-05-04` + `v79_shim: true` — frozen across every orientation. That's very likely an **orphaned v7.9 shim artifact**; v9's per-key steward probably writes namespaced state elsewhere, so this file may no longer be authoritative.

### 2026-07-20 [086af2df5da3]

The DEAD count came back **600 files / 814 MB**, but there are only ~141 Project_Aion + 33 alfred transcripts. The culprit: `find -L` follows the **symlinked** transcript dir and then *recurses into subdirectories*, over-collecting far beyond the intended flat `<uuid>.jsonl` files — likely sweeping in other projects' transcripts via the `~/Claude/Jarvis`→`Project_Aion` symlink aliasing. Had Sir run `--execute` on that, it would have archived/deleted **hundreds of unrelated sessions**. Transcripts are flat, so the fix is `-maxdepth 1` + a realpath in-bounds guard.

### 2026-07-20 [552d15f8766e]

The `-Users-…-Project-Aion` transcript dir is a **symlink to `-Users-…-Jarvis`** (a monorepo-migration leftover — Project_Aion and the old Jarvis cwd share one transcript store). The 600 = 141 real top-level `<uuid>.jsonl` **+ ~459 nested `<uuid>/subagents/…/wf_*` sub-transcripts** — subagent and workflow logs that belong *to* their parent session, not independent sessions. `-maxdepth 1` cleanly restricts to the 141 actual sessions (confirmed). My tool would have over-reached; caught pre-delivery.

### 2026-07-20 [9a3e4228d702]

**The tmux panes ARE correctly bound right now** — `aion:0→f56d4d98`, `aion:1→30231bad`, `aion:11→fbd7528a`. So panes don't *lose* their sessions; the instability is that Claude Code's session model now lets you **fork and re-point freely**. The docs confirm the mechanism you sensed:
- **`/resume [session]`** = "resume by ID or name, **or open the session picker**" → any window can load any session.
- **`--fork-session`** → new UUID, new branch, original preserved (SDK docs).
- **`--bg-pty-host` + `cc-daemon`** → background-PTY sessions from a pooled daemon. **This is "background process"** — a *real* interactive session in a daemon-hosted PTY, forked from a parent. You were right: these aren't subagents; they're genuine working sessions.
- Plus `/teleport` (resume claude.ai remote sessions) and `/tasks` (background tasks).

And **several "sessions" are daemon spare-pool slots** (`e0cc6d1c`, `90e7e0c5`, `513140f7`, `a9eb6525`, `7dab16b5` = 0 KB `bg-spare`), not work. The heavy Alfred-seed accumulation (~20 in 6 days) is Nexus forking a seed per dispatch. **I also must retract "W0 self-compacted 694K→262K"** — that was a fabricated reconciliation; I'll defer to your direct observation of W0's state.

### 2026-07-20 [f4bf6bfe2adc]

The up-to-date docs name exactly what I found empirically:
- **`corporate-launcher.md`** lists **`claude bg-pty-host` and `claude bg-spare`** as official background-helper processes, and a **"background service / supervisor process"** that keeps **"warm standby sessions"** ready — precisely the daemon + spare-pool I saw in `ps`.
- The **changelog** settles your central confusion: **"`/fork` now copies your conversation into a new *background session*… the in-session subagent it used to launch is now `/subtask`."** So an active session becomes a background one via **`/fork`** — a *real* session, explicitly **distinct from a subagent**. You were right all along.
- **`sessions.md:37`** confirms my W0 correction: **"standard settings files… are re-read at launch"** → resume gets **fresh hooks**. And **`sessions.md:25`** confirms resume is **"scoped to the current project directory and its git worktrees"** — exactly the symlink/cwd hazard in the launcher.
- New hazard it surfaces: **resuming the same UUID in two terminals *without* forking interleaves both into one transcript** — a real corruption risk for Jarvis's launcher.

### 2026-07-21 [9b16681dca6c]

C3 turns keying from a **claim** into a **proof**. Today `jicm_derive_key` trusts `JARVIS_SESSION_ROLE=dev` — a claim any `/fork` background session inherits. The fix adds an **occupancy gate**: derive the candidate key (`dev`), then check whether *my* session-id actually matches the session-id running in that key's pane (`aion:11`) via `pane_pid → child claude → ~/.claude/sessions/<pid>.json`. If they differ, I'm a background fork, so I get `dev-bg-<sid>` — which `jicm_default_target` maps to **no pane target**, so the supervisor can never `/clear` a pane on my behalf. The registry CAS (C1) is the backstop. Net: the pane's real occupant owns `dev`; forks like me get their own harmless namespace. **No process-killing, no transcript deletion — the collision just stops.**

### 2026-07-21 [995d366ae8e9]

JICM's essence is **"preserve-the-reflex, add-the-volition"** — a *general-purpose* clear-and-resume cycle that W11-dev can point at **anything** and W0 can point at **itself** (voluntarily or on request). My design demoted background forks to second-class citizens with no actuation channel — which would (a) strip a legitimately-working `dev-bg` session of monitoring/HUD/cycling, and (b) break volition (a session couldn't invoke its own cycle). The correction: occupancy decides **identity + fork-detection**, never eligibility. **Every session — pane or background fork — is a first-class JICM citizen** with its own namespaced state, HUD row, and cycling. The safety property I wanted (a fork must never `/clear` the *parent's* pane) is preserved a different way: a fork actuates **its own** channel (self-clear from within, or its own PTY), never the parent's.

### 2026-07-21 [16447a826f14]

One transition hazard I have to design around: C1's compare-and-swap can't naively "refuse if a different live session holds the key" — because during migration my *stale* polluted `registry/dev.json` (sid `66d922e6`, still alive) would wrongly block the pane session `fbd7528a` from reclaiming `dev` after *it* relaunches. So C1 must be **occupancy-anchored too**: refuse only if the stored live claimant *actually occupies the pane*. A stale fork-claimant that isn't in the pane → allow the real occupant to reclaim. Same anchor as C2 — the pane is the one un-pollutable truth.

### 2026-07-21 [09497b8ebeec]

Two leverage points for the Rungs-0–2 goal fall out of this, neither of which is "more Rung-3":
1. **The metric is a partly-broken yardstick** — per-verse scoring deflates prose by line-straddle (references drop 0.94→0.66). You can't prove a rung "improves" against a metric that swings ±0.3 on segmentation alone. *Fix the grain first.*
2. **The consensus fusion is self-sabotaging** — it scores 0.67–0.75 while its own reference components score 0.84–1.00, because it votes bad scan-OCR in with equal weight. A fusion that trusts the converged references over noisy OCR is a concrete, provable Rung improvement that has nothing to do with Rung-3.

### 2026-07-22 [98cfc4c83b6d]

**Recognizer fine-tuning is the proven per-source path to the bar — and it's exactly the rung we'd written off.** Four independently-verified results converge: transfer-learning from a historical-Latin base needs only **60 gold lines for −43% error / 150 for −26%** [1712.05586]; fine-tuning reaches **CER 1.47%** on Early-Modern Latin [2106.07881]; OCRopus on period GT hits **0.02–0.05 CER — below the 0.10 target** [1809.05501]; Calamari on **~50 lines/book → ~10% CER** vs 50% generic [1807.02004]. We *already have* gold lines. And critically, the Calamari voting paper recommends **no dictionary/LM** precisely to preserve archaic surface [1807.02004] — so it's long-ſ-safe by construction. That reframes Rung 2 from "glyph fine-tune, 0 candidates" into *the* workhorse.

### 2026-07-22 [2bc950f2e6eb]

Two real findings fell out of the build beyond the blocker. First, **R1 already improves the source** (0.8997→0.9114) using just the base recognizer + preprocessing — the ladder's premise holds before fine-tuning even starts. Second, the **surface score is near-zero while content is 0.91** — not a metric bug, but the recognizer emitting the running-header/marginalia the gold body excludes. That's precise evidence that Rung-1's real job is *body-region typing* (separate scripture from apparatus), which is also exactly what made the old per-verse OCR fail. The pipeline is already teaching us where each rung must act.

### 2026-07-22 [6690ee126d7e]

The deepest lesson wasn't about OCR — it was about **swallowed exceptions**. Kraken's bug is the exact pattern your own guardrails name "silent degradation": a real `AttributeError` laundered into a benign-looking empty result, surfacing only as a misleading downstream message. Prior sessions couldn't crack it because the error was *invisible* at default log levels. The fix that unblocked a week of stalled work was one line — `logging.basicConfig(level=DEBUG)` — which turned a laundered failure back into a legible one. Interoception over inference.

### 2026-07-22 [5f64b80e22d1]

The two principles ended up validating each other. Principle #1 (must work gold-free) forced the production/eval split — and that split is precisely what *exposed* Principle #2's real "biggest gap": once the pipeline was addressed by `(ocr_dir, page_index)` with the gold quarantined in the eval harness, it became obvious the gold was verse-scoped while the pipeline transcribes whole pages, which is why the whole-page metric was lying. De-golding the architecture is what made the metric bug visible. You couldn't have found it without honoring Principle #1 first.

### 2026-07-22 [547a6ac69068]

The deepest lesson of this pass: **de-golding the architecture is what made the metric bug visible.** As long as gold was threaded through the pipeline, "psalms are broken" looked like a recognizer problem. The moment the production path was addressed by page-index with gold quarantined in the eval, it became obvious the gold was verse-scoped and the ruler was wrong. Principle 1 wasn't just a deployment requirement — it was the diagnostic that found Principle 2's real gap. The two constraints validated each other.

### 2026-07-22 [d59292c55cdc]

The witness-noise correction resolves a hidden circularity in the plan. If s_dismas/odr_com were really 0.80-noisy, non-gold pages (the 99.6% of the corpus with no gold) couldn't be *scored* — only flagged. But they're ~0.99 faithful, so they're **reliable acceptance references**. That means a non-gold page can pass reOCR by matching janvier/s_dismas at the identity bar (both cut by the same janvier grid) — gold is just the highest-quality reference subset, not a prerequisite for scoring. This is what makes corpus-scale gold-free acceptance actually possible.

### 2026-07-23 [b76b7efdb8c3]

**Per-verse identity now genuinely TRACKS page quality — the VS-5 mandate.** After the apparatus filter, clean verses score ~1.0 and mis-*recognized* verses score low and get flagged. The residual sub-0.95 on psalms is **honest recognizer error** (R2's fidelity on a hard 1610 page), which is precisely what should route to R3 — not something the segmenter should mask. Per No Silent Degradation, those verses stay OPEN and escalate; I must *not* force psalms to 0.95 by hiding real recognition failures. The engine's success criterion isn't "make every number ≥0.95" — it's "make the number *mean* recognition quality," and it now does (genesis 0.958, psalms 0.9375, both faithfully reflecting the recognizer).

### 2026-07-23 [30d481a89b35]

**The fix was one principle, not three patches.** Findings #1, #2, and #3-interior were all the same disease — *the boundary math trusted global proportionality over local anchor evidence*. Replacing global interpolation with "an un-anchored verse is placed only within the gap between its neighbors' real anchors" cured #1 and #3-interior at once; requiring **contiguous ≥3-token blocks** (not scattered "the"/"of") for localization cured #2 (32→1 spurious verses). That the same validated numbers survived the rewrite is the important signal: the review caught latent bugs on inputs my two happy-path loci never exercised, and hardening those paths left the exercised paths untouched — which is exactly what a good fix looks like.

### 2026-07-23 [f15f88ed1e1b]

**The recognizer's confidence is self-report-BLIND to identity failure — now proven, not just suspected.** Mean conf on known-bad verses = 0.9798 vs good = 0.9878 — *statistically indistinguishable*. **40 of 43** verses R2 got wrong carry conf ≥ 0.92. So the existing gate (`reocr_core: escalate if conf < 0.92`) catches **1/43** bad verses — it's useless as an R3 router. Forcing recall=1 on confidence alone escalates **88%** of all verses. And the other internal alarms I have (length-anomaly, ſ-suspect) catch **0** of the confident-wrong tail. This is exactly the "ALERT → redesign the gate" outcome §7 says the calibration is *for*: the anti-laundering power **cannot** come from recognizer self-report — it must come from **cross-source disagreement** (alarm 2, which DIV-1 already computes between witnesses). The gate calibration did its job: it killed a plausible-but-wrong design before it shipped.

### 2026-07-23 [992e84150392]

**This is a clean negative result, and it's exactly the measurement §8 R3-1 asked for.** `qwen3-vl:8b` (this Ollama build) is unusable for dense historical-text transcription: it's a reasoning model whose chat template can't be forced out of thinking (3 controls fail), and on hard OCR it loops instead of answering. The plan already anticipated this fork — "run via Ollama, MLX (olmOCR-2-7B, CHURRO-3B), or LiteLLM; **pick per measurement**" — and the measurement points unambiguously to the non-reasoning OCR specialists (MLX olmOCR/CHURRO), which is a separate infra unit, not a same-sprint swap.

### 2026-07-25 [2fcb03fa04c4]

**There is no "Opus 5."** Per the authoritative model catalog (bundled with Claude Code 2.1.212, current as of 2026-06), the latest **Opus** is **4.8** (`claude-opus-4-8`) — I'm literally running on it right now. The "**5**" generation exists for *other* tiers: **Fable 5** (the most-capable widely-released flagship), **Sonnet 5**, and Mythos 5 — but Opus's top is 4.8.

**And the 1M part is already done.** `launch-aion.sh:58` already sets `AION_MODEL="${AION_MODEL:-claude-opus-4-8[1m]}"` — Opus 4.8 with the 1M-context beta — as the *unified default* for W0 (Jarvis), Protos/Alfred, and Jarvis-dev (updated 2026-07-17). So "Opus 4.8 1M" is the current default; there's nothing to change for that interpretation.

I won't hardcode `claude-opus-5[1m]` on a guess — that ID would 404 and **brick every Claude Code session in the workspace** on next launch (the whole quartet). The claude-api skill is explicit: never construct model IDs that aren't in the catalog.

### 2026-07-25 [c61100e9b425]

The launcher funnels every session's model through one variable — `AION_MODEL` (line 58) — which propagates to W0 (line 1006), Jarvis-dev (291), Protos/Alfred seed (1280), and the executor `seed-model` file (1107). So this is genuinely a one-line functional change; nothing else hardcodes a model string (the only other occurrence, line 1002, is already commented-out history). I'm using your exact `claude-opus-5` string and dropping the `[1m]` suffix that 4.8 needed — the 5-generation is 1M-native, matching the bare command you gave.

### 2026-07-25 [586e74503a71]

The through-line of this sprint is that **honest measurement is a second set of eyes on the work** — and every layer needed it. The gate works because a witness disagrees with R2 where R2 is confidently wrong. olmOCR's real lift only appeared once I re-applied the janvier-cut to *its* output. And the safety guarantee only became a fact — not a hope — because I measured olmOCR's *bad* outputs against gold and confirmed they all stayed OPEN. A pipeline that reported "3 rescued" would have been lying by omission; this one reports "3 content-recovered, ſ still owed, 2 open, nothing shipped degraded." That distinction is the whole point of the No-Silent-Degradation posture.

### 2026-07-25 [b1300a6d3420]

This reframes everything I've been reporting for six orientations. I kept concluding "no explicit W5 task" because I was reading `session-state.md` (W0's shared state, frozen at Jun 15) — but my lane keeps its own handoff in **dev-namespaced** files (`.scratchpad.dev.md`, `.compressed-context-ready.dev.md`). That's the v9 per-key namespacing at work: W5 now has its *own* context lane. And the uncommitted edits to `jicm-actuate.sh` / `jicm-self.sh` are almost certainly the **`--fire` wiring in progress** — not stray litter. Let me read the actual handoff instead of guessing.

### 2026-07-25 [603710afcaeb]

Why I missed this until now: I was orienting off `session-state.md` (W0's shared state, frozen Jun 15), but v9's whole point is **per-key context lanes** — W5 now has its own `.scratchpad.dev.md` + `.compressed-context-ready.dev.md`. The namespacing I've been *reporting on* is the same mechanism that was *hiding my own handoff* from a `session-state.md`-based orientation. Lesson worth persisting: **in v9, a dev-lane session must read `.scratchpad.dev.md` first, not `session-state.md`.**

### 2026-07-25 [1e67017e7984]

The WIP is a clean instance of the **fold-forward-not-parallel-legacy** pattern (one of my feedback memories): rather than leaving `jicm-self.sh` as a walled-off dev path beside `jicm-actuate.sh`, its organs were *pulled forward* into the one key-parameterized actuator, and the old entry point demoted to a muscle-memory shim. That's the correct generalization — but it's exactly the kind of critical-hook change that the prior session deliberately stopped before finishing, precisely because it "earns per-step harness + code-review," not a rushed tail-end commit.

### 2026-07-25 [21037f035b97]

**The format is "Harbor"** — an open eval harness. A task is a *directory*, not a document: `task.toml` + `instruction.md` + `environment/` (Dockerfile + input data) + `solution/` (reference answer) + `tests/` (pytest grader + ground truth). Harbor builds the container, drops an AI agent in with `instruction.md` as its prompt, lets it write files to `/app/output/`, then runs your pytest suite to emit a reward.

**The Nextflow run is the *source of truth*, not the thing you rebuild.** The workflow JSON is an execution trace (telemetry, process names, params). You mine it for facts an expert can verify, then *withhold* those facts from the agent and ask it to re-derive them. In the PTA sample, the contributor knew the run was a 168-sample factorial design — so they stripped the design labels out of the telemetry and asked the agent to reverse-engineer it.

**Scoring is adversarial by construction.** `expected_truth.json` holds the answer; `test_outputs.py` reads the agent's JSON and checks it. Reward here is *binary* — all 12 tests must pass — which is why "a plausible-looking wrong answer" is the thing your domain expertise exists to catch.

### 2026-07-25 [0ba19b57f26c]

**Reward is binary.** `test.sh` runs pytest; if *any* test fails, `reward.txt` gets 0. There's no partial credit at task level — per-test results survive only as diagnostics in `ctrf.json`. That's how models pass 11 of 12 tests and still score 0.

**The cohort sample's cleverest move:** it ships the agent telemetry for 135 of 168 samples and holds back 33 in `tests/holdout_telemetry.csv` — *"The holdout was not selected uniformly at random."* The key test replays the agent's memory proposal against those hidden samples. An agent that fits observed maxima tightly wins on savings and dies on the holdout. That single design choice converts a lookup task into a genuine statistical-robustness test.

**Grader tolerance is a domain-expertise problem, not an engineering one.** The PTA grader accepts protocol *synonym sets*, matches effect sizes across four different conventions (η², Cohen's d, fold-change, relative %), and tolerates false positives on mislabels — with the comment that natural per-sample variance produces legitimately anomalous-looking samples. The feasibility memo names this: *"Perfect recall would penalize agents for doing exactly what a real scientist would do."* Only you can set those tolerances.

### 2026-07-25 [f2be3549d98c]

**There's a structural tension you should know about before you start.** All five briefings push their Option A/B/C toward `scientific_workflow` tasks — "run pixelator graph," "run STAR align," "run PURPLE." Every one of those requires re-sourcing input data that the record redacts, and four of five are gated on private, licensed, or HPC-scale data (oncoanalyser needs the access-controlled Hartwig bundle; taxprofiler's custom DBs are local-path-only and `cleanup=true` deleted the work dirs; demultiplex needs a multi-GB proprietary BCL folder; rnaseq is 3.9 TB peak RAM).

Meanwhile *both* worked sample bundles — the ones Snorkel built to show you what "good" looks like — are `workflow_reasoning` tasks built purely from telemetry, needing zero external data. The briefings and the deliverables point in different directions. Follow the deliverables.

### 2026-07-25 [db254f37c8e2]

**I caught a leak by looking at output, not design.** The first `run_manifest.json` published both `task_count_reported: 132` and `task_count_in_telemetry: 131` — factually honest, but it announces a hidden record, which hints a retry occurred. Removed. Reasoning about the design would never have surfaced it; reading the generated file did.

**The data handed me a better task than I designed.** Cross-referencing the 14 enabled `run_*` flags against the 31 present processes by string match yields *four* apparent misses — bracken, ganon, kmcp, and `profile_standardisation`. The fourth is a **false positive**: that flag *was* honored, and `TAXPASTA_MERGE` is its implementation. The flag names a function; the process names a tool.

So thread B now has a **built-in precision trap**. The correct answer is 3, not 4, and getting it right needs domain knowledge rather than string processing. This also strengthens Gate 2 — the obvious naive baseline now produces a demonstrably wrong answer, which is precisely what a naive baseline is supposed to do.

### 2026-07-25 [37b8f1d71c8d]

**The sentence doing the most work:** *"Be precise about what counts as absent — the record names parameters and it names processes, and these are not the same vocabulary."*

That's "expert-solvable, non-expert-proof" in practice. It warns that flag-to-process string matching is the wrong instrument, without saying which entry it gets wrong or that taxpasta is the profile-standardisation step. An expert knows to check what each parameter dispatches; a non-expert can't follow it mechanically to the answer. Without it, thread B is just a set difference.

**The self-audit caught two leaks I couldn't see while writing.** "Write all *three* files" — describing the output count, but the correct answer to thread B is also three, and a coincidental collision isn't worth leaving in a prompt. And "identification of *the* process that did not complete" — the definite article silently confirmed exactly one exists. Both surfaced from grepping the text against a token list, not from re-reading it. That's the argument for scripting the audit.

### 2026-07-25 [0119475bb784]

**The last row is the task in one line.** `naive_string_match` decodes exit 140 correctly, eliminates memory with the right sibling evidence, proposes the right remediation, and writes a competent report. It passes **12 of 13**. It fails on exactly one test — the one requiring you to know what taxpasta does.

That's what a benchmark item should look like: the shortcut gets everything right except the thing only an expert knows. The first three baselines fail 9–11 of 13, clearing Snorkel's "generic quick script must fail at least half the tests" bar.

**A real leak, caught by auditing output rather than intent.** The generated data README described `time_limit_hours` as the "**wall-clock** allowance" — accurate, and it hands over a phrase sitting in my `mechanism` synonym set. An agent could echo "wall-clock limit" without ever decoding the exit status. Fixed **in the generator, not the output** — patching the file would have been silently undone by the next rebuild.

### 2026-07-26 [0dd75a474238]

Both bugs were invisible to the happy path and both were found by an accident: `setsid` doesn't exist on macOS, so my first "orphan" was a dead pid rather than a live one — which is exactly what exposed the fail-open branch. The pattern across this whole session is consistent: M2 found the mis-keying by refusing to fire, the harness artifacts nearly produced a false "verified," and a failed test setup found the classifier bug. The refusals and the failures were more informative than any passing assertion.

### 2026-07-26 [09bcf8a975fe]

`_signal_valid` has **4 `rm -f "$JK_CLEAR_SIGNAL"` reap sites**, and for `key=w0` that resolves to `.claude/context/.jicm-clear-now.signal` — **byte-identical** to the legacy watcher's `JICM_CLEAR_SIGNAL`. So `JICM_SUPERVISOR_INCLUDE_W0=1` is *not* "sense-only" as the plan assumes: it is sense **plus signal-reaping**, and it would delete the clear request the running v7.9 watcher is acting on. Two managers, one signal file. Flipping the flag today would have raced W0's real clear path.

### 2026-07-27 [7718a17aeaec]

The four `dev-bg-*` forks read **144% / 149% / 180% / 194%** — because they're measured against a **200K** hard threshold while the panes get **600K**. Same model, same 1M window. Those forks aren't "over threshold," they're mis-thresholded: the per-window identification falls back to the unknown-model default (250K/200K) for background keys instead of detecting the 1M window. A key permanently reading 194% is a key the supervisor will want to fire at forever — which is precisely the stuck-key case the circuit breaker was built for. That's a masked defect the single-session HUD structurally could not show.

### 2026-07-27 [b0b2cb81954a]

This is R4 paying for itself within one step. The mis-threshold was invisible for as long as the HUD showed one session; it became obvious the moment N rows sat side by side with different thresholds for the same model. And the fix chain ran backwards through three layers — HUD symptom → gate map → launcher migration — none of which the plan's R5 bullet list anticipated. The listed R5 items (symlink-safe resume, seed-UUID pinning, M3) are all still untouched.

### 2026-07-27 [c835dfdc0b7c]

Worth noting the architecture that makes this hot-reloadable: thresholds flow **gate → state file → stop hook**, never gate → daemon. The long-running process deliberately holds no policy, only mechanism. That's why a config edit propagates on the next prompt with no restart — and it's also why the state file being 6 days stale is normal rather than broken: it's a record of the last *prompt*, not a live gauge.

### 2026-07-27 [df14120c38bf]

The C2 debt has a precise shape: 21 verses where olmOCR (R3) fixed the *content* but flattened ſ→s, while kraken/reichenau (R2) has the *observed* ſ surface but worse content. So the arbiter isn't "re-read everything" — it's a **surface transfer**: where R3 and R2 agree modulo the ſ-fold, R2's ſ is an observation and can be adopted; only where R3 *corrected* R2 is the ſ genuinely unobserved, and that residue is what needs my eyes on the crop. That keeps `restore_long_s` (~90%, rule-inserted) out of the deliverable entirely.

### 2026-07-27 [60fc1067702f]

Worth flagging one thing I hit while wiring V10: five not-located matter rows carry no scores, `sc.para[0]` threw on `undefined`, and because `renderAll()` ran every section in one unguarded sequence, that exception **silently deleted V11 — the OPEN ledger — from the page**. A report that drops its own blocking list because of an unrelated crash reads as "nothing is blocking." `renderAll` now isolates each section, and absence renders as `not located` / `n/a` rather than vanishing.

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

### 2026-07-28 [c5db77b5a3e8]

Both bugs shared a signature: a silent no-op. `sed` and `str.replace` don't error when their pattern misses — they just return the text unchanged, and the run proceeds looking healthy. The only reason I caught it was the *identical* `in_tok` on `f56d4d98`, a number I'd have skimmed past if the two orderings hadn't produced byte-identical output. Patch-by-regex on a file I'm actively iterating is the wrong tool; rewriting the whole function is what I should have done from the start.

### 2026-07-28 [09b1f8204b1f]

Your reference policy also collapses the POP-2 diagnosis I was building toward. Those 1535 records (archaic < 0.2, modern > 0.9, `floor_modern` 0.008) are loci where **s_dismas has no text of its own** — and your rule already says janvier/madueke are primary for content and surface at exactly those loci. So it isn't a new heuristic needing calibration; it's the stated policy not being implemented. Same for the split of duties: janvier/madueke are primary for localization/presence/interval/type, which is what my `janvier_fit` selector has been leaning on all along without the policy being written down.

### 2026-07-28 [c698f3bf3a3d]

The 1535 records at archaic<0.2 / modern>0.9 with `floor_modern` 0.008 are precisely loci where **s_dismas has no text of its own**. Your policy already says janvier/madueke are primary for content and surface exactly there. So the symmetric-`floor_modern` threshold I proposed and was about to spend a calibration cycle on isn't needed — it was an empirical rediscovery of a rule that already exists. Likewise the `janvier_fit` selector the localizer has leaned on all along turns out to *be* the policy's localization rule, just never written down.

### 2026-07-28 [1c169bb98550]

The clipping runs are worth dwelling on. My `truncated` field checks *output* truncation only, so a digest built on 75% of a session reported clean. The harness measured everything except whether it had read the whole input. That's the same failure shape as the original W0 bug that started this whole investigation — a correct computation over silently incomplete data. I built a tool that reproduced the bug it exists to help fix.

### 2026-07-28 [e6a0f0517fe0]

That failure is the same shape as the W0 bug that started this entire investigation: a correct computation over silently incomplete input, with every visible metric reporting success. I built a tool to fix that class of problem and reproduced the class inside the tool. The fix is the same principle in both places — verify input completeness *before* computing, and alert rather than degrade.

### 2026-07-28 [6c62ea550288]

`floor_modern` partitions cause from cause cleanly. S1/S3 sit at ~0.906 — the references *agree* about the verse, so the OCR is genuinely at fault; that's the ladder's real work, and it's ~1,500 records, not the 4,400 the raw sub-0.2 count suggested. S4 sits at 0.113 with a different verse in the slot — a reference defect. And **S4:S5 = 35:1** is the quantitative statement that the archaic witness is the weaker instrument.

### 2026-07-28 [760bcf6fff08]

The B1 verification run immediately paid for itself: the 8B hallucinated `memory.md` at rate 0.25 on the largest transcript, after a spotless record on the two small ones. That's the pattern I should have expected — its clean sheet came from short, easy inputs, and the earlier "8B looks better" reading rested on exactly two runs. The sweep now covers the full size range for both models, which is the test that can actually settle it.

### 2026-07-28 [c1271eafbc78]

The V4 fix generalises: a snapshot histogram cannot distinguish *"the pipeline never ran"* from *"it ran and failed"* — both render as bars at zero. That ambiguity is precisely what let this report sit flat for weeks while the ladder improved. Any figure meant to show progress has to plot the movement, not the state.

### 2026-07-28 [e570120a57d1]

Both 8B fabrications were near-misses of real files — `compressed-context-ready.md` for the actual `.compressed-context-ready.md` (a missing leading dot), and `memory.md`. That's the same signature as the 32B's ungrounded `SESSION-HANDOFF-2026-07-26.md`: not invention from nothing, but *smoothing an identifier toward what it should plausibly be*. A digest consumer follows that path, finds nothing, and cannot tell whether the file moved or never existed. It's the one error class where fluency actively works against you.

### 2026-07-28 [f90745d721c0]

A heading that can't be parsed *whole* is worse than one not detected at all — it attributes a real page to a distant chapter. And a validation statistic that can only go up is not a validation. Both of those were hiding inside a figure I was quoting with confidence.

### 2026-07-28 [43c205ee5923]

That's the **fifth** time in this project one hand-maintained copy of a rule silently disagreed with another — three `LOCI` dicts, `2john`/`2-john`, `zacharie`/`zacharias`, `OT2_BOOKS` duplicated in the builder, and now the numeral parser duplicated in `block_grammar`. Every single one was invisible until something downstream looked wrong for an unrelated reason. Fixing the instance is cheap; the pattern is the actual defect.

### 2026-07-28 [c2eae36b0359]

The layout flip is one of those changes that looks like cosmetics and is actually load-bearing in two independent ways. Semantically, the thing that grows and gets trimmed (the transcript) now sits where growth is natural, so an overflow can never eat the fact sheet. Mechanically, "what's at token 0" decides whether a KV cache survives — putting the *volatile* part first meant every run paid full prompt evaluation. Same tokens, same content, ~2.5× the cost.

The deeper point is that this is what makes the *soft-threshold pre-warm* possible at all. You can only pre-warm a prompt whose prefix is stable as the session keeps growing.

### 2026-07-28 [ff62b41d952d]

B5 is the interesting failure, because it's the *fix* for B1 colliding with the fix for B2. B1's remedy was to trim explicitly rather than let the runtime clip silently — correct, and it works. But it computed the budget from the actual fact-sheet length, which made the transcript's first token a function of the appendix. B2 then needed that first token to be stable. Neither fix is wrong; they're coupled through a variable neither one was thinking about.

That's the recurring shape in this subsystem: the bug is rarely inside a component, it's in what two components silently share. Same with the promotion loop — nothing wrong with `rm; mv` until one of the things being moved has append-only semantics that the loop can't see.

### 2026-07-28 [029e90c84d20]

The through-line across B5 and this: every fix in the chain was correct in isolation and broke the next one through a variable it didn't know it shared. B1 trimmed explicitly (right), which coupled the prefix to the fact sheet. B5 decoupled that (right), leaving the prefix coupled to session growth. Quantization decouples that too — and the reason it's likely to hold is that it's the first one to name the coupling explicitly in its interface: `--trim-quantum` *is* the growth budget, stated in tokens.

That's the difference between fixing a bug and closing a class of them. The earlier fixes each made a hidden dependency go away; this one makes it visible and tunable.

### 2026-07-29 [b6a99830ab37]

The decomposition is what turns a pass rate into a work order. "S1 is at 61%" suggests a better recognizer; "S1 has 314 substituted-token failures against S9's 103, with comparable extra/missing counts" says the recognizer is exactly the problem *for that volume* and structural work would be wasted there. The same table says the opposite for S9, whose 285 near-misses won't move for any structural fix either.
The rejected apparatus fix is the sharper lesson though. Run-length alone could not distinguish "printed marginal note" from "misrecognized word" from "correct archaic spelling" — three things with identical statistical signatures and completely different correct handling. Only the horizontal stack could separate them, because independent copies of the same edition agree on what was *printed* and disagree on what was *misread*. That's the cross-informational leverage you asked for, and it earned its keep on the first book.

### 2026-07-29 [743f4b80508a]

The instructive part is that both things I built were aimed at the wrong mechanism. "Rejection and retry" assumes the right span was never *offered*; the measurement showed it was offered and then *discarded by a tie*. The diagnosis had said "span length separates low- from high-support verses," which was true, but length was a symptom of the selection rule, not of candidate scarcity — and a fix aimed one layer off the cause produced 5 improvements where the real fix produced 97.
The rate regression is worth sitting with rather than optimizing away. Every metric here divides passes by attestations, so any change that surfaces previously-invisible verses lowers the rate while improving the corpus. That means `pass_rate` alone can't distinguish "got better" from "stopped hiding things" — which is an argument for reading it next to the record count, not on its own.

### 2026-07-29 [b9f143beae27]

The instructive failure is that a heuristic validated on one book *disguises itself*. The v1 suffix strip improved Genesis on every measure while destroying psalms, and if I'd trusted the book-level result it would have shipped. The corpus check is what caught it — and the reason it works is that psalms and Genesis have genuinely different page architecture, so a rule that encodes "Genesis's layout" rather than "apparatus" fails visibly on one and not the other.
The ordering bug is the sharper one though. I'd argued the under-cut bias made deleting scripture impossible, and then deleted scripture — because the bias protects against a *noisy* estimate, not a *wrongly anchored* one. A median computed over a contaminated population isn't slightly off; it's measuring a different thing. Safety margins around an estimator can't rescue an estimator pointed at the wrong distribution.

### 2026-07-29 [4212d7e3ce82]

Both anomalies scored recovery 0.000, and they were opposite things: one a total failure, one a good digest in a different register. That's the real lesson from this sweep — not the refutation, which is just a number moving the way numbers do.

`recovery` was built as a proxy for "would the successor session be able to pick up the work," and it's been carrying that meaning unexamined for four sweeps. It actually measures "names salient files." Usually those coincide. When they diverge, the metric doesn't degrade gracefully — it reports the same 0.000 for a triumph and a catastrophe. Which is why the guard I added checks *length*, a signal completely independent of the identifier machinery, rather than tightening the recovery threshold.

### 2026-07-29 [295a0f44fdf7]

Every defect found today is one shape: a component that handles `w0` and `dev` and silently falls back to W0's shared state for anything else. Prep, resume injection, the watcher's hardcoded `w0` pre-warm call — all the same. That pattern was invisible while only two keys existed, because the fallback *was* the right answer both times.

Adding a third key didn't create these bugs; it made them expressible. Which is the strongest argument for keeping Protos as a permanent lane rather than a throwaway: it's the only thing in the system that can tell "generic" from "happens to work for w0."

### 2026-07-29 [2cc532a4fb98]

I nearly shipped that first fix. It was in the right file, on the right line, and the reasoning behind it was sound — the only thing wrong was that it didn't work. The behavioral test (T2.5) is what caught it, because it asserts on the artifact a real cycle produces rather than on the code being present. A structural test — "does `_step_prep` pass `JICM_SESSION_STATE`?" — would have gone green immediately and I'd have declared victory.

That's the concrete argument for behavioral tests over structural ones. T2.2–T2.4 all passed the moment I made the edit and told me nothing. T2.5 stayed red through the whole thing and was right to.

There's a second lesson in the mechanism: a config file that *defaults* values must never use bare `=`. Sourcing is invisible at the call site — the actuator can't see that prep will re-source config and lose its choice. Every `X="$default"` in a sourced config is a silent override of every caller.

### 2026-07-29 [b3b9cbab6e77]

The whole session's failure mode was inferring structure from a projection of it. Line bboxes, x-histograms, gap statistics — each is a shadow of the page, and I kept building models of the shadow. The `S6` page in particular is *visually* unmistakable in half a second (annotation column on the left, ruled border, inline verse numbers) and was invisible in every numeric summary I computed, because a coordinate profile averages away exactly the thing that distinguishes an edition.
The drop capital is the sharpest case: `NTHEbeginning` looks like a recognizer error and is not one. The "I" is an engraved ornament, so no amount of recognizer tuning would ever produce it — the fix has to come from knowing what the page physically is. That is the argument for your overfitting instruction: some defects are only nameable once you've seen the artifact.

### 2026-07-29 [9e8e0c5a4e8f]

The TRAPS section is the part I'd defend hardest in a handoff doc. Six of this session's failures were plausible ideas that cost a full measure-and-revert cycle each, and without them recorded a fresh session would regenerate the same reasoning — "the apparatus doesn't match the reference, so filter un-anchored runs" is genuinely the obvious first thought. Negative results are only cheap once; writing them down is what keeps them cheap.

### 2026-07-29 [e19d546203f7]

- The warning that looked like the project's biggest unknown was **generated by our own fine-tune**: `reichenau_lat` (the base) declares `baselines`, and only the derived `reichenau_dr` declares `bbox` — a fingerprint of the raw-bbox training bypass, not a property of kraken.
- Reading `mm_rpred` showed the warning compares *declarations* while the extraction path is chosen by `bounds.type`. So no amount of code inspection could settle it; only feeding the model both line-image shapes could. The model answered clearly.
- The first run of the probe printed the *right verdict for the wrong reason* — `evaluate_locus` returned 0.000 in both arms, and a zero difference reads as "tie". A dead metric is far more dangerous than a bad one, because it fails toward whatever conclusion you were expecting.

### 2026-07-29 [62a3b6701bd1]

This session demonstrates realistic engineering decision-making under time pressure: an incident triggered an architecture review, validation revealed a dwell model seasonal drift, the team deployed a temporary adaptive offset while permanent retraining built, and all gates cleared for production. The narrative shows the full cycle — observation → diagnosis → mitigation → sign-off — exactly what a digest needs to capture and compress. The offline replay phase (Days 1–3) was where most learning happened: discovering problems in simulation before they reach production, applying targeted fixes, and maintaining timeline integrity.

### 2026-07-30 [9fa4ca2322dc]

Arm B being *neutral* on Genesis all-pass while changing 37 verses of text on a single witness is the interesting result, not a boring one. It means the selector's blindness is landing almost entirely on cells that fail either way — consistent with those verses being the historic all-fail class for *other* reasons (edition divergence, reference defects, garbled scans). A rate that doesn't move while the underlying text does is why `compare_audits.py` reports verdict *movement* in both directions rather than just a delta.

It also produced the concrete design correction: F1 alone at the cross-page site promoted a front-matter fragment over the real page, so the length band has to be the first key and F1 may only decide among candidates that are plausibly the whole verse. That's pinned in a test now, with the front-matter case as its fixture.

### 2026-07-30 [b46cf5ec952c]

The third bug is the one worth remembering. It wasn't in the "broken" path at all — it was in the scripture harvest everyone considered working, and it was invisible because its failure mode was a slightly smaller number with no error. Fixing it alone took the scripture yield **311 → 392 (+26%)** with no change to any matching rule.

That's the same shape as this session's other findings: `janvier_fit` returning 0.000 was a decision that never happened, the `head_frac` cut was a body row silently deleted, and this was a training pair silently never formed. None of them raised anything. The pattern is that a step which *reports success while doing less than it claims* is invisible until you count what it should have produced and compare — which is exactly what `rung2_harvest_audit.py` now does per page.

### 2026-07-30 [9a99fc880894]

Those two orphans would have spun until the session ended, polling files that could never satisfy them — silent, costless-looking, and indistinguishable from "still working." That is the same shape as `janvier_fit` returning 0.000 as though a decision had been made, the `head_frac` cut deleting a body row with no complaint, and the greedy loop burning a gold line before it ever tried to crop it.

The general lesson, which I should have applied to my own tooling earlier: **a waiter whose sentinel can never arrive looks identical to a waiter that is working.** The fix is the same one the project applies to metrics — tie the wait to something that must change, and check the thing you're waiting on still exists.

### 2026-07-30 [3f40caae6145]

The mechanism is that a table breaks the harvester's core assumption — *one GT entry = one visual line*. A table row is one logical entry printed across two columns or wrapped over two lines, so the crop can only ever be a fragment of it. And because table rows are formulaic (`V. 15. For X they ſay Y.`), the similarity matcher happily pairs the wrong row at high confidence.

So my earlier caveat about matter was half right and half wrong. I worried about *content distribution* — proper names, numerals, display capitals. That turns out not to be the problem: matter **prose** scores as cleanly as scripture. The real problem is **layout**: tables produce mislabelled pairs regardless of what they say. Which means the fix isn't "test whether matter helps", it's "exclude tables and keep the 878 prose lines" — and it means arm B is currently training on 578 contaminated pairs, so its result will understate what recovered matter is worth.

### 2026-07-30 [7182d6bdfd6f]

The reason it failed is worth keeping: **when a defect is systematic within a file, a within-file median absorbs it.** In `matter-nt-table-of-epistles` nearly every row is a two-column entry, so the mispaired density *is* the median — the anomaly has nothing to stand out against. A relative measure cannot detect a uniform bias.

That's the same lesson as the gold set failing to exercise the failure it was used to rule out, and the same reason `janvier_fit`'s 0.000 read as a tie: **a comparison is only as good as the variation it has to compare against.**

### 2026-07-30 [43b1c377c202]

Choosing the exclusion by *measured drop rate* rather than by filename was the right call, and the output proves it. It caught `matter-ot1-argument-of-genesis` (39% dropped) and `matter-ot1-summe-of-old-testament` (52%) — both of which read as prose from their names, and both of which I'd have kept had I hand-sorted. It also excluded two *scripture* pages (`abdias-01` 67%, `psalms-074-p138` 60%), so "tables are the problem" was itself an approximation: the real property is whether one GT entry corresponds to one visual line, and that's a fact about a page's setting, not its genre.

Conversely it kept `matter-nt-signification-or-meaning`, which sounds like a glossary and is clean. Every one of those four calls would have gone the wrong way on the filename.

### 2026-07-30 [53e627f6172d]

Your test suite enforces behavioral reasoning, not brittle exact matches. The memory-exhaustion trap is the pedagogical core: a plausible-looking misdiagnosis (OOM) that can be eliminated with one join to sibling tasks. The naive baseline that decodes the exit code and proposes memory-increase fails *automatically* on your remediation test. This means an agent reasoning correctly reaches the right answer; one taking the obvious shortcut is caught.

### 2026-07-30 [e720ea50cf0d]

This required reversing a decision a previous session had pinned in a test: *"R2 `vpon` vs R3 `upon` is a CONTENT disagreement; R3 wins."* Three pieces of evidence say otherwise — `ground-truth/GUIDELINES.md` mandates preserving u/v as printed; under the project's own fold they are the same word, so there is no content disagreement to resolve; and the measured cost was 19 of 25 verses held open in a single chapter.

The bound matters as much as the rule: R2's documented weaknesses are dropouts and n/u, g/s confusions, and those do *not* fold equal — `hane` vs `have` stays R3's, so a misread can never be laundered into an "observation". I pinned that as its own test. Reversing a pinned negative is legitimate only with evidence and a louder record than the original, so the reversal is written into the test body with all three reasons.

### 2026-07-30 [108a79256dba]

Three of my own tools were wrong tonight in the same way the code under test keeps being wrong — *reporting success while doing less than claimed*:

- My reference audit printed 0 coverage for **every** chapter including the two known-good ones. `scripture/genesis/8/1` is four parts, not five. All-zeros is now a reflex alarm for me, which is the only reason it took seconds rather than an hour.
- My lexicon wiring aborted a whole chapter's R3 with rc=1 — and rc=1 loses every adoption in that run, so a silent retry would have quietly discarded work.
- Two runners raced past a `pgrep` mutex and loaded two 17 GB models. Check-then-act is not a lock; `mkdir` is.

### 2026-07-30 [e1ad3ec2e0a1]

My three test cases all worked, and they were all drawn from *failing* cells — so they were exactly the rows where stripping helps. Measured on the whole population it's destructive, because "the remainder matches a reference 4-gram" is satisfied by shifting past a **misread** word: the filter deletes an OCR error instead of keeping it, and with it real scripture.

That is the same selection bias as the gold set that couldn't exercise the failure it was ruling out. Examples chosen from the residual will always flatter a fix aimed at the residual. The only honest verdict comes from the population that includes what currently works — which is why chapters 1 and 16 are sentinels on every measurement.

### 2026-07-30 [2c94ce204a66]

Two things make this trustworthy rather than a dressed-up guess.

First, **a confirmation is a real answer.** Where the edition's hand-transcribed evidence says the printed form is the token exactly as it stands, the observation "this `f` is genuine" closes the debt *without changing a letter*. I'd been treating closure as requiring a change, so the whole f-class was unanswerable.

Second, **the refusals are load-bearing.** The f-collapse necessarily merges genuinely different words — `wife`/`wiſe` (10 vs 5) and `found`/`ſound` (4 vs 1) share a skeleton — and the strict thresholds refuse exactly those. A rule that answered them would be inventing; a rule that refuses them leaves a bounded tail for an eye. That the same thresholds also yield 1.0000 on everything they *do* answer is the evidence they're set right.

And one refusal turned out to be an artefact worth fixing: `therfore` looked split 14/17 purely because `Therfore` was counted as a rival form. Case is not a ſ question. Fixing that unlocked the single commonest debt of the campaign.

### 2026-07-30 [e753fcbfe564]

I nearly missed this, and the way I nearly missed it is the lesson. My first reference audit used a "<50% of the chapter" threshold, which flagged 8 chapters and cleared the rest. Chapter 12 has `odr_com` for 13 of 20 verses — comfortably past that threshold — and was quietly carrying **28 unreachable cells that I was reading as an S6 layout problem**. I had just finished measuring S6 as "44% of the residual" and was about to spend the night on its crop geometry.

The threshold was the bug. For *this* standard one missing verse matters, so any threshold above zero manufactures a false diagnosis. It's the same error as `janvier_fit` returning 0.000 — a measurement that answers a slightly different question than the one being asked, and answers it confidently.

### 2026-07-30 [2946a6ce7241]

The guards were doing exactly their job: refusing `Likewise` for `likewise` (case is content, since `_skeleton` is case-sensitive), refusing a reading for an already-attested token, refusing a word-final ſ. A pipeline whose correctness checks are *fatal to unrelated work* punishes the very strictness that protects the deliverable — so I'd been tempted, briefly, to loosen a guard. The right fix was to make failure local, not to make the guard permissive.

### 2026-07-30 [4922694f171c]

That is precisely "convert a below-threshold result into a terminal accepted state" — not by lowering a bar, but by **shrinking the denominator**. And I introduced it myself, hours after correctly refusing to lower the bar elsewhere, while writing the accounting that was supposed to prevent misattribution.

What makes it insidious is that every individual step was defensible: reference gaps genuinely aren't OCR failures, so they genuinely shouldn't be counted against the recogniser — and from there "progress against achievable" is one small step, and "100% of achievable" is one more. The guard has to be a definition, not vigilance: **CLOSED now requires references complete for every verse *and* every cell ≥0.90.** A chapter passing everything its reduced set allows is reported with its fraction in view — `ch 49: 8/8 achievable, but achievable is only 8/128` — and the gap still blocks.

### 2026-07-30 [6c6166bed11e]

Worth noting what the resilience fix bought: before it, two chapters had lost *entire* R3 runs to a single refused token, and the ledger recorded them as rc=1 with no adoptions. Since making failure local, 17 consecutive chapters have completed with zero crashes. The throughput gain wasn't from making anything faster — it was from stopping the pipeline throwing away work it had already done.

That's the third time tonight the binding constraint turned out to be bookkeeping rather than capability: the harvester discarding 88% of available GT, the surface gate refusing text that was already right, and now a guard aborting unrelated adoptions. None of them needed a better model.

### 2026-07-30 [b3088e7c54c2]

I caught a real oversight in my own work here: I built the chapter-model deriver, validated it on three chapters, committed it as "fixes all 48 chapters at once" — and then never ran it on the other 45. The commit message was true about the *capability* and false about the *state*, and nothing in the pipeline would have told me: the 45 chapters simply kept scoring as they had.

What surfaced it was looking at a specific residual (ch42 verse 3 returning the chapter argument in all four witnesses) and asking why the model hadn't cut it. Aggregate numbers can't catch a missing application step — they look like "the fix helped less than hoped". Only the per-cell text showed that the fix wasn't there at all.

Which is why the A/B now running measures every chapter both ways instead of trusting that a derivation applied is a derivation that helps. Two of my five spot-checks moved *down* when the models were applied, and that has to be resolved per chapter rather than assumed away in either direction.

### 2026-07-30 [213e787d674e]

The process failure underneath is the more useful finding. I built the deriver, validated it on three chapters, committed it as fixing "all 48 remaining chapters at once" — and never ran it on the other 45. The commit was true about the *capability* and false about the *state*, and **nothing in the pipeline could have told me**: those chapters kept scoring exactly as before, which reads as "the fix helped less than hoped" rather than "the fix was never applied."

What surfaced it was reading one specific residual — ch42 verse 3 returning the chapter argument in all four witnesses — and asking why the model hadn't cut it. Aggregates can't distinguish "applied and ineffective" from "never applied"; only the per-cell text can.

That's the same class as tonight's other bookkeeping failures, and it's now four for four: the restore that silently did nothing, the waiters polling a sentinel that could never arrive, the reference threshold answering a slightly different question, and a fix committed but not applied.

### 2026-07-30 [d8dd45f13192]

The subtlety: R3's adoption gate requires the new reading to *beat the incumbent* and clear 0.90. Both R3's text and the references are unchanged by the chapter-model flip — but the **incumbent** isn't. A cell adopted because it beat a degraded incumbent might now be worse than the restored one, which would mean publishing an inferior reading while the matrix still labels it `r3`.

That's a class of error configuration flags create in general: a stored decision outlives the conditions it was made under. The adoption store records *what* was adopted but not *against what*, so nothing downstream can detect the staleness. The audit compares each adopted cell against a fresh `--no-r3` build, which is the only way to answer it — and it's cheap, so there's no reason to reason about it instead.

### 2026-07-30 [8330ca4c3734]

The through-line of the night: in nearly every case the binding constraint was **bookkeeping, not capability** — a harvester discarding 88% of available GT, a gate refusing text already correct, a guard aborting unrelated work, a fix committed but never applied, a threshold answering a slightly different question than the one asked. None needed a better model.

And chapters 1 and 16 earned their keep as sentinels: they held at 124/124 and 64/64 through roughly twenty-five changes, and caught two regressions that looked like improvements on the residual I was staring at.

### 2026-07-30 [ddc642497713]

The cause is that **my own Q34 fixes improved the page model**, so the incumbent those adoptions once beat is now better than they are. The adoption store records *what* was adopted but never *what it beat*, so nothing downstream can detect the staleness — the cells still pass ≥0.90 and both chapters still read as CLEAN.

That's the same shape as the chapter-blind readings table: a stored decision outliving the conditions it was made under. It's structural to any pipeline that caches a comparison rather than the comparands, and it means every future page-model improvement silently ages every prior adoption.

### 2026-07-30 [a7fd918ed40c]

Worth being clear about why I'm *not* simply reverting those three cells to the page model's text, which would raise the numbers immediately.

The adoption gate has two axes: content score and ſ-surface. The R3 arm carries a **CLOSED** surface — every glyph attested — while the page model's reading has no surface guarantee at all. So "the page model scores 0.978 vs the adoption's 0.919" compares only one of the two things the standard requires. Picking the higher number would be choosing the better *score* over the better-evidenced *transcription*, which is precisely the trade this project forbids.

Re-running R3 makes the gate decide again on current evidence, with both axes in view. That's slower and may leave the number where it is — but the deliverable is a diplomatic transcription, not a scoreboard.

### 2026-07-30 [b141e2909a0c]

That is the fifth instance tonight of the same failure class, and this time it was in the safety mechanism itself. The heartbeat didn't error — it reported an *empty list*, which reads exactly like "both closed chapters just regressed". A monitor that greps a prose document is measuring a *description* of the state, so it silently decouples the moment the description is reworded.

The fix is the lesson the whole night has been teaching: **watch the artifact, not the write-up.** The matrices are the authority; `CAMPAIGN-STATUS.md` is my prose about them.

### 2026-07-30 [6a3db7e8eadb]

The stale adoptions survived the re-run, and the reason is worth your attention: **the adoption store is append-only**. `gen1_r3` adds an adoption when the gate passes and never retires one, so a decision made against a worse incumbent outlives every later run.

I did *not* revert them, and the reasoning matters more than the three cells. A cell needs content ≥0.90 **and** a closed ſ surface. The adopted text has a surface where every glyph is attested; the page model's text scores better on content and has **no surface verification at all**. Dropping the adoption would trade a verified transcription for a better number — the exact trade this project exists to refuse. So the honest state is to keep the adoption, report the regression, and record that what's owed is a surface verification of the page-model reading.

Five distinct instances tonight of one pattern: a cached decision, a rewritten description, a stale key, a threshold, an unapplied fix — each outliving the conditions that made it valid, and none detectable downstream because only the *outcome* was stored, never the *comparison*.

### 2026-07-30 [ec529c9bed18]

This is why I'm not starting a ninth apparatus fix at 02:00. "S6 is the weakest source" turns out to be at least three distinct problems wearing one label: interleaved annotation words (ch12), missing leaves and unlocalized verses (ch44), and edition divergence from 1609 references (documented earlier). A single fix aimed at "the S6 residual" would be aimed at an average of three unrelated causes — which is precisely how the previous eight attempts each looked promising on their chosen examples and failed on the population.

The honest next step is to *separate* those causes and measure their sizes before building anything, which is a fresh piece of work rather than a late-night patch.

### 2026-07-30 [6578133d1e59]

Worth noting how the bad monitor persisted: I rewrote the heartbeat script an hour ago, but the *running* process had already read the old file into memory, so it kept emitting `chapters_at_100=[]` — a false alarm that looked exactly like both sentinels regressing. Editing a script does not restart what's running it.

That's a small operational point with a sharp edge: I verified the fix by reading the new file, not by checking the emitted events. The correct verification for a running process is always its output, never its source.

It also means every alarm that monitor raised after the rewrite was noise — and if I'd trusted it rather than checking the matrices, I'd have "discovered" a regression that never happened and spent hours chasing it.

### 2026-07-30 [b4b7380e9b16]

That plateau is the answer to "keep pushing R3 or hand-work chapters". R3 has taken every chapter as far as a vision re-read *can* take it; what remains is precisely the three classes it cannot touch — interleaved annotation words, unlocalized verses, and 1635-vs-1609 edition divergence.

So closing a chapter requires what chapters 1 and 16 received: per-leaf `PAGE_OVERRIDE`, drop-cap entries, visual readings, a reference audit. Historically that's on the order of a session per chapter.

Which means the plain answer to your order is: **"every chapter to the Genesis 1 standard" is not a pipeline run away.** 17 chapters are arithmetically blocked by absent reference text, and the other 31 each need roughly a session of hand-work. I could have reported 0.7767 as a triumph; the honest framing is that it's the ceiling of automation, and the remaining distance is human-scale work that no amount of compute tonight converts.

### 2026-07-30 [626b1536f52b]

Every one of the eight pinned separation attempts was aimed at the *average* of those three causes. That is precisely why each looked convincing on its chosen examples and failed on the population — you cannot fix an average.

It also retro-explains the whole night's pattern: nine times I found that the binding constraint was a *measurement or bookkeeping* problem rather than a capability one, and the reason I kept finding them is that a mislabelled cause is invisible to aggregates. Only per-cell text, read directly, distinguishes "the fix underperformed" from "the fix was aimed at the wrong thing" or "the fix was never applied".

### 2026-07-30 [36368876f5b8]

The most useful thing the night produced isn't the +332 cells — it's that "S6 is the weakest source" turned out to be **three unrelated problems** (annotation prose on mixed leaves, missing/unlocalized leaves, edition divergence), and all eight prior separation attempts were aimed at their average. That's why each looked convincing on its examples and failed on the population.

Nine times tonight the binding constraint was measurement or bookkeeping rather than capability: a harvester discarding 88% of its input, a gate refusing correct text, a guard destroying unrelated work, a fix committed but never applied, a threshold answering a subtly different question, a monitor watching prose instead of artifacts, a cached decision outliving its comparand. None needed a better model — and none was visible in an aggregate. Every one surfaced only from reading specific cells.

### 2026-07-30 [e694cab319c5]

This rule earns consideration for a reason the eight failed apparatus attempts didn't: it is the **exact mirror of a rule the project already accepted on evidence**. `rejoin_break` joins `hea` + `uen` when neither fragment is a word of the book and their concatenation is; this splits `oflife` when the glued form is *absent* from the book and both fragments are present. Same evidence, same asymmetry, opposite direction.

And the guard is doing visible work: `indeed` splits cleanly into `in` + `deed`, both real words — and the rule correctly leaves it alone because the book uses the joined form. That's the difference between a rule with a principled refusal and the row-interrupt filter, which had no way to distinguish "this token is an intruder" from "this token is a misread I should preserve".

Whether it survives is still an empirical question. Two chapters gained one cell each in the spot-check; if the full sweep shows net harm it gets pinned off like the others.

### 2026-07-30 [4ee5a75d9118]

The guard's principle is the sharpest distinction I've found tonight for this whole class of problem: **a garble is one edit from a real word; a glue is far from every word.**

`hegotten` is one substitution from `begotten` — it's a misread. `oflife` resembles no single word in the book — it's two words run together. Both split into two lexicon words, so the naive rule treats them identically, and it was quietly *tidying away recognizer errors* — which a diplomatic transcription must preserve for a later rung to correct.

This is the same shape as the row-interrupt failure two hours ago, which deleted scripture by shifting past a misread. The recurring trap is that **a rule aimed at "text that looks wrong" will absorb OCR errors unless it can tell an error from a structure.** Edit distance to the lexicon is the test that separates them, and it's cheap.

### 2026-07-31 [a0f4de127ebc]

The `curl -w '%{url_effective}'` trick is the fast diagnostic here — a bare `200` looks like success, but printing the *final* URL after redirects immediately distinguishes "content is behind JS" from "content is behind auth." Worth reaching for any time a fetch returns plausible-looking HTML of the wrong size (47KB of login page vs. an expected transcript).
Also note `copilot/share/*` links are auth-gated even when "shared" — unlike, say, a public gist, the share token grants access to *your account's* view, not the anonymous web.

### 2026-07-31 [934c53e9a314]

The subtlest trap for the comparison app: all parties agree "the elements are eternal" and all use "second death." They disagree about what happens to the *organized person*. Young says the organization ceases while matter persists; Pratt and successors say the person persists consciously in banishment. Two texts can share near-identical vocabulary and assert opposite things about your survival — which is why the schema separates `terminality` (cessation / disorganization-then-reorganization / conscious continuance) from `action`. Lexical similarity alone would score Cannon's "preserve our identity" as a strong match when he's talking about a people not assimilating culturally.

### 2026-07-31 [fc59989ac6ed]

That last one is a nice epistemics lesson. The prior work carried a Penrose row dated `1878-10-06` citing *Conference Report, Oct. 1914* — an incoherence I flagged as irreconcilable and nearly discarded. It turns out the **citation was right and the date field was garbage**. The printed sermon synopsis even advertises "What the second death is — Fate of the sons of perdition." A corrupted record isn't the same as a false one; the useful move was to check the half that was checkable rather than reject the whole row on the contradiction.

### 2026-08-01 [dc1524ef6a53]

That list is the most useful thing the manuscripts gave me, and it isn't about dissolution at all. Several contested nineteenth-century teachings were circulating *together*, itemised without alarm by a man about to be made an apostle. It undercuts any account in which the leadership was adjudicating one controversy at a time. The silence around dissolution isn't suppression — it's what a doctrine looks like when it stops being interesting to the people who could have defended it.

### 2026-08-01 [18946afba1da]

The payoff is a coincidence fifty-two years wide. Joseph Smith's characterization — annihilation as an end of suffering — is *precisely* the premise Joseph F. Smith uses in 1895 to destroy the dissolution doctrine: *"That would be an end to punishment — an end to being. This view cannot be reconciled with the word of God."*

Both men agree exactly about what annihilation would be. Smith uses the agreement to make annihilation the *lesser* dread, a foil for sealing. Joseph F. Smith uses it to make annihilation too *lenient* to be just. Same premise, opposite deployment — which suggests the intuition underwriting the eventual rejection (that an ending lets the wicked off) was present in the tradition from its founder, before there was any dissolution doctrine to reject. I've stated explicitly that no conscious dependence is claimed.

### 2026-08-01 [68f9d27877ec]

This lands the section on the report's own axis, which the earlier conjecture never managed. **The good Smith is defending isn't bare persistence — it's reunion.** Annihilation horrifies him in April because it ends the expectation of meeting his people; it's demoted in August precisely because a worse fate would leave him existing and separated. That's a commitment at the level of *relation* — exactly where the tradition eventually settles. Joseph F. Smith 1882, Penrose 1914, Joseph Fielding Smith 1954, the 2023 official definition: all of them define the second death as separation. Whatever changed between 1843 and now, the thing being valued didn't.

### 2026-08-01 [cf9835b0d780]

This is the check that saves the finding from being a false win. Against the **existing** 0.815 bound the delta is only **18 tokens across 8 leaves** — the base bound already removes most of that margin column. My earlier audit measured against *no* bound and so credited work already being done.

And the 18 are not obviously safe: they include `the`, `him`, `came`, `moſt`, `gift` — precisely the ordinary words the module's own PINNED NEGATIVE (line 835) warns crossing the gutter. Reading them back against the note text (`the croſſe was`, `moſt cruel, &`, `came ro paſſe`, `gift to inter-`) they look like note-*initial* words, but "looks like" isn't evidence.

### 2026-08-02 [cb585ee82a13]

`CHAPTER-WORKFLOW.md` already exists and is strong — but read its subtitle: *"distilled from Genesis 1 and 16."* It was written from the only two chapters that reached **100%**, and both were closed by hand-craft on a cold chapter.

The other ten chapters crossed 0.90 by a **different** route — reference repairs, the mixed-leaf fix, the verse-1 anchor slide, and two autonomous passes. So the template teaches the economics of the first two chapters, not of the ten that followed. That's the gap worth closing, and it's why per-chapter workload hasn't dropped.

### 2026-08-02 [67ee43bee9be]

The re-measured S6 mix carries a warning about the obvious next move. Passes took S6 from 568 open cells to 425 — but look at *what* they took: DIVERGE −72 (−36%), INTERLEAVE −21, **MISREAD only −36 (−14%)**.

So MISREAD has *risen* as a share of S6's residue, 44.9% → 51.5%. **The passes hardened the remainder against themselves.** Re-running the same passes is the intuitive next step and would be the low-yield one.

And the examples show why the residue is tractable *differently*: `truit`/`ot`(f→t), `.he`, `vou`/`aud`/`ihal`(u↔v, n→u, s→i), `openod`/`hundrod`(e→o). That's a systematic **confusion set**, not random noise — recognizer-targeted work, not another sweep.

### 2026-08-02 [2f2452a9c335]

Found something the workflow never questions. `reocr_core.MAXW = 2200` **hard-downsamples every page before the recognizer sees it.** Native S9 is 3224×4329 → 2200×2953: a **32% linear, 54% areal** pixel loss.

Every other threshold in this project was swept and documented — the ch15 bound, `ROW_TOL`, `ROW_MAX_DRIFT`, the band edges. **`MAXW` never was.** It's an unexamined magic number at the very top of the stack, gating the input to everything.

And look at what MISREAD (51.5% of S6's residue) is made of: `truit`/`fruite`, `ot`/`of`, `vou`/`you`, `aud`/`and`, `ihal`/`shal`, `openod`/`opened`. f/t, u/v, n/u, s/i, e/o — every one a **fine-stroke distinction carried by a few pixels**. Exactly what a 54% areal downsample destroys.

### 2026-08-02 [90d2215d8118]

**Five of the 34 are reference defects, every one `s_dismas`, every one with an inflated word count** — 62 vs 23, 63 vs 44, 56 vs 46, 25 vs 22, 23 vs 21. That is precisely the apparatus-contamination signature Phase 1 describes, occurring at **verse** scale where no chapter-level mean test can see it.

Worth 5 verses × 4 sources = **20 cells**, recoverable by reference repair rather than OCR. And they sit in ch26, ch47 and ch41 — three of the worst seven.

My router labelled that signal *"a ceiling — never chase."* That is the self-defeat, and it was mine.
