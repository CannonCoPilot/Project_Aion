# Prose Forge: research findings, tool proposals, and development plan

**Status:** pre-project. Research complete, nothing built.
**Date:** 2026-09-08 (revised same day after the Amazon RefChecker review and a citation audit)
**Owner:** W3:Jarvis-dev
**Artifact:** https://claude.ai/code/artifact/2dbceeb7-58f5-4388-ab0f-ea4df40aa414

**Scope:** a conservative toolkit any Archon can use to write, review and revise **our own prose**,
so that legitimate work is not misjudged by unreliable machine-text classifiers. Phase 3 extends it
to rewriting toward a named target author.

---

## 1. Posture: what this is for, and what it is not for

The tool is **defensive**. It operates on text we have the right to publish, submitted by the person
who wrote it or commissioned it. It returns spans to improve.

It is **not an accusation instrument**. It ships no "was this written by a model" endpoint for
third-party text and returns no verdict about a person. That is an API constraint, not a
disclaimer: every entry point takes a document you own and returns editorial findings.

The research arrives at the same place independently. Detectors do not measure machine authorship;
they measure instruction-tuned style. Building an editor rather than a classifier is the position
that both the evidence and the ethics reach.

**The harm being avoided** is a false positive on genuine work. It falls hardest on writers whose
natural register resembles the flagged style: non-native English speakers, technical writers trained
to be formal, and anyone who writes cleanly.

---

## 2. Four findings that set the design

### 2.1 Detectors track instruction tuning, not generation

