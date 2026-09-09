# Prose Forge: research findings, tool proposals, and development plan

**Status:** pre-project. Research complete, nothing built.
**Date:** 2026-09-08
**Owner:** W3:Jarvis-dev
**Scope:** a shared toolkit any Archon can use to find and repair AI-generation tells in prose.
Phase 2 extends it to rewriting toward a named target author.

---

## 1. The reframe, and why it matters

The obvious design is a detector: score a document, report "87% AI". Three findings from the
current literature say that design fails, and say so in a way that changes what we should build.

**Detectors track alignment, not generation.** Xu et al. (2026), *Base Models Look Human To AI
Detectors*, ran base and instruction-tuned versions of the same weights through GPTZero and
Pangram across Llama-3 and Qwen-3 at 0.6B to 70B. Base-model output was judged "overwhelmingly
human". Instruct-tuned output from identical pretrained weights was not. The authors conclude
detectors track "artifacts of instruction tuning and local context more than any invariant notion
of machine-generated text".

This is the single most useful result for us. What we call an "AI tell" is not evidence of machine
authorship. It is the house style that RLHF produces. That is a **style problem**, and style
problems are editable. We are not in the forensics business, so the result that guts detection as
a discipline is precisely the result that licenses our tool.

**Lexical detectors barely fire on frontier models.** `sloptrim`, the most careful open-source
prose linter in this space, publishes its own true-positive rates at its default guard threshold:
46.7% on GPT-4o, **3.3% on Claude 3.5 Sonnet, 0% on humanized o1-pro**. Its ROC-AUC looks healthy
at 0.762 to 0.946, and its README is honest that "AUC is a ranking measure, not accuracy at
Sloptrim's guard threshold".

Our Archons run Opus 5. An off-the-shelf lexicon tuned on GPT-4o-era text will be close to silent
on our own output. Any plan that assumes otherwise is planning against 2024.

**Tells decay by model generation.** Wikipedia's *Signs of AI writing*, the most actively
maintained community catalogue, segments its vocabulary lists by GPT-4 era, GPT-4o era and GPT-5
era. It records that *delve* peaked in 2023 and early 2024 then "dropped off sharply in 2025". It
carries two sections we should read as design requirements: **Ineffective indicators** and
**Historical indicators**. A static word list rots, and it rots on a timescale of months.

### What this means for the build

The deliverable is **an editing instrument, not a classifier**. It does not need to answer "was
this written by a model". It needs to answer "which spans of this would read better, and why", and
then help fix them. That target is achievable, measurable, and does not degrade when the next model
ships. It also sidesteps the false-accusation ethics that make detection products unpleasant.

Corollary: every lexicon we ship must carry a **measured precision against our own corpus** and an
expiry review. A rule with no measured false-positive rate is a superstition.

---

## 2. Landscape: open-source projects

All verified active via the GitHub API on 2026-09-08. Stars and push dates are as read that day.

