# OriginalDR — Revision 2026-07-08: Locus-Level QC, the Double-Bind Coverage Contract, Exhaustive Best-Raster Re-OCR

> **Merge target:** folds into `/Users/nathanielcannon/Claude/Jarvis/.claude/plans/sparkling-petting-gosling.md` as
> **"Revision 2026-07-08"** atop §0 + a rewrite of **§12 (Phase 4)**. **Supersedes** `partitioned-snacking-feather.md`
> (the prior 4R working mirror) — this does not fork a new effort, it re-grounds the hard-path against Sir's course-correction.
> **Hold commit/push per §11.**

---

## Context — why this revision

Sir's review found execution *again* took the cheap path and, worse, drew **simplistic conclusions that degrade the project's aims**. Three specific corrections (Sir's words, internalized):

1. **No book may be dropped by a %-of-chapters-missing heuristic.** The `NOISE_FRACTION`/book-drop logic launders chapter-level failure into a clean book verdict. The only acceptable goal is: **recognize every chapter of every book, and OCR it at ≥0.90 identity vs the modern standard.**
2. **"Coverage" must mean realized quality, not physical presence.** A source that contains an OT but OCRs Psalms to garbage is **not** coverage of Psalms. "76/76 books have ≥1 source" was a false assumption. Coverage = *localized AND parsed at quality*, counted **per chapter and per apparatus element**.
3. **The jp2 "no gain" was cause-and-effect inverted.** Both registers carry the same layout-confusion pollution (e.g. inline `(n)/(o)` commentary folding *between* Psalm verses), so resolution can't express itself until layout is understood. **Layout-understanding and resolution go hand in hand** — hi-res lifts identity only once the page geometry is read correctly.

The fix Sir specified is a **granular quality-control contract** enforced at the **locus** level (every chapter, every apparatus element, all front/back matter), scored as **character-level % identity** against **two references at once** — janvier (modern) and s-dismas⊕odr_com (archaic) — with **post-OCR consensus, gating, and reporting all moved off book-level**. Intended outcome: an auditable, per-locus map where every Douay-Rheims chapter and apparatus element reaches its expected witness depth at ≥90% fidelity, with garbage caught early and driven to resolution by exhaustive, layout-aware, best-raster re-OCR.

> ### Design invariant — NO SILENT DEGRADATION (Sir, 2026-07-10; supersedes any "strategic back-off")
> The aim is **absolute**: iterate the algorithm until **every locus reaches the targeted threshold** (≥0.90
> identity vs the *correct* standard, at its E(v) depth). **No design clause may quietly accept, cap, or "park" a
> below-threshold locus** so that a run can report success while degraded. Safeguards are permitted **only** as
> circuit-breakers that keep *trial / preliminary / calibration* runs from failing infinitely — and **every time a
> safeguard fires it must alert both Sir and Jarvis that the current APPROACH needs to be carefully redesigned**,
> never stand as a terminal acceptance. "The method can't reach it" always means **"redesign the method,"** never
> "lower the aim." A below-threshold locus is an **OPEN** work item that **blocks the deliverable** until the
> algorithm is improved enough to clear it. This is the same anti-laundering posture as the extirpated book-level
> gates (`guard_no_book_gates.py`), now enforced at the autonomy / re-OCR layer — where a fired safeguard is a
> signal to *stop and rethink the approach*, not a license to continue to a degraded completion.
>
> **Escalation ≠ off-ramp (Sir, 2026-07-10).** When a locus escalates to human review, the **default expectation is
> that review returns a request for further retooling/adaptation to re-approach bar-passing automation** — not a
> decision to accept a gap. We hold the high threshold precisely to **rigorously expose the real limits of the
> source material and OCR capability, and then meet them** — never to short-cut below those real limits before every
> avenue to the optimum is exhausted. Even a genuine physical floor (e.g. an illegible page in the sole surviving
> scan) resolves to an **explicit, documented human decision**, never an automated acceptance.

---

## Part 1 — The QC contract (the 20 decisions, codified)

### 1.1 Locus, E(v), and the double-bind
- **Locus** = any canonical skeleton coordinate: a scripture **chapter**, an **apparatus element** (typed by channel), or a **front/back-matter** slot. The skeleton (`skeleton.json`) is the coordinate space.
- **E(v)** = expected source-witness count per locus (an *expected value*, used to warn/flag — not a hard cap):
  - Scripture chapters: **NT E(v)=12, OT E(v)=6** baseline (OT ranges to ~10).
  - Apparatus/marginalia: variable and often lower; **min 3** QC'd passing witnesses to unblock consensus.
- **Double-bind (two-way QC):**
  - **Forward:** an OCR read counts as a witness at a locus **iff it passes localization AND the identity bar**; below-bar → re-OCR + retry until it passes.
  - **Backward:** a locus that fails to reach its E(v) is **flagged**, which triggers investigation of *every source that ought to contain it* (via the per-source index) for localization/identity errors. This holds **transcribed** sources accountable, not just OCR. Neither gate alone catches both garbage-in and silent-drops; together they close the loop.
  - **Backward-gate owner (transcribed path) — DECIDED (rev 2026-07-08 PM):** `source_index.py` owns the ought-to-contain denominator; it is **manifest-seeded then detection-refined** (manifest spans give the initial per-source book/element set; `reads/{name}.json` actual detections refine it). A **transcribed-source** shortfall (a source that ought to localize a locus but does not) has no re-OCR analog — its disposition is **re-parse then human-review flag** (not silent), recorded in the audit as `shortfall_flag` with `reason=transcribed-localization-miss`. Every synthesis fix targets OCR mechanics; this bullet gives the backward gate a named owner and action for the transcribed half so it is not merely asserted.
- **Grain — REVISED 2026-07-10 (Sir): uniform verse/element grain** (supersedes the 2026-07-08 dual-grain split). Localization, witness-counting, AND identity scoring all operate at **verse grain** (`scripture/{b}/{c}/{v}`) or **apparatus-element grain** — so partial coverage (a half-transcribed chapter, a lone marginal note, a locus present in only one archaic source) is scored exactly where each reference exists, not smeared across a chapter average. **Versal drift** (s_dismas ±1–3) is absorbed in the *localization JOIN* (§1.3, `detect_s_dismas.validate` ±3 tolerance) so reads are correctly skeleton-keyed **before** per-verse scoring — the drift is a matching problem, not a reason to coarsen the scoring grain. `evaluate_locus` stays grain-agnostic; `qc_audit.py` scores one locus at a time.

### 1.2 Coverage semantics (individual-source count)
- **Reverse** the old "combined OCR = one witness." Coverage is an **individual-source count per locus**.
- A source counts at a locus iff **localized AND identity-pass**. **Transcribed sources auto-pass identity** but **must still localize** per-locus (congruent with OCR sources).
- **Madueke_a is NOT an independent witness** — it is a **localization aid for Madueke_b only** (helps separate scripture vs apparatus vs marginalia).
- **One witness per physical source; highest-res raster ONLY** (no low-res fallback). Re-OCR "hammers" that single best layer until layout + character errors resolve.
- **Downloaded pre-existing archive.org OCR (`archive-*`) is EXCLUDED** from coverage + consensus **until further notice** (kept on disk, parked).
- Witness roster & expected depth: 6 whole-bibles (Janvier, Madueke_b, S01, S03+S04, S06, S09); +NT: S05, S08, S10, S11, s-dismas, odr_com → **NT=12**; +OT: S02, S12–S15, s-dismas(→Wisdom), odr_com(partial) → **OT=6..10**.

### 1.3 Localization
- **Localized = start/end anchors found AND the body is a *contiguous* span** — no interleaving from an adjacent column or from marginalia/inline annotations folded into the text. Same test for transcribed + OCR. (This is exactly what eebo-vol4 Psalms violates.)
- **Localization scoring — CORRECTED (rev 2026-07-08 PM).** Today's `tight_window`/`locate_region` use order-blind **set-recall** (`|probe_types ∩ window_types| / |probe_types|`, `detect_our_ocr.py:271-299`) at an **uncalibrated `ATTEST_THRESHOLD 0.5`** with **no precision term** — so scrambled-order matches and function-word overlap inflate attestation, which inflates the E(v) witness counts the *backward* gate depends on (false positives → backward gate fails to fire on genuine shortfalls). Replace with **in-order matched-token coverage** under a monotone-position constraint (the pattern already in `consensus_v2.extract_source_verses`), score = Σ(in-order matched token lengths)/probe_len; **add a precision floor** — require `matched/probe_len ≥ ATTEST_THRESHOLD` **AND** `matched/window_len ≥ PREC_FLOOR (~0.25)` (F-β, β=2 acceptable) so diluted windows fail. `ATTEST_THRESHOLD` value stays 0.5 but is **calibrated at the P2 pilot** via an ROC sweep on a ≥20-verse hand-labelled Genesis+Psalms gold (promoted to a committed fixture). This is a **prerequisite for `qc_audit.py`'s forward pass**, not parallel to it.

### 1.4 The identity bar (char-level, ≥90%, verse/element grain) — REVISED 2026-07-10: ARCHAIC-PREEMINENT
Transcribed sources auto-pass identity (they *are* the references). For each OCR locus text the gate scores against **two backfilled references**, and the **archaic reference governs wherever it exists** — because it is in the same edition family as the 1582/1610 print the OCR came from, so a faithful OCR clears it (the modern reference measures edition-agreement, not OCR fidelity, and is the correct yardstick **only** where no archaic reference exists). This makes "right yardstick, not excused failure" the primary code path, not a special case.

**The two references (built once, per-locus, verse/element grain — Sir 2026-07-10):**
- **Archaic reference = `s_dismas` content, backfilled from `odr_com`.** `archaic_ref[locus] = s_dismas[locus] if present else odr_com[locus] if present else None`. (s_dismas is the ſ-diplomatic gold Genesis→Wisdom + NT; odr_com fills loci s_dismas lacks — later-OT, gaps, apparatus.)
- **Modern reference = `janvier` (`sabates_a`) content, backfilled from `madueke_b`.** `modern_ref[locus] = sabates_a[locus] if present else madueke_b[locus] if present else None`.
- **Grain = verse (`scripture/{b}/{c}/{v}`) or apparatus element**, NOT chapter — so marginalia, apparatus, partially-completed chapters, and any locus missing from one archaic source are scored exactly where each reference exists (a chapter average would hide a half-covered chapter). (Supersedes the earlier chapter-grain-for-archaic decision, §1.1/§10.1; versal drift is absorbed in the *localization* JOIN, §1.3, before per-verse scoring — reads are already skeleton-keyed.)

**The gate (per locus):**
1. Compute BOTH scores for reporting: **`modern_id`** = char-level (normalized Levenshtein, both sides modern-folded) of the OCR vs `modern_ref`; **`archaic_id`** = char-level (both sides ſ-folded) of the OCR vs `archaic_ref`, **plus a separate deterministic long-ſ *rule* placement check** (reference-free, per R12).
2. **PASS rule — archaic-preeminent:**
   - **If `archaic_ref` exists at the locus →** PASS iff **`archaic_id ≥ 0.90`** (+ long-ſ rule check). The archaic gate is the governing quality bar here; `modern_id` is recorded as a signal but does **not** gate (a faithful 1582 OCR that diverges from Janvier's modern edition must not fail on that divergence).
   - **Else (no `archaic_ref`) →** PASS iff **`modern_id ≥ 0.90`**. This is the only place the modern gate governs.
   - Neither reference present → `needs-reference` (loud OPEN alert per §1.4 scoped-trigger rule 1; never a silent pass or park).
- **Identity unit = character-level** (normalized edit ratio, post-fold) — a real change; today's `sim()` is token-level.
- **Metric — DECIDED (rev 2026-07-08 PM).** The char metric is **normalized Levenshtein** = `1 − editdist(a,b)/max(len(a),len(b))` post-fold, post-whitespace-collapse. This is the `edit_ratio` already implemented at `char_identity.py:71-86` but **currently dead code** — the live gate wrongly calls `char_ratio` (difflib `SequenceMatcher.ratio`, `:89-94`), which is not edit distance and slightly over-scores. Activate `edit_ratio` as the gate; keep difflib only as a fast skip-prefilter (`if char_ratio < 0.80: return 0.0`). "0.90" is meaningless without naming the function — this names it.
- **No-archaic-ref locus — REVISED 2026-07-10 (under archaic-preeminent gating).** Where **no archaic reference exists** (even after the odr_com backfill), the **modern gate governs** (`modern_id ≥ 0.90`) — this is the only place modern gates. It must **never auto-pass** (the old `evaluate_locus:109` bug silently defeated R12). Independently of which reference gates, apply the reference-free **long-ſ placement rule** (`long_s_rule.rule_pass`) as an **auxiliary ſ-conformance signal** on any archaic-spelling OCR, and the **f→s ſ-misread pre-check** (OCR with no ſ but f in initial/medial ſ-positions → flag suspected ſ→f, route to re-OCR rather than accept as surface variant). These surface the ſ-fidelity that the modern (ſ-folded) gate would otherwise hide.
- **Scoped re-OCR trigger — NEW (rev 2026-07-08 PM; REVISED 2026-07-10). Don't loop re-OCR against a yardstick that doesn't measure OCR fidelity — but never let that become silent acceptance.** The modern gate measures *edition-agreement*, not OCR fidelity, so a **perfect OCR can FAIL** it where the 1582/1610 printing genuinely diverges from Janvier's modern edition; no amount of re-OCR makes the 1582 text into a modern edition. The disposition is therefore **switch to the correct verifier, not lower the aim** — the locus must still reach ≥0.90 against a *valid in-edition* reference. Three sub-rules, applied in `qc_audit.py` before any re-OCR trigger fires:
  1. **Short loci (< ~500 folded chars: apparatus, front/back-matter, chapter summaries, annotations):** don't gate on `modern_id` — verify against the best-matching *other scan witness of the same printing* (intra-scan-family consensus) or the archaic gate. If **no valid in-edition reference exists** (e.g. a single scan witness with no archaic ref), raise `needs-reference` — a **loud OPEN alert** (acquire/transcribe a reference, or human-adjudicate); the locus stays open and blocks ship. **Never** a silent `park`.
  2. **Chronically-divergent books (empirical s_dismas-vs-madueke_a token agreement < 0.80: Acts, 2Paralipomenon, 2Esdras, Romans, Mark, Psalms):** treat `modern_id` as a **signal, not a gate** — the *archaic* gate (in-edition) governs quality here; re-OCR fires when `archaic_id < 0.90` (or modern+archaic both low, or an intra-scan-family shortfall is confirmed). The aim is unchanged; the correct in-family instrument does the gating.
  3. **All loci:** compute a cheap `floor_modern = align(transcribed-archaic, Janvier)` under the same fold; if `floor_modern < 0.90` the *modern yardstick itself* is partially invalid here — **flag it and redirect verification to the archaic / in-family instrument** (don't burn re-OCR compute chasing the modern number, and don't accept the locus on the modern number either). The **archaic gate is unchanged** — it scores within the same edition family, so a faithful OCR passes it; it remains the real quality gate for these loci.

### 1.5 Consensus gating (finest MSA, locus-level gates)
- **Keep the finest assembly unit** — verse-level (scripture) / item-level (apparatus) MSA + consensus + variant pileups. "No book-level" means **no book-level pass/drop**, not coarser assembly.
- **Scripture chapters hard-block** consensus until **every** source that contains the chapter passes (full E(v)); pending sources are warned + re-OCR'd first.
- **Apparatus/marginalia never hard-block** — unblock at **≥3** QC'd passing witnesses; thin elements carry a warning + low-confidence banding.
- **Cross-lineage independence floor on the apparatus unblock — NEW (rev 2026-07-08 PM).** The ≥3 passing witnesses must include **≥1 from OUTSIDE the Madueke/Sabates/Janvier lineage** (accept s_dismas, odr_com, any OCR scan S01–S15/archive.org). Janvier + Madueke_b + Sabates together count as **ONE** lineage vote (aligning the gate with the §4.3 confidence weighting in sparkling). This closes the correlated-source loophole where three modern witnesses of one lineage could fire the unblock with zero archaic/print evidence. Thin apparatus that can't meet the floor warns + low-confidence bands (existing behavior).
- **Coordinate authority — DECIDED (rev 2026-07-08 PM, resolves brainstorm fork §10.5).** Janvier's ODR tree defines the coordinate **KEY SPACE only** (locus IDs, marker types, expected-element set). **Content authority is consensus, never Janvier by default.** When Madueke_b and Janvier disagree on an element's presence/text, both are **variant reads in the pileup** and multi-source consensus calls the content.
- **SHORTFALL / NOVEL disposition — DECIDED (rev 2026-07-08 PM, resolves forks §10.4/§10.5).** Two-cell rule on the outer-join: (a) **Janvier coordinate present + no print attestation** = `SHORTFALL` → include in basis DB at low confidence, flag as OCR work-target, **never drop** (the backward E(v) gate already fires); (b) **print element present (OCR marker found) + no Janvier coordinate** = `NOVEL` → include in a dedicated novel channel, surface in the overlay map, **never drop**. **Novel-span ID grammar:** `apparatus/novel/{book}/{ch}/{page}/{reading_order_idx}` (anchored to cue-first typed-line records). Promote to `apparatus/confirmed_novel/{...}` with `min-witnesses=1` only after detection in **≥2 independent OCR sources** + reviewer confirmation. Whether confirmed-novel spans render into idx108/109 (vs overlay-only) + their insertion/ordering rule is settled at **P5** (see build order).

### 1.6 The audit = the new authority
A per-locus × per-source scorecard spanning the **full skeleton** (front/back matter + book/chapter + every apparatus channel), columns: `{localized?, modern_id, archaic_id, pass/fail, witness_count, E(v), shortfall_flag}`. It **supersedes** tome-map's book-level coverage; everything downstream reads from it. Preserve current artifacts as `.pre-QC-framework` baselines (mv-not-rm).
- **Authority reconciliation — DECIDED (rev 2026-07-08 PM).** `basis-db` is the **single materialized authority**; `coverage-audit.json` is a **derived view/export** of it, **not** a second authority. Join key = **locus = `element.id`**. The per-source×per-locus scores live on the basis-db **attestation** record (`+{modern_id, archaic_id, localized, pass}`) and the per-locus aggregates on the **consensus** record (`+{witness_count, E_v, shortfall_flag}`) — see sparkling §4.6 schema update. Build order: `qc_audit.py` (P3) populates `coverage-audit.json`; `build_basis_db.py` (P6) reads only **PASS** attestations keyed by `element.id` and writes the char-identity fields into the attestation table.

---

## Part 2 — Build order (REVISED 2026-07-08 PM: correctness-first, decision-forcing pilot)

> **Why the reorder.** The top-level contract is sound; the QC *measurement machinery* is not. So the cheap,
> **paradigm-independent** correctness fixes and doc reconciliation go FIRST; the one architectural decision
> (Janvier-canonical coordinate-collapse, brainstorm §§2–11) is FORCED **at** the pilot, not before; and only then
> is the harness built — so it can't be built in one paradigm and thrown away if the other is chosen. Supersedes
> the prior Phase 0–5 numbering.

**P0 — Provenance spine + gate-removal verification (no paradigm dependency).**
- **Unify** the `master-source-list.json` witness record shape (single schema + `kind` discriminant) — today the 3
  witness classes have disjoint key-sets, which a `coverage-audit` join would straddle. Then add **`sha256` to the
  14 scan witnesses** (S1–S15, no S7 — the 7 non-scan witnesses already carry it), and `lineage_group` (enum:
  madueke-family / sabates-derived / archaic-print-line / scan-archive-org / scan-eebo) + `independent` (bool) to
  **all 21**. Update `build_master_source_list.py`. Keep individual-source count, Madueke_a demoted, `archive-*`
  excluded, S03+S04 grouped, per-testament E(v), best-raster designation.
- Keep the **per-source ought-to-contain index** (`source_index.py`, manifest-seeded + detection-refined) — the
  backward-E(v) denominator (now with a named owner, §1.1).
- Confirm `guard_no_book_gates.py` green over its 3 live files (all 4 gate constants — COVER_FLOOR/NOISE_FRACTION/BOOK_FLOOR/BOOK_ALIAS_FLOOR — absent).
  **Delete the dead `consensus_spike.py`** (banner-superseded, no importers, guard-excluded — a stray
  `COVER_FLOOR=0.5` constant is drift-risk; deletion is the strongest anti-drift posture). Drop the orphaned
  `sources-registry.json` concept — `master-source-list.json` is the denominator.

**P1a — Fix the measurement primitives (paradigm-independent, cheap, mandatory before any harness).**
- `char_identity.py`: activate `edit_ratio` (normalized Levenshtein) as the gate, difflib as skip-prefilter; wire
  `long_s_rule.rule_pass` into the no-archaic-ref branch; add the `floor_modern` edition-divergence helper + f→s
  ſ-misread pre-check; add unit tests (see TDD gates).
- `detect_our_ocr.py:271-299`: replace order-blind set-recall with in-order matched-token coverage + `PREC_FLOOR
  ~0.25` (§1.3).
- `consensus_v2.py`: `conservation()` separate `n_present`/`n_all` + expose `depth_fraction`; `consensus()` exclude
  `"-"` from the plurality vote (a **silent gap-wins-plurality correctness bug**: 5 absent + 4 agreeing → gap wins,
  the word is dropped from the reconstruction). All three survive whichever paradigm the pilot picks.

**P1b — Doc reconciliation (spec-only; settle the contract so the harness builds to it).**
- Applied in this doc + sparkling: metric decision, dual-grain, scoped re-OCR triggers, long_s_rule no-ref gate,
  order-aware localization, cross-lineage independence floor, key-space-only + SHORTFALL/NOVEL + novel-span grammar,
  coverage-audit=derived-view, stale-0.85 delete, error-map banding, **asymmetric-pass deliverable rule** (sparkling
  §5/§9), **backward-gate transcribed owner** (§1.1), reciprocal Palimpsest handoff (sparkling §9).

**P2 — PILOT (eebo-vol4 Psalms + S06 end-to-end; the single human checkpoint; DECISION-FORCING).**
- **Blocking pre-check:** verify Douay-Rheims **Vulgate vs Masoretic Psalm numbering** against Janvier's
  `odr/psalms.json` **before** committing Psalms as the slice — a whole-Psalm coordinate offset (far larger than the
  ±3 versal drift `detect_s_dismas` handles) would break the pilot on the exact slice meant to prove the collapse.
- Run the loop on the P1a-fixed primitives; emit a committed **`pilot-report.json`** answering: (a) does
  contiguity-fix + layout-aware re-OCR unlock **>0 Psalms chapters at ≥0.90**; (b) **ROC-calibrated**
  `ATTEST_THRESHOLD` + identity bar on the ≥20-verse Genesis+Psalms committed gold; (c) the **BRAINSTORM
  approve/defer decision** (gates P3 architecture); (d) verse/chapter grain confirmed; (e) measured **vision-LLM
  per-page cost/time**.
- **Autonomy convergence-alerting envelope (co-equal pilot deliverable) — REVISED 2026-07-10 per the
  no-silent-degradation invariant.** The aim is absolute (every locus → ≥0.90 vs the correct standard at E(v)); the
  algorithm iterates until it gets there. This envelope exists ONLY to keep an *unattended* autonomous run from
  looping infinitely on a locus the *current method* cannot yet solve — and when any part of it fires it is a **loud
  ALERT to Sir + Jarvis that the APPROACH must be redesigned, never a terminal acceptance of a below-threshold
  locus.** In `reocr_ladder.py`:
  - **Ladder-exhaustion alert (replaces the attempt-ceiling):** a locus escalates through **every** rung (baseline →
    layout-aware → region/half-page → vision-LLM). Reaching the top rung still below 0.90 does **not** cap the locus
    — it raises `needs-approach-redesign`: the current ladder is inadequate for this failure class and a *new method*
    is required (better model, different segmentation, manual transcription, corrected reference). The locus stays
    OPEN and blocks ship.
  - **Plateau ⇒ escalate, not abort (replaces the monotonic-improvement *stop*):** if attempt N+1 within a rung
    doesn't beat N by a min-delta, that **rung** is exhausted → **advance to the next rung**. A plateau across the
    *whole* ladder is the ladder-exhaustion alert above — never a locus abandonment.
  - **Trial-run resource budget (preliminary analysis only):** a measured token/$/time bound for *exploratory /
    calibration* runs so they can't fail infinitely. Hitting it **HALTS and ALERTS** ("budget exhausted before
    convergence — redesign before spending more"); it does **not** silently mark loci done or let a run report
    "complete". The *production* push to threshold carries **no acceptance-cap** — it is bounded only by "a fired
    safeguard stops for redesign."
  - **No `parked: bar-unreachable` terminal state.** Every locus not yet at threshold is an **OPEN** item that
    **blocks the deliverable** (Part 4 / §11) and is enumerated in the run's terminal ALERT.
  - **Continue-but-flag, never silently-skip:** an autonomous run MAY keep working *other* loci while a stuck locus
    is flagged `needs-approach-redesign` (throughput preserved) — but the terminal report **loudly lists every open
    locus and refuses to declare success** while any remain. Systemic failure (many loci firing, or budget
    exhaustion) escalates to a full halt-for-redesign.
  - **Enforced in `reocr_ladder.py`, not merely measured.** Autonomous only after Sir's explicit go-ahead.

**P3 — QC harness = `qc_audit.py` + `coverage-audit.json`** (built in the paradigm chosen at P2). Forward gate =
fixed localization + identity with the scoped re-OCR routing (§1.4). Backward gate = witness_count vs E(v) per
locus (incl. the transcribed owner, §1.1). Becomes the derived authority (§1.6) superseding tome-map. Verification:
every locus×source scored; no book-level pass/drop survives.

**P4 — Exhaustive re-OCR to E(v), worst-first = `reocr_ladder.py` (autonomous, under the P2 envelope).** Per-locus
escalation, only as far as needed: (1) baseline kraken → (2) layout-aware segmentation (column/verse-line/marginal-
inline-annotation split) → (3) region/half-page models → (4) multimodal **vision-LLM page reading**. **S02**
(hi-res 1609 OT, **Gen–Job only**) and **S9-OT2** (Psalms–2 Machabees) are the named first-wave gaps with
`reocr_needed=true` as **distinct sources** (not aliased to S1 volumes); S08 NT confirmed 800/800. Backward flags
drive source-by-source investigation.

**P5 — Apparatus, first-class.** Per-element, channel-typed (book-argument→book, chapter-argument→chapter,
footnote→verse, marginal-note→anchor, front/back-matter sections) into the Janvier coordinate tree. Identity refs:
modern Sabates→Madueke_b, archaic odr_com→s-dismas. Consensus per element; **cross-lineage ≥3-witness unblock**
(§1.5); SHORTFALL/NOVEL disposition applied; thin → warn. **Decide whether confirmed-novel spans render into
idx108/109 or only the overlay map** (+ insertion/ordering rule for material with no Janvier coordinate if they
render).

**P6 — Consensus rebuild + deliverables (autonomous).** Implement **two-stage MSA** (R3: Stage-1 scan-consensus →
Stage-2 cross-register scan-vs-transcribed) replacing the flat MSA. Rebuild `basis-db` from **PASS attestations
only**; render idx108 (modern) + idx109 (archaic everywhere incl. apparatus, **no modern fallbacks**) from the one
basis DB. Emit the source-overlay + confidence/error map (banded by depth_fraction × agreement_among_present ×
shortfall_flag) + per-source accounting. Register into Palimpsest gold + run the e2e handoff smoke test. Add the
**inbound contract test + version-pin on `spelling_glyph_model.fold_diplomatic`** (a Palimpsest-side fold change
must not silently re-score every gate).

**P7 — Final verification gate (ship gate; nothing below threshold passes).** idx108 ≥0.90 every chapter; idx109
≥0.90 where measurable + ſ-rule-conformance elsewhere; **every scripture chapter reaches E(v) at ≥0.90** — any
locus still short is an **OPEN `needs-approach-redesign` item that BLOCKS this gate** ("flagged" is an in-progress
state, never a ship state; a flagged-but-unresolved locus does **not** pass P7); apparatus cross-lineage 3-witness
unblock enforced; every coverage-audit source resolves to a master-source-list witness with
sha256/lineage/independent; Palimpsest ingest→apply→align smoke test green.

> Execution model (Sir): one deliberate pause after **P2**; **fully autonomous to completion** thereafter (report
> on completion or if blocked), **bounded by the P2 convergence-alerting envelope** (a fired safeguard halts for
approach-redesign; it never accepts a below-threshold locus — see the no-silent-degradation invariant). HOLD commit/push per §11.

---

## Part 3 — Critical files (reuse-first; grounded in current code)

**Remove / relocate the book-level gates — DONE (earlier this session, verified by `guard_no_book_gates.py`):**
- `ocr-spike/consensus_v2.py` — `COVER_FLOOR=0.5` REMOVED (const + gate-site); per-verse ATTEST + qc_audit char-identity are the only gates.
- `ocr-spike/build_tome_map.py` — `BOOK_FLOOR` + `NOISE_FRACTION` REMOVED; the audit supersedes book-level coverage.
- `.../originaldr_reconstruction/detect_our_ocr.py` — `BOOK_ALIAS_FLOOR` REMOVED; `resolve_alias` returns best alias unconditionally.
- **P0 addition (rev 2026-07-08 PM): DELETE the dead `ocr-spike/consensus_spike.py`.** It is banner-marked SUPERSEDED, has **no importers**, and `guard_no_book_gates.py` intentionally excludes it — but it still contains a `COVER_FLOOR=0.5` book-drop constant (L41/L248) that only executes if the file is run standalone. Deleting it (rather than keeping a neutralized artifact) is the strongest anti-drift posture per Sir's "protect from drift" directive.

**Modify:**
- `char_identity.py` (**P1a — CORRECTED rev 2026-07-08 PM**) — activate `edit_ratio` (Levenshtein) as the gate metric, difflib as skip-prefilter (`:89-94`); wire `long_s_rule.rule_pass` into the no-archaic-ref branch (`:107-109`, replacing the auto-pass); add `floor_modern` helper + f→s ſ-misread pre-check + unit tests.
- `consensus_v2.py` (**P1a + P6**) — **P1a fixes:** `conservation()` (L216) separate `n_present`/`n_all` + expose `depth_fraction` (stop normalizing entropy by padded gaps); `consensus()` (L241) exclude `"-"` from the plurality vote (silent gap-wins-plurality correctness bug). **P6:** char-level identity path (today `sim()` L89 token-level; `fold_tok` L55 / `archaic_tok` L67 stay); move `modern_match`/`archaic_match` (L431) to per-chapter/element gates; two-stage MSA (R3).
- `detect_our_ocr.py` (**P1a**) — replace order-blind **set-recall** in `tight_window`/`locate_region`/`_recall` (L271-299) with in-order matched-token coverage under a monotone-position constraint + `PREC_FLOOR ~0.25`; `ATTEST_THRESHOLD` (L85) calibrated at the P2 pilot. (The `_is_inline_annotation` contiguity content-signal is **already committed** — no change.) P5: upgrade `apparatus_record` (L334) to per-element, channel-typed.
- `acquisition/ocr_pipeline.py` — the escalation ladder atop `run_batch` (L208, currently bare `-a segment -bl`): layout-aware segmentation, column/half-page split, per-line confidence, **vision-LLM rung**, best-raster-only selection.
- `build_master_source_list.py` (**P0 — expanded rev 2026-07-08 PM**) — **unify the heterogeneous witness record shape** (single schema + `kind` discriminant); add `sha256` to the 14 scan witnesses (7 non-scan already have it), `lineage_group` (enum) + `independent` (bool) to all 21; keep individual-count, Madueke_a demotion, `archive-*` exclusion, S03+S04 grouping, E(v) columns.
- `build_consensus.py` / `build_basis_db.py` — element-level gating; char-identity fields.
- `sources/dr-sources-manifest.json` — add E(v) + ought-to-contain per source.

**Create:**
- `char_identity.py` — char-level normalized identity (modern fold + ſ-folded archaic), both-sides fold, reusing `spelling_glyph_model.py` §6.1 rules.
- `long_s_rule.py` — deterministic ſ-placement rule + validator (R12).
- `source_index.py` — per-source ought-to-contain index (manifest-seeded, detection-refined).
- `qc_audit.py` — the locus×source coverage audit (new authority) → `coverage-audit.json`(+sqlite); the double-bind engine (forward gate + backward E(v) flagging).
- `reocr_ladder.py` — escalation orchestrator (baseline → layout-aware → region/half-page → vision-LLM), per-locus method + resulting identity recorded.
- apparatus per-element localizer/typer — extend `apparatus_crossmap.py` (L39/L60, today binary/chapter-granular) + `build_apparatus_attestation.py` (channel counts → per-element localization).

**Reuse (don't reinvent):** `spelling_glyph_model.py` (fold rules), `marginalia-geometry.json` + `build_marginalia_geometry.py` (body/margin bands), `apparatus-cross-map.json`, `skeleton.json` (76 books/1360 ch oracle), `detect_s_dismas.py` `validate` (±3 versification tolerance) + `chapter_blocks`, `detect_sources.py` transcribed parsers, `consensus_v2` `align_to_anchor`/`ref_chapter_tokens`.

**Graduation + housekeeping (NEW rev 2026-07-08 PM):**
- **Split-brain:** the QC harness (`char_identity.py`, `consensus_v2.py`, `long_s_rule.py`, `master-source-list.json`) lives in **gitignored** `core/.scratch/originaldr-project/ocr-spike/`, reaching into the tracked `originaldr_reconstruction/` tree via a **hardcoded `sys.path.insert`** (`char_identity.py:31-34`). Before the §11 commit-hold lifts, **graduate the harness into the tracked reconstruction tree** and remove the absolute-path bridge — otherwise the P1a/P6 edits can't land cleanly.
- **`skeleton.json` ↔ Janvier enumeration:** if the BRAINSTORM is approved at P2, reconcile the 76-book/1360-ch oracle against Janvier's ODR enumeration (apparatus channels, apocrypha ordering, **Psalm numbering**) and re-anchor the Catholic-oracle 76/76 assertion — a **blocking sub-task** of that approval, not an afterthought.
- **Inbound coupling:** version-pin / contract-test `spelling_glyph_model.fold_diplomatic` (a Palimpsest-side fold change silently re-scores every char-identity gate).

---

## Part 4 — Verification

- **Harness:** the audit scores every locus×source for char-level modern + archaic identity, localization (contiguous), pass/fail, and witness_count vs E(v). No book-level pass/drop survives (grep the removed gates).
- **Pilot (Phase-2 gate):** eebo-vol4 Psalms localizes **>0 chapters** after contiguity fix + re-OCR; its verses clear the **governing gate** (archaic≥0.90 ſ-folded where an archaic ref exists — Psalms has s_dismas; modern≥0.90 only where none does); their consensus unblocks. Report real per-page cost incl. vision-LLM rung.
- **Coverage:** every scripture chapter reaches **E(v)** (NT=12, OT=6..10) or carries a warning + source-by-source investigation flag; every source that "ought to contain X" is checked (backward gate).
- **Apparatus:** per-element identity vs Sabates/odr_com; **cross-lineage** ≥3-witness unblock (≥1 outside Madueke/Sabates/Janvier); thin elements warned, not dropped; SHORTFALL/NOVEL kept, never dropped.
- **Provenance (NEW):** every source cited in `coverage-audit.json` resolves to a `master-source-list.json` witness carrying non-null `sha256` + `lineage_group` + `independent` — closes the §9 audit trail within this doc's scope.
- **Deliverable:** idx108 modern ≥0.90 every chapter; idx109 archaic ≥0.90 where measurable + ſ-rule conformance elsewhere; a 108-vs-109 diff shows apparatus deltas. **Asymmetric-pass (NEW):** the modern-PASS/archaic-FAIL locus renders per the sparkling §5/§9 rule (never a modern-for-archaic fallback; parity + `verify_map==[]` preserved).
- **Regression / hygiene:** anchors (**genesis, psalms, matthew**) re-pass — psalms added to match the calibration bracket; `pyright --outputjson` 0/0 on every touched module; current `consensus-full`/`tome-map`/`master-source-list` preserved as `.pre-QC-framework` baselines. **HOLD commit/push per §11.**

---

## Part 5 — Assumptions (RESOLVED where the 2026-07-08 PM review settled them)
- **Char metric — DECIDED:** normalized **Levenshtein** = `1 − editdist/max(len)` on the folded char stream, post-whitespace-collapse; ≥0.90 = pass. (Not difflib — difflib is a skip-prefilter only. See §1.4.)
- **Localization recall floor** — `ATTEST_THRESHOLD` + `PREC_FLOOR` are **calibrated at the P2 pilot** via ROC (§1.3), not assumed; contiguity is the harder gate.
- **Front/back-matter loci** use the apparatus rule (E(v) low; ≥3-witness unblock).
- **Modern reference** = Janvier/Sabates_A *bible text* for scoring (the reconciled `modern-standard.json` is for *rendering*, not scoring).
- **Deliverable ships** only when the completeness gate is met corpus-wide (consensus holds otherwise).
- **Merge on approval:** the 2026-07-08 PM review revision is folded into `sparkling-petting-gosling.md` (§0″ authoritative build order + §4.x/§5/§9 schema/rule updates) and into this doc (above); `.active-plan` repoints to this contract; scratchpad/compressed-context refreshed; `partitioned-snacking-feather.md` stays banner-superseded; `partitioned-mapping-lamport.md` retained as the approval record.

---

## Part 6 — Review traceability (2026-07-08 PM multi-agent adversarial review)

Source: workflow run `w7ojgfgxw` (46 agents — 5 reader digests → 5 review lenses [adversarial / technical / gaps / build-order / tdd] → per-finding adversarial verification → synthesis + completeness critic). **26 findings raised, 25 survived verification**; plus an **11-item completeness critique (3 high-severity)**. Every item's disposition is recorded below so nothing was silently dropped.

**Legend** — **FOLDED**: plan text updated in this revision (doc-change; also folds into `sparkling` §-edits where noted). **SCHEDULED Pn**: accepted, encoded as a Part 2 build-order step; code/impl held per §11. **DEFERRED Pn**: test/verification deferred to that phase. "code→Pn" = the corresponding code change is scheduled for that phase.

### A. Verified findings (25)

| # | Lens / Sev | Finding | Disposition | Landed |
|---|---|---|---|---|
| F1 | adversarial / **H** | 0.90 modern bar conflates OCR error with genuine Janvier-vs-1582 edition divergence — a perfect OCR can FAIL | FOLDED (code→P1a) | §1.4 scoped re-OCR triggers (short-locus intra-scan-family; 6-divergent-books signal-not-gate; `floor_modern` pre-check) |
| F2 | technical / M | `difflib.ratio` ≠ edit distance is the *live* gate; correct `edit_ratio` is dead code | FOLDED (code→P1a) | §1.4 metric DECIDED = normalized Levenshtein; `sparkling` §0′ |
| F3 | technical / **H** | Localization = order-blind set-recall, uncalibrated 0.5, no precision term → inflates E(v) | FOLDED (code→P1a) | §1.3 in-order matched-token coverage + `PREC_FLOOR`~0.25; calibrate@P2 |
| F4 | technical / M | Three folds disagree on long-ſ; no-archaic-ref branch auto-passes (defeats R12 on 24 OT books) | FOLDED (code→P1a) | §1.4 no-ref gate = `long_s_rule.rule_pass`; f→s ſ-misread pre-check |
| F5 | technical / M | MSA `conservation()` normalized by n (erases depth); gaps win plurality | FOLDED (code→P1a) | Part 3 Modify `consensus_v2`; `sparkling` §4.3/§7.2 depth_fraction |
| F6 | technical / M | Reference-BLAST under-specified on seeding + gapped chaining | FOLDED | BRAINSTORM §5 (spaced-seed char k-mers; affine-gap chaining DP `g(d)=a+b·d`; weighted interval-scheduling; LIS dropped) |
| F7 | gaps / L | Reciprocal OriginalDR→Palimpsest gold-set handoff never specified | FOLDED | `sparkling` §9 handoff path + e2e smoke test |
| F8 | gaps / M | Verse-grain vs chapter-grain identity is an open fork the E(v) gate depends on | FOLDED, **REVISED 2026-07-10** | §1.1/§1.4 now **uniform verse/element grain** (Sir); drift absorbed in the localization JOIN, not by coarsening scoring grain (supersedes the earlier verse=modern/chapter=archaic split) |
| F9 | gaps / M | Apparatus coordinate-authority + correlated-source unblock loophole | FOLDED | §1.5 one-lineage-vote independence floor + key-space-only content rule; §10.4/§10.5 DECIDED |
| F10 | gaps / M | `coverage-audit.json` and basis-db are two disconnected authorities | FOLDED | §1.6 derived-view of basis-db (join key `element.id`); `sparkling` §4.6 schema |
| F11 | gaps / M | `sources-registry.json` orphaned; no provenance spine on witnesses | FOLDED (code→P0) | Part 2 P0 + Part 3 Modify `build_master_source_list` (sha256/lineage_group/independent); Part 4 check |
| F12 | gaps / L | Novel-OCR spans lack an ID grammar | FOLDED | §1.5 `apparatus/novel/{book}/{ch}/{page}/{reading_order_idx}` + promotion rule |
| F13 | gaps / M | Error/uncertainty uses 3 unreconciled thresholds + 2 vocabularies | FOLDED | `sparkling` §12.4 delete stale 0.85; §7.2 banding; §1.4 metric named |
| F14 | buildorder / M | P2 pilot gate under-specifies cost / kill-criteria | FOLDED (reframed 2026-07-10) | Part 2 P2 decision-forcing + convergence-alerting envelope — "kill-criteria" are alert-and-redesign triggers, NOT locus-acceptance (see C1 + no-silent-degradation invariant) |
| F15 | buildorder / M | S02 (1609 OT, 10pp OCR'd) silently caps OT E(v); not in Phase-0 sizing | SCHEDULED P4 | Part 2 P4 S02/S08 named worst-first, `reocr_needed=true`, distinct from S1 |
| F16 | buildorder / M | BRAINSTORM proposes a different build order that would rebuild Phase 1 | FOLDED | Part 2 P2 forces BRAINSTORM approve/defer BEFORE `qc_audit.py` |
| F17 | buildorder / L | Two-stage MSA (R3) scheduled last, silently dropped from dijkstra | SCHEDULED P6 | Part 2 P6 R3 explicit; open-decision logged; `feather` pointer |
| F18 | buildorder / M | `reocr_ladder.py` vision-LLM rung has zero measured baseline | SCHEDULED P2/P4 (code→skeletal ladder pre-pilot) | Part 2 P2 measures rung cost/time; P4 ladder |
| F19 | tdd / **H** | QC harness modules have zero pytest coverage; self-checks aren't gates | DEFERRED P0–P7 | tdd validation stages per phase; `guard_no_book_gates` highest-urgency |
| F20 | tdd / M | 0.90 + 0.5 are magic numbers; ROC calibration protocol never built | FOLDED (code→P2) | §1.3/§1.4 calibrate@P2; ROC gold → committed fixture |
| F21 | tdd / **H** | Committed tests freeze pre-QC state as invariants the rebuild will break | DEFERRED P4→P5 | test-migration gate (xfail Phase-1 snapshots) before P6 regen |
| F22 | tdd / M | No runnable per-phase acceptance gate; pilot can't be objectively judged | DEFERRED | `pilot-result.json` + `test_coverage_audit_schema` (recomputed `pass`) |
| F23 | tdd / M | No coverage/identity regression ratchet for the autonomous re-OCR loop | DEFERRED P3 | `qc_audit.py --check-baseline` (non-decreasing pass + mean-identity) |
| F24 | tdd / M | Anchor set (genesis, matthew) too weak — no columnar/apparatus anchor | FOLDED + DEFERRED P2 | Part 4 psalms added to anchors; Phase-2 pilot-gate test |
| F25 | tdd / L | BRAINSTORM would rebuild the localization axis; no paradigm gate on the harness | FOLDED + DEFERRED | §10.2 fork + Part 2 P2 forces paradigm; backend-agnostic schema-contract test |

### B. Completeness-critique items (11 — the critic's "what's missing" pass)

| # | Sev | Item | Disposition | Landed |
|---|---|---|---|---|
| C1 | **H** | Phase-3 autonomy envelope unspecified — the review originally proposed a budget cap, per-locus escalation ceiling, monotonic-improvement stop, and a "parked" terminal state | FOLDED, then **REVISED 2026-07-10** (enforcement code→P4) | Part 2 P2 **convergence-alerting** envelope. NB: the review's original ceiling/stop/parked mechanisms were **rejected** as silent-degradation (they laundered locus-failure into run-success, the same anti-pattern as the book gates). Reframed: ladder-exhaustion → `needs-approach-redesign` (open, blocks ship); plateau → escalate rung; budget → halt+alert for *trial* runs only; no `parked` terminal state. See the no-silent-degradation invariant. |
| C2 | **H** | Backward double-bind gate has no owner/algorithm for the TRANSCRIBED-source path; `source_index.py` denominator fork unresolved | FOLDED | §1.1 backward-gate transcribed owner (`source_index` manifest-seeded + detection-refined; transcribed shortfall → re-parse + human-review) |
| C3 | **H** | Deliverable-parity: what ships at a modern-PASS / archaic-FAIL locus is unspecified (vs §10.8 no-fallback + §9 parity) | FOLDED | Part 4 asymmetric-pass; `sparkling` §5/§9 rule (no modern-for-archaic fallback; parity + `verify_map==[]` preserved) |
| C4 | M | MSL schema heterogeneous across witness kinds; sha256 already on the 7 non-scan witnesses (contradicts "all 21") | FOLDED | Part 3 unify witness record FIRST; add sha256 to the 14 scans only; lineage/independent to all 21 |
| C5 | M | `guard` file-coverage unverified; a live `COVER_FLOOR=0.5` still sits in `consensus_spike.py:248` | RESOLVED | `consensus_spike.py` verified DEAD (no importers, guard-excluded) → **DELETE** (Part 3 Remove); guard scans the tracked gate files |
| C6 | M | `skeleton.json` (76/1360 oracle) ↔ Janvier ODR enumeration reconciliation is a data-migration risk | FOLDED | Blocking sub-task of the BRAINSTORM approval (Part 2 P2 / §10) — re-anchor the 76/76 oracle |
| C7 | M | Psalms Vulgate-vs-Masoretic numbering never called out — yet Psalms is the pilot slice | FOLDED | Part 2 P2 Psalms-numbering pre-check before committing the pilot |
| C8 | M | No test for double-bind INTEGRATION or the consensus gap/plurality fix | DEFERRED P1a | conservation test (present-plurality beats gaps; depth_fraction exposed) + backward-gate integration test |
| C9 | M | Inbound coupling: `spelling_glyph_model.fold_diplomatic` can silently re-score every gate; unpinned | FOLDED (code→P1) | `sparkling` §9 inbound contract test + version-pin; graduation note |
| C10 | M | Confirmed-novel render disposition (idx108/109 vs overlay-only) unspecified | FOLDED | §1.5 render/insertion decision settled at P5 |
| C11 | L | `.scratch/` live code vs tracked `reconstruction/` fixtures split-brain; hardcoded `sys.path` bridge | FOLDED | Graduation note (`.scratch`→tracked); migration sequenced against the §11 hold |

**Not adopted as-written (reviewer over-reach, corrected during my critical pass):** the critic's "all 21 witnesses lack sha256" (7 already carry it — C4); the "expanded-window inconsistency" sub-claim in F3 (`locate_region` re-scores, so no inconsistency — dropped); the non-metric/triangle-inequality objection in F2 (correct math, irrelevant to threshold gating — dropped from spec); `rapidfuzz`/`Bio.Align` dependency in F2 (pure-Python `edit_ratio` suffices at these string lengths).

---

# === DESIGN BRAINSTORM 2026-07-08 (post-gate-extirpation): Localization–Identity Collapse, Cue-First Segmentation, Janvier-Canonical Coordinate Frame ===

> STATUS: BRAINSTORM, not yet approved for build. Captures the Jarvis↔Sir design chat after the four book-level gates were extirpated. Kept here as the single home for these ideas ("one place for later review and digestion"). Supersedes nothing yet; refines Phase 1 (§Parts 1–3 above).

## 0. Origin — why we reopened the localization/identity design
After extirpating the four book-level gates (COVER_FLOOR / NOISE_FRACTION / BOOK_FLOOR / BOOK_ALIAS_FLOOR — see §Part 3; enforced by `guard_no_book_gates.py`), Sir asked how per-verse localization + identity are actually computed, then proposed **collapsing the two axes into one coordinate-anchored operation**. This section records that redesign.

## 1. Two axes today (grounded in code)
- **Localization / attestation (live gate):** token/type-level *set-recall* of a verse's word-skeletons within a located window. `_recall = |probe_types ∩ window_types| / |probe_types|` (`detect_our_ocr.py:271`). Two paths: `tight_window` sliding best-recall (detect), and chapter-`difflib`-align → per-verse sub-span recall (`consensus_v2.extract_source_verses:174–185`). Gate = `ATTEST_THRESHOLD 0.5`. Answers WHERE + IS-IT-HERE; tolerant of char noise.
- **Identity (not yet the gate):** char-level `difflib.ratio` on folded char streams, TWO refs at once — `fold_modern` skeleton vs Janvier (content) and `fold_archaic` light fold vs s_dismas (surface); PASS iff modern≥0.90 AND (archaic≥0.90 | no archaic ref). `char_identity.py:evaluate_locus`. Today only informs a per-CHAPTER token match (`consensus_v2:431–445`); qc_audit is where it should become the per-locus forward gate.
- Genome analogy: localization = breadth-of-coverage / read-mapping (did the k-mers map, and where); identity = percent-identity of the alignment (base-level fidelity once mapped); two folds = degenerate/AA-level vs base/strain-level identity against two reference genomes.

## 2. The collapse (Sir's core move)
Once every source is skeleton-keyed, **localization becomes a coordinate JOIN** ("does source X have a record at `scripture/b/c/v`?" — a lookup, not a search) and **identity becomes a per-cell string-diff** computed once and attached to the cell. PASS = present-at-coordinate AND modern≥0.90 AND (archaic≥0.90 | no archaic ref). One metric family, two thresholds (present-floor + 0.90 identity), calibrated empirically.

## 3. The catch: coordinates are FREE for transcribed sources, DERIVED for OCR
`reads/{name}.json` already keys every transcribed source (sabates_a/Janvier, s_dismas, odr_com, madueke_b) by `skeleton_id = scripture/{book}/{ch}/{v}` — because those inputs arrive pre-structured. OCR arrives as pixels → **lines with bbox+text** (kraken `-a segment -bl` → ALTO → `d["lines"]`), with NO b/c/v tags. `load_stream` currently *flattens* those lines into one token stream (`detect_our_ocr.py:239–260`), discarding line structure + geometry after the body/margin split. So the schema is identical, but for OCR it is the OUTPUT of a (currently fuzzy) localization step, not a free input. **Segmenting OCR into skeleton cells is the real hard step.**

## 4. Cue-first segmentation (the "a human knows where they are" insight)
The page image carries the same navigation a human uses — running heads (book name), chapter rubrics ("CHAP. IV."), verse numerals, folio/signature marks, drop-caps — and we discard all of it, then reconstruct by fuzzy match. Fix: **preserve OCR lines as typed records** (page, bbox, reading-order idx, text) and TAG each: running-head / chapter-rubric / verse-start(leading numeral) / body / inline-annotation / marginal. Use cues to place coarse coordinates FIRST (collapses search from "this book" to "this chapter's ~2 pages"), reference-match as verification/fallback (blackletter garbles cues — "CHAP." header variance already measured). Two corroborating localization signals = same double-bind ethos as the rest of the plan. Currently only `_PAGENUM` (from filename) + `_INLINE_ANNOT` `(x)` are detected; running-head/rubric/numeral parsers are net-new.

## 5. Reference-BLAST + collinear chaining (OCR fine segmentation)
Model each reference element as a QUERY, the cue-reduced OCR lines as the SUBJECT db; seed-and-extend → HSPs → **chain collinear hits under monotonicity** → reconstruct each element's span. Natively fixes the structural pathologies: **column-split** (two HSPs, stitched by query), **page-overrun** (HSPs across pages), **shared line** (queries N and N+1 partition one line by which wins each sub-span). OCR lines that no query hits = **novel material** (apparatus/marginalia the reference lacks) — surfaced, not discarded (accessory vs core genome). NB `extract_source_verses` is already a crude chapter-scoped instance of this; the redesign generalizes it to element-level queries + cue-reduced bands + explicit chaining + first-class "novel".

**Under-specs resolved (rev 2026-07-08 PM) — three algorithm choices, so this is buildable, not hand-wavy:**
1. **Seeding = character n-grams / spaced seeds, NOT whole-word.** Blackletter OCR substitutes and splits *within* words (ſ→f, rn→m, hyphen-break), so a whole-word seed index misses precisely where we need recall. Seed on **char k-mers (k≈4–5)** with **spaced seeds** (e.g. `11011011`, don't-care positions) so a seed survives a mid-word substitution — the standard BLAST/PatternHunter sensitivity move. Extend seeds into HSPs with a banded char-level alignment. (Whole-word matching stays only as the cheap `char_ratio` skip-prefilter from §1.4.)
2. **Chaining = affine-gap collinear-chaining DP, DROP LIS.** Plain LIS maximizes *count* of collinear HSPs and is blind to how far apart they sit, so it cannot distinguish a legitimate column-jump from a spurious cross-page leap. Use a **chaining DP with an affine gap penalty** `g(d) = a + b·d` (open cost `a`, per-unit extend `b` on the query/subject offset gap `d`); the recurrence `chain(i) = score(HSP_i) + max_{j≺i}[chain(j) − g(gap(j,i))]` prefers tight collinear runs and *charges* for the column/page jump rather than ignoring it. Affine (not linear) so one big structural jump (column→column) is cheap to open once, while many small drifts are penalized — matches real print layout.
3. **Conflict resolution = greedy interval-scheduling for one-span-to-one-element.** After chaining, a subject sub-span may be claimed by two queries (the **shared-line** case). Resolve as **weighted interval scheduling**: each (query, chained-span) is an interval with weight = chain score; take the max-weight non-overlapping set greedily by descending score, assigning each OCR sub-span to exactly **one** element. Leftover unclaimed intervals → **novel** channel (§10.4). This replaces the vague "Smith-Waterman over blocks" — SW is the per-HSP extend, interval-scheduling is the cross-query arbitration.

**Sequencing note — start with the transcribed outer-join, not the OCR segmenter.** This whole BLAST machinery is needed **only for OCR** (§3: transcribed sources join by coordinate for free). So P1a builds `qc_audit.py` on the transcribed outer-join first (proves the identity-metric collapse at zero segmentation risk), and the BLAST segmenter (P1b) is spiked on the 2 calibration books *after* the metric is validated — see Part 2 build order and fork §10.2.

## 6. JANVIER IS THE CANONICAL COORDINATE AUTHORITY (repo scrape 2026-07-08)
Cloned `github.com/janvier-s/douayrheimsbible` → `GitRepos/douayrheimsbible` (SvelteKit; 8,483 JSON in `static/data`; license "all rights reserved, source available for reference" — note: `sabates_a`/Janvier already in our pipeline). Data is organized as **typed channels** (top-level dirs): `odr/` (the Original-DR spine, 512 files), `cpdv/` (modern), `conf*`/`conf-commentary`/`conf-footnotes`/`conf-front`/`conf-back` (Confraternity), `drc-notes`/`drc-crossrefs`, `cpdv-notes`, `haydock-commentary`/`haydock-crossrefs`, `knox-notes`, `fathers/`.

**The ODR book file (`odr/{book}.json`) is a complete nested coordinate tree** (schema `src/lib/data/types.ts`):
```
BookData: {book, book_title, short_title, hebrew_title,
  intros[]:     BookIntro{title,text,notes[],default}   # BOOK argument / front matter
  endMatters[]:                                          # BACK matter
  chapters[]:   Chapter{
     chapter, summary(=CHAPTER argument), summary_notes[]{marker,text}, articles[],
     verses[]:  Verse{verse, text, has_annotation, cross_refs[]{text}, notes[]{label,text}}}}
+ sidecar odr/{book}/annotations/{NNN}.json:
     ChapterAnnotations{chapter, annotations[]{verse, part, title, text, notes[]{marker,text}}}
```
**Inline markers embed apparatus KEYS directly in the verse text:** `<cr>[N]</cr>` = cross-ref (numeric, →`cross_refs[N]`), `<na>` = annotation anchor (7984 occ.), `<sc>`/`<i>` = typography, `<alt>` = alt reading; annotation bodies carry `<mn>[N]</mn>` marginal-note sub-markers. `isCrossRef(marker)`: numeric = cross-ref, letter = footnote/note. **These are the same printed cues that appear in the physical 1582/1610 prints → and therefore in our OCR** (we already route `(x)` inline keys to the apparatus stream).

## 7. The elegant collapse Janvier enables
- **Canonical locus id (scripture + apparatus), from Janvier's own tree:**
  - scripture verse: `scripture/{book}/{ch}/{v}`
  - chapter argument: `apparatus/chapter_argument/{book}/{ch}` (+ `summary_notes` marker)
  - book argument / front / back: `apparatus/book_intro/{book}/{i}`, `.../front/{slot}`, `.../back/{slot}`
  - cross-ref: `apparatus/cross_ref/{book}/{ch}/{v}/{n}` (numeric marker)
  - verse note / margin note: `apparatus/note/{book}/{ch}/{v}/{label}` (letter marker)
  - annotation: `apparatus/annotation/{book}/{ch}/{v}/{part}` (+ `<mn>` sub-markers)
  The **marker is the coordinate** and it is the edition's own reference apparatus — shared between digital Janvier and printed OCR. Not invented by us.
- **Transcribed sources need NO localization** — they join to Janvier by coordinate. The ONLY place segmentation is required is OCR, and there the printed markers (cross-ref numerals, note letters, verse numbers, chapter rubrics) are **hard anchors** for both scripture and apparatus alignment.
- **Apparatus attestation = marker-keyed join within a verse neighborhood**, mirroring scripture's verse-keyed join. Extensible: OCR marker not in Janvier → novel; Janvier marker absent in OCR → shortfall (backward gate now covers apparatus too).
- Genome analogy sharpens: Janvier's tree = fully-annotated REFERENCE GENOME with feature annotations (verses=genes, apparatus=regulatory/annotation features at coordinates, markers=tagged landmark loci); other sources = samples aligned to it; OCR = noisy long-reads anchored on the landmark markers; novel OCR = structural insertions.

## 8. Lift-over plan (Sabates/Janvier canonical)
- **Adopt Janvier's ODR tree as the coordinate spine for ALL content** (scripture + apparatus). Our `skeleton.json` becomes a projection/index of it (it already enumerates channels; Janvier populates them).
- **Madueke_b → Janvier:** scripture already skeleton-keyed; apparatus (`apparatus_blocks[]{book,chapter,kind,text}`, 1334) matched into Janvier channels by (book, chapter, kind, text-sim).
- **s_dismas, odr_com → Janvier:** scripture already keyed (note known versal drift, e.g. s_dismas Gen 1:25 +1 → keep chapter-level archaic identity); apparatus lifted where present.
- **OCR → Janvier:** cue-first + reference-BLAST segmentation into the same id space; apparatus via marker-keyed anchoring.
- Effort: transcribed *scripture* ≈ done; *apparatus* lift-over + OCR segmenter are the real work (Phase-4-sized for apparatus).

## 9. How this reduces (not increases) dropped OCR
- Outer-join on a fully-populated coordinate frame ⇒ **no book-level (or now, no apparatus-level) cell to drop**; every locus is a row: matched / missing / novel.
- Mangled verse = low-identity row → re-OCR worklist, never silent.
- Novel OCR spans (no reference coordinate) = surfaced candidate apparatus (esp. Rheims-note-heavy pages), not discarded as "unlocated noise".
- Backward E(v) gate now extends to apparatus (Janvier gives every note/crossref a coordinate to check sources against).
- Marker-anchored alignment is more robust than fuzzy text-match on the hard columnar cases (Psalms).

## 10. Open decisions / forks (three DECIDED by the 2026-07-08 PM review; rest fall out of the pilot)
1. **Verse-grain vs chapter-grain BLAST — DECIDED, then REVISED 2026-07-10 (Sir): uniform verse/element grain for BOTH references.** Archaic is no longer coarsened to chapter grain; versal drift is absorbed in the localization JOIN (`detect_s_dismas.validate` ±3) so reads are correctly skeleton-keyed before per-verse scoring. Archaic-identity is **preeminent** where present and scored per verse/element; modern governs only where no archaic reference exists — see **§1.4** (and §1.1 grain). No longer open.
2. **Prove-on-transcribed-first vs OCR-segmenter-first** — prototype outer-join + per-cell identity on already-structured transcribed sources immediately (zero segmentation risk, proves the metric collapse), while spiking the typed-line/cue/BLAST segmenter on 2 calibration books in parallel. Jarvis lean: both in parallel. (Sequencing detail, settled at P1a/P1b in Part 2.)
3. **Calibration** — genesis@S06 (clean prose) + psalms@eebo-vol4 (columnar) as the two bracket books; sweep length-diff + string-diff cutoffs off the ROC rather than guessing. (Operationalized as the P2 pilot ROC calibration, §1.3.)
4. **Janvier completeness caveat — DECIDED:** Janvier is the canonical COORDINATE FRAME + modern-content ref, but is NOT treated as omniscient on apparatus selection. A reference marker absent in OCR = **SHORTFALL**; an OCR marker/​span absent from Janvier = **NOVEL** — both are first-class dispositions kept and investigated, never dropped, per the SHORTFALL/NOVEL grammar and novel-span id in **§1.5**. No longer open.
5. **Coordinate-authority reconciliation — DECIDED:** cross-lineage disagreement is recorded as a **variant, never a drop**. Janvier/Sabates and Madueke_b (+ s_dismas) count as **one lineage vote** (they share provenance), so a presence/text disagreement between them does not manufacture an independent witness; it is logged against the locus and surfaced for review under the independence-floor rule in **§1.5**. No longer open.
6. Slack policy + PASS-cell flow (→ re-OCR worklist, consensus-fuse, confidence map) expected to fall out of 2–3.

## 11. Proposed build order (if approved)
1. Ingest Janvier ODR tree → canonical `locus-index.json` (scripture + apparatus coordinates + markers).
2. `qc_audit.py` v1 = outer-join over transcribed sources (coordinate join + per-cell `evaluate_locus`) — proves the collapse with zero segmentation risk.
3. Typed-line OCR model + cue parsers (running-head/rubric/numeral) + reference-BLAST/chaining segmenter — spiked on the 2 calibration books.
4. Fold OCR sources into the same outer-join; wire novel-material + backward-E(v) flags → re-OCR worklist.
5. Apparatus lift-over (Madueke_b/s_dismas/odr_com) + marker-keyed OCR apparatus.
6. Consensus reads only PASS cells; deliverable confidence/error map is the outer-join projected.
