# OriginalDR — Plan Revision 2026-07-08 (PM): QC-Machinery Correctness First, Doc Reconciliation, Decision-Forcing Pilot

> **✅ APPROVAL RECORD (banner added 2026-07-08 PM) — FOLDED IN, DO NOT EDIT FURTHER.** This is the approved
> plan-mode output that authorized the revision. Its content has been folded end-to-end into the two spine docs
> per Planning-Doc-Discipline (update-in-place, don't fork): the authoritative **P0–P7 build order + QC contract +
> resolved forks + TDD gates** now live in **`partitioned-watching-dijkstra.md`** (active execution contract,
> Parts 1–6 incl. the review traceability table) and **`sparkling-petting-gosling.md`** (§0′ master summary +
> §4.3/§4.5/§4.6/§5/§7.2/§9/§12.4 schema/rule updates). `.active-plan` points at **dijkstra**. This file is
> retained only as the dated evidence trail of the approval; edits go to the spine docs.

## Context — why this revision exists

You asked for a thorough critical review of the 13 OriginalDR/Palimpsest planning docs — find/fill gaps, clarify
ambiguities, connect stages, refine the build order, **add test-driven validation stages**, then synthesize and
**update the planning docs end-to-end**. That review ran as a 46-agent adversarial workflow (5 parallel readers →
5 review lenses: adversarial/technical/gaps/build-order/tdd → per-finding verification → synthesis + completeness
critic). It returned **25 verified findings** in 5 themes, a 13-action synthesis, and an 11-item completeness
critique. I then did my own critical pass, verifying the highest-stakes and most-conflicting claims against the
actual code.

**What this plan authorizes:** updating the two spine planning docs (`sparkling-petting-gosling.md` master +
`partitioned-watching-dijkstra.md` active contract) end-to-end to encode the revised build order, resolved forks,
and TDD gates below. **Code changes remain under the §11 commit-hold and the "one pause after the P2 pilot"
execution model** — the revised build order becomes the *content* of the updated docs, not work executed now.

**The core diagnosis (my words, confirmed against code):** the plan's top-level *contract* is sound — locus-level
QC, double-bind coverage, no book-level gates, two gold works from one basis DB. The risk is entirely in the **QC
measurement machinery the contract rests on**: the identity engine, the localization gate, and the consensus
statistics are each mis-built or half-built today, and the "new authority" (`qc_audit.py`/`coverage-audit.json`)
does not exist yet. Build order must therefore fix the cheap, paradigm-independent measurement primitives *first*,
force the one architectural decision (Janvier-canonical collapse) *at* the pilot, and only then build the harness.

---

## My critical-pass corrections to the review (I verified these against the code, did not rubber-stamp)

1. **Theme A confirmed accurate.** `char_identity.py:89-94` — `modern_identity`/`archaic_identity` call `char_ratio`
   (difflib) as the live gate; `edit_ratio` (Levenshtein, `:71-86`) is **dead code**. `evaluate_locus:109` sets
   `archaic_pass = (not archaic_ref_exists) or …` — i.e. **auto-passes** the archaic gate for the 24 later-OT
   books with no s_dismas reference, defeating R12. The self-check even documents the auto-pass as intended. The
   three cheapest, highest-value fixes are correctly grounded.

2. **The completeness-critic OVERSTATED the `consensus_spike.py` "live gate."** Ground truth: the file carries an
   explicit `SUPERSEDED / DEAD — DO NOT RUN` banner, **nothing imports it** (verified — only self-references), and
   `guard_no_book_gates.py` *intentionally* excludes it (guard line 18; its `LIVE_FILES` are exactly
   `consensus_v2.py`, `build_tome_map.py`, `detect_our_ocr.py`). The `COVER_FLOOR=0.5` at `:248` only executes if
   the dead file is run standalone — it is **not reachable in the live pipeline**, so it is *not* a contract
   violation. Severity is LOW, and the clean fix is to **delete the dead file** (strongest anti-drift posture,
   matching your "protect from drift" directive) — not "verify the guard covers a reachable gate."

3. **The critic's sha256/schema correction is right; the synthesis was imprecise.** Verified: 14 scan witnesses
   (S1–S15, no S7) lack `sha256`; **all 21** lack `lineage_group`/`independent`; the 7 non-scan witnesses **already
   carry `sha256`**. The record schema is genuinely **heterogeneous** across witness kinds (three disjoint
   key-sets). So P0 must add sha256 to the 14 scans only, add lineage/independent to all 21, and **unify the
   record shape first** so the `coverage-audit` join key is stable.

4. **Split-brain confirmed in real time.** The synthesis's doc-change-map placed `char_identity.py` in the tracked
   `reconstruction/` dir; the Read errored — it actually lives in `.scratch/…/ocr-spike/` (gitignored), reaching
   into the tracked tree via a hardcoded `sys.path.insert` (`char_identity.py:31-34`). The QC harness must
   **graduate from `.scratch/` to the tracked tree** (removing the hardcoded bridge) before the §11 hold lifts, or
   the edits can't land cleanly.

---

## Revised end-to-end build order (this becomes the docs' authoritative sequence)

Reordered so paradigm-independent correctness fixes and doc reconciliation precede the harness, and the pilot is
decision-forcing. High-severity completeness-critic additions are folded in as **[NEW]**.

- **P0 — Provenance spine + gate-removal verification (no paradigm dependency).**
  Unify the `master-source-list.json` witness record shape (single schema + discriminant); add `sha256` to the 14
  scan witnesses, `lineage_group` (enum) + `independent` (bool) to all 21; update `build_master_source_list.py`.
  Confirm `guard_no_book_gates.py` green over its 3 live files. **Delete the dead `consensus_spike.py`** (my
  correction #2). Drop the orphaned `sources-registry.json` concept — `master-source-list.json` is the denominator.

- **P1a — Fix the measurement primitives (paradigm-independent, cheap, mandatory before any harness).**
  (1) `char_identity.py`: activate `edit_ratio` as the gate metric, difflib as skip-prefilter; wire
  `long_s_rule.rule_pass` into the no-archaic-ref branch; add a `floor_modern` edition-divergence helper; add an
  f→s ſ-misread pre-check + unit tests. (2) `detect_our_ocr.py:271-299`: replace order-blind set-recall with
  in-order matched-token coverage + a precision floor (`PREC_FLOOR ~0.25`). (3) `consensus_v2.py`: fix
  `conservation()` to separate `n_present`/`n_all` + expose `depth_fraction`; fix `consensus()` to exclude `"-"`
  from the plurality vote (silent gap-wins-plurality correctness bug). All survive whichever paradigm the pilot
  picks.

- **P1b — Doc reconciliation (spec-only; settle the contract before the harness builds to it).**
  Delete the stale `0.85` archaic threshold (sparkling §12.4:797); resolve the char-metric fork to
  normalized-Levenshtein (dijkstra:126, sparkling §1.4); make `basis-db` the single authority and
  `coverage-audit.json` a derived view (add `{modern_id,archaic_id,localized,pass}` to the attestation record,
  `{witness_count,E_v,shortfall_flag}` to consensus — sparkling §4.6); add the apparatus cross-lineage-independence
  floor + Janvier-coordinate-key-space-only content rule + SHORTFALL/NOVEL disposition + novel-span ID grammar
  (dijkstra §1.5); state the verse/chapter **dual-grain** architecture as decided (dijkstra §1.1/§1.4); add the
  reciprocal Palimpsest-handoff paragraph (sparkling §9). **[NEW]** Add the **asymmetric-pass deliverable rule**:
  what idx108/idx109 emit at a locus that passes modern but fails archaic (reconcile with "confidence-not-fallback"
  §10.8 + "structural parity" §9). **[NEW]** Assign an **owner + algorithm to the BACKWARD double-bind gate for
  transcribed sources** (resolve `source_index.py` manifest-seeded-then-detection-refined; define what a
  transcribed shortfall triggers — re-parse/human-review, since there's no re-OCR analog).

- **P2 — PILOT (eebo-vol4 Psalms + S06; the single human checkpoint; DECISION-FORCING).**
  Run to conclusion on the P1a-fixed primitives and produce a committed `pilot-report.json` that answers:
  (a) does contiguity-fix + layout-aware re-OCR unlock >0 Psalms chapters at ≥0.90; (b) **ROC-calibrated**
  `ATTEST_THRESHOLD` and the identity bar on a ≥20-verse hand-labelled Genesis+Psalms gold (promoted to a committed
  fixture); (c) the **BRAINSTORM approve/defer decision** (Janvier-canonical coordinate-collapse) — this gates P3's
  architecture; (d) verse-vs-chapter grain confirmed; (e) first measured **vision-LLM per-page cost/time**.
  **[NEW] Blocking pre-check:** verify Douay-Rheims **Vulgate vs Masoretic Psalm numbering** against Janvier's
  `odr/psalms.json` before committing Psalms as the slice — a whole-Psalm coordinate offset would break the pilot
  on the exact slice meant to prove the collapse. **[NEW] Autonomy safety envelope** (co-equal pilot deliverable):
  a hard token/$ budget for the P3/P4 fan-out (from measured per-page vision cost × loci-below-E(v)), a
  max-escalation-attempts-per-locus ceiling, a monotonic-improvement stop rule, and an explicit terminal
  "parked: bar-unreachable" state — **enforced in `reocr_ladder.py`, not just measured.** Autonomous only after
  your explicit go-ahead here.

- **P3 — QC harness = `qc_audit.py` + `coverage-audit.json`** (built in the paradigm chosen at P2). Forward gate =
  fixed localization + identity with scoped re-OCR routing (short-locus intra-scan-family; the 6 divergent books —
  Acts, 2Paralipomenon, 2Esdras, Romans, Mark, Psalms — as signal-not-gate; `floor_modern` pre-check). Backward
  gate = witness_count vs E(v) shortfall flagging per locus (incl. the transcribed-source owner from P1b). Becomes
  the derived authority superseding tome-map.

- **P4 — Exhaustive re-OCR, worst-first = `reocr_ladder.py`.** Per-locus escalation (baseline kraken → layout-aware
  → region/half-page → vision-LLM), only as far as needed, under the P2 safety envelope. Fully autonomous. S02
  (hi-res 1609 OT, Gen–Job only) and S9-OT2 (Psalms–2 Mac) are the named first-wave gaps; S08 confirmed 800/800.

- **P5 — Apparatus first-class.** Per-element channel-typed localization into the Janvier coordinate tree; modern
  (Sabates→Madueke_b) + archaic (odr_com→s-dismas) surfaces; consensus per element with the cross-lineage
  ≥3-witness unblock; SHORTFALL/NOVEL disposition applied; **[NEW]** decide whether confirmed-novel spans render
  into idx108/109 or only the overlay map (+ insertion/ordering rule if they render).

- **P6 — Consensus rebuild + deliverables.** Implement two-stage MSA (R3: Stage-1 scan-consensus, Stage-2
  cross-register) replacing flat MSA; rebuild basis-db from PASS attestations only; render idx108 (modern) + idx109
  (archaic, no fallbacks) from the one basis DB; build the source-overlay + confidence/error map (banded by
  depth_fraction × agreement_among_present × shortfall_flag) + per-source accounting; register into Palimpsest gold
  + run the e2e handoff smoke test. **[NEW]** Add an **inbound contract test + version-pin on
  `spelling_glyph_model.fold_diplomatic`** so a Palimpsest-side fold change can't silently re-score every gate.

- **P7 — Final verification gate.** idx108 ≥0.90 every chapter; idx109 ≥0.90 where measurable + ſ-rule-conformance
  elsewhere; every scripture chapter reaches E(v) or is flagged; apparatus cross-lineage 3-witness unblock
  enforced; every coverage-audit source resolves to a master-source-list witness with sha256/lineage/independent;
  Palimpsest ingest→apply→align smoke test green. Commit/push HELD pending explicit approval.

---

## TDD validation gates (one runnable acceptance test per phase — the review's biggest ask)

- **P0:** `test_master_source_list_complete` — every witness has sha256 (14 scans specifically) + lineage_group in
  enum + explicit independent; `guard_no_book_gates.py` exits 0; `consensus_spike.py` absent.
- **P1a:** `test_char_identity` (gate calls edit_ratio; ſ→f passage fails long_s_rule + archaic_pass when no ref +
  scores <0.90 when ref present); `test_localization` (scrambled-order probe scores below in-order; 3× diluted
  window fails PREC_FLOOR); `test_conservation` (4 present agree "god" + 5 absent → consensus "god" not "-",
  agreement=1.0=topn/n_present, depth_fraction=4/E_v separate).
- **P1b:** grep-guard — no `0.85` archaic threshold anywhere; char metric named once (normalized Levenshtein);
  §4.6 records carry the new fields; §1.5 has the independence floor + SHORTFALL/NOVEL rule + novel-span grammar;
  asymmetric-pass rule present; backward-gate owner named.
- **P2:** `pilot-report.json` asserts >0 Psalms chapters ≥0.90; calibrated thresholds + ROC recorded; BRAINSTORM +
  grain decisions recorded; measured vision-LLM cost recorded; **safety-envelope ceilings recorded + your
  go-ahead logged** before P3.
- **P3:** `test_qc_audit` — every locus×source scored; no book-level drop; a divergent-book locus (modern<0.90,
  archaic≥0.90) is NOT re-OCR-flagged; a 1-witness short apparatus locus is parked not looped; each scripture
  chapter reaches E(v) or carries shortfall_flag.
- **P4:** `test_reocr_ladder` — escalates only as far as needed, stops at first clearing rung (no needless vision
  calls); S02/S9-OT2 present with reocr_needed=true as distinct sources; re-run on passing locus = no-op;
  budget/attempt ceilings enforced.
- **P5:** `test_apparatus` — element carries channel type + both surfaces; ≥3-unblock fires only with ≥1
  out-of-lineage witness; Janvier-only→SHORTFALL (kept, flagged); print-only→NOVEL (kept, novel/ id).
- **P6:** `test_two_stage_msa`; `test_render_parity` (idx108/109 identical structure; idx109 zero modern-fallback +
  ſ-conformance ≥0.90); `test_error_map`; inbound fold-contract test.
- **P7:** `test_originaldr_e2e` — idx108/109 thresholds; every coverage-audit source resolves to a witness with
  provenance fields; apply idx108 → workspace-resident → word-overlap alignment vs idx100 Challoner completes.

---

## Doc change map (the edits this approval authorizes; Planning-Doc-Discipline: update in place, don't fork)

- **`sparkling-petting-gosling.md`** (master): §12.4:797 delete stale 0.85 → 0.90; §4.6 extend attestation +
  consensus records + declare basis-db single authority / coverage-audit derived view; §4.3/§7.2 error-map banding
  + Janvier+Madueke_b+Sabates = one lineage vote; §4.4/§4.5 novel/shortfall disposition; §5/§9 asymmetric-pass
  deliverable rule + reciprocal-handoff paragraph + sha256/lineage/independent audit check; §0′ note edit-distance
  is the identity function. Replace the confusing 4-strata top with a single **"Current authoritative build order
  (P0–P7)"** block; keep the dated revision strata below it as the evidence trail (the docs' own convention).
- **`partitioned-watching-dijkstra.md`** (active contract): line 126 resolve metric fork → normalized Levenshtein;
  §1.1/§1.4 dual-grain decided + scoped re-OCR-trigger rules + long_s_rule as the no-ref archaic gate; §1.3
  order-aware localization + PREC_FLOOR; §1.5 cross-lineage independence floor + key-space-only rule +
  SHORTFALL/NOVEL + novel-span grammar `apparatus/novel/{book}/{ch}/{page}/{reading_order_idx}`; §1.6 coverage-audit
  = derived view; Part 2 reorder to P0/P1a/P1b→P2(decision-forcing + safety envelope)→P3+; Part 3 add
  `build_master_source_list.py`, `consensus_v2.conservation()/consensus()`, `detect_our_ocr.py:271-299`,
  delete `consensus_spike.py`, note the .scratch→tracked graduation; Part 4 add the provenance-resolution check;
  Part 5 (BRAINSTORM) resolve the 3 BLAST under-specs (char n-gram seeding, affine-gap collinear chaining, greedy
  interval-scheduling), drop LIS, start with transcribed outer-join.
- **`partitioned-snacking-feather.md`**: no content change (SUPERSEDED, evidence trail); optional 1-line pointer
  that R3→P6 and R10→P0 provenance spine.
- **Code files (execution-deferred under §11; documented in the plan, edited only after P2 pilot / your
  go-ahead):** `char_identity.py`, `detect_our_ocr.py`, `consensus_v2.py`, `master-source-list.json` +
  `build_master_source_list.py`; CREATE `qc_audit.py`, `reocr_ladder.py`, `coverage-audit.json`.

---

## Open decisions — my recommendations (confirm or redirect at approval)

1. **BRAINSTORM approve/defer (Janvier-canonical collapse):** *Rec — decide at the P2 pilot, not now.* The plan
   builds paradigm-independent fixes first, so nothing is wasted either way; the pilot gives empirical data to
   decide. (Resolves the biggest throwaway-work risk without a premature call.)
2. **P3/P4 autonomy cost ceiling** *(genuinely your policy call):* *Rec — set a default hard ceiling now* (e.g.
   pause for re-approval if projected vision-LLM fan-out > a set $ or > a set wall-clock), refined by the pilot's
   measured per-page number. I'll propose concrete defaults in the doc; adjust to your risk tolerance.
3. **Verse vs chapter grain:** *Rec — dual-grain* (localize+count at verse grain via Janvier JOIN; identity at
   chapter grain for versal-drift archaic sources, verse grain for stable modern spine). Already implicit in
   dijkstra §10.1.
4. **Apparatus coordinate authority (Madueke_b vs Janvier):** *Rec — Janvier defines key-space only; content is
   consensus; disagreements are variant pileups, Janvier never wins on content.*
5. **Two-stage MSA (R3) scheduling:** *Rec — P6, not retrofitted now* (current flat consensus-full is
   non-compliant regardless; rebuilding early wastes compute before QC/re-OCR change the inputs).
6. **Psalms as pilot slice:** *Rec — keep it, but gate on the Vulgate/Masoretic numbering pre-check* (cheap, and
   it's the columnar poster-child worth proving on).
7. **This approval's scope:** *Rec — doc updates only now* (sparkling + dijkstra); code stays under §11 hold and
   the one-pause-after-pilot model. The revised build order is doc content, not work I start today.

---

## Verification (how we'll know the doc update is done right)

- Both spine docs read as one coherent current plan: a single authoritative P0–P7 build order at the top, evidence
  strata preserved below, no dangling "SUPERSEDES §X" that a reader must chase to reconstruct the live plan.
- Grep-clean: no stale `0.85` archaic threshold; the char metric named exactly once as normalized Levenshtein;
  every §4.6 record carries the new fields; §1.5 carries the independence floor + SHORTFALL/NOVEL + novel-span
  grammar.
- Every one of the 25 findings + 3 high-severity critique additions maps to a concrete doc change or an explicit
  "deferred to execution" note (traceability table appended to the dijkstra revision).
- `.active-plan` repointed; scratchpad + compressed-context refreshed; `partitioned-snacking-feather.md` remains
  banner-superseded. **HOLD commit/push per §11.**