| Project | Stars | Last push | What it is | Verdict |
|---|---|---|---|---|
| [`tbhb/vale-ai-tells`](https://github.com/tbhb/vale-ai-tells) | 88 | 2026-09-08 | Vale style package. 134 prose rules plus 15 commit-message rules. MIT. | **Build on this.** See below. |
| [`seyedehsanhadi/sloptrim`](https://github.com/seyedehsanhadi/sloptrim) | 209 | 2026-09-05 | 71 documented patterns, 0-100 score, Python stdlib only, save-time hook. Apache-2.0. | **Study its method.** Best-in-class honesty about limits. |
| [`manavmishra/ZeroSlop`](https://github.com/manavmishra/ZeroSlop) | 114 | 2026-09-08 | Agent skill, scores 0-100 then edits with the assistant. | Closest to our intended UX. Evaluate. |
| [`vale-cli/agent-tools`](https://github.com/vale-cli/agent-tools) | 6 | 2026-09-03 | Vale skills, edit-time hook, MCP server. MIT. | Integration blueprint. Very early, 5 commits. |
| [`stef41/lmscan`](https://github.com/stef41/lmscan) | 30 | 2026-04-11 | Detection plus LLM fingerprinting, offline, zero deps. | Detection side. Optional signal. |
| [`pablocaeg/sloptotal`](https://github.com/pablocaeg/sloptotal) | 12 | 2026-07-26 | 23 detection engines, self-hosted, CPU-only. | Useful as an ensemble harness for calibration. |
| [`Byk3y/no-slop`](https://github.com/Byk3y/no-slop) | 10 | 2026-04-08 | Prose linter derived from Wikipedia's Signs of AI Writing. | Redundant with vale-ai-tells. |
| [`199-biotechnologies/humanise-text-skill`](https://github.com/199-biotechnologies/humanise-text-skill) | 12 | 2026-04-02 | Claude skill, 507-entry banned word list. | Banned-word lists are the weakest design. Reference only. |
| [`talkstream/ru-text`](https://github.com/talkstream/ru-text), [`smixs/humanizer-ru`](https://github.com/smixs/humanizer-ru) | 225 / 151 | 2026-08 | Russian-language equivalents. | Not directly usable. Their rule taxonomies are worth reading. |

**Why `vale-ai-tells` is the right foundation.** It is the only project in this space that reports
per-rule false positives against **seven pre-LLM corpora** (Go and Python standard libraries, Rust
RFCs, PEPs, Go blog posts), with hit counts per rule. It names its own noisiest rules: `BareHolds`
is "the loudest rule in the package" at roughly 160 corpus hits, `NamedAdjective` matches about 230
times in two standard libraries. It ships domain-disable guidance per rule. That is a calibrated
instrument rather than a word list, and calibration is the part that is expensive to reproduce.

Its rule families map closely onto what we want: vocabulary fingerprints, rhetorical scaffolding,
meta-discourse, hedging and sycophancy, punctuation, negation constructions, figurative-verb
families, metaphor families, anthropomorphism, and padding.

Vale itself is MIT and free. Custom rule packages are authorable and runnable entirely with the
free CLI. The paid Vale CMS subscription buys only the rule-authoring MCP, which we do not need.

**A caution on the "humanizer" category.** Most repos tagged `humanizer` optimise for evading
detectors. That is a different goal from writing better, it is adversarial rather than editorial,
and it produces text tuned to a scoring artifact. We take rules from that literature and reject
its objective.

---

## 3. Landscape: published literature

Selected from arXiv cs.CL, 2026. The first group changes the design. The second is method
reference. The third is Phase 2.

### Design-changing

| Paper | ID | Finding we act on |
|---|---|---|
| Base Models Look Human To AI Detectors | [2605.19516](https://arxiv.org/abs/2605.19516) | Detectors track instruction tuning, not generation. Tells are RLHF style. |
| A Systematic Analysis of Linguistic Features in AI-Generated Text Detection Across Domains and Models | [2606.04177](https://arxiv.org/abs/2606.04177) | 284 interpretable features, 27 LLMs, 10 domains. **Lexical richness is the one family robust across model and domain.** Many published indicators are strongly context-dependent. |
| Rethinking AI-Generated Text Detection: A Strong Baseline and the Distribution-Shift Problem That Remains | [2607.03680](https://arxiv.org/abs/2607.03680) | A plain fine-tuned RoBERTa matches or beats specialised detectors. The field compares against weak baselines. Do not build a bespoke detector. |
| Why AI-Generated Text Detection Fails: Evidence from Explainable AI Beyond Benchmark Accuracy | [2603.23146](https://arxiv.org/abs/2603.23146) | Benchmark accuracy does not survive contact with real use. |
| Show, Don't TELL: Explainable AI-Generated Text Detection | [2605.27921](https://arxiv.org/abs/2605.27921) | Detector output is misaligned with what users actually need. Argues for span-level explanation, which is exactly our interface. |

### Method reference

| Paper | ID | Relevance |
|---|---|---|
| Explaining Generalization of AI-Generated Text Detectors Through Linguistic Analysis | [2601.07974](https://arxiv.org/abs/2601.07974) | Why detectors fail to transfer across prompts, model families, domains. |
| Triospect: three-dimensional framework robust against attacks | [2606.31074](https://arxiv.org/abs/2606.31074) | Separates content from expression. That split is our data model. |
| SenFlow: inter-sentence flow modelling for hybrid documents | [2606.18946](https://arxiv.org/abs/2606.18946) | Human and model co-authored text, which is every document we produce. |
| D2C-Routing: mixed-origin detection | [2608.27380](https://arxiv.org/abs/2608.27380) | Content origin and expression origin can differ. Directly our case. |
| Diversity Boosts AI-Generated Text Detection (DivEye) | [2509.18880](https://arxiv.org/abs/2509.18880) | Surprisal-diversity features. Cheap, and complements lexical richness. |
| Log-Likelihood, Simpson's Paradox, and the Detection of Machine-Generated Text | [2605.06294](https://arxiv.org/abs/2605.06294) | Aggregate likelihood signals mislead on mixed text. |
| RAID: shared benchmark for robust evaluation | [2405.07940](https://arxiv.org/abs/2405.07940) | Standard evaluation harness if we ever need one. |

### Phase 2, target-author style

| Paper | ID | Relevance |
|---|---|---|
| STEB: Style Text Embedding Benchmark | [2606.31741](https://arxiv.org/abs/2606.31741) | 96 datasets, 7 languages. **Semantic embedding models consistently fail at style tasks. No style embedding is universally best.** Code at [rrivera1849/STEB](https://github.com/rrivera1849/STEB). |
| HyperStyler: low-resource authorship style transfer | [2609.02772](https://arxiv.org/abs/2609.02772) | Rewrites toward an arbitrary author from a few reference examples. Published 2026-09-02. |
| AuthorMix: modular style transfer via layer-wise adapter mixing | [2603.23069](https://arxiv.org/abs/2603.23069) | One adapter per author instead of one model for all styles. |
| Explainable Disentangled Representation Learning for Generalizable Authorship Attribution | [2604.21300](https://arxiv.org/abs/2604.21300) | Content-style entanglement is the core failure mode. Relevant to not fabricating. |

The STEB finding matters for planning. Our existing Qwen3-Embedding-4B server is a **semantic**
embedder, and semantic embedders fail at style. It is the right tool for the fidelity check in
Phase 1 and the wrong tool for style matching in Phase 2. Phase 2 needs a separate style embedder.

---

## 4. The asset nobody else has

Every project above calibrates against public corpora. We hold something better.

The monorepo contains years of paired, provenance-labelled text:

- **Human:** Sir's prompts in the session JSONL, his commit messages, his prose in project docs.
- **Archon:** checkpoints, digests, scratchpads, persona files, my commit messages, insight logs.
- **Same topics, same domain, same period.** The pairing controls for content, which is the
  confound that ruins public style corpora.

This gives us three things the public projects cannot get:

1. **Calibration on the models we actually run**, not on GPT-4o-era text.
2. **A personal target style.** Sir's style is already partially specified in memory: no em-dashes,
   sentences under fifteen words, bold labels of one or two words. That is a written spec plus a
   large corpus, which is a rare combination.
3. **Rule pruning with measured precision.** For each of the 134 vale-ai-tells rules we can compute
   how often it fires on Sir's writing. A rule that fires often on his prose is not measuring AI.

Two cautions. The JSONL is conversational, so register differs from his document prose, and the two
must be kept as separate arms. And Sir's own text will contain some Archon-influenced phrasing after
this much collaboration, so the corpus is not pristine. Both are manageable with careful arm
definition, and both must be stated in whatever we report.

---

## 5. Proposed architecture

Four layers. Each is independently useful, and each can ship before the next exists.

```
  ┌─ L0  CORPUS  ─────────────────────────────────────────────────────┐
  │  paired human / Archon text from the monorepo, provenance-labelled │
  │  the calibration substrate. every layer above is measured on it     │
  └────────────────────────────────────────────────────────────────────┘
        │
  ┌─ L1  RULES  ──────────────────────────────────────────────────────┐
  │  Vale + a recalibrated fork of vale-ai-tells                       │
  │  deterministic, offline, fast, span-level, explainable             │
  │  every rule carries a measured precision figure and a review date  │
  └────────────────────────────────────────────────────────────────────┘
        │
  ┌─ L2  STATISTICS  ─────────────────────────────────────────────────┐
  │  lexical richness (the family that generalises), burstiness,       │
  │  sentence-length variance, surprisal diversity                     │
  │  continuous document score where L1 gives discrete hits            │
  └────────────────────────────────────────────────────────────────────┘
        │
  ┌─ L3  REVISION  ───────────────────────────────────────────────────┐
  │  local model proposes span rewrites for L1/L2 findings             │
  │  GATED BY A FIDELITY CHECK: no new claims, no dropped claims       │
  └────────────────────────────────────────────────────────────────────┘
```

**L1 is the workhorse.** Deterministic, no model, no network, sub-second. It produces the span-level
explanation that the *Show, Don't TELL* paper argues users actually need.

**L2 exists because L1 has a recall ceiling.** Rules catch known phrasings. Lexical richness catches
the texture that survives paraphrase, and it is the one feature family the 27-model study found
stable under shift.

**L3 is where the value is, and where the danger is.** A rewriting tool that invents content is
worse than no tool. The fidelity gate is not optional. Our own guardrails already say this: an
unplanned fallback that masks missing data is a bug, and nothing below threshold gets accepted
silently.

---

## 6. Tool proposals

Five deliverables. Names are provisional.

### T1. `prose-corpus`: corpus builder (CLI, Python)
Extracts and labels the paired corpus from the monorepo. Arms: Sir-document, Sir-conversational,
Archon-checkpoint, Archon-commit, Archon-document. Emits a manifest with per-arm token counts and a
held-out split. Deterministic and re-runnable, per project convention.

**Why first:** every claim any other tool makes is measured against this. Without it we are guessing.

### T2. `prose-tells`: the rule pack (Vale style package)
A fork of vale-ai-tells, recalibrated. For each rule: fire rate on each corpus arm, precision, and a
keep, downgrade or drop decision. Adds Aion-specific rules from Sir's written style spec. Ships as a
Vale package plus a `.vale.ini` template.

**Design rule:** no rule ships without a measured number. Rules that only fire on GPT-4o-era text
get dropped, not kept for completeness.

### T3. `prose-score`: statistical scorer (CLI + library)
Lexical richness, burstiness, sentence-length distribution, surprisal diversity via a local model.
Returns a continuous score plus per-metric percentiles against the corpus arms. Percentile framing
matters: "your sentence-length variance sits at the 8th percentile of Sir's prose" is actionable in
a way that "72% AI" is not.

### T4. `prose-forge`: the Archon-facing skill
The primary interface. Runs L1 and L2, presents ranked findings with spans and reasons, proposes
rewrites, and gates every rewrite on the fidelity check. Modes: `check` (report only), `polish`
(propose edits), `strict`, `explain <span>`.

Follows the `sloptrim` and `vale-cli/agent-tools` integration pattern: a skill for interactive use,
plus an optional save-time hook for automatic scoring.

### T5. `prose-forge` MCP server
Tool-level access for any Archon: `score_text`, `explain_span`, `suggest_revision`,
`corpus_percentile`, and in Phase 2 `match_author`. FastMCP 3.0 with stdio transport, matching the
existing `jarvis-rag` and `jarvis-graphiti` servers.

**Sequencing note.** T4 as a skill is the cheapest useful thing and should ship before T5. An MCP
server is the right shape once several Archons use it concurrently, not before.

### Phase 2 (not scoped in detail yet)
`prose-forge match <author>`. Requires a style embedder selected via STEB, a target-author corpus
builder, and a few-shot rewriting approach along HyperStyler lines. Depends on Phase 1 fidelity
machinery already working.

---

## 7. Development plan

Complexity is given as low, moderate or high. No hour estimates, per standing preference.

### Phase 0. Foundation
| # | Task | Complexity | Exit criterion |
|---|---|---|---|
| 0.1 | Vendor and read `vale-ai-tells`, `sloptrim`, `ZeroSlop` | Low | Rule taxonomies compared in a written note |
| 0.2 | Build T1 `prose-corpus` | Moderate | Manifest with five arms, per-arm token counts, held-out split, re-runnable byte-identical |
| 0.3 | Baseline measurement | Moderate | Every vale-ai-tells rule has a fire rate on every arm |

**Phase 0 gate:** we can state, with numbers, which existing rules discriminate our Archons' prose
from Sir's. If none do, that is a real finding and Phase 1 changes shape rather than proceeding.

### Phase 1. The instrument
| # | Task | Complexity | Exit criterion |
|---|---|---|---|
| 1.1 | T2 `prose-tells` recalibrated pack | Moderate | Every shipped rule carries measured precision. Dropped rules are listed with their numbers |
| 1.2 | Encode Sir's style spec as rules | Low | Em-dash, sentence length and bold-label rules fire correctly on known samples |
| 1.3 | T3 `prose-score` | Moderate | Percentile output against corpus arms, validated on held-out split |
| 1.4 | Fidelity checker | **High** | On a labelled set of good and bad rewrites, catches every fabricated or dropped claim |
| 1.5 | T4 `prose-forge` skill | Moderate | End-to-end on a real document, with before and after scores |

**Phase 1 gate:** the tool improves a real document, and the fidelity checker has never passed a
rewrite that changed meaning. 1.4 is the hard one and should not be compressed.

### Phase 2. Integration
| # | Task | Complexity | Exit criterion |
|---|---|---|---|
| 2.1 | Save-time hook, opt-in per lane | Low | Scores on write, never blocks, respects the three-tier hook reload rules |
| 2.2 | T5 MCP server | Moderate | Five tools, registered in `.mcp.json`, usable from two lanes at once |
| 2.3 | Calibration refresh job | Moderate | Nexus job re-measures rule precision on a schedule and alerts on drift |

2.3 is the answer to lexicon rot. Tells decay, so precision figures need a heartbeat, not a
one-time measurement.

### Phase 3. Author style transfer
Not scoped until Phase 1 closes. Sketch: select a style embedder using STEB, build target-author
corpora, evaluate HyperStyler and AuthorMix, reuse the Phase 1 fidelity gate unchanged.

---

## 8. Resource needs

**Compute.** Everything runs on what is already up. Ollama on :11434 for surprisal and rewriting.
LiteLLM on :4000 if we want a stronger reviser. Qwen3-Embedding-4B on :8000 for the fidelity check.
Vale is a single Go binary. No new GPU, no new service, no cloud spend.

Watch the MLX embedding leak. It reached 38GB over 23 hours previously, and a corpus-scale
embedding pass is exactly the workload that triggers it. Batch the fidelity checks and check
`footprint` before long runs.

**Storage.** Corpus and manifests are small, likely well under a gigabyte. If any bulk model
download is needed it lands in `~/Claude/Staging/` and is referenced by symlink, per the bulk
download policy.

**Dependencies.** Vale (MIT, single binary). Python standard library where possible, matching the
`sloptrim` design choice. spaCy only if part-of-speech rules prove necessary, and that decision
should be made on measured benefit since it adds real weight.

**The actual cost is calibration, not inference.** Phase 0.3 and Phase 1.1 are where the effort
sits. Measuring 134 rules across five corpus arms and making a keep-or-drop call on each is the
project. The code around it is comparatively simple.

**Licensing.** Vale MIT, vale-ai-tells MIT, sloptrim Apache-2.0. All compatible with a fork. Attribution
and NOTICE obligations must be honoured, and vale-ai-tells ships a `CITATION.cff` that should be
carried forward.

---

## 9. Risks and open questions

**R1. The rules may not fire on Opus 5 at all.** This is the live risk, and `sloptrim` at 3.3% on
Claude 3.5 Sonnet is the warning. Phase 0.3 exists to find out before we build on the assumption.
If the answer is that no lexical rule discriminates, the project pivots to L2 statistics plus L3
revision, and L1 becomes a style-spec enforcer for Sir's preferences rather than an AI detector.
That is still a useful tool, but it is a different one, and we should know which we are building
by the end of Phase 0.

**R2. Fabrication during rewriting.** The failure that would make this tool net-negative. Mitigated
by the fidelity gate, and the gate must be built before the rewriter is trusted, not after.

**R3. Lexicon rot.** Handled by 2.3, but only if the refresh job actually runs and actually alerts.
A calibration job that silently stops is worse than none, because the numbers keep looking fresh.

**R4. Goodhart.** If we optimise prose against our own score, we will produce text that scores well
and reads badly. Keep a held-out human judgement in the loop, and never let the score become the
acceptance criterion on its own.

**R5. Corpus contamination.** Sir's recent prose may carry Archon phrasing. Measure it, state it,
and prefer older samples for the human arm where the question is sensitive.

**Open questions for Sir:**

1. **Primary target.** Should the default standard be "not AI-sounding" or "sounds like Sir"?
   These diverge. The second is more useful and more achievable, given we hold both a written spec
   and a corpus.
2. **Scope of prose.** Documents only, or also commit messages and Archon-to-Sir terminal replies?
   The commit-message rule set exists upstream and is cheap to adopt.
3. **Enforcement posture.** Advisory only, or a blocking gate on some lane? Given the guard
   false-positive history from this week, advisory first is the safer default.
4. **Phase 2 authors.** Which target authors, and do we have sample works of sufficient length for
   them?

---

## 10. Sources

Repositories are linked inline in section 2. Papers are linked inline in section 3. Additional
references:

- Wikipedia, [*Signs of AI writing*](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing).
  WikiProject AI Cleanup. Actively maintained, carries an August 2026 update banner. Its
  *Ineffective indicators* and *Historical indicators* sections are required reading before writing
  any rule.
- Vale, [vale.sh](https://vale.sh). MIT prose linter. Twelve check types, YAML rules, syncable
  style packages.
- [rrivera1849/STEB](https://github.com/rrivera1849/STEB), style embedding benchmark code.
