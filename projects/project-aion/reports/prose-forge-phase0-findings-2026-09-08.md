# Prose Forge Phase 0: findings

**Date:** 2026-09-08
**Owner:** W3:Jarvis-dev
**Plan:** `projects/project-aion/plans/prose-forge-research-and-plan-2026-09-08.md`
**Code:** `infrastructure/prose-forge/`
**Status:** Phase 0 gate **PASSED**, both carry-overs **CLOSED**. Rules that discriminate exist.

> ⚠️ **READ THE ADDENDUM FIRST.** Section 3 is a CROSS-GENRE comparison and is superseded.
> The same-genre table in Addendum C is the one Phase 1 calibrates against; its ratios are
> roughly a third of section 3's, because much of that separation was genre, not authorship.

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

---

# Addendum: carry-overs closed, 2026-09-08

## A. Watermark on Opus 5 output: NOT DETERMINABLE

Closed as a negative result rather than left open. Four independent blockers:

1. **Coverage unstated.** Anthropic's support article still reads, verbatim: *"Models currently
   supported include Fable 5.1 and Mythos 5.1."* No Opus model appears. Earlier models are
   described only as ones Anthropic is "working to add marking support" for.
2. **Detector gated.** Text-watermark detection remains in private preview, restricted to
   organisations with a legal obligation to verify. There is no self-serve path.
3. **No public text checker.** The free Claude Content Checker covers *files* carrying C2PA
   Content Credentials, not embedded text watermarks.
4. **No probe channel.** Generating controlled samples for a black-box presence test would require
   calling the Anthropic API directly, which standing policy forbids.

A scheme-specific open detector cannot substitute. MarkLLM's detectors only find their own
schemes, so a null result against KGW says nothing about an unpublished Anthropic scheme. Running
it would be a dead metric: a test whose negative result is uninformative.

**Design impact: none.** The ledger already carries an explicit `unknown, vendor detector gated`
state for exactly this case, which is why the design chose reporting over scrubbing.

**Revisit triggers:** an Opus model appearing on the supported list, or the detection API opening
beyond private preview.

## B. Human-document arm: BUILT

The blocker was that git author is `CannonCoPilot` for both of us, so document authorship is not
attributable from history. Solved from a different direction: **long-form prose Sir typed into
prompts is document-register human prose**, and its provenance is certain.

The obstacle was that the contamination had moved from between records to inside them. The longest
human record is 15,368 words and is a kernel panic log with roughly 1,700 words of Sir's framing
around it. Several others are AutoEval build logs behind a sentence of introduction.

`corpus/deprose.py` strips machine output line by line: fenced blocks, timestamped log lines,
shell prompts, tracebacks, bare paths and hashes, and symbol-dense lines below an alphabetic
ratio floor. It is deliberately conservative, since a dropped log line costs nothing but a dropped
sentence biases the arm we are characterising.

Validated before use, which is the point:

| Record | Before | After | Kept |
|---|---|---|---|
| kernel panic report | 15,368 | 1,667 | 11% |
| review brief (pure prose) | 1,806 | 1,806 | **100%** |
| "Whoa there cowboy" (pure prose) | 1,661 | 1,661 | **100%** |
| AutoEval log + framing | 1,198 | 641 | 54% |

Across the whole human arm, 87.9% of words survive. The stripper guts logs and leaves prose intact.

**Final arms:**

| Arm | Records | Words | Median | p90 | Max |
|---|---|---|---|---|---|
| archon-conversational | 12,002 | 904,156 | 24 | 219 | 4,240 |
| archon-document | 162 | 225,515 | 653 | 3,618 | 6,962 |
| human-conversational | 806 | 56,311 | 31 | 230 | 248 |
| **human-document** | **193** | **94,724** | **390** | **908** | **1,806** |

## C. The same-genre baseline, and how much it revises

Running document against document removes the genre confound flagged as the main limitation.
**It matters. Ratios collapse by roughly two thirds.**

| Rule | cross-genre ratio | same-genre ratio | same-genre hits h/a |
|---|---|---|---|
| `EmphaticCopula` | 134.0 | **16.6** | 0 / 6 |
| `CataphoricForecasting` | 11.7 | **5.07** | 12 / 49 |
| `ExplainerHeadings` | 55.1 | **11.5** | 0 / 4 |
| `AnthropomorphicJustification` | 57.2 | **8.96** | 0 / 3 |

