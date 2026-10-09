# Handoff: Palimpsest and OriginalDR, Jarvis to Fielding

**Opened:** 2026-10-09 by W0:Jarvis, at Sir's instruction.
**Working with:** W3:Jarvis-dev (builds Fielding) and Fielding (receives the projects).
**After handoff:** Jarvis supervises all Archon projects. Fielding owns these two.

Every path below was checked on disk on 2026-10-09. Nothing here is from memory alone.

---

## 1. The rule that governs this handoff

**Seed Fielding from primary sources, never from my derived tiers.**

My graph (`jarvis-core`) and my sessions collection were written by a small local model
summarising my sessions. On these projects they carry errors that read as fact:

| tier | example found 2026-10-09 | truth |
|---|---|---|
| L5 graph `jarvis-core` | "Plate Tool writes to the Class register" | Two separate tools. The register is a report of classes; the Plate Tool is the leaf editor. Sir had to ask which was which. |
| L4 `sessions` | checkpoint lists `Project_Aion/witness/plates/img/`, `208-plate-set/`, `B-leaves/` | None exist. Witness lives in the **palimpsest** repo. |

So: **do not bulk-copy `jarvis-core` or `sessions` into Fielding's stores.** Build Fielding's
L4 and L5 by ingesting the primary documents in §3, and let its graph grow from its own sessions.
Fielding may still READ `jarvis-core` (read-any is already wired); it should treat those facts
as leads to verify, not as ground truth.

---

## 2. Memory tiers: what Fielding needs in each

Template is W6:Fleming, the newest Archon: `.claude/personas/fleming/CLAUDE.md`,
`.claude/context/.scratchpad.fleming.md`, RAG `fleming-{context,research,sessions,codebase}`,
graph `fleming-core`. Lane wiring touches `aion-inbox.sh`, `aion-lane-restart.sh`,
`jicm-actuate.sh`, `jicm-config.sh`, `jicm-watcher.sh`, `launch-aion.sh` (commit `0fe6cd9`),
and the RAG namespace landed in `d40c540`. **Jarvis-dev owns this wiring.**

| tier | Fielding gets | source | action |
|---|---|---|---|
| **L1** scratchpad | `.scratchpad.fielding.md` | my OriginalDR section of `.claude/context/.scratchpad.md` | I write a clean, verified extract (§5). Not a copy: mine mixes in Aion-wide items. |
| **L2** persona + memory | `personas/fielding/CLAUDE.md`, its own `MEMORY.md` | the memory files in §4 | Move the project-specific ones; **copy** the method ones (both Archons need them). |
| **L3** checkpoint | none at start | n/a | Starts empty. A transferred checkpoint would carry my session's inversions. |
| **L4** RAG | `fielding-{context,research,codebase,sessions}` | §3 documents | Ingest primary docs. `fielding-sessions` starts **empty**. |
| **L5** graph | `fielding-core` | none at start | Grows from Fielding's own sessions. Optionally seed by ingesting §3 docs as episodes, never by copying edges. |

---

## 3. Primary sources (the canon)

### OriginalDR — repo `Claude/Projects/palimpsest/projects/originaldr/ocr-spike/`

**Read first, in this order:**

| file | lines | why |
|---|---|---|
| `witness/plates/REVIEW-STATE.md` | 223 | gold-layout state, the 208/238 sets, what is reviewed |
| `witness/plates/SIR-REVIEW-2026-09-01.md` | 233 | seven findings with `file:line`; Finding 5 is why the Plate Tool exists |
| `witness/plates/DETECT-PROBE-2026-09-03.md` | 294 | detection floor/cap (R16.19/R16.20), adopted |
| `witness/cold-read/FABLE-COLD-READ-B-2026-09-04.md` | 72 | the director-design cold read of 54 B leaves |
| `witness/plates/BOX-BIAS-2026-09-15.md` | 76 | what Sir's 31 corrections say about the director's boxes |
| `Project_Aion/.claude/context/reference/ocr-suite-rules.md` | | suite rules. **Lives in Project_Aion, not palimpsest.** |

