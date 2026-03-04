# Comparative Analysis: Three-Model Biographical Narrative Experiment

**Subject:** Historical Figure 19639 — Minaro Autumnalsculpt the Windy
**Date:** 2026-03-03
**Experiment:** Same 278-fact registry, same prompt, three Claude model tiers
**Purpose:** Investigate model-effect on narrative quality, factual accuracy, and creative approach

---

## 1. Overview of Outputs

| Metric | Haiku 4.5 | Sonnet 4.6 | Opus 4.6 |
|--------|-----------|------------|----------|
| **Total words** | 7,035 | 8,511 | 10,128 |
| **Total lines** | 330 | 360 | 573 |
| **Narrative section (est.)** | ~3,000 | ~4,500 | ~5,000 |
| **Facts used** | 144 / 278 | ~162 / 278 | 199 / 278 |
| **Coverage %** | 51.8% | ~58% | 71.6% |
| **Facts omitted** | 134 | ~116 | 79 |
| **FACT tags** | 127 | ~185 | ~41 (lines with FACT) |
| **EMBELLISHMENT tags** | 32 | ~32 | 27 |
| **CREATIVE LICENSE tags** | 21 | ~28 | 22 |
| **PROBABLE tags** | 18 | ~8 | 8 |
| **WILD GUESS tags** | 4 | 2 | 0 |
| **FABRICATION tags** | 0 | 0 | 0 |
| **Narrative-only claims** | 16 | 7 | 14 |

### Key Finding: Zero Fabrications Across All Three Models

All three models produced narratives with **zero fabricated claims** — no model invented events, dates, or details that contradict the fact registry. This is a strong signal that the fact-constrained prompt format works as intended.

---

## 2. Factual Coverage Analysis

### 2.1 Coverage Gradient

```
Opus  ████████████████████████████████████░░░░░░░░░░░░░░  71.6%  (199/278)
Sonnet ██████████████████████████████░░░░░░░░░░░░░░░░░░░░  58.0%  (162/278)
Haiku  ██████████████████████████░░░░░░░░░░░░░░░░░░░░░░░░  51.8%  (144/278)
```

**Observation:** Coverage scales approximately linearly with model capability tier. Opus covered 20 percentage points more than Haiku, incorporating an additional 55 facts into its narrative. This suggests that more capable models are better at:
- Identifying which facts are narratively significant
- Weaving more data points into flowing prose without making the text feel like a list
- Finding creative ways to reference technical facts (skills, entity links) through implication

### 2.2 Omission Patterns

All three models converged on omitting the same categories of facts:
- **Database metadata** (F001, F002): No model included the HF ID or world ID in narrative
- **Negative identity flags** (F010-F013): "Is NOT a vampire/necromancer/ghost" — all models correctly deemed these as non-narratively useful
- **Low-IP skill entries** (F027-F029): Minor combat skills with low investment
- **Individual enemy entity names** (F067-F087): All models referenced the aggregate count (21 enemies) rather than listing all

**Where models diverged on omissions:**
- **Haiku** omitted F015 (goal: "see the great natural sites") — both Sonnet and Opus also omitted this, but Opus noted it in the omissions table as having "no events to corroborate"
- **Sonnet** was the only model to deeply interpret individual poem *titles* as thematic windows (e.g., "a reader with patience might trace in these titles a portrait of a mind")
- **Opus** was the only model to draw the "Burden and Nothing More" title as potential "prophecy" of the curse

---

## 3. Narrative Quality Assessment

### 3.1 Opening Paragraphs (Chronicle Voice)

**Haiku:** Opens with a direct thematic thesis: "few lives encompass such extremes." Efficient, workmanlike, hits the dramatic contrast immediately. Prose is competent but somewhat formulaic.

**Sonnet:** Opens with an elaborate archival framing device — an italicized preface in the style of a medieval manuscript's colophon. Then shifts to a meditation on elven temporality ("What passes swiftly in the telling endured, in truth, across generations of shorter-lived races"). More literary, more self-aware of the chronicle conceit.

**Opus:** Opens with atmospheric worldbuilding: "when the world of Tar Thran was yet young in its dawning." Contextualizes Minaro in the sweep of history before introducing her. The most fully realized chronicle voice — reads like a published fantasy history.

### 3.2 Dramatic Arc Structure

