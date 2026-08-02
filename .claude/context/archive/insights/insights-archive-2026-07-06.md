# Insights Archive — 2026-07-06
# Rotated: 2026-07-06T06:18:06Z (2 entries)

### 2026-06-18 [548e5037b8cc]

- **The MIRAGE detector earns its keep on idx6 and idx104** — the two cases the composite would have waved through. Geneva scores **99.6** yet A3 flags MIRAGE because the structure-presence test finds *zero* chapters (the detector collapsed ~1189 chapters into 21 book containers); Cummings scores **91.7** yet recall is **0.21** (18 of 84 poems). Neither would have been caught by any threshold on the scalar composite.
- **UNRATED-PRIMARY is doing exactly the job it should**: idx70 and idx100 refuse to receive a verdict because their only gold is a *singular* colophon — and idx100's note auto-derives "SUSPECTED MIRAGE: book>0, chapter=0 at composite 100 — add chapter_heading gold." The scorer is pointing at its own missing inputs rather than fabricating a rating, which is precisely the fall-forward (no-fallback) discipline the design demanded.
- **The two genuine OPTIMIZED works (Douay 0.99, Dickinson 1.00) still carry honest caveats** — both note the Phase-B retype gap (the detector segments correctly but can't yet emit `chapter_heading`/`poetry`). Segmentation recall and type correctness are kept on separate axes, so "right pieces, wrong label" never masquerades as fully solved.

### 2026-06-18 [d3ce7114d6dc]

- **The same-work-diff-format test now fires.** Two editions of the *identical* work — idx5 and idx100 — both score composite ~100 on the old rubric, yet A3 now cleanly discriminates them: idx5 **OPTIMIZED** (recall 0.99) vs idx100 **MIRAGE** (recall 0.00, 0 chapters over 73 book containers). idx100 was UNRATED 20 minutes ago; the authored chapter contract turned it into a measured mirage. This is the precise discriminator the gold set existed to enable.
- **The count is earned, not assumed.** Running idx5's verification regex on both editions gave 1334 vs 1335 — and rather than paper over the one-off, I traced it to a parenthetical "(Psalm Chapter 10 according to the Hebrews.)" numbering note (singular "Psalm") at the Psalms 9/10 boundary, so the gold records 1334 with the exclusion documented in the count_cue.
- **The two-level contract makes the pathology legible:** `book` recall 1.0 (73/73, detected) beside `chapter_heading` recall 0.0 (0/1334) — and because A3 aggregates with `min`, one missing structural level is enough to flag the whole work. Books found, chapters lost: the coarse-mirage signature in two numbers.

# Insights Archive — 2026-07-06
# Rotated: 2026-07-06T07:47:38Z (7 entries)

### 2026-06-19 [3f04c5860978]

- **The grounding work paid off in findings the rubric could never surface.** The most striking: idx70 reads "33 chapters" to the detector, but the EPUB nav actually has 35 (I–XXXV) — chapters XXI and XXXI were dropped because their nav labels are corrupted to `XXI11`/`XXXI18` by endnote-reference digits fusing into the heading. The gold now pins the true 35, turning an invisible defect into a measured 0.94 recall.
- **A3 grew two principled axes during the pass, both driven by real data, not speculation:** the `role: primary/secondary` split (so idx5's missing book-grouping is a note, not a rating flip) and the `_found` identity default (so contracts can reference existing detector types). Each change was forced by a concrete work — the methodology and its instrument co-evolved.
- **"Honest null" held the line three times** — Geneva's chapter and book counts and the LDS BoM count are left null with descriptive cues because no clean text cue exists. Fabricating a plausible number there would have been the exact Goodhart trap this whole effort exists to escape.

### 2026-06-19 [5ebbc65fab02]

- You're right that the destination is near-perfect masking for every gold text — but that's the **goal the ratings measure progress toward**, not something this phase produced. What we just finished (Phase A) is the *answer key + grader*. Improving the detector until it scores OPTIMIZED everywhere is the **next** body of work (Phases B→D).
- The mostly-not-OPTIMIZED tally is the **baseline** — the starting line, deliberately taken *before* any detection improvement. In fact the 4 new types (`chapter_heading`/`letter`/`poetry`/`colophon`) aren't even *detected* yet — that heuristic work was explicitly deferred to Phase B. So even Dickinson, which reads "OPTIMIZED," still has its 589 poems typed as `chapter`. **Zero** works are fully perfected right now — and that is the expected, correct state at the end of Phase A.
- The whole reason this project exists is that the *old* scalar rubric scored nearly all of these ~100 and **hid** the failures. The point of the gold wasn't to fix the masking — it was to stop the failures from being invisible. A screen full of MIRAGE/COARSE is the methodology *succeeding*: the gaps are finally visible and quantified.

### 2026-06-19 [c62ad31c79b5]

- The per-instance reversal is consequential: it turns the gold from a *contract* (what structure exists, how many) into a *complete segmentation* (exactly where every element starts and ends). That's strictly more demanding to produce and to keep honest — but it's also what lets you grade boundary *precision* per instance, which the count-based gold couldn't.
- The two hardest works (idx101, idx19) are hard for the same underlying reason: their structure lives in a layer the naive text extraction destroys — column layout (PDF) and document-type framing (letters). Parsing them "perfectly" is really about reconstructing that layer, which is exactly the work the detector must eventually do. So these gold parsers double as detector reference implementations.

### 2026-06-19 [78daed85b122]

This is why span-level beats text-level here: pymupdf's `flags & 1` superscript bit identifies the markers structurally, with zero risk of stripping legitimate single letters or hair-space-adjacent text. A regex on `[a-z]\u200a` would mishandle the ~114 messy edge cases (double hair spaces, stray spacing) and could false-match real content. Filtering by the typographic property the PDF actually encodes is the principled fix the doc called for.

### 2026-06-19 [9a0650e43e08]

The span-level filter delivered a bonus beyond verse bodies: the index headword-locator digits (`Aaron1`, `Zoramites2`) were the *same* superscript class as the footnote markers, so one principled filter cleaned both — that's why only the index `end_anchor` needed updating (the stripped "2" was pollution, not content). A text-level `[a-z]\u200a` regex would have missed these digit locators entirely. Filtering by the typographic property generalized correctly to a case I hadn't explicitly targeted.

### 2026-06-19 [c1b6b6169d20]

Two empirical facts reframe everything below:
- **The audit measures the *detector's* map, whose emit vocabulary is only 24 types — and 9 of the 27 gold types (`bibliography, chapter_heading, colophon, dedication, footnotes, insert, letter, poetry, volume`) are *structurally unreachable*: the detector never emits them for any work.**
- **The detector types poems and letters as `chapter`** (Dickinson's 589 poems → 589 `chapter` + 589 `header`; Frost's poems → not detected at all).

### 2026-06-19 [2202a570b678]

**Edge encoding:** executable instance-rule + count gate (confirmed). **Coverage ideal:** the two-layer requirement *stands* — at every coordinate position the mask stack must be ≥2 deep (≥1 generic + ≥1 specific) — but this is **per-position depth, not a per-character mask**, and crucially **`chapter` reclassifies as a *specific* type.** GENERIC shrinks to the broad containers `{body, volume, book, part}`; `chapter` joins the specific side.

One consequence I have to honor: reclassifying `chapter`→specific must happen in the **gold-intended-map** audit, *not* the current detector-map audit. The detector types poems and letters as `chapter`; if I flipped `chapter`→specific on the *detector's* output, those mis-types would launder into fake "specific coverage" — re-creating the exact mirage the audit exists to expose. So this lands in the re-scoped engine, where `chapter` means a *ratified gold assignment*.

# Insights Archive — 2026-07-06
# Rotated: 2026-07-06T08:39:16Z (3 entries)

### 2026-06-19 [bd957ecbe710]

- **`mode: "replace"` vs `mode: "append"`**: `replace` wipes the built-in verb list entirely and uses only your single entry — guaranteed determinism (every spin is "Reticulating splines"). `append` would mix yours into the existing rotation, so you'd see it ~1-in-N times. You picked `replace`, so the effect is total.
- **Global settings load fresh per session**: Claude Code reads `~/.claude/settings.json` at session start, so the spinner change takes effect on the *next* launch in each window, not retroactively in the currently-running W11:Jarvis-dev or W0:Jarvis sessions. To see it immediately, restart a Claude Code session (or wait for the next autonomic-tick that runs a Bash tool, which is when the spinner shows).
- **JSON validated before stopping**: Always lint settings.json after edits — a single trailing comma or misplaced brace silently disables the whole file and Claude Code falls back to defaults without telling you. `python3 -c "import json; json.load(...)"` is the cheapest possible check.

### 2026-06-19 [024b2dd2f6d0]

- **"not in a mode" is a real bug in my trigger design**: tmux's send-keys silently fails when the target pane is in copy-mode/view-mode/menu — it doesn't queue, it drops. My script swallowed stderr and called itself done. A robust version should: (1) check mode with `display-message -p '#{pane_in_mode}'` before sending, (2) send `q` or `Escape` first to exit any mode, (3) verify input landed by polling for echo. Easy fix if Sir wants me to re-arm with hardening.
- **Phase B `blocked:yes` is meaningful, not broken**: All 5 new tickets show `blocked:yes` while queued. This is the orchestrator gating Phase B on Phase A's `revised_master_plan.md` review — the master plan was the final Phase A deliverable, and Phase B can't start until reviewers sign off. The blocked state is the dependency graph working, not a bug.
- **Phase A→B handoff visible**: 37h elapsed between Phase A closure (~last night) and Phase B kickoff (~now). That gap is presumably Sir reading the Phase A docs and the orchestrator waiting for human review before unlocking Phase B. The fortress doesn't auto-cascade — it waits for sign-off. Worth confirming.

### 2026-06-19 [f17cad53ed27]

- **Phase B is implementation, not research**: Phase A used `assigned:researcher`. Phase B switched to `assigned:backend-eng` — the persona swap confirms the kanban is moving from "understand the corpus" to "build from the master plan". This is the Phase A→B handoff working as designed.
- **Dual persona labels on AION-dda8ac46** (`system_designer` + `systems-engineer`) is structurally unusual. Either (a) Alfred genuinely wants both perspectives on this ticket (likely architectural — system design + engineering review), (b) a labeling race where two persona-assign passes ran, or (c) an unfinished migration from old label names. If it stays as-is when the gate opens, it's intentional; if a chain refuses it ("ambiguous persona"), it's a bug.

# Insights Archive — 2026-07-06
# Rotated: 2026-07-06T09:21:55Z (1 entries)

### 2026-06-19 [e343bf45227b]

- **My dual-persona hypothesis was right**: Two ticks ago I flagged AION-dda8ac46's two assignees as "likely architectural work needing design + engineering review". The fact that this ticket unblocked FIRST — before any of the 6 backend-eng implementation tickets — confirms it. The dependency graph is: dda8ac46 (architecture spec) must complete before backend-eng can begin implementation. The blocked-state is the topological sort being enforced.
- **Snap to 180s per cadence rules** because this is a real transition, not just elapsed time. The 6 backend-eng tickets will likely unblock in cascade once dda8ac46 produces its architecture output.

# Insights Archive — 2026-07-06
# Rotated: 2026-07-06T09:58:38Z (1 entries)

### 2026-06-19 [8b9fdcbb2ada]

- **Two unblocks without a chain pickup**: The orchestrator is releasing tickets from the dependency gate, but the chains aren't picking them up. Two non-exclusive hypotheses: (a) the 3 existing chains are stuck in non-Phase-B work (Alfred meta-work, /compact prep, or hung on previous tickets) and not polling the queue; (b) the daemon's queue-claim logic requires a fresh chain spawn and the 3 existing chains have already claimed their tickets but the labels never updated to `executing`. The clean way to differentiate: peek at one chain window's pane content. If it's actively producing tokens, hypothesis (b); if it's idle/waiting, hypothesis (a).
- **The cascade hypothesis is being validated even without execution**: I predicted "dda8ac46 must complete before backend-eng cascades." But 33689631 just unblocked WITHOUT dda8ac46 doing anything. So the dependency graph isn't `dda8ac46 → all backend-eng` — it's more granular. Some backend-eng tickets depend on dda8ac46, others have independent dependencies that just resolved. Worth pulling task metadata next tick to see what gates remain.

# Insights Archive — 2026-07-06
# Rotated: 2026-07-06T10:41:26Z (4 entries)

### 2026-06-19 [0a6c41368188]

- **Path-watching is fragile**: I assumed Phase B would output to `docs/reconstruction/` because Phase A did. Wrong — Alfred's seed routed Phase B to `alfred/output/neural-canvas/`. The chain pane's `Read output/neural-canvas/<file>` was the only signal that told me. Lesson: never hardcode an output path inside a long-running observer — discover it from chain panes or task metadata. Going to fix the observer script.
- **Cadence delta is the real signal**: Phase A delivered 10 docs in ~2h = ~12min/doc. Phase B delivered 2 docs in 12h = ~6h/doc. 30× slower. Either: (a) Phase B work is genuinely deeper (implementation/audit vs research), (b) chains are hitting review loops that don't terminate cleanly, (c) the dependency gate is throttling pickup. The 5 still-blocked tickets argue for (c) — but the slow throughput on the 2 unblocked-and-running deserves investigation.
- **Existing chains have been doing real work all along**: My earlier "chains stuck?" hypothesis was wrong. They're slow, not stuck. The pane verbatim ("Read ... 33 lines, Read ... 101 lines") is empirically substantive activity, not a spinner.

### 2026-06-20 [87a44abd2c75]

The gold contracts are now **self-documenting and self-correcting**: each carries its reconciled count *and* the executable rule that proves it, so the "poor assumptions locked into the ratification doc" that started this work are replaced by character-verified ground truth. The whole chain — contract → engine → report → portfolio — regenerates from `reference_text()` with one command each.

### 2026-06-20 [ff7dfd0b5e6e]

- The verification that mattered most wasn't "did the API accept the data" (it returned 200 happily) but **"do the offsets mean what the gold says they mean."** The SHA256 match guaranteed the coordinate space is identical; the text spot-checks confirmed the *semantics* — heading markers are 17 chars of pure heading, chapters tile gap-free, books align to canon. Both layers had to hold, and both do.

### 2026-06-20 [d246c455d58b]

- This reveals an important structural fact about the methodology: the durable contract stores only the **specific maskable masks** (chapter_heading) and the **generic container** (book). The `chapter` body-spans, the `body` canvas, and front/back matter are **materialized, not stored** — derived at build time to complete two-layer coverage. So "matches the Gold Set 1-to-1" has two layers to verify: (a) the imported map reproduces `build_elements(5)` exactly, and (b) `build_elements(5)` is faithful to the contract's declared counts. I'll check both, and be explicit about which elements are contract-declared vs materialized-completion.

# Insights Archive — 2026-07-06
# Rotated: 2026-07-06T16:28:42Z (2 entries)

### 2026-06-20 [28ca4d5d4f07]

- **Same family as last night's resume-trigger bug**: My W0:Jarvis send-keys failed with "not in a mode" because the pane was in a dialog state. The seed-fork chains hit a *different* dialog (session resume) but the same root cause: **non-interactive spawn + interactive prompt = deadlock**. Every place Alfred spawns a Claude Code session needs `--print` or `--continue` or a pre-fire dialog drain — otherwise a single popup freezes the worker.
- **Why only W12 escaped**: W12 was the first chain spawned (oldest), so it likely got past the dialog before the seed switched modes, OR it was spawned with different flags. The `--fork-session` flag may behave differently for the first vs subsequent forks. The fix is probably as simple as auto-Esc-then-retry, or adding `--continue` to the fork command.
- **Sir's call on intervention**: I can send Esc or Enter to both windows to unblock, but the dialog is asking *which* resume mode (options 1/2/3) — blind Enter picks whatever's currently highlighted, which might be wrong. The safe-and-fast fix is `Esc` (cancel the dialog) and let the seed re-spawn cleanly. Want me to do that, or wait for your call?

### 2026-06-20 [e85415e8cdd8]

- **The bug is in the seed-fork architecture, not in the chains**: `claude --resume '$seed_sid' --fork-session` blindly attempts a full-session resume on a 600k-token seed. Claude Code's safety net throws a TUI dialog. The fix is either (a) pass a `--summary-resume` flag if it exists, (b) the seed should hand off via a `--continue` from a short session, or (c) auto-`/compact` the seed at fork time (which Alfred's "/compact policy on seed" fix from yesterday was supposed to do — but seed hit 611.8k anyway, so the policy may not be firing reliably).
- **Why W12 didn't hit the dialog**: It was the first child of the seed, spawned before the seed itself crossed the size threshold. Once the seed grew, every subsequent fork inherited the bloat and hit the dialog. This is a *progressive failure mode* — system works until the seed gets too big, then ALL new forks die at the dialog.
- **This is exactly the type of dialog block I just hit on the W0:Jarvis trigger last night**. Same root pattern. Worth documenting as a memory: *interactive dialogs are the silent killer of seed-fork orchestration*.

# Insights Archive — 2026-07-06
# Rotated: 2026-07-06T18:02:15Z (1 entries)

### 2026-06-20 [484aaba29709]

- **"Summary resume" doesn't shrink context enough**: Claude Code's summary mode summarized the prior session to ~610k tokens, which IS the 100% boundary. So the resume succeeded *technically* but the session has no working room. The architectural problem is upstream: the seed needs to fork into a **fresh** session for each ticket, not resume the prior worker's session.
- **The seed-fork pattern is fundamentally mismatched for long Phase B work**: For Phase A's 7 tickets at ~12min each, sessions stayed under threshold and `--fork-session` worked. For Phase B's larger implementation tickets, each session grows past the dialog threshold and the next fork inherits the bloat. The fix has to happen in `host-executor-bridge.sh` — change `--fork-session` to `--print` (oneshot) or start truly fresh sessions per ticket.
- **What just happened from a recovery standpoint**: My Enter intervention got the dialog out of the way but consumed the chain in a different mode — they're now "alive but useless." Killing them now is no worse than leaving them stuck. Closing the windows would let the seed respawn — but the seed itself might be bloated too, hitting the same dialog on the next fork. Without a seed-side fix, every recovery cycle re-creates the problem.

# Insights Archive — 2026-07-06
# Rotated: 2026-07-06T20:16:46Z (2 entries)

### 2026-06-20 [ae9f25ee5f95]

- This is the integrity gate doing exactly its job. idx101 is the LDS Triple Combination — a **PDF that was custom columnar-extracted** (the `.scratch/mask-eval/lds_extract.py` pipeline, per the "idx101 columnar promotion" note). Its gold map offsets are aligned to that *custom* text, but the standard API `ingest_file` produces a *different* text from the same PDF. Without the SHA gate, this would have silently rendered 9,227 mask elements at wrong offsets — exactly the "can't trust what I see" failure we're guarding against.

### 2026-06-21 [439ec11c81b6]

The two Bibles took opposite engineering approaches for the same masking model. For **Challoner (idx5)** I had to *reverse-engineer* structure from a flat etext — detecting 73 varied book headers, the heading→argument→verse shape, and "CHAP." apocrypha markers by reading the actual characters. For the **1582/1610 original (idx108)** I *generated* the text from structured JSON, recording every element's offset as I emitted it — so the map is exact by construction. The bridge between them is `reference_sha256`: because the generated text is normalization-stable, the server's ingest reproduces it byte-for-byte and the offsets align, proven by the same 409-gate that guards all imports.

# Insights Archive — 2026-07-06
# Rotated: 2026-07-06T21:25:34Z (3 entries)

### 2026-06-22 [2bd83b44916b]

The cleanest representation of "a chapter interrupted by notes" in a flat start/end element model is **multiple `chapter` spans sharing identical metadata**, interleaved with `footnotes`, tiling the body with zero gaps. I keep the element layer non-overlapping (not an overlay) because you verify *visually* — you flagged earlier that chapter spans must not visually swallow non-verse content. Each segment boundary lands on the `\n\n` *before* a run, so the blank line preceding a note belongs to the note — exactly the convention the existing trailing-note carver used, making this a strict generalization (single trailing note → byte-identical to before).

### 2026-06-22 [174c9cb31cc6]

The redesign is purely additive because the data was already group-ready: every element carried its type and color, and `elementVisibilityStore` already had `toggle/showAll/hideAll` — it was just never consumed in the Browser tab. The new code is one config (the partition) + one component (the lane) + a 20-line wiring change, rather than a data-model rework.

### 2026-06-22 [f35bcd8fabc4]

The new `section` element turned out to be the keystone for three of your asks at once. It's the structural chapter-span you wanted (item 2), but because it spans the *whole* chapter and carries `palimpsest:chapterTitle`, it's also the cleanest source for the live Book:Chapter breadcrumb (item 3) and a reliable target for cross-tab focus (items 4/5). And because masking is "deepest-wins", adding a big unmasked container left the masked-interval set byte-identical (3040 → 3040) — so your WYSIWYG gold guarantee held even as the element count grew 6332 → 7695.

# Insights Archive — 2026-07-06
# Rotated: 2026-07-06T23:20:08Z (7 entries)

### 2026-06-22 [837f2ad759ad]

The exon/intron metaphor maps perfectly onto the post-carve data. Each logical chapter's verse-runs are the exons, and the inline-footnote gaps that split them are the introns — and the `palimpsest:chapterTitle` you already carry ("Genesis Chapter 1" on every segment) is exactly the join key needed to know which exons belong to the same transcript. So the connector is pure presentation derived from existing metadata; no new data or backend change.

### 2026-06-22 [8410e40aa7dc]

The two context files disagree, and one is wrong. The **compressed-context-ready.md** was LLM-enriched by a small local model (qwen3:8b) and its "Key Paths" are **confabulated** — it cites `projects/project-aion/src/components/BrowserTab/ChapterTrack.js` and `TrackVisualization.js`, files that don't exist. The real work lives in `/Users/nathanielcannon/Claude/Projects/palimpsest/browser/src/components/BrowserView/ElementGroupLane.tsx`, per the hand-maintained **scratchpad**. When a compressor and a primary source conflict, the primary source wins — and I verify both against the actual filesystem before trusting either.

### 2026-06-22 [fe6f4aad07f1]

The design principle: in the Structure lane, `section` is the lone **grey** backbone everything nests in, while the other types cluster into hue families — blue/indigo = nesting containers (volume/book), red→pink = front matter, cyan = supplementary (appendix/glossary), purple = the `header` name-marker layer. In the Content lane the warm tones (orange intros, gold argument, yellow notes) read as "editorial apparatus" and **green `chapter`** stands apart as the one analyzable text. So hue itself encodes the sub-group, which is exactly what makes a dense gene-track legible at a glance.

### 2026-06-22 [1dbf5d591912]

Element colors are resolved at **serve time** from `SECTION_COLORS` (server.py:172), not stored in the gold map — so the palette change needed no map regen and left WYSIWYG/A3 untouched, but it *did* require restarting the dev API because Python caches the imported `layout` module. The `palimpsest` package is an editable install (`_editable_impl_palimpsest.pth` → `core/palimpsest/`), which is why the restart picked up the edit at all. I restarted it detached (`nohup`) so it survives the session.

### 2026-06-22 [241348a33f3e]

The linchpin is task #14. Masking 35k verse-number tokens means they enter `masked_intervals`, which is O(breakpoints × sections) — at ~45k sections that's billions of ops. So this path *requires* rewriting the core masking algorithm to an O(n log n) sweep-line. That function decides the analyzable text for **every work**, not just idx5, so the rewrite has to be proven byte-identical across all 20 gold works before anything downstream can trust it. That verification gate — plus a full gold-map regeneration on the renumbered text and a new server/frontend track — is genuinely a fresh-session-sized effort, not a tail-end one.

### 2026-06-22 [ff9d67024518]

The performance unlock is recognizing that the verse-number tokens are a *flat, disjoint, leaf-level* interval set — they never nest, never overlap, never participate in "deepest section wins." So they don't belong in `masked_intervals` at all. The structural masking stays element-based over the ~9k real sections (fast, unchanged), and the verse-number layer is a separate precomputed interval set **unioned in at the end** — O(n). That kills the need for the sweep-line rewrite (drop task #14 entirely) *and* keeps the gold map at ~9k elements instead of 46k. Masking = `deepest-wins(structural sections) ∪ active interval-layers`. The verse layer is just the first interval-layer; the design generalizes to any dense regular marker later.

### 2026-06-22 [a2c41124f765]

One probe is quietly important: **Psalms 119:176 → NOT FOUND**, yet Psalms has 2,508 verses indexed. That's not a bug — the Douay-Rheims uses Vulgate/Septuagint psalm numbering, where KJV Psalm 119 is DR Psalm 118. So the index is faithful to *each edition's own* numbering, which is exactly why your "KJV John 3:16 ↔ DR John 3:16" alignment must be reference-based and *per-edition* — and why some refs (Psalms especially) need a numbering-system mapping, not a naive key match. The index captures the raw truth; alignment is a layer on top of it. Worth knowing before we wire cross-work mapping.

# Insights Archive — 2026-07-06
# Rotated: 2026-07-07T01:50:47Z (9 entries)

### 2026-06-22 [90f5fab86813]

`826,357 = 600,290 (structural) + 226,067 (verse numbers)` — the two layers compose perfectly, and the live server, the verifier, and the stored map all agree. The span count (37,581) is *less* than 3,040 + 35,755 because some verse-number tokens abut a footnote or each other and merge — exactly what the O(n) union + merge should do. This proves the index-as-source design end-to-end: structural deepest-wins untouched, verse numbers masked categorically, no quadratic blowup.

### 2026-06-22 [30187db4e311]

- **TickerTape** (readable strip): the grayed span reads "Ecclesiasticus Chapter 7 Religious and moral duties. **7:1.**" — the chapter heading, its argument, AND the verse-number token are all masked-gray and merge into one span (adjacent masked intervals coalescing exactly as the union logic intends), while the verse prose stays normal black.
- **Verses lane** (3rd row, green dot, count "2"): renders verse marks with `c:v` labels ("6:37", "7:1") and a distinct dark box for the masked `[ns,s)` number token right before "7:1" — my `VersesLane` drawing masked-number vs. analyzed-prose.
- The lane auto-shows only at this 262-char zoom (well under 30k), and the lazy fetch fired only on zoom-in.

### 2026-06-22 [08f0d70fc3cd]

The key design payoff: verse numbers are a **flat interval mask-layer**, not nested sections. Because they never participate in deepest-wins, the client union is a cheap sort+merge appended to the structural result — and since the TickerTape only renders glyphs at deep zoom (<1600 chars) while the index lazy-loads at <30k, the data is always present exactly when masking needs it, with zero cost when zoomed out.

### 2026-06-22 [6d202c761ea8]

- **Breadcrumb**: "Third Booke of Esdras : Chapter 1" — the appendix book is correctly identified.
- **Verses lane** (count "5"): renders `1:1`–`1:5` with green prose bars and thin masked number-token segments — the inline-numbered Esdras verses are now indexed exactly like canonical ones.
- **Discrimination working**: the visible TickerTape text is the *argument* paragraph ("…32. and much lamented… 34. His sonne…"), whose `N.` cross-reference numbers are correctly **left un-grayed** (they're not verse markers), while the body's bare `N ` markers are masked — exactly the period-vs-space distinction the detector relies on. The Content lane shows gold (argument) → green (verse body) confirming the split.

### 2026-06-22 [f7f8afaf5221]

Two themes dominate and both cut across the whole stack: (1) the core masking algorithm is **accidentally quadratic** and is reimplemented identically in Python and TypeScript — so the same O(sections²) cost is paid on both the server and in the browser; (2) the project's impressive-looking "WYSIWYG PASS / gold-verified" guarantees are **partly circular** — they prove the server agrees with its own library, not that the library is correct. The verse layer (the newest, riskiest code) has *zero* independent ground truth.

### 2026-06-22 [10a7c881ba20]

The `cached != computed` mismatch (37210 vs 37182, Δ28) is **expected and harmless**: the cache keeps zero-width num-spans for implicit lead verses, while `verse_number_intervals` drops them — but `masked_intervals` filters `0 <= a < b` downstream, so both converge to the identical masked set. This also means my `server.py` refactor is *exactly* behavior-preserving: the old inline read also kept zero-width records. The lesson — when two code paths feed a normalizing sink, equivalence must be asserted at the **sink's output**, not the intermediate.

### 2026-06-22 [38273b9ea80f]

The sweep-line's win comes from touching each section O(log N) times *total* (one heap push + one lazy pop) instead of O(N) times *per segment*. The lazy-deletion trick — leave a closed section in the heap and discard it only when it surfaces at the root with `end ≤ a` — is what keeps it correct without an O(log N) delete-by-key. It works precisely because the sweep position only advances, so "closed" is permanent.

### 2026-06-23 [35df5170fab1]

The whole feature rests on one realization proven end-to-end: **masking and subtext-selection are inverses over the same engine**. Keeping the `chapter` layer = masking everything else; the subtext = the kept spans with every overlapping parent layer remapped by a single **piecewise offset map** that simultaneously assembles the child text and re-anchors its layout, verse index, and tracks — preserving mask state (verse numbers stay masked). No parallel data model was needed; the live glossary derive (7591 chars, child + auto-collection, 1.4s) and the earlier full-DR derive (3039 chapters, 37173 verses, headers stripped) both confirm it.

### 2026-06-23 [0522abedd415]

Diagnosing first, then the architecture answer. Three classes of "noise" here, each with a different fix — lumping them all as "Pyright garbage" hides the fact that one class is actually a real bug.

# Insights Archive — 2026-07-06
# Rotated: 2026-07-07T05:26:11Z (3 entries)

### 2026-06-23 [a7871e52eb7c]

- **The `|| [[ -n "$_line" ]]` pattern** in the while-read loop handles files that don't end with a newline — without it, the last line is silently dropped. This is the classic `while read` bash gotcha; missing it would mean the LAST project in `.active-projects` gets silently ignored.
- **Why `.active-projects` is opt-in (all commented) by default**: Aion's launcher has no idea which projects Sir is actively touching. Auto-loading all of `~/Claude/Projects/` would bloat every Jarvis session's workspace + add startup cost for projects he isn't using. Opt-in keeps cold-start lean.
- **The Aion-root config deliberately excludes `alfred/`**: Alfred's Python subprojects (`alfred/usage-proxy/`, `alfred/pulse/`, etc.) have their own venvs and import structures. Forcing them under Aion's `infrastructure/.venv` would produce noise. They can get their own `pyrightconfig.json` files later if Sir wants Pyright on them.

### 2026-06-23 [eeca7abb6c6b]

- **What you'll experience in W0**: Claude Code retries 529s automatically with backoff, so you'll see *slower* responses (10–30s lag on tool calls) but not outright failures. If you see Claude Code show "Retrying..." or "Overloaded, retrying" — that's exactly this. The 5.5% 500-rate is more concerning because some clients don't retry 500s the same way; you might see a turn fail outright and need to re-send.
- **The proxy doesn't track HTTP status**: I confirmed `api_requests` schema has no `status_code` column. The Postgres DB only stores successful Anthropic responses (tokens, cost, rate limits). HTTP-level errors live ONLY in the docker proxy logs, which rotate. If you want durable error-rate alerting, that's a real gap worth fixing — add a `status_code` column + ingest 4xx/5xx into the DB so the dashboard can graph it.
- **No action from you required for the autonomic loop**: My observer ticks aren't failing because each individual API call retries through. But Phase B's chains may be experiencing the same 529 retries, which is *additional* slowdown on top of the existing 6h/doc cadence. So if Phase B looks even slower today than before, this is part of why.

### 2026-06-23 [84cc7a275eb1]

- **The error message is misleadingly worded by Claude Code itself**: `"check your inference gateway (localhost:9800)"` makes it sound like the proxy is the culprit. It's not — the proxy is just the URL Claude Code POSTed to. Anthropic returned 529; the proxy passed it through. Claude Code generated the "check your gateway" suggestion as a generic template, not as a diagnosis. This phrasing has been confusing you.
- **The MLX `500 Internal Server Error` from the bad-model test is a SEPARATE event from the 529 Overloaded that hit your next prompt**. They look related because they happened close together, but they originate in different services (MLX :8000 vs Anthropic via :9800). The 500 was your `nonexistent-model-xyz` test crashing MLX's request gracefully. The 529 was Anthropic-side throttling on your next message. Two unrelated failures coincident in time.
- **Where the misdirection in Claude's error came from**: `localhost:9800` is the configured `ANTHROPIC_BASE_URL` in Sir's env, so when ANY POST to that URL fails, Claude Code shows "check your inference gateway (localhost:9800)" — even when the failure is from Anthropic upstream-of-the-proxy. There's no logic in Claude Code distinguishing "proxy failed" vs "proxy forwarded an upstream failure" because it has no way to know.