**Large reference docs** (ingest to RAG, don't force-load): `OCR-ROADMAP.md` (5,166 lines),
`CHAPTER-WORKFLOW.md` (665), `CAMPAIGN-STATUS.md` (538, **stale**: its 0.8576/0.8669 board is
~500 cells behind; live board was 0.9392 on 2026-09-04).

**Code and data:** `witness/plate_tool.py` (730), `witness/plate_gold.py` (418, the only sanctioned
reader of the gold record), `witness/test_plate_gold.py` (7 tests, run with `python3 -m pytest`),
`witness/score_box_bias.py`, `witness/cold-read/cold-read-B.json`, `witness/plates/gold-layout.json`,
`witness/plates/gold-set-1-proposed.json`, `witness/plates/skew-survey-B.json`,
`witness/cold-read/register-build/build_register_B.py`.

**Moved 2026-10-09** to `Projects/Fielding/research/originaldr/lector-review-2026-09-03/` (sha256-identical,
15 files, credential-swept; awaits Fielding's root commit, original kept until then). Was:
`Project_Aion/.claude/scratch/lector-review-2026-09-03/` is the distilled
doc corpus (1,943 lines from 13,087, every claim `file:line`; read its `README.md` first). It sits
in a **gitignored** scratch folder. It should move to a tracked location Fielding owns before
anything else, or a cleanup erases it.

### Palimpsest platform — repo `Claude/Projects/palimpsest/`

My platform knowledge is **dated**: memories from June and July 2026, and the priorities line in my
`MEMORY.md` from 2026-08-01. Since August all my palimpsest work has been inside `originaldr/`.
**I cannot vouch for the platform's current state.** Fielding should establish it from the repo,
starting with the audit remediation items (4 critical/high bugs, warnings, coverage gaps) named in
`project_palimpsest_phase1.md`, and verify each is still open.

---

## 4. Memory files (`~/.claude/projects/-Users-nathanielcannon-Claude-Project-Aion/memory/`)

**MOVE to Fielding** (project-specific; remove from my index once Fielding holds them):
`project_palimpsest_phase1.md` · `project_palimpsest_gold_eval.md` ·
`project_palimpsest_fastapi_model_scope.md` · `project_originaldr_reocr_path.md` ·
`project_originaldr_standing_corrections.md` · `project_genesis_walkthrough.md` ·
`feedback_palimpsest_iterate_autonomy.md` · `feedback_palimpsest_param_classification.md` ·
`feedback_diplomatic_transcription_rules.md` · `reference_palimpsest_frontend_typecheck.md` ·
`reference_kraken_calamari_finetune_gotchas.md` · `reference_qwen3vl_thinking_lock.md` ·
`reference_gold_audit_precision_method.md`

**COPY** (method lessons learned on these projects, still needed by a supervisor):
`reference_dead_metric_and_blind_gold.md` · `reference_instrument_independence_and_bars.md` ·
`reference_test_contrasts_and_label_blindness.md` · `reference_two_cause_signal_suppression.md` ·
`reference_clean_room_probe_hides_dominant_variable.md` · `reference_gold_addressing_and_enumeration.md` ·
`reference_chaotic_model_ab_testing.md` · `feedback_no_silent_degradation.md` ·
`feedback_show_dont_tell_visual_first.md` · `feedback_prose_style_sir.md` · `feedback_complexity_not_hours.md`

Each moved file should be **re-read and re-verified** as it lands. Several name files and flags;
the memory rule is to verify a named thing still exists before relying on it.

---

## 5. OriginalDR state at handoff (verified 2026-10-09)

No commits since 2026-09-15. State is exactly as follows.

**Design:** LECTOR is a **director agent**: a reasoning model steers, detectors are tools (Sir,
2026-09-04). The standard is frontier-model judgement, hand-corrected by Sir in the Plate Tool, then
locked. The old cascade is unplugged, kept as a tool. R14.15 must not start.

**Gold record** `witness/plates/gold-layout.json`: 33 leaves touched. **31 corrected, 0 accepted.**
All 31 have zero open `??`, so all are eligible to accept today. Until some are accepted,
`plate_gold.is_gold` returns nothing and no scorer can use them.

**Box bias** (`BOX-BIAS-2026-09-15.md`): Sir moved 362 of 391 kept boxes, reclassified 0. Classes
right, geometry wrong. Median box sits ~0.007 page-heights low: bound from the type body, not the
ink. Brief only: **no blind shift of cold-read boxes**, it would launder the signal.

**Plate Tool** `witness/plate_tool.py`, port 8765. Page deskew and verified column-shear dewarp
(`colshear-v1`) are in the record; provisional classes live in the record's `classes_added`.
Known defect: the `moved` flag over-reports (379 flagged vs 362 real) because a page-angle change
marks every region. The verse-number rows view is **diagnostic only**: Sir ruled that relations
(numeral to verse) are a post-hoc pass after region and text gold, not a correction target now.

**Open, owed by Sir:** (1) accept the ready 31 leaves; (2) class rulings exported to
`witness/cold-read/class-rulings.json` (still absent); (3) Gold Set 1 approval (19 leaves proposed,
full cover of 27 classes); (4) the OT-1635-M role question (holds 20 leaves).

**Next build after acceptances:** wire `plate_gold.is_gold` into the scorers in place of the
hardcoded `LEAF_LO/LEAF_HI` window, then score the director against accepted leaves.

**Live artifacts** (republish to the same URL): Class Register
`claude.ai/code/artifact/5e285c57-44a0-4f26-b6e9-639e4a70b2d1` · Reprioritisation report
`claude.ai/code/artifact/eeb5d063-3372-46d6-8462-ef4db915d244`. Both were published from my
session; Fielding can update them by URL.

---

## 6. What stays with Jarvis (not part of this handoff)

- **Postgres password rotation.** Shared by `jarvis`, `chronicler` and `n8n`; Aion-wide, not
  project-specific. Runbook `.claude/scratch/postgres-rotation-runbook.md`. Still not run.
- **Unpushed commits** in palimpsest: **21** ahead of origin (corrected 2026-10-09; the scratchpad's "five"
  predated later work). Repo is **PUBLIC**. Full-diff credential sweep clean (host value only). Push awaits
  Sir. **Pushed 2026-10-09** (`79936db..ff5d0bc`), so the commit ban on Fielding is lifted.
- **Shared checkout.** Palimpsest is a shared working tree. Stage by explicit path, never `-A`.
  This rule transfers to Fielding as-is.

---

## 7. Handoff checklist

- [~] Jarvis-dev: Fielding persona, lane (aion:12), scratchpad, `fielding-*` RAG (registered), `fielding-core` graph. Home `Projects/Fielding` (own repo, no remote yet)
- [x] Jarvis: move `lector-review-2026-09-03/` → `Projects/Fielding/research/originaldr/` (verified; in Fielding root commit `e7023ec`). Scratch original kept until Fielding's repo has a remote
- [x] Jarvis: pushed the **21** palimpsest commits on Sir's approval (2026-10-09, `79936db..ff5d0bc`; swept clean first). Fielding may commit there
- [x] Jarvis: write `Project_Aion/.claude/context/.scratchpad.fielding.md` from §5 (`e3e217c`, 71 lines; path measured by dev)
- [x] Jarvis-dev: copy ALL §4 files to `~/.claude/projects/-Users-nathanielcannon-Claude-Projects-Fielding/memory/`, re-verifying (re-checked 2026-10-09 21:4xZ: all 24 listed present, 33 files incl. Fielding MEMORY.md); then Jarvis removes MOVE entries from its index
- [ ] Jarvis: triage the **43 uncommitted palimpsest entries** (13 M, 30 untracked; flagged by Fielding 2026-10-09). `.archive-consensus-full.pre-r9.4b/` + `OriginalDRnotes` believed Sir's: leave untouched
- [x] Jarvis: rulings to Fielding 2026-10-09 — work 109 (dr-original) INDEX HOLD STAYS (modern apparatus; 199 modern fallbacks; OCR-consensus input not clearable of fabricated S01/S08); work-101 LDS gold map defect CONFIRMED (no D&C entry; Moroni spans 1.03M chars) → Fielding fixes the generator after handoff
- [x] Jarvis-dev: ingest §3 primary docs into `fielding-*` RAG: all 11 PROSE docs (6 in fielding-context, 5 in fielding-research; re-checked 2026-10-09). Code and JSON (plate_tool.py, gold-*.json, ...) deliberately NOT ingested: read from the repo, since a RAG copy of code goes stale on its first edit
- [ ] Fielding: read §3 "read first" list; confirm state in §5 against the repo
- [ ] Fielding: establish Palimpsest platform state from the repo (§3)
- [x] Jarvis: removed the 13 MOVE entries from `MEMORY.md` (2026-10-09, after verifying all 24 §4 files in Fielding's memory dir: 23 byte-identical, `project_genesis_walkthrough` = dev's annotated path fix); index 151→140; supervisor role recorded
- [ ] Jarvis-dev: ingest lector-review A–E (`A-masterplan` … `E-code`, 1,943 ln) into `fielding-research`; only its README went in (plan §3 did not ask — my omission)
- [ ] Sir: confirm the handoff is complete; Fielding takes the next OriginalDR turn
