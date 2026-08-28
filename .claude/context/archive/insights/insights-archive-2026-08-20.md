# Insights Archive — 2026-08-20
# Rotated: 2026-08-20T22:32:04Z (9 entries)

### 2026-07-12 [2dabeeff71b6]

This decomposes the "0.82→0.90 gap" I was going to spend weeks on:
- **verse-span error** (v12-31 vs v12-30 on-page): **+0.034** (0.8163 → 0.8502)
- **reference-vs-page divergence** (s_dismas ≠ actual print): **+0.045** (0.8502 → 0.8955)
- **actual recognizer gap** (OCR vs the true printed page): **0.045** (0.8955 → 0.90)

So of the "0.083 gap" I was measuring, **only 0.045 was the recognizer** — the other 0.038 was s_dismas + verse-span not being the printed page. The recognizer is *much* closer to bar than the sweep suggested.

### 2026-07-12 [c875fcdf83dc]

- A static `file://` page **cannot write to disk** — the browser sandbox forbids it. So a one-click "submit → file I can read" needs a tiny local server with a POST endpoint. I'll use Python's stdlib `http.server` (no Flask dependency) bound to `127.0.0.1` only.
- I'll make it **locus-parameterized** from the start (dropdown over all ground-truth files), so the same tool serves all 15+ pages as I add them — not a throwaway for one page.
- Correction granularity = **per-line editable fields** pre-filled with my reading. That matches my GT's line structure, which is also what I need for line-level recognizer alignment later. Plus a glyph palette (ſ æ œ † ‖) so you can type archaic characters easily.

### 2026-07-12 [a3591acac319]

- **Why a server and not a static file:** browsers sandbox `file://` pages from writing to disk, so a one-click "submit → file I can read" is impossible without a local endpoint. The stdlib server binds `127.0.0.1` only (not exposed to the network), and the raster/GT/submit paths are all containment-guarded under the project dir.
- **Why per-line fields:** your corrections land keyed by `line_index`, which is exactly the structure I need later to align each corrected line to its raster crop for recognizer fine-tuning. The review UI and the training-data format are the same object.
- **The tool is already general:** the locus dropdown reads every file in `ground-truth/`, so as I add Psalms 118, Matthew 26, etc., they'll just appear in the same page — no rebuild.

### 2026-07-12 [fa548a1e089f]

- **s_dismas has an error my GT caught**: it inlines `eloquia` *into* verse 103 ("more eloquia then honie"), but on the page that's a **left-margin Latin gloss** (`* elogia`) keyed to "wordes", not verse text. My GT separates it correctly — a concrete case where the reference is wrong and the human-reviewed GT is right.
- **The tool can't show this page's apparatus yet.** Psalms 118 has a rich `apparatus[]` (italic annotations, Nun/Samech section markers, signature) and a `catchword` — structures Gen 24 didn't have. The current `gt_review.html` only renders `body[]` + `marginalia[]`, so you'd be blind to the annotation uncertains (`reidie`, `diſplaſed`, `bridleth`).

### 2026-07-14 [831ff2a559cf]

- **The state file lies about recency.** `session-state.md` was last written 2026-06-15 (Palimpsest), but git shows a full month of newer work since — the live thread is **OriginalDR** (a custom-OCR reconstruction effort) plus a batch of **JICM/Nexus infrastructure** commits. When state files and git disagree, git wins; the stale doc is itself a hygiene signal in my domain.
- **Domain split matters here.** The scratchpad's entire tail is OriginalDR OCR (seg_v2, consensus rungs, ground-truth) — that's **W0's product work**, not mine. My W5 lane is the *infrastructure underneath it*: JICM watcher, hooks, skills, Nexus control-plane. The recent `645b00f fix(jicm): autonomous hard-threshold trigger` and the Nexus hardening commits are the ones in my lane.

### 2026-07-15 [df78949ceb14]

The strongest methodological result of this batch isn't any single page — it's that **the w/vv choice is a per-volume, per-face property of the physical type-case, resolvable by zooming one capital `W`.** A solid single-sort capital proves the font owns a lowercase `w`, so vv-looking lowercase is a *cut*, not a digraph. That single test now disambiguates the whole corpus (NT-1582 vs OT-1609/1610) and is exactly the kind of volume-level prior the re-OCR ladder can key on. Each GT file records the regime in `layout_note` + `glyph_regime_resolved`, so it's training signal, not just a transcription.

### 2026-07-15 [9cbb03d9d2a5]

The prune targets are entries that got **superseded by the work just completed**, not arbitrary old lines:
1. **Fork option (A)** ("extend GT to more layouts") — that *was* this task; it's now done, so the fork collapses to just (B), the consensus rung.
2. **The old glyph rule** ("real `w` in body, footnotes use vv") — now refined and partly corrected by the volume-scoped finding; keep the pointer, drop the superseded specifics.
3. **The 2-exemplar GROUND TRUTH list** — subsumed by the 25-loci COMPLETE block; compress to just the distinction that matters (which 2 are Sir-reviewed vs. 23 first-pass).
The freshest blocks (COMPLETE, corrections, glyph finding) stay intact — pruning removes the *replaced*, not the *recent*.

### 2026-07-15 [21293ecd495f]