So a large part of the headline separation in section 3 was Sir-writes-instructions against
Archon-writes-explanations. The cross-genre table should not be used for rule selection. **The
same-genre table supersedes it**, and is the one Phase 1 calibrates against.

**Strongest same-genre discriminators**, ordered by trustworthiness rather than ratio:

| Rule | human/1k | archon/1k | ratio | hits h/a |
|---|---|---|---|---|
| **`ColonUsage`** | **2.470** | **11.771** | **4.76** | **234 / 871** |
| `CataphoricForecasting` | 0.127 | 0.662 | 5.07 | 12 / 49 |
| `ShipOveruse` | 0.095 | 0.500 | 5.05 | 9 / 37 |
| `ConsequenceParticiple` | 0.032 | 0.419 | 11.52 | 3 / 31 |
| `ContrastiveNegation` | 0.021 | 0.203 | 7.94 | 2 / 15 |
| `Metacommentary` | 0.011 | 0.162 | 10.67 | 1 / 12 |
| `FigurativeLands` | 0.011 | 0.162 | 10.67 | 1 / 12 |

**`ColonUsage` is now the single most valuable rule.** It has by far the largest counts (871
against 234), so its 4.76x rests on volume rather than a handful of hits. The rules above it by
ratio all sit on single-digit Archon counts and should be treated as suggestive until they
accumulate.

**Reversed rules in document register**, all to be dropped or re-scoped:

| Rule | human/1k | archon/1k | ratio | hits h/a |
|---|---|---|---|---|
| `NegatedPair` | 0.454 | 0.013 | 0.04 | 43 / 1 |
| `BareHolds` | 0.401 | 0.013 | 0.05 | 38 / 1 |
| `DoubleHyphen` | 3.072 | 0.284 | 0.09 | 291 / 21 |
| `HedgingPhrases` | 0.074 | 0.000 | 0.09 | 7 / 0 |
| `FigurativeCarries` | 0.908 | 0.081 | 0.10 | 86 / 6 |
| `RestatementMarkers` | 0.063 | 0.000 | 0.10 | 6 / 0 |
| `FillerPhrases` | 0.169 | 0.013 | 0.12 | 16 / 1 |
| `UniversalSubject` | 0.517 | 0.081 | 0.17 | 49 / 6 |

`FigurativeCarries` at 86 human hits and `UniversalSubject` at 49 join `DoubleHyphen` and
`NegatedPair` as rules that would have argued Sir's own prose was machine-written.

**Phase 1 inherits this table, not section 3's.**

---

## Addendum D — a second human author retires both top rules (2026-09-09)

**Status:** Phase 1.1 delivered a working stdlib port. The port is sound. The two
rules it carries are not. Both are now metric-only, and neither may raise a flag.

### What was built

`infrastructure/prose-forge/prose_tells.py` ports ColonUsage and
CataphoricForecasting to pure Python. No Vale at request time, no network, no
subprocess, stdlib only. It answers W13:Jacques' Console contract:
`DETECTORS[name](text) -> {verdict, score, flags[], metrics{}}`. Measured latency
is 5 ms on a 2,472-word document, against a 2-second interactive budget.

`corpus/validate_port.py` checks the port against Vale by comparing matched
strings per record. Recall is 1.000 on the Archon arm for both rules. Port-only
hits are 6 and 5. The human arm shows 12 Vale hits the port declines on purpose.
Vale matches a colon at the end of a line against the next line's first word.
It scans block by block, so that pairing crosses a boundary Vale itself respects.

**Two real defects surfaced during validation.** Blanking markup while preserving
length turned `**Changes**: Updated` into `Changes  :  Updated`, and every rule
with a literal single space stopped matching. Separately, a greedy `.*$` under
`re.DOTALL` made one code fence blank every paragraph after it. Both are fixed.
Both were invisible in hit counts and only appeared in a string-level comparison.

### The finding

Phase 0 compared Archon prose against one human arm. That arm is Sir. A
single-author arm cannot distinguish "machines do this" from "this author avoids
this." Jacques' corpus extractor supplied 52 harbor-family documents by other
contributors. That is a second human arm in the same genre. Both rules fail it.

| Rule | Sir /1k | Other humans /1k | Archon authored /1k | Archon digest /1k |
|---|---|---|---|---|
| ColonUsage | 2.375 | 0.286 | 4.100 | 15.617 |
| CataphoricForecasting | 0.127 | 1.220 | 0.625 | 0.666 |

