# Prose Forge Phase 0: findings

**Date:** 2026-09-08
**Owner:** W3:Jarvis-dev
**Plan:** `projects/project-aion/plans/prose-forge-research-and-plan-2026-09-08.md`
**Code:** `infrastructure/prose-forge/`
**Status:** Phase 0 gate **PASSED**. Rules that discriminate exist, and they are named below.

---

## The gate, and the answer

Phase 0 asked one question: *can we state, with numbers, which existing rules separate Archon
prose from Sir's?* The stated risk was that none would, because `sloptrim` reports a 3.3%
true-positive rate on Claude 3.5 Sonnet and our Archons run something newer.

**They do.** Of 132 vale-ai-tells rules, 102 fired at all, and the top of the table separates the
arms by more than an order of magnitude. The project proceeds to Phase 1 as planned, with the
rule-pruning list below.

---

## 1. What was built

| Component | Path | Function |
|---|---|---|
| `prose-corpus` | `infrastructure/prose-forge/corpus/build_corpus.py` | Extracts and labels the paired corpus. Deterministic |
| Rule baseline | `infrastructure/prose-forge/corpus/measure_rules.py` | Length-matched per-rule fire rates |
| Vendored rules | `infrastructure/prose-forge/styles/ai-tells/` | 132 rule files, Vale 3.20.0 |

Corpus build runs in 2.5 seconds over 550 transcripts. Rule measurement takes 103 seconds.

---

## 2. The corpus, and the contamination that nearly ruined it

**Three arms built.** Records are deduplicated and the split is by content hash, so the same
record always lands on the same side regardless of run order.

| Arm | Records | Words | Median | p90 | Max |
|---|---|---|---|---|---|
| archon-conversational | 11,872 | 896,719 | 24 | 219 | 4,240 |
| archon-document | 161 | 223,915 | 651 | 3,534 | 6,962 |
| human-conversational | 1,019 | 171,735 | 49 | 390 | 15,368 |

### 2.1 The human arm was 40% machine text

This is the most important operational finding of Phase 0. A naive read puts every `type:user`
record in the human arm. That is wrong in five distinct ways, and each was found by inspection
rather than by reasoning:

| Source | Removed | What it is |
|---|---|---|
| Tool results | 28,681 | `user` records whose content is a `tool_result` list, not a typed prompt |
| Harness text | 425 | `<local-command-caveat>`, `<command-name>` echoes, `[Image: …]` placeholders |
| Machine injections | 604 | See below |
| Duplicates | 1,166 | Fork-and-resume copies a transcript's history into the child |

The machine-injection category is the dangerous one, because those records look like prose and are
long. Four emitters were identified:

- **`Watcher here …`** — written by the JICM watcher daemon.
- **JICM resume nudges** and context-restoration blocks.
- **`<task-notification>`** — subagent completion reports, delivered as a user turn.
- **`This session is being continued from a previous conversation …`** — **the autocompact summary,
  which is written by Claude.**

The last one matters most. It arrives as a long `user` record, so it carried disproportionate word
mass. Before filtering, records of 500 words or more were 7.5% of human records but **46.3% of
human words**, and most of that tail was machine-authored.

Filtering took the human arm from 286,929 words to 171,735. **Forty percent of the apparent human
corpus was machine text**, concentrated in exactly the long-form records that a stylometric
measurement weights most heavily. Left in, it would have taught the instrument to call Archon prose
human, which is the precise failure the project exists to prevent.

### 2.2 The symlink trap

`~/.claude/projects/` contains slug directories that are symlinks to one real directory:
`-Users-nathanielcannon-Claude-Project-Aion` and `…Project_Aion` both resolve to `…Claude-Jarvis`,
confirmed by identical inodes. Walking them by path counts the same 630 MB three times.
Deduplication is by `(st_dev, st_ino)`.

---

## 3. Rule baseline

Method: the Archon arm is resampled to match the human arm's word-count histogram bucket by
bucket, because nearly every rule fires more in longer text and an unmatched comparison would
measure length and call it style. Rates are per 1,000 words. Each record is written to its own file
so document-scoped rules keep their intended scope. Ratios carry a half-hit floor so a 0-versus-3
rule cannot read as infinite.

Matched sample: 1,019 records and 171,735 words human, 1,019 records and 165,277 words Archon.

### 3.1 Strongest discriminators

| Rule | human/1k | archon/1k | ratio | hits h/a |
|---|---|---|---|---|
| `EmphaticCopula` | 0.000 | 0.387 | 134.0 | 0 / 64 |
| `AnthropomorphicJustification` | 0.000 | 0.163 | 57.2 | 0 / 27 |
| `ExplainerHeadings` | 0.000 | 0.157 | 55.1 | 0 / 26 |
| `SummativeAppositive` | 0.000 | 0.151 | 53.0 | 0 / 25 |
| `FigurativeFires` | 0.000 | 0.109 | 38.5 | 0 / 18 |
| `FigurativeStays` | 0.006 | 0.188 | 21.8 | 1 / 31 |
| `ListIntroductions` | 0.000 | 0.054 | 19.7 | 0 / 9 |
| `FigurativeSits` | 0.006 | 0.157 | 18.4 | 1 / 26 |
| `FigurativeLands` | 0.023 | 0.363 | 14.0 | 4 / 60 |
| **`CataphoricForecasting`** | **0.151** | **1.809** | **11.7** | **26 / 299** |
| `LabelAndExplain` | 0.041 | 0.333 | 7.7 | 7 / 55 |