Each requested skill now has concrete evidence, which is what makes a CV credible rather than a keyword-stuffed list:
- **Pipeline validation** → Oncomine triple data-quality gate + FDA-submission standards; Bayer GCKD "gates that exit non-zero on violation"; Natera `setdiff` lossless-join validation.
- **Proteomic ETL** (the one I was worried about) → *genuinely supported*: the Bayer GCKD renal panel is **protein biomarkers** (NGAL, galectin-3, osteopontin, copeptin, MR-proANP), plus STRING/PPI + Reactome protein-interaction ontologies in the Knowledge Graph. I'll frame it honestly as protein-biomarker/interaction work, not mass-spec.
- **Real-world data** → the Optum engagement is *explicitly* CDISC SDTM/ADaM-modeled real-world evidence.
- **Ontology mapping/enrichment** → Eli Lilly OMOP CDM (SNOMED↔ICD-10-CM via OHDSI/Athena) + the 20-ontology Clinical Knowledge Graph.
- **Unstructured-data harmonization** → Natera free-text/PHI fields → relational schema; NLP free-text→coded-concept.

### 2026-07-15 [28e46640505a]

**Two dispatch surfaces to Alfred, and they compose.** (1) *Pulse tickets* labeled `agent:aifred` are the **durable** coordination substrate — Nexus's 5-min cron dispatcher routes them, and they give me a queryable monitoring surface via the Pulse MCP. (2) The **Protos pane** (`aion:1`) is a *live, idle* Alfred seed session at its input prompt with bypass-permissions on — the **immediate** execution channel. The robust pattern is: I create precise tickets (I've done the recon, so Alfred doesn't re-derive), then hand the live seed session the mission pointing at those tickets to coordinate/execute.

# Insights Archive — 2026-08-20
# Rotated: 2026-08-21T04:32:07Z (8 entries)

### 2026-07-15 [ffa66108be41]

Notice Alfred **independently chose** to handle SW-1 directly rather than delegate it — "destructive file ops warrant care." That's the right instinct: the folder move is the one irreversible step (source deletion), so it stays with the coordinator, not a fire-and-forget subagent. My briefing's "verify byte-for-byte before deleting source" guardrail reinforced that.

### 2026-07-15 [ddb10e121399]

**The validation did its job — it caught a real failure.** Fixing the crash-loop and lifting the pause was necessary but *not sufficient*: the ticket never leaves `staging:wait`, and no managed executor spawns. The evaluation→queue→execute promotion stage is broken (compounded by the missing `pulse` CLI). This is a genuine debugging project, not a one-liner — exactly the kind of thing "validate first" exists to surface before real work is trusted to it.

### 2026-07-15 [c04fe2ecc64e]

This is the third deliberate off-switch. The Nexus autonomous system was shut down through **multiple independent, intentional mechanisms** around the same time: the `.nexus-paused` sentinel (Jun 19) *and* a `launchctl disable` on every agent. That belt-and-suspenders pattern is a strong signal the shutdown was **deliberate**, not an accident — you can't `bootstrap` a disabled service (hence the EIO error); it must be `enable`d first. The plists lint clean, so nothing is broken — they're just switched off on purpose.

### 2026-07-15 [8d49348da428]

**The flood is stale, and I triggered it.** All 15 `systems-engineer` load-failure notifications are dated **Jun 19–20** — they sat *pending* (undelivered) for 27 days because the delivery infra was down. When I loaded the dispatcher ~20 min ago, it drained that queue → Keryx/Telegram fired all 15 at once. They're now marked `delivered` (0 pending), so no *new* real failures — but I need to confirm the delivery isn't looping, and fix the **root cause**: the `systems-engineer` persona directory **doesn't exist** (task `AION-dda8ac46` was routed to a non-existent persona → `prompt_load_failed` → fell back to default).

### 2026-07-15 [bc77a64d3cf3]

**One root cause, several dependent symptoms.** (1) **Ollama down + loopback-bound** → every LLM-gated stage fails ⇒ staging-revert + review-thrash (the Jun 19 incident) — **fixed**. Secondary/independent gaps: (2) review has no backoff cap, so a *persistent* Ollama failure thrashes rather than parks; (3) Flask clobbers the logger to WARNING, hiding heartbeats; (4) dashboard delivery URL is `:8600` not `:8701`; (5) `pulse` CLI missing for some personas; (6) evaluator can assign a non-existent persona.

### 2026-07-15 [9cb8b1272444]

The validation confirms the Ollama outage was the whole story: with it restored, the state machine — which was well-built all along — advances cleanly through every gate. The Jun 19 "reviewer thrash" was review reverting `completed:no` on every Ollama failure; with Ollama healthy, review returns a verdict once and closes.

### 2026-07-15 [486223d256a8]

The Jarvis-dev (W11) `claude` command currently has **no `--model` flag** — so it inherits the CLI default rather than `AION_MODEL`. To put *this window* on Fable 5 I must add `--model '${AION_MODEL}'` explicitly, not just change line 55. The same `--effort high --add-dir…` fragment appears **4×** (both the add-to-existing and fresh-create paths, each with resume/session-id variants), so one `replace_all` fixes them together. And `~/Claude/Projects` + `~/Claude/GitRepos` are *outside* cwd, so they need explicit `--add-dir` grants (alfred is already under cwd).

### 2026-07-16 [d73a1ccfdd10]

One behavior to expect on restart: the launcher will `--resume` W0's existing conversation, which was recorded under Opus. Resuming it with `--model claude-fable-5` is fine — Claude Code honors the `--model` override and continues on Fable 5 — but the prompt **prefix cache resets** on the model switch (a one-time cost, not an error). If you'd rather start W0 clean on Fable 5, launch with `--fresh`.