Xu et al., *Base Models Look Human To AI Detectors* ([2605.19516](https://arxiv.org/abs/2605.19516)),
ran base and instruction-tuned versions of *the same weights* through GPTZero and Pangram across
Llama-3 and Qwen-3 from 0.6B to 70B. Base-model output was judged overwhelmingly human;
instruct-tuned output from identical pretrained weights was not. They conclude detectors track
"artifacts of instruction tuning and local context more than any invariant notion of
machine-generated text".

An "AI tell" is therefore not evidence of a machine. It is the house style alignment produces, and
style is editable.

### 2.2 Lexical detectors barely fire on current models

`sloptrim` publishes its own true-positive rates at its default guard threshold. Self-reported,
measured against matched arms of the Human Detectors dataset, CIs from 10,000 paired bootstrap
resamples. Not reproduced by us.

| Generator | ROC-AUC | TPR at default threshold |
|---|---|---|
| GPT-4o | 0.946 | 46.7% |
| Claude 3.5 Sonnet | not given | 3.3% |
| o1-pro, humanized | 0.762 | 0.0% |

Its README states: "AUC is a ranking measure, not accuracy at Sloptrim's guard threshold." Our
Archons run Opus 5, so a lexicon tuned on GPT-4o-era text may be close to silent on our own writing.

### 2.3 Tells decay on a timescale of months

Wikipedia's *Signs of AI writing* segments vocabulary by GPT-4, GPT-4o and GPT-5 era, and records
*delve* peaking in 2023 to early 2024 then dropping sharply in 2025. It carries **Ineffective
indicators** and **Historical indicators** sections. Every rule needs a measured precision figure
and a refresh heartbeat.

### 2.4 Only one feature family survives shift

El Attar et al. ([2606.04177](https://arxiv.org/abs/2606.04177)) tested 284 interpretable features
across 27 LLMs and ten domains. Interpretable features alone suffice, but most published indicators
proved strongly context-dependent. **Lexical richness was the exception.**

---

## 3. Watermarking

### 3.1 What changed

On **2 August 2026** Anthropic began embedding machine-readable marks in Claude-generated text.
Per Anthropic's own support documentation, marking is model-level and travels wherever the model
runs; listed surfaces include **Claude Code**. It applies worldwide to all generated text. Driver
is the EU AI Act Article 50 transparency obligation.

### 3.2 Two unresolved facts, material to scope

- The support article names **Fable 5.1 and Mythos 5.1** as currently supported, with models
  launched on or after 2 August 2026 marked at launch and earlier models "in transition".
  **Opus 5 is not on that list.** Whether Archon output is marked today is unknown.
- Text-watermark detection is in **private preview**, restricted to organisations with a legal
  obligation to verify. We cannot check our own output with the vendor tool.

### 3.3 What is knowable without vendor access

- **Presence is detectable black-box.** Gloaguen, Jovanović, Staab and Vechev
  ([2405.20777](https://arxiv.org/abs/2405.20777)) show SynthID-Text's presence is easily detected
  through black-box queries and note it is easier to scrub than other schemes. Presence is a
  different and easier question than decoding.
- **Paraphrase removes marks almost completely.** *AI Watermark Evidence Fails Forensic Readiness*
  ([2607.16010](https://arxiv.org/abs/2607.16010)) reports meaning-preserving paraphrase achieving
  100% conditional removal for two of three schemes and 98.3% for the third, holding semantic
  similarity high.
- **Open tooling exists.** MarkLLM ([2405.10051](https://arxiv.org/abs/2405.10051)) states it
  "currently supports nine specific algorithms from two prominent families", with an attack suite
  and detection-threshold calculators. Apache-2.0, 1,068 stars, pushed 2026-09-05.

### 3.4 Design consequence: a ledger, not a scrubber

Any revision aggressive enough to change register will incidentally degrade a watermark. Anthropic
says so: detection fails on text "heavily edited, paraphrased, translated, or mixed into other
writing". This is a side effect of editing, not a feature to build.

So the tool **reports** observable provenance signal before and after a revision and records it.
That keeps disclosure decisions informed rather than accidental, which is what actually protects
the user. A tool that silently stripped provenance would leave the user unable to answer a question
they may be required to answer.

**Boundary:** we build watermark *audit* and *change reporting*. We do not build a scheme-specific
stripper.

---

## 4. Repository reviews

Stars, licences, push dates and archive status from the GitHub API on 2026-09-08, not README prose.
That check corrected four figures taken from page text.

### 4.1 lmmx, "AI tells" rubric (gist): highest conceptual value

Three markdown files: a system prompt plus two rubrics for a model acting as text evaluator. Rubric
1 gives nine categories including Voice and Perspective, Epistemic Texture, Structural Tells and
Meta-Level Tells. Rubric 2 targets fabricated first-person accounts.

The individual tells are unlike anything in the linter projects: *View from Nowhere*, *Missing the
Why*, *No Visible Learning*, *The Missing "I Was Wrong"*, *Zero Epistemic Humility*, *Missing Loose
Threads*. Its coda argues the real diagnostic is "text that has no author".

**Take:** these are **absences**, not word choices. A paraphrase attack cannot remove a missing
admission of error. This is the seed of N1 and the strongest single item in the review.

### 4.2 amazon-science/RefChecker: adopt, vendor, extend

Apache-2.0 · 434 stars · 111 commits · **archived 2026-04-08, read-only** · paper
[2405.14486](https://arxiv.org/abs/2405.14486)

Three-stage pipeline: claim extractor, hallucination checker, aggregator. Text decomposes into
`(subject, predicate, object)` triplets verified independently against a reference, then aggregated.
A `subsentence` format is also supported. Labels are NLI-style (Entailment, Contradiction, Neutral)
plus `Abstain`. Aggregators: `strict`, `soft`, `major`. Extraction routes through litellm, so
Bedrock, OpenAI or local vllm all work, plus a fine-tuned `Mistral-7B-Claim-Extractor`. Checkers
include LLMChecker, AlignScore ([2305.16739](https://arxiv.org/abs/2305.16739)), a RoBERTa NLI
checker and RepC. An embedding localisation module maps triplets back to reference spans.

Benchmark: 300 examples across zero-context, noisy-context and accurate-context settings, responses
from seven LLMs, ~2.1k human-annotated responses, 95.0% inter-annotator agreement on the 23%
double-annotated. No end-to-end checker F1 in the README.

**Take:** it catches **added claims but not dropped ones**. The project scopes itself to QA,
summarisation and IE, where a missing fact is not counted as a hallucination; its README concedes
that in translation an omission "should be considered a form of hallucination" but treats that as
out of scope. The fix is to **run it in both directions** (see §6, N4). Archived, so adoption means
vendoring and maintaining.

### 4.3 markrussinovich/refchecker: same name, different job

MIT · 492 stars · 1,406 commits · pushed 2026-09-07 · paper
[2607.00738](https://arxiv.org/abs/2607.00738) (*Phantom References*)

A citation and bibliography validator, **not** the claim-triplet RefChecker above. Three stages: a
deterministic pre-filter needing no LLM (unverified status, author overlap below 60%, identifier
conflicts, broken URLs), LLM deep web search that must find a dedicated page for the cited work,
then re-verification of title, author and year. Verdicts LIKELY / UNCERTAIN / UNLIKELY. Sources:
Semantic Scholar, OpenAlex, CrossRef, DBLP, ACL Anthology. Its paper reports roughly one in twenty
NeurIPS and USENIX Security 2025 papers carrying at least two likely-hallucinated references, at
about $0.04 per paper.

**Take:** the citation half of the fidelity gate. Run before and after a revision and diff the
reference-level results. Actively maintained, which the Amazon tool is not.

### 4.4 stef41/lmscan: useful signals, unvalidated weights

Apache-2.0 · 30 stars · 26 commits · pushed 2026-04-11

Twelve statistical features with no reference model: burstiness, sentence-length variance,
type-token ratio and Yule's K, hapax ratio, Zipf deviation, Flesch-Kincaid variance across
paragraphs, bigram and trigram repetition, transition-word ratio, slop-word density, punctuation
entropy. Each passes a sigmoid, then a weighted combination. Reimplements DetectGPT, GLTR and
Binoculars intuitions as heuristics needing no local LLM. Also attempts model attribution from
vocabulary fingerprints across five families.

Publishes **no precision, recall or false-positive figures**, and explicitly does not handle
watermarks. (Note: GitHub's licence classifier reports NOASSERTION, but the `LICENSE` file is
genuine Apache 2.0 text with a modified copyright line.)

**Take:** adopt the feature list, reject the weights. Its lexical-richness and burstiness measures
are exactly the family §2.4 found robust. The vocabulary fingerprints are 2024-era.

### 4.5 prometheus-eval: adopt as evaluation harness

Apache-2.0 · 1,113 stars · 211 commits · **last push 2025-04-25**

Open-weight judge models for rubric-based grading. Absolute mode takes an instruction, a response,
a five-level rubric and an optional reference answer, returning a critique plus a 1–5 score.
Relative mode does pairwise A/B. Prometheus 2 7B fits in 16 GB VRAM and is claimed to reach at least
80% of the 8x7B's evaluation performance.

**Take:** the missing piece nobody in the de-slop space has, namely a way to prove a revision
improved the text. Three caveats. Correlations come from general instruction-following benchmarks,
not rewriting. The reported 0.6–0.7 Pearson is agreement with GPT-4-1106, **not with humans**; only
the 72–85% pairwise range is human-referenced. And it has not been pushed since April 2025, so
treat the weights as a fixed asset rather than a maintained dependency.

### 4.6 cong-zeng/ood-llm-detect: borrow the framing

MIT · 12 stars · 98 commits · pushed 2025-11-08 · NeurIPS 2025 ·
[2510.08602](https://arxiv.org/abs/2510.08602)

*Human Texts Are Outliers.* Models LLM text as in-distribution and human text as the OOD anomaly,
rejecting the balanced-binary assumption. Three variants: DeepSVDD, HRN, Energy-based. Evaluated on
DeepFake, M4 and RAID. No numeric results in the repo.

**Take:** the asymmetry inverts cleanly for us. Not "is this an outlier from human text" but "how
far is this from *Sir's* text". That is a one-class problem against a corpus we own, which DeepSVDD
fits directly. Strongest methodological borrow in the set.

### 4.7 TrustedLLM/LLMDet: architecturally interesting, practically stale

MIT · 86 stars · 38 commits · **last push 2024-05-27** ·
[2305.15004](https://arxiv.org/abs/2305.15004)

Proxy perplexity from precomputed n-gram dictionaries, then a classifier on that proxy. Dictionaries
are built offline once, so detection never needs the source model. Nine classes: GPT-2, LLaMA, BART,
OPT, UniLM, T5, Bloom, GPT-neo, human. No accuracy figures published.

**Take:** the roster is obsolete, but the architecture is worth stealing. A precomputed n-gram
dictionary gives a perplexity-shaped signal with no model in the loop, which fits a hook that must
return in milliseconds. Rebuild the idea against our corpus.

### 4.8 beingamanforever/LLM-Text-Detection: reference only

**No licence** · 61 stars · 13 commits · last push 2024-01-08

Kaggle competition entry. Fine-tuned `bert-base-uncased` plus a TF-IDF voting-classifier track.
Carries one valuable negative result: cross-validation of 0.99+ did not transfer to the leaderboard,
because organisers injected human-like typos into the hidden test set, corrupting embeddings.
TF-IDF beat the transformer.

**Take:** the cautionary tale, not the code. A trivial surface perturbation collapsed a 0.99 model.
Absence of a licence rules out reuse regardless.

### 4.9 Wider landscape

| Project | Stars | Pushed | Verdict |
|---|---|---|---|
| tbhb/vale-ai-tells | 88 | 2026-09-08 | **Foundation.** 134 prose rules + 15 commit rules, MIT |
| seyedehsanhadi/sloptrim | 209 | 2026-09-05 | Method model. 71 patterns, Apache-2.0 |
| manavmishra/ZeroSlop | 114 | 2026-09-08 | UX reference |
| THU-BPM/MarkLLM | 1,068 | 2026-09-05 | **Watermark core.** Apache-2.0 |
| vale-cli/agent-tools | 6 | 2026-09-03 | Integration blueprint, 5 commits |
| pablocaeg/sloptotal | 12 | 2026-07-26 | Ensemble harness |
| Byk3y/no-slop | 10 | 2026-04-08 | Redundant with vale-ai-tells |
| 199-biotechnologies/humanise-text-skill | 12 | 2026-04-02 | Banned-word lists are the weakest design |

**Why vale-ai-tells is the foundation.** It is the only project reporting per-rule false positives
against seven pre-LLM corpora (Go and Python standard libraries, Rust RFCs, PEPs, Go blog posts)
with hit counts per rule. It names its own noisiest rules rather than hiding them. That is a
calibrated instrument, and the calibration is the expensive part to reproduce.

**Caution on the humanizer category.** Most repos tagged `humanizer` optimise for evading detectors.
That objective produces text tuned to a scoring artifact, and it is the posture §1 rejects.

---

## 5. Architecture

| Layer | Name | Function |
|---|---|---|
| L0 | Corpus | Paired provenance-labelled text, five arms. The calibration substrate |
| L1 | Rules | Vale + recalibrated vale-ai-tells fork. Deterministic, offline, span-level |
| L2 | Statistics | Lexical richness first, plus burstiness and one-class distance. Percentiles, never a probability of authorship |
| L3 | **Absence detection** | The novel layer. Operationalises the lmmx epistemic rubric |
| L4 | Gated revision | Local rewriter behind a bidirectional fidelity gate and a provenance ledger |

---

## 6. Novel work

**N1 · Detect absences, not words.** Every deployed linter matches things that are *present*, which
is why paraphrase defeats them and why sloptrim scores 0% on humanized text. Absence features are
structural: no stated uncertainty, no visible learning, missing the why, uniform confidence, no
loose threads. A paraphraser preserves propositional content, so it *cannot* introduce an admission
of error that was never there. No shipped tool implements these. **Hypothesis with a clean
rationale, not a measured result.** Phase 1 tests it; if absence features do not separate our corpus
arms, the layer is cut rather than shipped weakly.

**N2 · Calibrate on a paired corpus nobody else has.** Every project reviewed calibrates against
public corpora. We hold years of provenance-labelled text on the same topics in the same period:
Sir's prose against Archon prose. The pairing controls for content, the confound that ruins public
style corpora.

**N3 · One-class distance, not binary classification.** Borrowed from *Human Texts Are Outliers* and
inverted. How far does this sit from the centre of Sir's writing? Non-accusatory by construction.

**N4 · A bidirectional fidelity gate.** Not one reviewed humanizer checks meaning preservation.
RefChecker supplies the machinery but catches only added claims. **Deletion is our actual failure
mode**: a rewriter tuned for smoothness drops the caveat, the limitation, the exact figure, which
are precisely the things whose absence L3 flags. A one-directional check would police the failure we
are less likely to commit while permitting the one we are most likely to. So: rewrite-against-source
catches invention, source-against-rewrite surfaces dropped claims as Neutral, plus an embedding
floor, numeric fidelity, and a citation diff.

**N5 · A provenance ledger rather than a scrubber.** MarkLLM detectors for open schemes, explicit
"unknown, vendor detector gated" state for Anthropic's mark.

**N6 · A rot heartbeat, and proof that revisions help.** Scheduled recalibration with drift alerts,
plus Prometheus rubric grading on rewrite pairs.

---

## 7. Tools

| Tool | Form | Function |
|---|---|---|
| `prose-corpus` | CLI | Builds the five-arm paired corpus, deterministic and re-runnable |
| `prose-tells` | Vale package | Recalibrated rules, each with fire rate, precision, keep/downgrade/drop |
| `prose-score` | CLI + lib | Lexical richness, burstiness, one-class distance, as percentiles |
| `prose-absence` | library | The N1 layer |
| `prose-fidelity` | library | **Bidirectional** claim triplets (vendored RefChecker), embedding floor, numeric fidelity, citation diff |
| `prose-mark` | CLI | Watermark audit and ledger |
| `prose-forge` | Skill | `check`, `polish`, `strict`, `explain`, `ledger` |
| `prose-forge` | MCP | `score_text`, `explain_span`, `suggest_revision`, `corpus_percentile`, `provenance_ledger` |

---

## 8. Development plan

**Phase 0: foundation and the empirical question. GATE PASSED 2026-09-08.**
Findings: `projects/project-aion/reports/prose-forge-phase0-findings-2026-09-08.md`.
Code: `infrastructure/prose-forge/`.

- [x] Vendor and read the leading rule sets (vale-ai-tells 132 rules, Vale 3.20.0)
- [x] Build `prose-corpus`. Three arms, 550 inode-deduped transcripts, 2.5s, deterministic
- [x] Measure every rule against every arm, length-matched
- [ ] Determine empirically whether Opus 5 output carries a watermark **(still open)**
- [ ] Build the `human-document` arm **(new, added by the findings)**

**Result:** 102 of 132 rules fired. `CataphoricForecasting` separates the arms 11.7x on 299 Archon
hits against 26 human, and is the strongest rule on both volume and cleanliness. Seven rules fire
MORE on Sir's prose and must be dropped or re-scoped, `DoubleHyphen` worst at 406 human hits, which
turned out to be markdown rules and CLI flags rather than punctuation style.

**The corpus finding matters more than the rule table.** Forty percent of the apparent human arm was
machine text: autocompact summaries, watcher injections, task notifications and fork duplicates, all
arriving as `type:user` records. Before filtering, records of 500+ words were 7.5% of human records
but 46.3% of human words, and most of that tail was machine-authored.

**Phase 1: the instrument.** Recalibrated `prose-tells` (moderate). Encode Sir's style spec (low).
`prose-score` with one-class distance (moderate). `prose-absence` (**high**). `prose-fidelity`,
bidirectional, on a vendored copy of the archived RefChecker (**high**). The skill (moderate).
**Gate:** the tool improves a real document, and the fidelity gate has never passed a rewrite that
changed meaning. The two high-complexity items must not be compressed.

**Phase 2: provenance and integration.** `prose-mark` with MarkLLM (moderate). Opt-in save hook,
advisory only (low). MCP server (moderate). Prometheus rewrite evaluation (moderate). Calibration
refresh job with drift alerts (moderate).
**Gate:** rewrite quality is measured rather than asserted, and the refresh job has alerted at least
once on synthetic drift.

**Phase 3: target-author style.** Not scoped until Phase 1 closes. Select a style embedder via STEB
([2606.31741](https://arxiv.org/abs/2606.31741)), build target-author corpora, evaluate HyperStyler
([2609.02772](https://arxiv.org/abs/2609.02772)) and AuthorMix
([2603.23069](https://arxiv.org/abs/2603.23069)), reuse the Phase 1 fidelity gate unchanged.
**Note:** STEB found semantic embedders fail at style tasks, so our Qwen3 embedder is right for the
fidelity floor and wrong for style matching.

### Resources

Everything runs on infrastructure already up: Ollama `:11434`, LiteLLM `:4000`,
Qwen3-Embedding-4B `:8000`. Vale is a single Go binary. Prometheus 7B at 16 GB VRAM is the one
genuinely new model weight. No new service, no cloud spend.

Two cautions. The MLX embedding server has previously leaked to 38 GB over 23 hours, and a
corpus-scale embedding pass is exactly that workload; batch it and check `footprint` first. Any bulk
download lands in `~/Claude/Staging/` and is referenced by symlink.

**The real cost is calibration, not inference.** Licensing is compatible throughout: Vale MIT,
vale-ai-tells MIT, sloptrim Apache-2.0, MarkLLM Apache-2.0, RefChecker Apache-2.0, Prometheus
Apache-2.0.

---

## 9. Risks and open questions

| Risk | Response |
|---|---|
| Rules may not fire on Opus 5 at all | Phase 0 measures first. If none discriminate, L1 becomes a style-spec enforcer and weight shifts to L2/L3 |
| Fabrication during revision | Bidirectional gate built before the rewriter is trusted |
| Absence features may not separate | Tested in Phase 1; cut rather than ship weak |
| Lexicon rot | Refresh job that must alert. A silent calibration job is worse than none |
| Goodhart | Held-out human judgement stays in the loop |
| Corpus contamination | Sir's recent prose may carry Archon phrasing. Measure, state, prefer older samples |
| RefChecker is archived | Vendor and maintain; budget for it |

**Open questions**

1. **Is the target "not AI-sounding" or "sounds like Sir"?** These diverge. The second is measurable
   and more achievable, since we hold a corpus and a written spec.
2. **How far does scope run?** Documents only, or commit messages and terminal replies too?
3. **Advisory or blocking?** Given this week's guard false-positive history, advisory first.
4. **What is the disclosure posture?** The ledger records provenance change but does not decide
   policy. Worth settling before Phase 2.
5. **Which target authors for Phase 3, and do we hold enough of their work?**

---

## 10. Verification method

Every arXiv identifier here was resolved through the arXiv API and its returned title compared
against the claim made. All fifteen resolve and match. Every star count, licence, push date and
archive flag came from the GitHub API on 2026-09-08 rather than README prose; that check corrected
four figures, including Prometheus's dormancy since April 2025 and RefChecker's archived status.
Author attributions were verified against API author lists. Anthropic's watermarking claims come
from its own support documentation, read directly.

Claims not verified at source are marked second-hand where they appear. Two such: the "527% of human
rate" participial-phrase figure attributed to a PNAS study by vale-ai-tells, and the 2025 study on
human rater accuracy reported by Wikipedia. Both were removed from load-bearing positions.

### Papers cited, all IDs verified

| ID | Title |
|---|---|
| [2605.19516](https://arxiv.org/abs/2605.19516) | Base Models Look Human To AI Detectors |
| [2606.04177](https://arxiv.org/abs/2606.04177) | A Systematic Analysis of Linguistic Features in AI-Generated Text Detection |
| [2607.03680](https://arxiv.org/abs/2607.03680) | Rethinking AI-Generated Text Detection |
| [2605.27921](https://arxiv.org/abs/2605.27921) | Show, Don't TELL: Explainable AI-Generated Text Detection |
| [2510.08602](https://arxiv.org/abs/2510.08602) | Human Texts Are Outliers |
| [2405.10051](https://arxiv.org/abs/2405.10051) | MarkLLM: An Open-Source Toolkit for LLM Watermarking |
| [2405.20777](https://arxiv.org/abs/2405.20777) | Black-Box Detection of Language Model Watermarks |
| [2607.16010](https://arxiv.org/abs/2607.16010) | AI Watermark Evidence Fails Forensic Readiness |
| [2607.00738](https://arxiv.org/abs/2607.00738) | Phantom References |
| [2305.15004](https://arxiv.org/abs/2305.15004) | LLMDet |
| [2405.14486](https://arxiv.org/abs/2405.14486) | RefChecker |
| [2305.16739](https://arxiv.org/abs/2305.16739) | AlignScore |
| [2606.31741](https://arxiv.org/abs/2606.31741) | STEB: Style Text Embedding Benchmark |
| [2609.02772](https://arxiv.org/abs/2609.02772) | HyperStyler |
| [2603.23069](https://arxiv.org/abs/2603.23069) | AuthorMix |