| Narrative Beat | Haiku | Sonnet | Opus |
|---------------|-------|--------|------|
| Silent years / childhood | 1 paragraph | 1 rich paragraph | 1 paragraph + worldbuilding |
| Poetry period | 3 paragraphs | 6 paragraphs (deep) | 5 paragraphs (detailed) |
| Apprentice contradiction | Mentioned | Full paragraph exploring psychology | Full paragraph + philosophical musing |
| The Curse | 2 paragraphs | 3 paragraphs (meditates on the moment) | 2 paragraphs (concise but powerful) |
| First kill / infant victim | Noted with moral weight | Extended meditation on moral horror | Named victim, age, form — clinical horror |
| Political rise | 1 paragraph (summary) | 2 paragraphs (career metaphor) | 2 paragraphs (institutional analysis) |
| Closing / reflection | Philosophical coda | Poetic coda ("The world is long. So, it seems, is she.") | Thematic closure referencing deities' silence |

### 3.3 Emotional Impact (Pathos / Tragedy / Triumph)

**Haiku:** Achieves pathos through direct statement: "The child had barely experienced life when it was taken." The emotional register is accessible but lacks subtlety.

**Sonnet:** The most consistently emotional narrative. The "Let us sit with this moment, because the chronicle demands it" passage is a masterclass in controlled pathos — the narrator breaks the historical frame to address the reader directly, forcing contemplation. The closing three lines ("The world is long. So, it seems, is she.") achieve genuine literary resonance.

**Opus:** Achieves pathos through accumulation and restraint rather than direct emotional appeal. The "Burden and Nothing More" = prophecy connection is elegant. The noting that Ola and Romi are "silent in the later records" — an absence that implies abandonment by the divine — is the most sophisticated tragic beat across all three narratives.

### 3.4 Prose Quality Ranking

1. **Sonnet** — The strongest literary voice. Sentences have rhythm and variation. The narrator's personality is most distinct — self-aware, measured, occasionally breaking frame for emotional effect. Most readable as a standalone piece of writing.

2. **Opus** — The most comprehensive and architecturally sound. Prose is excellent but slightly more clinical than Sonnet's. Greater integration of details into the narrative fabric. Better at managing transitions between life phases.

3. **Haiku** — Competent and well-structured but prose is flatter. More reliance on direct statement than implication. Fewer memorable sentences. Still genuinely good — reads as a solid encyclopedia entry rather than a literary work.

---

## 4. Creative Approach Comparison

### 4.1 Embellishment Strategies

**Haiku** embellishes through *generalized emotional interpretation*:
- "The killing opened a door that would never close"
- "this longevity is not a blessing; it is the prolongation of a curse"

**Sonnet** embellishes through *specific sensory and philosophical detail*:
- "She walked with her hands in the earth for long years" (inferring herbalism as physical practice)
- "The muse did not return, or if it did, Minaro was no longer capable of receiving it"

**Opus** embellishes through *historical authority and worldbuilding*:
- "a title of no small significance among the elves, for whom the composition of verse was regarded as a sacred act"
- "Their deaths unrecorded in detail but mourned in silence"

### 4.2 Wild Guess Discipline

| Model | Wild Guesses | Nature |
|-------|-------------|--------|
| Haiku | 4 | Speculation about internal conscience, regret, future risk |
| Sonnet | 2 | (a) What drew Minaro to accept Lene; (b) dreams before curse showed disturbing imagery |
| Opus | 0 | Zero wild guesses; all unsupported claims kept to CREATIVE LICENSE or PROBABLE |

**Key Finding:** The more capable the model, the fewer unsupported speculations. Opus maintained the most disciplined separation between "plausible inference" and "wild guess," keeping all speculative content within the CREATIVE LICENSE or PROBABLE categories.

---

## 5. Self-Assessment Quality

### 5.1 Coverage Matrix Thoroughness

**Haiku:** Provides a functional matrix with broad category groupings. Lists facts used (144) and omitted (134) with category-level explanations. Includes a "Coverage by Life Phase" breakdown table — unique among the three.

**Sonnet:** The most thorough coverage matrix. Lists individual omitted facts with specific reasons. Includes a "Claims Not In Registry" section with 7 specific ungrounded claims analyzed. The most honest self-assessment.

