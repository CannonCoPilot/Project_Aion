# Insights Archive — 2026-08-02
# Rotated: 2026-08-02T23:37:44Z (153 entries)

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