**ColonUsage measures house style.** Sir writes it 8.3x more than other humans do.
Archon prose is 1.7x Sir but 14.3x those humans. The two human arms disagree by
more than the human-machine gap. That is disqualifying for an authorship flag.

**ColonUsage's headline was a contaminated arm.** The 4.98x rested on JICM digests
written by qwen3:8b, at 15.6/1k. Those are machine summaries of Archon work, not
Archon prose. Adjudicating 60 sampled hits found 51 of them there. Excluding
digests, the rule reads 4.100 against 2.375, which is 1.73x.

**CataphoricForecasting is reversed.** Other humans fire it at 1.220/1k against
Archon-authored 0.625/1k. The 4.9x was Sir's own avoidance of numbered lead-ins.
Adjudicating all 54 Archon hits gives 0.537 precision for the construction itself.
Half the hits are ordinary back-reference, such as "the four commits were pushed."

### Sign test against the labelled fixtures

Both rules score zero on all four Snorkel fixtures. This is no signal, not a
failure. The constructions are absent from that register. The set cannot be
widened: the platform keeps only the current submission, so the three failed
variants exist nowhere but `fixtures.py`.

### What this changes

1. **Do not ship either rule as a flag.** Both join the counter-indicative set.
2. **Every future rule is measured against both human arms from the start.**
   A rule earns a flag only by separating machine text from every human arm.
3. **Held-out splits key on `task_ref`, not author.** Jacques confirms `assignee`
   is constant across the account, so author-level holdout is not available.
4. **Genres stay unpooled.** A rubric criterion is one sentence. A review
   description runs 19k characters.
5. **The digest contamination class is wider than Phase 0 recorded.** JICM digests
   are machine-written and were sitting inside the Archon-authored arm.

### Honest limit on this addendum

The second human arm is harbor task documentation. Sir's arm is plans, reports and
messages. Some of the gap is genre, not authorship. That weakens any claim about
which arm is higher. It does not weaken the conclusion, which needs only this: two
human arms in document genre disagree on both rules by more than machines differ
from either. A flag calibrated on one of them does not transfer to the other.

---

## Addendum E — the rule ColonUsage was a bad proxy for (2026-09-09)

Addendum D retired ColonUsage. W13:Jacques then offered a third data point against
it: raw colon density on his 52-document human arm reads 11.43 per 1k words,
against my Archon-authored 4.100. That looked like humans out-colon machines.

**The two figures are different instruments.** His 11.43 counts every colon. My
4.100 counts ColonUsage, which requires a capital after the colon. Measured
like for like on the same documents, the comparison inverts.

| Metric (median /1k) | Sir | Other humans | Archon authored | Archon digest |
|---|---|---|---|---|
| raw colon | 13.83 | 11.43 | 32.54 | 15.28 |
| colon, markup stripped | 13.56 | 11.36 | 39.92 | 15.38 |
| **mid-sentence colon** | **7.92** | **8.57** | **34.50** | **11.83** |

His 11.43 reproduces exactly. The conclusion it was offered for does not.

### What the like-for-like comparison found instead

The **mid-sentence colon**, one that follows a lowercase word, comma or closing
paren, is the first metric to clear the bar Addendum D set. It separates machine
text from every human arm at once, and the two human arms agree on it.

- AUC 0.917 for Archon-authored against pooled humans, on 59 versus 236 documents.
- AUC 0.906 against Sir alone, 0.969 against third-party humans.
- AUC 0.584 between the two human arms, where 0.5 is chance.
- At the humans' own 90th percentile of 25.4/1k: 73% of Archon documents flag,
  12% of Sir's, 0% of third-party humans'.

**Why ColonUsage failed and this does not.** Requiring a capital after the colon
selects the run-in label. That is house style, and Sir writes it 8.3x more often
than other humans do. The discriminating construction is the colon used as a
clause hinge inside a sentence, and capitalisation is precisely what excludes it.

### The limit that bounds every claim from this rule

The qwen3:8b digest arm reads human at AUC 0.586. **This is a tell for
Claude-family prose, not for machine text in general.** For revising Archon
output that is the target. Presented as an AI detector it would be a fraud.

Genre confound remains partly open. The arms differ in document sub-genre. The
protection is that the two human arms also differ from each other in sub-genre
and still agree to within 8%.

Shipped as `sentence_colon` in `prose_tells.py`, threshold 25.4/1k, level medium.