**`CataphoricForecasting` is the most valuable rule in the pack.** It has both the largest absolute
volume (299 Archon hits) and a clean 11.7x separation, so its ratio rests on real counts rather
than a handful. Inspected matches: *"Two zeros in"*, *"Three live claims"*, *"The three named"*,
*"The four commits"*, *"The two steps"*. Numbered lead-ins are a genuine and pervasive habit.

`SummativeAppositive` is equally genuine on inspection: *", which is exactly how"*, *", which is
precisely what"*, *", which is exactly why"*.

### 3.2 Rules that fire MORE on Sir's prose

These are the ones N2 predicted, and finding them is the point of calibrating on our own corpus.

| Rule | human/1k | archon/1k | ratio | hits h/a |
|---|---|---|---|---|
| `NegatedPair` | 0.256 | 0.012 | 0.06 | 44 / 2 |
| `DoubleHyphen` | 2.364 | 0.133 | 0.06 | 406 / 22 |
| `SequencingMarkers` | 0.029 | 0.000 | 0.09 | 5 / 0 |
| `StackedHedges` | 0.018 | 0.000 | 0.15 | 3 / 0 |
| `OpeningCliches` | 0.018 | 0.000 | 0.15 | 3 / 0 |
| `AIAdjectiveNounPairs` | 0.052 | 0.006 | 0.16 | 9 / 1 |
| `OverusedVocabularyVerbs` | 0.047 | 0.006 | 0.18 | 8 / 1 |

`DoubleHyphen` is the instructive case, and it is not a style finding at all. Its 406 hits on Sir's
text break down as 239 instances of `---` (markdown horizontal rules and YAML frontmatter) and the
remainder CLI flags: `--input-dir`, `--output-dir`, `--version`, `--task-dir`, `--model`. The rule
is measuring **pasted technical content**, not punctuation. It must be scoped to exclude code
spans and fenced blocks, or dropped.

A rule shipped as an AI tell that fires eighteen times more often on the human than the machine is
not merely useless. It actively points the wrong way, and would have contributed a false signal to
any composite score.

---

## 4. Limitations, stated plainly

**The genre confound is not fully controlled.** Length is matched; genre is not. Sir writes
*instructions*; the Archon arm is *explanations*. Some of the measured separation is that
difference rather than authorship. Confirming these rules separate Sir's prose from Archon prose
requires a same-genre comparison, which needs a **human-document arm we do not yet have**.

**`EmphaticCopula` is partly a formatting artifact.** Its matches are `*not*`, `*is*`, `*was*`,
`*or*` — italicised function words. That is a real habit of mine, but it measures markdown emphasis
usage, and Sir rarely uses markdown in prompts. It would not transfer cleanly to plain prose.
Treat its 134x as an upper bound.

**Vale's own scoping is inherited.** Rules were run at their shipped severity and scope. The
recalibration in Phase 1 should re-scope rather than only keep or drop.

**One arm is missing entirely.** No `human-document` arm exists, because attributing document
authorship in the repository is not solved: git author is `CannonCoPilot` for both of us. Candidate
sources are older files predating Archon involvement, and any prose Sir marks as his.

---

## 5. What Phase 1 inherits

**Keep and prioritise.** `CataphoricForecasting` first, on volume and clean separation. Then
`SummativeAppositive`, `AnthropomorphicJustification`, `ExplainerHeadings`, `ListIntroductions`,
`LabelAndExplain`, and the figurative-verb family.

**Re-scope before dropping.** `DoubleHyphen` needs code-span exclusion. Re-measure after.

**Drop or invert.** `NegatedPair`, `SequencingMarkers`, `StackedHedges`, `OpeningCliches`,
`AIAdjectiveNounPairs`, `OverusedVocabularyVerbs`. Each fires more on Sir than on us.

**Thirty rules never fired.** They cost nothing but should not be shipped as though calibrated.

**Build the human-document arm.** It is the missing control, and until it exists every ratio here
carries the genre caveat.

---

## 6. Reproduction

```bash
cd /Users/nathanielcannon/Claude/Project_Aion
infrastructure/.venv/bin/python infrastructure/prose-forge/corpus/build_corpus.py
infrastructure/.venv/bin/python infrastructure/prose-forge/corpus/measure_rules.py
```

Outputs land in `infrastructure/prose-forge/out/` (gitignored): `manifest.json`, `arms/*.jsonl`,
`rule_baseline.json` with the full 102-rule table. Requires `vale` on `PATH` (3.20.0, `brew install
vale`) and a `vale sync` to populate `styles/`.