**Opus:** Most comprehensive omission table — lists every single omitted fact ID with a specific reason. The most systematic approach to self-validation. Includes a "Claims Not In Registry" section with 14 items.

### 5.2 Annotation Granularity

**Haiku:** Annotated narrative faithfully reproduces Section 1 text with inline tags. Tags are applied at the claim level — most sentences get 1-2 tags.

**Sonnet:** The most granular annotation — multiple tags per sentence, sometimes tagging individual clauses within a sentence. Also unique in embedding the rationale directly into the tag (e.g., `[CREATIVE LICENSE — the philosophical interpretation of the werebeast condition]`).

**Opus:** Clean annotation with fact IDs. Tags applied at claim-cluster level rather than individual clause. More readable annotated version but slightly less granular than Sonnet's.

---

## 6. Model-Effect Summary

### 6.1 Tier Characteristics

| Dimension | Haiku | Sonnet | Opus |
|-----------|-------|--------|------|
| **Strength** | Speed, efficiency, solid structure | Literary voice, emotional depth, self-aware narration | Comprehensive coverage, disciplined accuracy, architectural sophistication |
| **Weakness** | Flatter prose, more wild guesses | Slightly less systematic coverage matrix | Slightly more clinical than Sonnet |
| **Best for** | Quick summaries, bulk narrative generation | Showcase/publication-quality narratives | Gold-standard reference narratives |
| **Chronicle voice** | Competent | Excellent (best) | Very good |
| **Factual discipline** | Good (4 wild guesses) | Very good (2 wild guesses) | Excellent (0 wild guesses) |
| **Self-assessment** | Adequate | Thorough | Most systematic |

### 6.2 The Coverage-Quality Tradeoff

There is no tradeoff. Opus achieves both the highest factual coverage (71.6%) AND the most disciplined creative approach (0 wild guesses, 0 fabrications). Sonnet achieves the best prose quality despite lower coverage. Haiku is the fastest but sacrifices both coverage and prose quality.

### 6.3 Implications for Chronicler

1. **For Phase 3 (Narrative Engine):** Use Sonnet as the default narrative model — best balance of prose quality, coverage, and cost. Reserve Opus for gold-standard/publication-quality narratives where accuracy is paramount.

2. **For automated validation:** The fact-tagging system works across all tiers. Any model can produce annotated output that a validation pipeline can parse.

3. **For prompt engineering:** The current prompt format (full fact registry + narrative instructions) works well. All models understood the 4-section output format. The zero-fabrication result across all three tiers validates the approach.

4. **For model selection in production:** Haiku could serve for "quick summary" or "preview" narratives where speed matters. Sonnet for user-facing narratives. Opus for quality assurance and reference generation.

---

## 7. Memorable Passages

### Sonnet (best single passage):
> "Let us sit with this moment, because the chronicle demands it. Here is a woman who had spent more than two centuries in service to beauty, to verse, to prayer, to the patient instruction of students she only reluctantly agreed to teach. A creature of such profound artistic commitment that she achieved mastery in poetry, in speaking, in conversation, in the herbalist's knowledge of the living world. Two hundred and nine years of a life that produced no violent act, caused no death, accumulated no enemies. And then a dwarf's bite in some unrecorded place, and all of it undone."

### Opus (best thematic moment):
> "Her last poem was composed in the year 190, while praying to Romi. It was called 'Boils and the Floors.' The title, in light of what was to come, reads as prophecy — the painful and the mundane, the affliction and the merely structural, pressed together in two words."

### Haiku (best direct statement):
> "The records do not speculate on whether Minaro took these lives deliberately or in blind rage, whether she chose these small creatures or whether they simply stood before her at the moment of her transformation. Yet the fact remains: she killed children."

---

## 8. Experiment Metadata

| Parameter | Value |
|-----------|-------|
| Fact registry | 278 facts (F001–F278) |
| Prompt length | ~3,500 words (identical across all three) |
| Models | claude-haiku-4-5, claude-sonnet-4-6, claude-opus-4-6 |
| Temperature | Default (per model) |
| Execution | Parallel (all three launched simultaneously) |
| Completion order | Haiku first (~5 min), Sonnet (~8 min), Opus (~12 min) |
| Total output | 25,674 words across 1,263 lines |
| Fabrications | 0 (all models) |

---

*Comparative Analysis v1.0 — Chronicler Narrative Gold-Standard Experiment*
