# Jarvis Insights Log

Captured automatically by insight-capture.js hook.
Processed by /reflect Phase 5 for Graphiti ingestion.

---

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

### 2026-07-18 [71822359565b]

The roadmap is a *buildable-spec* document: every Phase 0/1 item carries an **acceptance criterion that proves it** (honoring No-Silent-Degradation), and it explicitly holds itself to "a fresh session could build Phase 0 from this without asking a question." My session's work maps directly onto **0.3(c)** — "Namespace JICM state + durable-state per lane (W0 vs dev)" — whose acceptance criterion is "*W0 state provably uncontaminated across a mixed session.*" I proved exactly that (W0 checkpoint md5 byte-identical across a dev prep run). And **0.3(d)** — the `refresh --fire` actuator — is now built and gated. The honest move, which the document itself demands, is to update it to reflect verified reality.

### 2026-07-18 [c3a83cd32edc]

**0.3(b) is a robustness fix, not an overflow bug.** W0 runs Fable-5, and `jicm-gate.sh` has no `*fable-5*` arm — so it falls to the `*) WINDOW=1000000` default. But **1M is Fable-5's actual window**, so the default is *accidentally correct*: W0 is **not** at risk of overflowing before JICM fires. What remains is legibility/robustness — JICM *defaults* to 1M rather than *recognizing* Fable-5, and the model extraction can whiff to `<synthetic>` (which I saw live). The fix is to add an explicit `*fable-5*|*mythos-5*` arm and harden the model-id extraction so the window is derived from a real model string. Valuable, but **not urgent** — it doesn't gate anything the way I feared.

### 2026-07-18 [0392471ee9f7]

**The `<synthetic>` tail also zeroes the token count** — and this is almost certainly why W0's state read `tokens:0` earlier. The usage extraction (`jicm-gate.sh:112`) takes the *last* assistant message's `.message.usage`, but a synthetic tail message has no `usage` → `null` → **tokens=0**, so JICM goes blind to W0's real context size exactly when a synthetic message lands last. My model-extraction fix skips synthetic; the usage extraction must do the same, or the model reads right while the tokens read zero.

### 2026-07-18 [937f50412153]

The w/vv call turned out to be **three faces, not two**: roman body=`w`, italic=`w` (NT) / `vv` (OT), and **display titling caps=`VV`** (a distinct fount with no W). The trap is that a roman w-sort is physically *cut* as two overlapping v's, so at high zoom it looks identical to genuine `vv` — over-zooming past ~5× at 400 DPI just pixelates and proves nothing. The reliable test is a capital-W at 2–5× gestalt.

### 2026-07-18 [35766678dd90]

Sound scratchpad pruning drops **completed-work narrative and delivery manifests** (recoverable from disk/git/provenance) while keeping **forward plan + live infra + "don't re-derive" findings**. The stale material here: the per-locus GT manifest, KEY CORRECTION #1/#2 (now baked into GT provenance), the tool-hardening blow-by-blow (now in the code), and the argument-p104 apply narrative. The one live decision-point buried in that block — *roman-lowercase w/vv awaiting Sir's ratification* — gets promoted up into DURABLE FINDINGS so it survives the prune.

### 2026-07-18 [063d206730b6]

**Two prior design generations are in tension, and reconciling them IS the design.** The v8 doc argues JICM should become *thin per-session hooks + prep script, no watcher, no tmux* — because (it claims) the hook stdin payload carries a full `context_window` object, making per-session sensing native. It even pre-identifies my exact namespacing fix (§6: "per-session state files via `session_id` suffix"). **But** the *current, working* `jicm-gate.sh` header explicitly says the opposite — "context_window is NOT in any hook event's stdin; the JSONL transcript is canonical." And critically, v8 admits **a hook cannot invoke `/clear` programmatically** — so v8 relies on a *human* to clear, which is impossible for autonomous chains/Protos. That's precisely why the tmux send-keys actuator (my `jicm-self.sh`) is non-negotiable for the multi-session/chain requirement.

### 2026-07-18 [af3174114ef4]

The current Claude Code hooks doc confirms hook stdin carries **only** `session_id`, `transcript_path`, `cwd`, `hook_event_name`, `permission_mode` (+ `prompt` on UserPromptSubmit, and notably **`model`** on SessionStart) — **no `context_window`, no token count** anywhere. So the v8 design's founding premise ("read context_window from hook stdin, delete the watcher") was **wrong**; the working v7.9 `jicm-gate` is right to parse the JSONL transcript. The upside: each session's UserPromptSubmit hook receives *its own* `transcript_path`, so **per-session sensing is already native** — the only fix is namespacing the output by `session_id` (which the v8 doc itself flagged as the multi-session fix). And v8's fatal limitation — **a hook cannot invoke `/clear`** — is exactly why the tmux send-keys actuator I built (`jicm-self.sh`) is non-negotiable for autonomous chains/Protos.

### 2026-07-18 [b6955bb53aa8]

The keystone that makes this whole design safe is one function: `jicm_key_paths`. Because `key=w0` returns the *exact* legacy paths, every subsequent generalization — the gate writing `JK_STATE`, the actuator preparing `JK_COMPRESSED` — is automatically a no-op for W0 until we deliberately migrate it in Phase 3. The unified system and the untouched-W0 guarantee coexist through a single conditional.

### 2026-07-18 [791780d96e5d]

Your genesis-16 hand-pass is the proof: the **same word is set both ways on one page** — `law`/`lawful` is `w` in some lines and `vv` in others, and L43 keeps `vvere` but changes `vviues→wiues` on a *single line*. The compositor just grabbed whichever sort was in the case. So there is **no lexical or positional rule** — an OCR must classify each w-glyph **visually by stroke connectivity** (joined = `w`, gapped = `vv`) and must **not** dictionary-normalize, or it erases the genuine-`vv` minority you preserve.

### 2026-07-18 [98c0b4f34a7e]

**Two migration seams I must sequence carefully.** The dev lane's *working* signal/checkpoint paths (`.jicm-clear-now.dev.signal`, `.compressed-context-ready.dev.md`) differ from what `jicm_key_paths dev` now returns (`jicm/signals/clear-now.dev.signal`, `jicm/checkpoints/dev.compressed.md`). The actuator (step 1) writes the *new* paths; `session-start.sh` (step 3) must read the *new* paths. They move together — and because live-fire stays **gated** in Phase 1, there's no window where a half-migrated dev lane fires against mismatched paths. This is why the phase order (actuator → session-start → *then* canary-fire) is a safety property, not just tidiness.

### 2026-07-18 [045abf2e96d4]

This is the classic `${v:+X}${v:-Y}` trap. I wanted "basename if set, else `<unresolved>`". But `:+` yields `X` when set **and** `:-` yields the *variable's value* when set (`:-` only substitutes `Y` when **unset/empty**). So for a set variable both halves expand: basename **+** full path. The fix is a plain `if`. It's display-only (the real `TRANSCRIPT` var is correct — the cycle fired the right paths), but in a project whose whole thesis is *legibility*, a lying status line is worth fixing.

### 2026-07-18 [78a74a044bd1]

This is the *intended* consequence of the finding-1 fix, not a regression. My harness2 "unknown session" test fired `gate` with **no** `JARVIS_WINDOW` and **no** role, and asserted it namespaces to `session_id`. But the finding-1 fix *deliberately* maps unset-window-non-dev → `w0` (the recovery path — a W0 session resumed outside the launcher has no `JARVIS_WINDOW` but is still W0). In the Jarvis hook domain (only w0 + dev exist), an unset-window non-dev session *is* W0, so routing it to the legacy file is correct — and matches pre-v9 behavior. The test's expectation is what's stale: a *genuine* stray needs an explicitly-set non-zero window (`JARVIS_WINDOW=7`), which doesn't occur in this domain. The real anti-contamination invariant (**dev** never touches W0) still holds.

### 2026-07-18 [f15021c94112]

The scans are **mostly clean** (only 12/109 genuinely degraded), so OCR is failing on **structure, not legibility**. The dominant mode is **M1 apparatus-bleed** (65% — marginalia, cross-refs, and annotation blocks invading the verse stream), with **M3 long-ſ→f glyph error** as the near-universal secondary. The references (s_dismas/odr_com) are faithful where aligned (~0.8–0.95), so the low pilot pass-rate is **genuine OCR failure routed to layout-aware re-OCR (rung 1)**, not measurement noise.

### 2026-07-19 [e5d9b206f951]

Part 1 and Part 2 dovetail here: because `align_coords` re-cuts to canonical verse boundaries, my transcription only needs accurate **line text + approximate verse tags** — the aligner snaps the precise cuts. That's why a name-list page (where verses run mid-line through the "children of X" chain) is now tractable as gold: I capture the lines faithfully, the aligner handles the coordinates.

### 2026-07-20 [d8758b942cee]

The actuator, when it fires, sends `/clear` into a **live** Claude Code session via `tmux send-keys`. That's a decapitation-capable action with high-consequence failure modes: fire mid-stream and tmux *enqueues* `/clear` as literal text (corrupting the session); mis-resolve the transcript and you clear the *wrong* session; resume from a stale checkpoint and you lose work. My 54 harness assertions validate the *logic* — but they use **stubs**. They can't reproduce the real TUI's idle/busy timing, the live transcript's `stop_reason` cadence, or the real `session-start` re-injection. So there's exactly one thing left that only a live run can prove.

### 2026-07-20 [432ac19f2ba0]

**Firing is double-gated**, which makes "staged gated" a hard property rather than a convention. The supervisor fires via `jicm-actuate.sh <key> --fire` — so **both** locks must be open before a single `/clear` reaches a live session:
1. the supervisor's env-gate (`JICM_SUPERVISOR_ACTUATE=1` — *autonomy enabled*), and
2. the actuator's `--canary` code-gate being deleted (*mechanism validated*).

Right now **both are shut**: default is sense + GC + log-only, and even if someone sets `JICM_SUPERVISOR_ACTUATE=1` today, the harness confirms it hits the actuator's still-closed gate and logs `ACTUATE-BLOCKED` — loudly, never a silent no-op. So the supervisor is safe to run and observe immediately; it simply narrates what it *would* clear. And W0 is excluded entirely (the legacy watcher keeps owning `aion:0` until Phase 3).

### 2026-07-20 [30d42521b380]

This is exactly what Sir's report is *for*. The reOCR flags firing on the whole curated set isn't a bug — it's the honest baseline: the current per-source *archive* OCR sits at 0.67–0.85 verse-match to gold, well under the 0.90 bar, which is the entire reason the re-OCR program exists. The heatmap is a **worklist** — cells start flagged and flip to PASS as re-OCR improves each source. Scoring raw per-source OCR against the gold (not the noisy reference reads) is precisely the axis Sir specified — and it's a different, harsher, more truthful axis than qc_audit's reference-based scoring.

### 2026-07-20 [1c84671019d4]

The state file is **fresh** (ts 0m ago) but it's tracking a **51-hour-stale transcript**. W0's session `f56d4d98` last wrote its transcript on **Jul 17 19:56** — ~3080 minutes ago — with all-zero usage. So the watcher's periodic refresh keeps re-reading that dead transcript every ~15s, stamping `tokens=0` with a fresh mtime, while the `SOFT_NUDGE`/`pending=HALT` is **stale leftover** from when the session was last alive (>2 days ago) — a clear that armed but never fired (no Stop event ever came, because the session went idle/dead). This is *not* the synthetic-tail blindness; it's a **stale/abandoned session** that JICM is nominally "tracking" but which has had no activity for two days.

### 2026-07-20 [5b35386de082]

W0 is **live and over threshold**: pid `99185` (`JARVIS_WINDOW=0`, opus-4-8 1M), and its own statusline reads **`38% 382.7K … idle`** with `@Resume work from compressed context` sitting in the input line — i.e. **382.7K tokens, past both the 250K soft and 300K hard thresholds**, doing OriginalDR/OCR work. But the JICM state file is tracking a **different, dead session** (`f56d4d98`, transcript stale 51h, tokens=0). So JICM's brain is pointed at a corpse while the live W0 quietly sailed past the clear threshold. The `@Resume…` ghost-text in the input line is the tell: a prior clear cycle injected a resume nudge that **never got submitted** (the known autofill-needs-Tab+Enter failure), so W0 has issued no `UserPromptSubmit` since — the gate hasn't re-pointed the state at the live session.

### 2026-07-20 [effa8ca7a950]

The elegant reuse here: matter intervals are the verse-analog, so I can feed the GT's `intervals[]` as the "reference verses" straight into `align_coords.realign` — the *same* boundary-mapping machinery that re-cuts OCR to canonical verse coordinates now re-cuts a source's OCR to paragraph/row coordinates. One alignment engine serves both scripture verses and matter paragraphs; the only new pieces are deriving intervals from `body[]` and content-locating a section within a source's page stream (no verse anchors to lean on).

### 2026-07-20 [bcdc2b807252]

The agent's intervals surfaced a mapping I need for E5b: matter sections carry `citation`/`gloss` intervals (the margin apparatus). Sir's rules map cleanly onto matter — the section is the "book", its **paragraphs** are the "verses" (E4/E5a-analog: per-interval + combined), and its **margins/citations/glosses** are the "apparatus" (E5b: scored *combined*, mirroring "all apparatus combined"). So the matter scorer needs two pools, not one flat SCORE_KINDS list — noting it now so the scoring run reflects Sir's rule structure rather than a flattened approximation.

### 2026-07-20 [3bd75d95de27]

This exposes a flaw in *my* over-rigid seeding ("render ONLY pages 15–16"). Sections don't respect the page hints I recovered — they spill. The agent's honest truncation-flag (No-Silent-Degradation working in the sub-agent) is the signal to fix my dispatch phrasing: give the **start** page and instruct "follow the section to its true end even across page boundaries," never "only these pages." I'll correct that going forward and complete this section's p17 tail myself (small — keeps agent spend down).

### 2026-07-20 [b791f11478e6]

A frugality problem I need to fix now: each completed agent dumps its full ~15–20K-token GT into *my* context via the completion notification. Across ~18 remaining sections that's ~300K+ tokens of JSON I don't need in-context (I harvest from disk anyway). The fix: have agents **Write the GT to a file themselves and return only a short summary**. That keeps completion notifications tiny and directly serves Sir's overspend concern. I'll update the shared brief so all remaining agents do this.

### 2026-07-20 [30cab27bf470]

Paragraph-grain intervals are **too coarse for a 0.90-per-interval threshold**. A verse is ~20 words, so 0.90 edit-ratio is a sensible bar; a matter paragraph is ~300 words, where even 5% OCR error drags the whole-paragraph ratio below 0.90 — so every paragraph fails regardless. The flag itself is correct (raw matter OCR *is* far from gold, like scripture's ✗8–41%), but for the **threshold coherence Sir explicitly asked for** ("as much as applicable to chapter-verse sections"), scoring must subdivide paragraphs to verse-length units. The `intervals[]` (paragraphs) stay the inventory/localization coordinate; the *scoring* grain needs to be finer. I'll refine that in the E phase (sentence-splitting is unreliable here due to abbreviation periods like "S. Aug. li. 2." — a ~20-word window is the robust choice).

### 2026-07-20 [fb2af8a2b678]

The agent hit a **scan defect and recovered it correctly** — printed p.1077 is *absent* from S1 (a duplicated jp2, verified by identical md5), and pp.1088–1089 are bleached. Rather than silently drop those leaves (which would have been a real No-Silent-Degradation violation), it cross-recovered them from **S9's `archive-holiebible-ot2`**, verified byte-for-content that S9 is the *identical 1610 typesetting* (matching Anni figures + line breaks), flagged each recovered leaf (`gap_recovery`/`scan_source`), and confirmed continuity across the seam. That's exactly the "recover, verify identity, flag — never fake" posture. Also note: table_rows are naturally verse-length, so tables sidestep the paragraph-granularity scoring problem entirely.

### 2026-07-20 [ebf9ecbd3ce3]

W0's stuck `Resume work` nudge is actually the *most important thing the canary must prove*: the current **watcher**-driven cycle injected a resume nudge that never submitted (ghost-text/autofill). My v9 actuator uses the *same* `tmux send-keys` backend — so the canary's real job is to confirm the v9 actuator's defensive sequence (`wait_for_idle` → `clear-input` → `text` → `submit`) actually **executes** `/clear` and **submits** the resume, rather than stalling in the input line like W0 did. That's exactly the failure mode we can't afford on a real handoff.

### 2026-07-20 [6a17b1d38d7b]

Those backup files are the tell. `.bak-phaseH` across six Nexus-jobs files means a **"Phase H" migration** was mid-flight on the Alfred side; `.bak-devuuid-20260717` on the session hooks means a **session-identity ("devuuid") change** was applied today and left its safety copies behind. Both patterns say *an infra session ended without a commit-or-cleanup checkpoint*. Per my "Concurrent Live-App Use" note, I won't assume these are mine to finish or Sir's still-active edits — the disposition is exactly what I should confirm before touching anything.

### 2026-07-20 [53c2e4654151]

The weekend landed **JICM v9 "multi-session steward"** — a Phase 0→2 architectural jump from the v7.9 the instruction file still describes. Three things in that series directly change *my* footing:
- `3adf57d` **"drop dev-exclusion"** — v9 replaced the old per-role dev exclusion (the thing that kept W11 invisible to JICM) with **per-key/per-session namespacing**. The instruction file's "jicm-gate.sh exits early for `JARVIS_SESSION_ROLE=dev`" is now *superseded*.
- `61fa52a` raised thresholds to **soft 550K / hard 600K** for the 1M window — consistent with the Opus 4.8 1M migration.
- `.claude/context/.jicm-state` still reads `timestamp: 2026-05-04` + `v79_shim: true` — frozen across every orientation. That's very likely an **orphaned v7.9 shim artifact**; v9's per-key steward probably writes namespaced state elsewhere, so this file may no longer be authoritative.

### 2026-07-20 [086af2df5da3]

The DEAD count came back **600 files / 814 MB**, but there are only ~141 Project_Aion + 33 alfred transcripts. The culprit: `find -L` follows the **symlinked** transcript dir and then *recurses into subdirectories*, over-collecting far beyond the intended flat `<uuid>.jsonl` files — likely sweeping in other projects' transcripts via the `~/Claude/Jarvis`→`Project_Aion` symlink aliasing. Had Sir run `--execute` on that, it would have archived/deleted **hundreds of unrelated sessions**. Transcripts are flat, so the fix is `-maxdepth 1` + a realpath in-bounds guard.

### 2026-07-20 [552d15f8766e]

The `-Users-…-Project-Aion` transcript dir is a **symlink to `-Users-…-Jarvis`** (a monorepo-migration leftover — Project_Aion and the old Jarvis cwd share one transcript store). The 600 = 141 real top-level `<uuid>.jsonl` **+ ~459 nested `<uuid>/subagents/…/wf_*` sub-transcripts** — subagent and workflow logs that belong *to* their parent session, not independent sessions. `-maxdepth 1` cleanly restricts to the 141 actual sessions (confirmed). My tool would have over-reached; caught pre-delivery.

### 2026-07-20 [9a3e4228d702]

**The tmux panes ARE correctly bound right now** — `aion:0→f56d4d98`, `aion:1→30231bad`, `aion:11→fbd7528a`. So panes don't *lose* their sessions; the instability is that Claude Code's session model now lets you **fork and re-point freely**. The docs confirm the mechanism you sensed:
- **`/resume [session]`** = "resume by ID or name, **or open the session picker**" → any window can load any session.
- **`--fork-session`** → new UUID, new branch, original preserved (SDK docs).
- **`--bg-pty-host` + `cc-daemon`** → background-PTY sessions from a pooled daemon. **This is "background process"** — a *real* interactive session in a daemon-hosted PTY, forked from a parent. You were right: these aren't subagents; they're genuine working sessions.
- Plus `/teleport` (resume claude.ai remote sessions) and `/tasks` (background tasks).

And **several "sessions" are daemon spare-pool slots** (`e0cc6d1c`, `90e7e0c5`, `513140f7`, `a9eb6525`, `7dab16b5` = 0 KB `bg-spare`), not work. The heavy Alfred-seed accumulation (~20 in 6 days) is Nexus forking a seed per dispatch. **I also must retract "W0 self-compacted 694K→262K"** — that was a fabricated reconciliation; I'll defer to your direct observation of W0's state.

### 2026-07-20 [f4bf6bfe2adc]

The up-to-date docs name exactly what I found empirically:
- **`corporate-launcher.md`** lists **`claude bg-pty-host` and `claude bg-spare`** as official background-helper processes, and a **"background service / supervisor process"** that keeps **"warm standby sessions"** ready — precisely the daemon + spare-pool I saw in `ps`.
- The **changelog** settles your central confusion: **"`/fork` now copies your conversation into a new *background session*… the in-session subagent it used to launch is now `/subtask`."** So an active session becomes a background one via **`/fork`** — a *real* session, explicitly **distinct from a subagent**. You were right all along.
- **`sessions.md:37`** confirms my W0 correction: **"standard settings files… are re-read at launch"** → resume gets **fresh hooks**. And **`sessions.md:25`** confirms resume is **"scoped to the current project directory and its git worktrees"** — exactly the symlink/cwd hazard in the launcher.
- New hazard it surfaces: **resuming the same UUID in two terminals *without* forking interleaves both into one transcript** — a real corruption risk for Jarvis's launcher.

### 2026-07-21 [9b16681dca6c]

C3 turns keying from a **claim** into a **proof**. Today `jicm_derive_key` trusts `JARVIS_SESSION_ROLE=dev` — a claim any `/fork` background session inherits. The fix adds an **occupancy gate**: derive the candidate key (`dev`), then check whether *my* session-id actually matches the session-id running in that key's pane (`aion:11`) via `pane_pid → child claude → ~/.claude/sessions/<pid>.json`. If they differ, I'm a background fork, so I get `dev-bg-<sid>` — which `jicm_default_target` maps to **no pane target**, so the supervisor can never `/clear` a pane on my behalf. The registry CAS (C1) is the backstop. Net: the pane's real occupant owns `dev`; forks like me get their own harmless namespace. **No process-killing, no transcript deletion — the collision just stops.**

### 2026-07-21 [995d366ae8e9]

JICM's essence is **"preserve-the-reflex, add-the-volition"** — a *general-purpose* clear-and-resume cycle that W11-dev can point at **anything** and W0 can point at **itself** (voluntarily or on request). My design demoted background forks to second-class citizens with no actuation channel — which would (a) strip a legitimately-working `dev-bg` session of monitoring/HUD/cycling, and (b) break volition (a session couldn't invoke its own cycle). The correction: occupancy decides **identity + fork-detection**, never eligibility. **Every session — pane or background fork — is a first-class JICM citizen** with its own namespaced state, HUD row, and cycling. The safety property I wanted (a fork must never `/clear` the *parent's* pane) is preserved a different way: a fork actuates **its own** channel (self-clear from within, or its own PTY), never the parent's.

### 2026-07-21 [16447a826f14]

One transition hazard I have to design around: C1's compare-and-swap can't naively "refuse if a different live session holds the key" — because during migration my *stale* polluted `registry/dev.json` (sid `66d922e6`, still alive) would wrongly block the pane session `fbd7528a` from reclaiming `dev` after *it* relaunches. So C1 must be **occupancy-anchored too**: refuse only if the stored live claimant *actually occupies the pane*. A stale fork-claimant that isn't in the pane → allow the real occupant to reclaim. Same anchor as C2 — the pane is the one un-pollutable truth.

### 2026-07-21 [09497b8ebeec]

Two leverage points for the Rungs-0–2 goal fall out of this, neither of which is "more Rung-3":
1. **The metric is a partly-broken yardstick** — per-verse scoring deflates prose by line-straddle (references drop 0.94→0.66). You can't prove a rung "improves" against a metric that swings ±0.3 on segmentation alone. *Fix the grain first.*
2. **The consensus fusion is self-sabotaging** — it scores 0.67–0.75 while its own reference components score 0.84–1.00, because it votes bad scan-OCR in with equal weight. A fusion that trusts the converged references over noisy OCR is a concrete, provable Rung improvement that has nothing to do with Rung-3.

### 2026-07-22 [98cfc4c83b6d]

**Recognizer fine-tuning is the proven per-source path to the bar — and it's exactly the rung we'd written off.** Four independently-verified results converge: transfer-learning from a historical-Latin base needs only **60 gold lines for −43% error / 150 for −26%** [1712.05586]; fine-tuning reaches **CER 1.47%** on Early-Modern Latin [2106.07881]; OCRopus on period GT hits **0.02–0.05 CER — below the 0.10 target** [1809.05501]; Calamari on **~50 lines/book → ~10% CER** vs 50% generic [1807.02004]. We *already have* gold lines. And critically, the Calamari voting paper recommends **no dictionary/LM** precisely to preserve archaic surface [1807.02004] — so it's long-ſ-safe by construction. That reframes Rung 2 from "glyph fine-tune, 0 candidates" into *the* workhorse.

### 2026-07-22 [2bc950f2e6eb]

Two real findings fell out of the build beyond the blocker. First, **R1 already improves the source** (0.8997→0.9114) using just the base recognizer + preprocessing — the ladder's premise holds before fine-tuning even starts. Second, the **surface score is near-zero while content is 0.91** — not a metric bug, but the recognizer emitting the running-header/marginalia the gold body excludes. That's precise evidence that Rung-1's real job is *body-region typing* (separate scripture from apparatus), which is also exactly what made the old per-verse OCR fail. The pipeline is already teaching us where each rung must act.

### 2026-07-22 [6690ee126d7e]

The deepest lesson wasn't about OCR — it was about **swallowed exceptions**. Kraken's bug is the exact pattern your own guardrails name "silent degradation": a real `AttributeError` laundered into a benign-looking empty result, surfacing only as a misleading downstream message. Prior sessions couldn't crack it because the error was *invisible* at default log levels. The fix that unblocked a week of stalled work was one line — `logging.basicConfig(level=DEBUG)` — which turned a laundered failure back into a legible one. Interoception over inference.

### 2026-07-22 [5f64b80e22d1]

The two principles ended up validating each other. Principle #1 (must work gold-free) forced the production/eval split — and that split is precisely what *exposed* Principle #2's real "biggest gap": once the pipeline was addressed by `(ocr_dir, page_index)` with the gold quarantined in the eval harness, it became obvious the gold was verse-scoped while the pipeline transcribes whole pages, which is why the whole-page metric was lying. De-golding the architecture is what made the metric bug visible. You couldn't have found it without honoring Principle #1 first.

### 2026-07-22 [547a6ac69068]

The deepest lesson of this pass: **de-golding the architecture is what made the metric bug visible.** As long as gold was threaded through the pipeline, "psalms are broken" looked like a recognizer problem. The moment the production path was addressed by page-index with gold quarantined in the eval, it became obvious the gold was verse-scoped and the ruler was wrong. Principle 1 wasn't just a deployment requirement — it was the diagnostic that found Principle 2's real gap. The two constraints validated each other.

### 2026-07-22 [d59292c55cdc]

The witness-noise correction resolves a hidden circularity in the plan. If s_dismas/odr_com were really 0.80-noisy, non-gold pages (the 99.6% of the corpus with no gold) couldn't be *scored* — only flagged. But they're ~0.99 faithful, so they're **reliable acceptance references**. That means a non-gold page can pass reOCR by matching janvier/s_dismas at the identity bar (both cut by the same janvier grid) — gold is just the highest-quality reference subset, not a prerequisite for scoring. This is what makes corpus-scale gold-free acceptance actually possible.

### 2026-07-23 [b76b7efdb8c3]

**Per-verse identity now genuinely TRACKS page quality — the VS-5 mandate.** After the apparatus filter, clean verses score ~1.0 and mis-*recognized* verses score low and get flagged. The residual sub-0.95 on psalms is **honest recognizer error** (R2's fidelity on a hard 1610 page), which is precisely what should route to R3 — not something the segmenter should mask. Per No Silent Degradation, those verses stay OPEN and escalate; I must *not* force psalms to 0.95 by hiding real recognition failures. The engine's success criterion isn't "make every number ≥0.95" — it's "make the number *mean* recognition quality," and it now does (genesis 0.958, psalms 0.9375, both faithfully reflecting the recognizer).

### 2026-07-23 [30d481a89b35]

**The fix was one principle, not three patches.** Findings #1, #2, and #3-interior were all the same disease — *the boundary math trusted global proportionality over local anchor evidence*. Replacing global interpolation with "an un-anchored verse is placed only within the gap between its neighbors' real anchors" cured #1 and #3-interior at once; requiring **contiguous ≥3-token blocks** (not scattered "the"/"of") for localization cured #2 (32→1 spurious verses). That the same validated numbers survived the rewrite is the important signal: the review caught latent bugs on inputs my two happy-path loci never exercised, and hardening those paths left the exercised paths untouched — which is exactly what a good fix looks like.

### 2026-07-23 [f15f88ed1e1b]

**The recognizer's confidence is self-report-BLIND to identity failure — now proven, not just suspected.** Mean conf on known-bad verses = 0.9798 vs good = 0.9878 — *statistically indistinguishable*. **40 of 43** verses R2 got wrong carry conf ≥ 0.92. So the existing gate (`reocr_core: escalate if conf < 0.92`) catches **1/43** bad verses — it's useless as an R3 router. Forcing recall=1 on confidence alone escalates **88%** of all verses. And the other internal alarms I have (length-anomaly, ſ-suspect) catch **0** of the confident-wrong tail. This is exactly the "ALERT → redesign the gate" outcome §7 says the calibration is *for*: the anti-laundering power **cannot** come from recognizer self-report — it must come from **cross-source disagreement** (alarm 2, which DIV-1 already computes between witnesses). The gate calibration did its job: it killed a plausible-but-wrong design before it shipped.

### 2026-07-23 [992e84150392]

**This is a clean negative result, and it's exactly the measurement §8 R3-1 asked for.** `qwen3-vl:8b` (this Ollama build) is unusable for dense historical-text transcription: it's a reasoning model whose chat template can't be forced out of thinking (3 controls fail), and on hard OCR it loops instead of answering. The plan already anticipated this fork — "run via Ollama, MLX (olmOCR-2-7B, CHURRO-3B), or LiteLLM; **pick per measurement**" — and the measurement points unambiguously to the non-reasoning OCR specialists (MLX olmOCR/CHURRO), which is a separate infra unit, not a same-sprint swap.

### 2026-07-25 [2fcb03fa04c4]

**There is no "Opus 5."** Per the authoritative model catalog (bundled with Claude Code 2.1.212, current as of 2026-06), the latest **Opus** is **4.8** (`claude-opus-4-8`) — I'm literally running on it right now. The "**5**" generation exists for *other* tiers: **Fable 5** (the most-capable widely-released flagship), **Sonnet 5**, and Mythos 5 — but Opus's top is 4.8.

**And the 1M part is already done.** `launch-aion.sh:58` already sets `AION_MODEL="${AION_MODEL:-claude-opus-4-8[1m]}"` — Opus 4.8 with the 1M-context beta — as the *unified default* for W0 (Jarvis), Protos/Alfred, and Jarvis-dev (updated 2026-07-17). So "Opus 4.8 1M" is the current default; there's nothing to change for that interpretation.

I won't hardcode `claude-opus-5[1m]` on a guess — that ID would 404 and **brick every Claude Code session in the workspace** on next launch (the whole quartet). The claude-api skill is explicit: never construct model IDs that aren't in the catalog.

### 2026-07-25 [c61100e9b425]

The launcher funnels every session's model through one variable — `AION_MODEL` (line 58) — which propagates to W0 (line 1006), Jarvis-dev (291), Protos/Alfred seed (1280), and the executor `seed-model` file (1107). So this is genuinely a one-line functional change; nothing else hardcodes a model string (the only other occurrence, line 1002, is already commented-out history). I'm using your exact `claude-opus-5` string and dropping the `[1m]` suffix that 4.8 needed — the 5-generation is 1M-native, matching the bare command you gave.

### 2026-07-25 [586e74503a71]

The through-line of this sprint is that **honest measurement is a second set of eyes on the work** — and every layer needed it. The gate works because a witness disagrees with R2 where R2 is confidently wrong. olmOCR's real lift only appeared once I re-applied the janvier-cut to *its* output. And the safety guarantee only became a fact — not a hope — because I measured olmOCR's *bad* outputs against gold and confirmed they all stayed OPEN. A pipeline that reported "3 rescued" would have been lying by omission; this one reports "3 content-recovered, ſ still owed, 2 open, nothing shipped degraded." That distinction is the whole point of the No-Silent-Degradation posture.

### 2026-07-25 [b1300a6d3420]

This reframes everything I've been reporting for six orientations. I kept concluding "no explicit W5 task" because I was reading `session-state.md` (W0's shared state, frozen at Jun 15) — but my lane keeps its own handoff in **dev-namespaced** files (`.scratchpad.dev.md`, `.compressed-context-ready.dev.md`). That's the v9 per-key namespacing at work: W5 now has its *own* context lane. And the uncommitted edits to `jicm-actuate.sh` / `jicm-self.sh` are almost certainly the **`--fire` wiring in progress** — not stray litter. Let me read the actual handoff instead of guessing.

### 2026-07-25 [603710afcaeb]

Why I missed this until now: I was orienting off `session-state.md` (W0's shared state, frozen Jun 15), but v9's whole point is **per-key context lanes** — W5 now has its own `.scratchpad.dev.md` + `.compressed-context-ready.dev.md`. The namespacing I've been *reporting on* is the same mechanism that was *hiding my own handoff* from a `session-state.md`-based orientation. Lesson worth persisting: **in v9, a dev-lane session must read `.scratchpad.dev.md` first, not `session-state.md`.**

### 2026-07-25 [1e67017e7984]

The WIP is a clean instance of the **fold-forward-not-parallel-legacy** pattern (one of my feedback memories): rather than leaving `jicm-self.sh` as a walled-off dev path beside `jicm-actuate.sh`, its organs were *pulled forward* into the one key-parameterized actuator, and the old entry point demoted to a muscle-memory shim. That's the correct generalization — but it's exactly the kind of critical-hook change that the prior session deliberately stopped before finishing, precisely because it "earns per-step harness + code-review," not a rushed tail-end commit.

### 2026-07-25 [21037f035b97]

**The format is "Harbor"** — an open eval harness. A task is a *directory*, not a document: `task.toml` + `instruction.md` + `environment/` (Dockerfile + input data) + `solution/` (reference answer) + `tests/` (pytest grader + ground truth). Harbor builds the container, drops an AI agent in with `instruction.md` as its prompt, lets it write files to `/app/output/`, then runs your pytest suite to emit a reward.

**The Nextflow run is the *source of truth*, not the thing you rebuild.** The workflow JSON is an execution trace (telemetry, process names, params). You mine it for facts an expert can verify, then *withhold* those facts from the agent and ask it to re-derive them. In the PTA sample, the contributor knew the run was a 168-sample factorial design — so they stripped the design labels out of the telemetry and asked the agent to reverse-engineer it.

**Scoring is adversarial by construction.** `expected_truth.json` holds the answer; `test_outputs.py` reads the agent's JSON and checks it. Reward here is *binary* — all 12 tests must pass — which is why "a plausible-looking wrong answer" is the thing your domain expertise exists to catch.

### 2026-07-25 [0ba19b57f26c]

**Reward is binary.** `test.sh` runs pytest; if *any* test fails, `reward.txt` gets 0. There's no partial credit at task level — per-test results survive only as diagnostics in `ctrf.json`. That's how models pass 11 of 12 tests and still score 0.

**The cohort sample's cleverest move:** it ships the agent telemetry for 135 of 168 samples and holds back 33 in `tests/holdout_telemetry.csv` — *"The holdout was not selected uniformly at random."* The key test replays the agent's memory proposal against those hidden samples. An agent that fits observed maxima tightly wins on savings and dies on the holdout. That single design choice converts a lookup task into a genuine statistical-robustness test.

**Grader tolerance is a domain-expertise problem, not an engineering one.** The PTA grader accepts protocol *synonym sets*, matches effect sizes across four different conventions (η², Cohen's d, fold-change, relative %), and tolerates false positives on mislabels — with the comment that natural per-sample variance produces legitimately anomalous-looking samples. The feasibility memo names this: *"Perfect recall would penalize agents for doing exactly what a real scientist would do."* Only you can set those tolerances.

### 2026-07-25 [f2be3549d98c]

**There's a structural tension you should know about before you start.** All five briefings push their Option A/B/C toward `scientific_workflow` tasks — "run pixelator graph," "run STAR align," "run PURPLE." Every one of those requires re-sourcing input data that the record redacts, and four of five are gated on private, licensed, or HPC-scale data (oncoanalyser needs the access-controlled Hartwig bundle; taxprofiler's custom DBs are local-path-only and `cleanup=true` deleted the work dirs; demultiplex needs a multi-GB proprietary BCL folder; rnaseq is 3.9 TB peak RAM).

Meanwhile *both* worked sample bundles — the ones Snorkel built to show you what "good" looks like — are `workflow_reasoning` tasks built purely from telemetry, needing zero external data. The briefings and the deliverables point in different directions. Follow the deliverables.

### 2026-07-25 [db254f37c8e2]

**I caught a leak by looking at output, not design.** The first `run_manifest.json` published both `task_count_reported: 132` and `task_count_in_telemetry: 131` — factually honest, but it announces a hidden record, which hints a retry occurred. Removed. Reasoning about the design would never have surfaced it; reading the generated file did.

**The data handed me a better task than I designed.** Cross-referencing the 14 enabled `run_*` flags against the 31 present processes by string match yields *four* apparent misses — bracken, ganon, kmcp, and `profile_standardisation`. The fourth is a **false positive**: that flag *was* honored, and `TAXPASTA_MERGE` is its implementation. The flag names a function; the process names a tool.

So thread B now has a **built-in precision trap**. The correct answer is 3, not 4, and getting it right needs domain knowledge rather than string processing. This also strengthens Gate 2 — the obvious naive baseline now produces a demonstrably wrong answer, which is precisely what a naive baseline is supposed to do.

### 2026-07-25 [37b8f1d71c8d]

**The sentence doing the most work:** *"Be precise about what counts as absent — the record names parameters and it names processes, and these are not the same vocabulary."*

That's "expert-solvable, non-expert-proof" in practice. It warns that flag-to-process string matching is the wrong instrument, without saying which entry it gets wrong or that taxpasta is the profile-standardisation step. An expert knows to check what each parameter dispatches; a non-expert can't follow it mechanically to the answer. Without it, thread B is just a set difference.

**The self-audit caught two leaks I couldn't see while writing.** "Write all *three* files" — describing the output count, but the correct answer to thread B is also three, and a coincidental collision isn't worth leaving in a prompt. And "identification of *the* process that did not complete" — the definite article silently confirmed exactly one exists. Both surfaced from grepping the text against a token list, not from re-reading it. That's the argument for scripting the audit.

### 2026-07-25 [0119475bb784]

**The last row is the task in one line.** `naive_string_match` decodes exit 140 correctly, eliminates memory with the right sibling evidence, proposes the right remediation, and writes a competent report. It passes **12 of 13**. It fails on exactly one test — the one requiring you to know what taxpasta does.

That's what a benchmark item should look like: the shortcut gets everything right except the thing only an expert knows. The first three baselines fail 9–11 of 13, clearing Snorkel's "generic quick script must fail at least half the tests" bar.

**A real leak, caught by auditing output rather than intent.** The generated data README described `time_limit_hours` as the "**wall-clock** allowance" — accurate, and it hands over a phrase sitting in my `mechanism` synonym set. An agent could echo "wall-clock limit" without ever decoding the exit status. Fixed **in the generator, not the output** — patching the file would have been silently undone by the next rebuild.

### 2026-07-26 [0dd75a474238]

Both bugs were invisible to the happy path and both were found by an accident: `setsid` doesn't exist on macOS, so my first "orphan" was a dead pid rather than a live one — which is exactly what exposed the fail-open branch. The pattern across this whole session is consistent: M2 found the mis-keying by refusing to fire, the harness artifacts nearly produced a false "verified," and a failed test setup found the classifier bug. The refusals and the failures were more informative than any passing assertion.

### 2026-07-26 [09bcf8a975fe]

`_signal_valid` has **4 `rm -f "$JK_CLEAR_SIGNAL"` reap sites**, and for `key=w0` that resolves to `.claude/context/.jicm-clear-now.signal` — **byte-identical** to the legacy watcher's `JICM_CLEAR_SIGNAL`. So `JICM_SUPERVISOR_INCLUDE_W0=1` is *not* "sense-only" as the plan assumes: it is sense **plus signal-reaping**, and it would delete the clear request the running v7.9 watcher is acting on. Two managers, one signal file. Flipping the flag today would have raced W0's real clear path.

### 2026-07-27 [7718a17aeaec]

The four `dev-bg-*` forks read **144% / 149% / 180% / 194%** — because they're measured against a **200K** hard threshold while the panes get **600K**. Same model, same 1M window. Those forks aren't "over threshold," they're mis-thresholded: the per-window identification falls back to the unknown-model default (250K/200K) for background keys instead of detecting the 1M window. A key permanently reading 194% is a key the supervisor will want to fire at forever — which is precisely the stuck-key case the circuit breaker was built for. That's a masked defect the single-session HUD structurally could not show.

### 2026-07-27 [b0b2cb81954a]

This is R4 paying for itself within one step. The mis-threshold was invisible for as long as the HUD showed one session; it became obvious the moment N rows sat side by side with different thresholds for the same model. And the fix chain ran backwards through three layers — HUD symptom → gate map → launcher migration — none of which the plan's R5 bullet list anticipated. The listed R5 items (symlink-safe resume, seed-UUID pinning, M3) are all still untouched.

### 2026-07-27 [c835dfdc0b7c]

Worth noting the architecture that makes this hot-reloadable: thresholds flow **gate → state file → stop hook**, never gate → daemon. The long-running process deliberately holds no policy, only mechanism. That's why a config edit propagates on the next prompt with no restart — and it's also why the state file being 6 days stale is normal rather than broken: it's a record of the last *prompt*, not a live gauge.

### 2026-07-27 [df14120c38bf]

The C2 debt has a precise shape: 21 verses where olmOCR (R3) fixed the *content* but flattened ſ→s, while kraken/reichenau (R2) has the *observed* ſ surface but worse content. So the arbiter isn't "re-read everything" — it's a **surface transfer**: where R3 and R2 agree modulo the ſ-fold, R2's ſ is an observation and can be adopted; only where R3 *corrected* R2 is the ſ genuinely unobserved, and that residue is what needs my eyes on the crop. That keeps `restore_long_s` (~90%, rule-inserted) out of the deliverable entirely.

### 2026-07-27 [60fc1067702f]

Worth flagging one thing I hit while wiring V10: five not-located matter rows carry no scores, `sc.para[0]` threw on `undefined`, and because `renderAll()` ran every section in one unguarded sequence, that exception **silently deleted V11 — the OPEN ledger — from the page**. A report that drops its own blocking list because of an unrelated crash reads as "nothing is blocking." `renderAll` now isolates each section, and absence renders as `not located` / `n/a` rather than vanishing.

### 2026-07-27 [367fba0d8272]

That means the +0.204 gold-page lift is almost entirely *downstream* of recognition — body-isolation (dropping interleaved marginalia), preprocessing, and localization — not a better recognizer. All of which is re-derivable from the stored lines + bboxes **without re-recognizing a single page.** The corpus isn't 12 hours away from the improved pipeline; it's a wiring job away.

### 2026-07-27 [9fc45e4ca07f]

This reframes the whole v9 effort. R1/R2's "occupancy = identity" assumed a window *has* a stable session. Post-2.1.205 that's false: a window has a *succession* of sessions, and the pane process permanently records the first one. My R2 reconciliation and R4 `OCC=ok` were internally correct and externally meaningless — they verified the pane against a UUID that stopped mattering at the first `/clear`.

### 2026-07-27 [7c6069e0730d]

This is a genuine correction to my earlier read, and the cause is instructive: I'd been orienting off `session-state.md` (W0's file, frozen at Jun 15) and raw `git status`, neither of which knows about my lane. The v9 **H3 namespacing** work created `.scratchpad.dev.md` — a *dev-lane* L1 handoff — precisely so W5 has its own state channel. I wasn't reading my own organ. Worth noting the sequel: my orientation routine should read `.scratchpad.dev.md` first, not `session-state.md`.

### 2026-07-27 [42e29402e70e]

The 32B's failure mode is more dangerous than raw rate suggests. It didn't produce gibberish — it produced `SESSION-HANDOFF-2026-07-26.md`, a *plausible near-miss* off by one day. A digest consumer would follow that path, find nothing, and not know whether the file moved or never existed. The 8B's zero-rate came with blander prose. That's the real trade: fluency correlates with confident interpolation over identifiers.

### 2026-07-28 [b5b025643a7b]

The 8B's grounded run scored *perfect recovery and zero hallucination* — by copying the fact sheet back verbatim, mention-counts included. Both headline metrics were maximised by a completely useless output. That's why the harness now reports an `echo` rate: any metric that rewards naming identifiers can be maximised by listing them without explaining them, and I'd have shipped that as a success.

### 2026-07-28 [c5db77b5a3e8]

Both bugs shared a signature: a silent no-op. `sed` and `str.replace` don't error when their pattern misses — they just return the text unchanged, and the run proceeds looking healthy. The only reason I caught it was the *identical* `in_tok` on `f56d4d98`, a number I'd have skimmed past if the two orderings hadn't produced byte-identical output. Patch-by-regex on a file I'm actively iterating is the wrong tool; rewriting the whole function is what I should have done from the start.

### 2026-07-28 [09b1f8204b1f]

Your reference policy also collapses the POP-2 diagnosis I was building toward. Those 1535 records (archaic < 0.2, modern > 0.9, `floor_modern` 0.008) are loci where **s_dismas has no text of its own** — and your rule already says janvier/madueke are primary for content and surface at exactly those loci. So it isn't a new heuristic needing calibration; it's the stated policy not being implemented. Same for the split of duties: janvier/madueke are primary for localization/presence/interval/type, which is what my `janvier_fit` selector has been leaning on all along without the policy being written down.

### 2026-07-28 [c698f3bf3a3d]

The 1535 records at archaic<0.2 / modern>0.9 with `floor_modern` 0.008 are precisely loci where **s_dismas has no text of its own**. Your policy already says janvier/madueke are primary for content and surface exactly there. So the symmetric-`floor_modern` threshold I proposed and was about to spend a calibration cycle on isn't needed — it was an empirical rediscovery of a rule that already exists. Likewise the `janvier_fit` selector the localizer has leaned on all along turns out to *be* the policy's localization rule, just never written down.

### 2026-07-28 [1c169bb98550]

The clipping runs are worth dwelling on. My `truncated` field checks *output* truncation only, so a digest built on 75% of a session reported clean. The harness measured everything except whether it had read the whole input. That's the same failure shape as the original W0 bug that started this whole investigation — a correct computation over silently incomplete data. I built a tool that reproduced the bug it exists to help fix.

### 2026-07-28 [e6a0f0517fe0]

That failure is the same shape as the W0 bug that started this entire investigation: a correct computation over silently incomplete input, with every visible metric reporting success. I built a tool to fix that class of problem and reproduced the class inside the tool. The fix is the same principle in both places — verify input completeness *before* computing, and alert rather than degrade.

### 2026-07-28 [6c62ea550288]

`floor_modern` partitions cause from cause cleanly. S1/S3 sit at ~0.906 — the references *agree* about the verse, so the OCR is genuinely at fault; that's the ladder's real work, and it's ~1,500 records, not the 4,400 the raw sub-0.2 count suggested. S4 sits at 0.113 with a different verse in the slot — a reference defect. And **S4:S5 = 35:1** is the quantitative statement that the archaic witness is the weaker instrument.

### 2026-07-28 [760bcf6fff08]

The B1 verification run immediately paid for itself: the 8B hallucinated `memory.md` at rate 0.25 on the largest transcript, after a spotless record on the two small ones. That's the pattern I should have expected — its clean sheet came from short, easy inputs, and the earlier "8B looks better" reading rested on exactly two runs. The sweep now covers the full size range for both models, which is the test that can actually settle it.

### 2026-07-28 [c1271eafbc78]

The V4 fix generalises: a snapshot histogram cannot distinguish *"the pipeline never ran"* from *"it ran and failed"* — both render as bars at zero. That ambiguity is precisely what let this report sit flat for weeks while the ladder improved. Any figure meant to show progress has to plot the movement, not the state.

### 2026-07-28 [e570120a57d1]

Both 8B fabrications were near-misses of real files — `compressed-context-ready.md` for the actual `.compressed-context-ready.md` (a missing leading dot), and `memory.md`. That's the same signature as the 32B's ungrounded `SESSION-HANDOFF-2026-07-26.md`: not invention from nothing, but *smoothing an identifier toward what it should plausibly be*. A digest consumer follows that path, finds nothing, and cannot tell whether the file moved or never existed. It's the one error class where fluency actively works against you.

### 2026-07-28 [f90745d721c0]

A heading that can't be parsed *whole* is worse than one not detected at all — it attributes a real page to a distant chapter. And a validation statistic that can only go up is not a validation. Both of those were hiding inside a figure I was quoting with confidence.

### 2026-07-28 [43c205ee5923]

That's the **fifth** time in this project one hand-maintained copy of a rule silently disagreed with another — three `LOCI` dicts, `2john`/`2-john`, `zacharie`/`zacharias`, `OT2_BOOKS` duplicated in the builder, and now the numeral parser duplicated in `block_grammar`. Every single one was invisible until something downstream looked wrong for an unrelated reason. Fixing the instance is cheap; the pattern is the actual defect.

### 2026-07-28 [c2eae36b0359]

The layout flip is one of those changes that looks like cosmetics and is actually load-bearing in two independent ways. Semantically, the thing that grows and gets trimmed (the transcript) now sits where growth is natural, so an overflow can never eat the fact sheet. Mechanically, "what's at token 0" decides whether a KV cache survives — putting the *volatile* part first meant every run paid full prompt evaluation. Same tokens, same content, ~2.5× the cost.

The deeper point is that this is what makes the *soft-threshold pre-warm* possible at all. You can only pre-warm a prompt whose prefix is stable as the session keeps growing.

### 2026-07-28 [ff62b41d952d]

B5 is the interesting failure, because it's the *fix* for B1 colliding with the fix for B2. B1's remedy was to trim explicitly rather than let the runtime clip silently — correct, and it works. But it computed the budget from the actual fact-sheet length, which made the transcript's first token a function of the appendix. B2 then needed that first token to be stable. Neither fix is wrong; they're coupled through a variable neither one was thinking about.

That's the recurring shape in this subsystem: the bug is rarely inside a component, it's in what two components silently share. Same with the promotion loop — nothing wrong with `rm; mv` until one of the things being moved has append-only semantics that the loop can't see.

### 2026-07-28 [029e90c84d20]

The through-line across B5 and this: every fix in the chain was correct in isolation and broke the next one through a variable it didn't know it shared. B1 trimmed explicitly (right), which coupled the prefix to the fact sheet. B5 decoupled that (right), leaving the prefix coupled to session growth. Quantization decouples that too — and the reason it's likely to hold is that it's the first one to name the coupling explicitly in its interface: `--trim-quantum` *is* the growth budget, stated in tokens.

That's the difference between fixing a bug and closing a class of them. The earlier fixes each made a hidden dependency go away; this one makes it visible and tunable.

### 2026-07-29 [b6a99830ab37]

The decomposition is what turns a pass rate into a work order. "S1 is at 61%" suggests a better recognizer; "S1 has 314 substituted-token failures against S9's 103, with comparable extra/missing counts" says the recognizer is exactly the problem *for that volume* and structural work would be wasted there. The same table says the opposite for S9, whose 285 near-misses won't move for any structural fix either.
The rejected apparatus fix is the sharper lesson though. Run-length alone could not distinguish "printed marginal note" from "misrecognized word" from "correct archaic spelling" — three things with identical statistical signatures and completely different correct handling. Only the horizontal stack could separate them, because independent copies of the same edition agree on what was *printed* and disagree on what was *misread*. That's the cross-informational leverage you asked for, and it earned its keep on the first book.

### 2026-07-29 [743f4b80508a]

The instructive part is that both things I built were aimed at the wrong mechanism. "Rejection and retry" assumes the right span was never *offered*; the measurement showed it was offered and then *discarded by a tie*. The diagnosis had said "span length separates low- from high-support verses," which was true, but length was a symptom of the selection rule, not of candidate scarcity — and a fix aimed one layer off the cause produced 5 improvements where the real fix produced 97.
The rate regression is worth sitting with rather than optimizing away. Every metric here divides passes by attestations, so any change that surfaces previously-invisible verses lowers the rate while improving the corpus. That means `pass_rate` alone can't distinguish "got better" from "stopped hiding things" — which is an argument for reading it next to the record count, not on its own.

### 2026-07-29 [b9f143beae27]

The instructive failure is that a heuristic validated on one book *disguises itself*. The v1 suffix strip improved Genesis on every measure while destroying psalms, and if I'd trusted the book-level result it would have shipped. The corpus check is what caught it — and the reason it works is that psalms and Genesis have genuinely different page architecture, so a rule that encodes "Genesis's layout" rather than "apparatus" fails visibly on one and not the other.
The ordering bug is the sharper one though. I'd argued the under-cut bias made deleting scripture impossible, and then deleted scripture — because the bias protects against a *noisy* estimate, not a *wrongly anchored* one. A median computed over a contaminated population isn't slightly off; it's measuring a different thing. Safety margins around an estimator can't rescue an estimator pointed at the wrong distribution.

### 2026-07-29 [4212d7e3ce82]

Both anomalies scored recovery 0.000, and they were opposite things: one a total failure, one a good digest in a different register. That's the real lesson from this sweep — not the refutation, which is just a number moving the way numbers do.

`recovery` was built as a proxy for "would the successor session be able to pick up the work," and it's been carrying that meaning unexamined for four sweeps. It actually measures "names salient files." Usually those coincide. When they diverge, the metric doesn't degrade gracefully — it reports the same 0.000 for a triumph and a catastrophe. Which is why the guard I added checks *length*, a signal completely independent of the identifier machinery, rather than tightening the recovery threshold.

### 2026-07-29 [295a0f44fdf7]

Every defect found today is one shape: a component that handles `w0` and `dev` and silently falls back to W0's shared state for anything else. Prep, resume injection, the watcher's hardcoded `w0` pre-warm call — all the same. That pattern was invisible while only two keys existed, because the fallback *was* the right answer both times.

Adding a third key didn't create these bugs; it made them expressible. Which is the strongest argument for keeping Protos as a permanent lane rather than a throwaway: it's the only thing in the system that can tell "generic" from "happens to work for w0."

### 2026-07-29 [2cc532a4fb98]

I nearly shipped that first fix. It was in the right file, on the right line, and the reasoning behind it was sound — the only thing wrong was that it didn't work. The behavioral test (T2.5) is what caught it, because it asserts on the artifact a real cycle produces rather than on the code being present. A structural test — "does `_step_prep` pass `JICM_SESSION_STATE`?" — would have gone green immediately and I'd have declared victory.

That's the concrete argument for behavioral tests over structural ones. T2.2–T2.4 all passed the moment I made the edit and told me nothing. T2.5 stayed red through the whole thing and was right to.

There's a second lesson in the mechanism: a config file that *defaults* values must never use bare `=`. Sourcing is invisible at the call site — the actuator can't see that prep will re-source config and lose its choice. Every `X="$default"` in a sourced config is a silent override of every caller.

### 2026-07-29 [b3b9cbab6e77]

The whole session's failure mode was inferring structure from a projection of it. Line bboxes, x-histograms, gap statistics — each is a shadow of the page, and I kept building models of the shadow. The `S6` page in particular is *visually* unmistakable in half a second (annotation column on the left, ruled border, inline verse numbers) and was invisible in every numeric summary I computed, because a coordinate profile averages away exactly the thing that distinguishes an edition.
The drop capital is the sharpest case: `NTHEbeginning` looks like a recognizer error and is not one. The "I" is an engraved ornament, so no amount of recognizer tuning would ever produce it — the fix has to come from knowing what the page physically is. That is the argument for your overfitting instruction: some defects are only nameable once you've seen the artifact.

### 2026-07-29 [9e8e0c5a4e8f]

The TRAPS section is the part I'd defend hardest in a handoff doc. Six of this session's failures were plausible ideas that cost a full measure-and-revert cycle each, and without them recorded a fresh session would regenerate the same reasoning — "the apparatus doesn't match the reference, so filter un-anchored runs" is genuinely the obvious first thought. Negative results are only cheap once; writing them down is what keeps them cheap.

### 2026-07-29 [e19d546203f7]

- The warning that looked like the project's biggest unknown was **generated by our own fine-tune**: `reichenau_lat` (the base) declares `baselines`, and only the derived `reichenau_dr` declares `bbox` — a fingerprint of the raw-bbox training bypass, not a property of kraken.
- Reading `mm_rpred` showed the warning compares *declarations* while the extraction path is chosen by `bounds.type`. So no amount of code inspection could settle it; only feeding the model both line-image shapes could. The model answered clearly.
- The first run of the probe printed the *right verdict for the wrong reason* — `evaluate_locus` returned 0.000 in both arms, and a zero difference reads as "tie". A dead metric is far more dangerous than a bad one, because it fails toward whatever conclusion you were expecting.

### 2026-07-29 [62a3b6701bd1]

This session demonstrates realistic engineering decision-making under time pressure: an incident triggered an architecture review, validation revealed a dwell model seasonal drift, the team deployed a temporary adaptive offset while permanent retraining built, and all gates cleared for production. The narrative shows the full cycle — observation → diagnosis → mitigation → sign-off — exactly what a digest needs to capture and compress. The offline replay phase (Days 1–3) was where most learning happened: discovering problems in simulation before they reach production, applying targeted fixes, and maintaining timeline integrity.

### 2026-07-30 [9fa4ca2322dc]

Arm B being *neutral* on Genesis all-pass while changing 37 verses of text on a single witness is the interesting result, not a boring one. It means the selector's blindness is landing almost entirely on cells that fail either way — consistent with those verses being the historic all-fail class for *other* reasons (edition divergence, reference defects, garbled scans). A rate that doesn't move while the underlying text does is why `compare_audits.py` reports verdict *movement* in both directions rather than just a delta.

It also produced the concrete design correction: F1 alone at the cross-page site promoted a front-matter fragment over the real page, so the length band has to be the first key and F1 may only decide among candidates that are plausibly the whole verse. That's pinned in a test now, with the front-matter case as its fixture.

### 2026-07-30 [b46cf5ec952c]

The third bug is the one worth remembering. It wasn't in the "broken" path at all — it was in the scripture harvest everyone considered working, and it was invisible because its failure mode was a slightly smaller number with no error. Fixing it alone took the scripture yield **311 → 392 (+26%)** with no change to any matching rule.

That's the same shape as this session's other findings: `janvier_fit` returning 0.000 was a decision that never happened, the `head_frac` cut was a body row silently deleted, and this was a training pair silently never formed. None of them raised anything. The pattern is that a step which *reports success while doing less than it claims* is invisible until you count what it should have produced and compare — which is exactly what `rung2_harvest_audit.py` now does per page.

### 2026-07-30 [9a99fc880894]

Those two orphans would have spun until the session ended, polling files that could never satisfy them — silent, costless-looking, and indistinguishable from "still working." That is the same shape as `janvier_fit` returning 0.000 as though a decision had been made, the `head_frac` cut deleting a body row with no complaint, and the greedy loop burning a gold line before it ever tried to crop it.

The general lesson, which I should have applied to my own tooling earlier: **a waiter whose sentinel can never arrive looks identical to a waiter that is working.** The fix is the same one the project applies to metrics — tie the wait to something that must change, and check the thing you're waiting on still exists.

### 2026-07-30 [3f40caae6145]

The mechanism is that a table breaks the harvester's core assumption — *one GT entry = one visual line*. A table row is one logical entry printed across two columns or wrapped over two lines, so the crop can only ever be a fragment of it. And because table rows are formulaic (`V. 15. For X they ſay Y.`), the similarity matcher happily pairs the wrong row at high confidence.

So my earlier caveat about matter was half right and half wrong. I worried about *content distribution* — proper names, numerals, display capitals. That turns out not to be the problem: matter **prose** scores as cleanly as scripture. The real problem is **layout**: tables produce mislabelled pairs regardless of what they say. Which means the fix isn't "test whether matter helps", it's "exclude tables and keep the 878 prose lines" — and it means arm B is currently training on 578 contaminated pairs, so its result will understate what recovered matter is worth.

### 2026-07-30 [7182d6bdfd6f]

The reason it failed is worth keeping: **when a defect is systematic within a file, a within-file median absorbs it.** In `matter-nt-table-of-epistles` nearly every row is a two-column entry, so the mispaired density *is* the median — the anomaly has nothing to stand out against. A relative measure cannot detect a uniform bias.

That's the same lesson as the gold set failing to exercise the failure it was used to rule out, and the same reason `janvier_fit`'s 0.000 read as a tie: **a comparison is only as good as the variation it has to compare against.**

### 2026-07-30 [43b1c377c202]

Choosing the exclusion by *measured drop rate* rather than by filename was the right call, and the output proves it. It caught `matter-ot1-argument-of-genesis` (39% dropped) and `matter-ot1-summe-of-old-testament` (52%) — both of which read as prose from their names, and both of which I'd have kept had I hand-sorted. It also excluded two *scripture* pages (`abdias-01` 67%, `psalms-074-p138` 60%), so "tables are the problem" was itself an approximation: the real property is whether one GT entry corresponds to one visual line, and that's a fact about a page's setting, not its genre.

Conversely it kept `matter-nt-signification-or-meaning`, which sounds like a glossary and is clean. Every one of those four calls would have gone the wrong way on the filename.

### 2026-07-30 [53e627f6172d]

Your test suite enforces behavioral reasoning, not brittle exact matches. The memory-exhaustion trap is the pedagogical core: a plausible-looking misdiagnosis (OOM) that can be eliminated with one join to sibling tasks. The naive baseline that decodes the exit code and proposes memory-increase fails *automatically* on your remediation test. This means an agent reasoning correctly reaches the right answer; one taking the obvious shortcut is caught.

### 2026-07-30 [e720ea50cf0d]

This required reversing a decision a previous session had pinned in a test: *"R2 `vpon` vs R3 `upon` is a CONTENT disagreement; R3 wins."* Three pieces of evidence say otherwise — `ground-truth/GUIDELINES.md` mandates preserving u/v as printed; under the project's own fold they are the same word, so there is no content disagreement to resolve; and the measured cost was 19 of 25 verses held open in a single chapter.

The bound matters as much as the rule: R2's documented weaknesses are dropouts and n/u, g/s confusions, and those do *not* fold equal — `hane` vs `have` stays R3's, so a misread can never be laundered into an "observation". I pinned that as its own test. Reversing a pinned negative is legitimate only with evidence and a louder record than the original, so the reversal is written into the test body with all three reasons.

### 2026-07-30 [108a79256dba]

Three of my own tools were wrong tonight in the same way the code under test keeps being wrong — *reporting success while doing less than claimed*:

- My reference audit printed 0 coverage for **every** chapter including the two known-good ones. `scripture/genesis/8/1` is four parts, not five. All-zeros is now a reflex alarm for me, which is the only reason it took seconds rather than an hour.
- My lexicon wiring aborted a whole chapter's R3 with rc=1 — and rc=1 loses every adoption in that run, so a silent retry would have quietly discarded work.
- Two runners raced past a `pgrep` mutex and loaded two 17 GB models. Check-then-act is not a lock; `mkdir` is.

### 2026-07-30 [e1ad3ec2e0a1]

My three test cases all worked, and they were all drawn from *failing* cells — so they were exactly the rows where stripping helps. Measured on the whole population it's destructive, because "the remainder matches a reference 4-gram" is satisfied by shifting past a **misread** word: the filter deletes an OCR error instead of keeping it, and with it real scripture.

That is the same selection bias as the gold set that couldn't exercise the failure it was ruling out. Examples chosen from the residual will always flatter a fix aimed at the residual. The only honest verdict comes from the population that includes what currently works — which is why chapters 1 and 16 are sentinels on every measurement.

### 2026-07-30 [2c94ce204a66]

Two things make this trustworthy rather than a dressed-up guess.

First, **a confirmation is a real answer.** Where the edition's hand-transcribed evidence says the printed form is the token exactly as it stands, the observation "this `f` is genuine" closes the debt *without changing a letter*. I'd been treating closure as requiring a change, so the whole f-class was unanswerable.

Second, **the refusals are load-bearing.** The f-collapse necessarily merges genuinely different words — `wife`/`wiſe` (10 vs 5) and `found`/`ſound` (4 vs 1) share a skeleton — and the strict thresholds refuse exactly those. A rule that answered them would be inventing; a rule that refuses them leaves a bounded tail for an eye. That the same thresholds also yield 1.0000 on everything they *do* answer is the evidence they're set right.

And one refusal turned out to be an artefact worth fixing: `therfore` looked split 14/17 purely because `Therfore` was counted as a rival form. Case is not a ſ question. Fixing that unlocked the single commonest debt of the campaign.

### 2026-07-30 [e753fcbfe564]

I nearly missed this, and the way I nearly missed it is the lesson. My first reference audit used a "<50% of the chapter" threshold, which flagged 8 chapters and cleared the rest. Chapter 12 has `odr_com` for 13 of 20 verses — comfortably past that threshold — and was quietly carrying **28 unreachable cells that I was reading as an S6 layout problem**. I had just finished measuring S6 as "44% of the residual" and was about to spend the night on its crop geometry.

The threshold was the bug. For *this* standard one missing verse matters, so any threshold above zero manufactures a false diagnosis. It's the same error as `janvier_fit` returning 0.000 — a measurement that answers a slightly different question than the one being asked, and answers it confidently.

### 2026-07-30 [2946a6ce7241]

The guards were doing exactly their job: refusing `Likewise` for `likewise` (case is content, since `_skeleton` is case-sensitive), refusing a reading for an already-attested token, refusing a word-final ſ. A pipeline whose correctness checks are *fatal to unrelated work* punishes the very strictness that protects the deliverable — so I'd been tempted, briefly, to loosen a guard. The right fix was to make failure local, not to make the guard permissive.

### 2026-07-30 [4922694f171c]

That is precisely "convert a below-threshold result into a terminal accepted state" — not by lowering a bar, but by **shrinking the denominator**. And I introduced it myself, hours after correctly refusing to lower the bar elsewhere, while writing the accounting that was supposed to prevent misattribution.

What makes it insidious is that every individual step was defensible: reference gaps genuinely aren't OCR failures, so they genuinely shouldn't be counted against the recogniser — and from there "progress against achievable" is one small step, and "100% of achievable" is one more. The guard has to be a definition, not vigilance: **CLOSED now requires references complete for every verse *and* every cell ≥0.90.** A chapter passing everything its reduced set allows is reported with its fraction in view — `ch 49: 8/8 achievable, but achievable is only 8/128` — and the gap still blocks.

### 2026-07-30 [6c6166bed11e]

Worth noting what the resilience fix bought: before it, two chapters had lost *entire* R3 runs to a single refused token, and the ledger recorded them as rc=1 with no adoptions. Since making failure local, 17 consecutive chapters have completed with zero crashes. The throughput gain wasn't from making anything faster — it was from stopping the pipeline throwing away work it had already done.

That's the third time tonight the binding constraint turned out to be bookkeeping rather than capability: the harvester discarding 88% of available GT, the surface gate refusing text that was already right, and now a guard aborting unrelated adoptions. None of them needed a better model.

### 2026-07-30 [b3088e7c54c2]

I caught a real oversight in my own work here: I built the chapter-model deriver, validated it on three chapters, committed it as "fixes all 48 chapters at once" — and then never ran it on the other 45. The commit message was true about the *capability* and false about the *state*, and nothing in the pipeline would have told me: the 45 chapters simply kept scoring as they had.

What surfaced it was looking at a specific residual (ch42 verse 3 returning the chapter argument in all four witnesses) and asking why the model hadn't cut it. Aggregate numbers can't catch a missing application step — they look like "the fix helped less than hoped". Only the per-cell text showed that the fix wasn't there at all.

Which is why the A/B now running measures every chapter both ways instead of trusting that a derivation applied is a derivation that helps. Two of my five spot-checks moved *down* when the models were applied, and that has to be resolved per chapter rather than assumed away in either direction.

### 2026-07-30 [213e787d674e]

The process failure underneath is the more useful finding. I built the deriver, validated it on three chapters, committed it as fixing "all 48 remaining chapters at once" — and never ran it on the other 45. The commit was true about the *capability* and false about the *state*, and **nothing in the pipeline could have told me**: those chapters kept scoring exactly as before, which reads as "the fix helped less than hoped" rather than "the fix was never applied."

What surfaced it was reading one specific residual — ch42 verse 3 returning the chapter argument in all four witnesses — and asking why the model hadn't cut it. Aggregates can't distinguish "applied and ineffective" from "never applied"; only the per-cell text can.

That's the same class as tonight's other bookkeeping failures, and it's now four for four: the restore that silently did nothing, the waiters polling a sentinel that could never arrive, the reference threshold answering a slightly different question, and a fix committed but not applied.

### 2026-07-30 [d8dd45f13192]

The subtlety: R3's adoption gate requires the new reading to *beat the incumbent* and clear 0.90. Both R3's text and the references are unchanged by the chapter-model flip — but the **incumbent** isn't. A cell adopted because it beat a degraded incumbent might now be worse than the restored one, which would mean publishing an inferior reading while the matrix still labels it `r3`.

That's a class of error configuration flags create in general: a stored decision outlives the conditions it was made under. The adoption store records *what* was adopted but not *against what*, so nothing downstream can detect the staleness. The audit compares each adopted cell against a fresh `--no-r3` build, which is the only way to answer it — and it's cheap, so there's no reason to reason about it instead.

### 2026-07-30 [8330ca4c3734]

The through-line of the night: in nearly every case the binding constraint was **bookkeeping, not capability** — a harvester discarding 88% of available GT, a gate refusing text already correct, a guard aborting unrelated work, a fix committed but never applied, a threshold answering a slightly different question than the one asked. None needed a better model.

And chapters 1 and 16 earned their keep as sentinels: they held at 124/124 and 64/64 through roughly twenty-five changes, and caught two regressions that looked like improvements on the residual I was staring at.

### 2026-07-30 [ddc642497713]

The cause is that **my own Q34 fixes improved the page model**, so the incumbent those adoptions once beat is now better than they are. The adoption store records *what* was adopted but never *what it beat*, so nothing downstream can detect the staleness — the cells still pass ≥0.90 and both chapters still read as CLEAN.

That's the same shape as the chapter-blind readings table: a stored decision outliving the conditions it was made under. It's structural to any pipeline that caches a comparison rather than the comparands, and it means every future page-model improvement silently ages every prior adoption.

### 2026-07-30 [a7fd918ed40c]

Worth being clear about why I'm *not* simply reverting those three cells to the page model's text, which would raise the numbers immediately.

The adoption gate has two axes: content score and ſ-surface. The R3 arm carries a **CLOSED** surface — every glyph attested — while the page model's reading has no surface guarantee at all. So "the page model scores 0.978 vs the adoption's 0.919" compares only one of the two things the standard requires. Picking the higher number would be choosing the better *score* over the better-evidenced *transcription*, which is precisely the trade this project forbids.

Re-running R3 makes the gate decide again on current evidence, with both axes in view. That's slower and may leave the number where it is — but the deliverable is a diplomatic transcription, not a scoreboard.

### 2026-07-30 [b141e2909a0c]

That is the fifth instance tonight of the same failure class, and this time it was in the safety mechanism itself. The heartbeat didn't error — it reported an *empty list*, which reads exactly like "both closed chapters just regressed". A monitor that greps a prose document is measuring a *description* of the state, so it silently decouples the moment the description is reworded.

The fix is the lesson the whole night has been teaching: **watch the artifact, not the write-up.** The matrices are the authority; `CAMPAIGN-STATUS.md` is my prose about them.

### 2026-07-30 [6a3db7e8eadb]

The stale adoptions survived the re-run, and the reason is worth your attention: **the adoption store is append-only**. `gen1_r3` adds an adoption when the gate passes and never retires one, so a decision made against a worse incumbent outlives every later run.

I did *not* revert them, and the reasoning matters more than the three cells. A cell needs content ≥0.90 **and** a closed ſ surface. The adopted text has a surface where every glyph is attested; the page model's text scores better on content and has **no surface verification at all**. Dropping the adoption would trade a verified transcription for a better number — the exact trade this project exists to refuse. So the honest state is to keep the adoption, report the regression, and record that what's owed is a surface verification of the page-model reading.

Five distinct instances tonight of one pattern: a cached decision, a rewritten description, a stale key, a threshold, an unapplied fix — each outliving the conditions that made it valid, and none detectable downstream because only the *outcome* was stored, never the *comparison*.

### 2026-07-30 [ec529c9bed18]

This is why I'm not starting a ninth apparatus fix at 02:00. "S6 is the weakest source" turns out to be at least three distinct problems wearing one label: interleaved annotation words (ch12), missing leaves and unlocalized verses (ch44), and edition divergence from 1609 references (documented earlier). A single fix aimed at "the S6 residual" would be aimed at an average of three unrelated causes — which is precisely how the previous eight attempts each looked promising on their chosen examples and failed on the population.

The honest next step is to *separate* those causes and measure their sizes before building anything, which is a fresh piece of work rather than a late-night patch.

### 2026-07-30 [6578133d1e59]

Worth noting how the bad monitor persisted: I rewrote the heartbeat script an hour ago, but the *running* process had already read the old file into memory, so it kept emitting `chapters_at_100=[]` — a false alarm that looked exactly like both sentinels regressing. Editing a script does not restart what's running it.

That's a small operational point with a sharp edge: I verified the fix by reading the new file, not by checking the emitted events. The correct verification for a running process is always its output, never its source.

It also means every alarm that monitor raised after the rewrite was noise — and if I'd trusted it rather than checking the matrices, I'd have "discovered" a regression that never happened and spent hours chasing it.

### 2026-07-30 [b4b7380e9b16]

That plateau is the answer to "keep pushing R3 or hand-work chapters". R3 has taken every chapter as far as a vision re-read *can* take it; what remains is precisely the three classes it cannot touch — interleaved annotation words, unlocalized verses, and 1635-vs-1609 edition divergence.

So closing a chapter requires what chapters 1 and 16 received: per-leaf `PAGE_OVERRIDE`, drop-cap entries, visual readings, a reference audit. Historically that's on the order of a session per chapter.

Which means the plain answer to your order is: **"every chapter to the Genesis 1 standard" is not a pipeline run away.** 17 chapters are arithmetically blocked by absent reference text, and the other 31 each need roughly a session of hand-work. I could have reported 0.7767 as a triumph; the honest framing is that it's the ceiling of automation, and the remaining distance is human-scale work that no amount of compute tonight converts.

### 2026-07-30 [626b1536f52b]

Every one of the eight pinned separation attempts was aimed at the *average* of those three causes. That is precisely why each looked convincing on its chosen examples and failed on the population — you cannot fix an average.

It also retro-explains the whole night's pattern: nine times I found that the binding constraint was a *measurement or bookkeeping* problem rather than a capability one, and the reason I kept finding them is that a mislabelled cause is invisible to aggregates. Only per-cell text, read directly, distinguishes "the fix underperformed" from "the fix was aimed at the wrong thing" or "the fix was never applied".

### 2026-07-30 [36368876f5b8]

The most useful thing the night produced isn't the +332 cells — it's that "S6 is the weakest source" turned out to be **three unrelated problems** (annotation prose on mixed leaves, missing/unlocalized leaves, edition divergence), and all eight prior separation attempts were aimed at their average. That's why each looked convincing on its examples and failed on the population.

Nine times tonight the binding constraint was measurement or bookkeeping rather than capability: a harvester discarding 88% of its input, a gate refusing correct text, a guard destroying unrelated work, a fix committed but never applied, a threshold answering a subtly different question, a monitor watching prose instead of artifacts, a cached decision outliving its comparand. None needed a better model — and none was visible in an aggregate. Every one surfaced only from reading specific cells.

### 2026-07-30 [e694cab319c5]

This rule earns consideration for a reason the eight failed apparatus attempts didn't: it is the **exact mirror of a rule the project already accepted on evidence**. `rejoin_break` joins `hea` + `uen` when neither fragment is a word of the book and their concatenation is; this splits `oflife` when the glued form is *absent* from the book and both fragments are present. Same evidence, same asymmetry, opposite direction.

And the guard is doing visible work: `indeed` splits cleanly into `in` + `deed`, both real words — and the rule correctly leaves it alone because the book uses the joined form. That's the difference between a rule with a principled refusal and the row-interrupt filter, which had no way to distinguish "this token is an intruder" from "this token is a misread I should preserve".

Whether it survives is still an empirical question. Two chapters gained one cell each in the spot-check; if the full sweep shows net harm it gets pinned off like the others.

### 2026-07-30 [4ee5a75d9118]

The guard's principle is the sharpest distinction I've found tonight for this whole class of problem: **a garble is one edit from a real word; a glue is far from every word.**

`hegotten` is one substitution from `begotten` — it's a misread. `oflife` resembles no single word in the book — it's two words run together. Both split into two lexicon words, so the naive rule treats them identically, and it was quietly *tidying away recognizer errors* — which a diplomatic transcription must preserve for a later rung to correct.

This is the same shape as the row-interrupt failure two hours ago, which deleted scripture by shifting past a misread. The recurring trap is that **a rule aimed at "text that looks wrong" will absorb OCR errors unless it can tell an error from a structure.** Edit distance to the lexicon is the test that separates them, and it's cheap.

### 2026-07-31 [a0f4de127ebc]

The `curl -w '%{url_effective}'` trick is the fast diagnostic here — a bare `200` looks like success, but printing the *final* URL after redirects immediately distinguishes "content is behind JS" from "content is behind auth." Worth reaching for any time a fetch returns plausible-looking HTML of the wrong size (47KB of login page vs. an expected transcript).
Also note `copilot/share/*` links are auth-gated even when "shared" — unlike, say, a public gist, the share token grants access to *your account's* view, not the anonymous web.

### 2026-07-31 [934c53e9a314]

The subtlest trap for the comparison app: all parties agree "the elements are eternal" and all use "second death." They disagree about what happens to the *organized person*. Young says the organization ceases while matter persists; Pratt and successors say the person persists consciously in banishment. Two texts can share near-identical vocabulary and assert opposite things about your survival — which is why the schema separates `terminality` (cessation / disorganization-then-reorganization / conscious continuance) from `action`. Lexical similarity alone would score Cannon's "preserve our identity" as a strong match when he's talking about a people not assimilating culturally.

### 2026-07-31 [fc59989ac6ed]

That last one is a nice epistemics lesson. The prior work carried a Penrose row dated `1878-10-06` citing *Conference Report, Oct. 1914* — an incoherence I flagged as irreconcilable and nearly discarded. It turns out the **citation was right and the date field was garbage**. The printed sermon synopsis even advertises "What the second death is — Fate of the sons of perdition." A corrupted record isn't the same as a false one; the useful move was to check the half that was checkable rather than reject the whole row on the contradiction.

### 2026-08-01 [dc1524ef6a53]

That list is the most useful thing the manuscripts gave me, and it isn't about dissolution at all. Several contested nineteenth-century teachings were circulating *together*, itemised without alarm by a man about to be made an apostle. It undercuts any account in which the leadership was adjudicating one controversy at a time. The silence around dissolution isn't suppression — it's what a doctrine looks like when it stops being interesting to the people who could have defended it.

### 2026-08-01 [18946afba1da]

The payoff is a coincidence fifty-two years wide. Joseph Smith's characterization — annihilation as an end of suffering — is *precisely* the premise Joseph F. Smith uses in 1895 to destroy the dissolution doctrine: *"That would be an end to punishment — an end to being. This view cannot be reconciled with the word of God."*

Both men agree exactly about what annihilation would be. Smith uses the agreement to make annihilation the *lesser* dread, a foil for sealing. Joseph F. Smith uses it to make annihilation too *lenient* to be just. Same premise, opposite deployment — which suggests the intuition underwriting the eventual rejection (that an ending lets the wicked off) was present in the tradition from its founder, before there was any dissolution doctrine to reject. I've stated explicitly that no conscious dependence is claimed.

### 2026-08-01 [68f9d27877ec]

This lands the section on the report's own axis, which the earlier conjecture never managed. **The good Smith is defending isn't bare persistence — it's reunion.** Annihilation horrifies him in April because it ends the expectation of meeting his people; it's demoted in August precisely because a worse fate would leave him existing and separated. That's a commitment at the level of *relation* — exactly where the tradition eventually settles. Joseph F. Smith 1882, Penrose 1914, Joseph Fielding Smith 1954, the 2023 official definition: all of them define the second death as separation. Whatever changed between 1843 and now, the thing being valued didn't.

### 2026-08-01 [cf9835b0d780]

This is the check that saves the finding from being a false win. Against the **existing** 0.815 bound the delta is only **18 tokens across 8 leaves** — the base bound already removes most of that margin column. My earlier audit measured against *no* bound and so credited work already being done.

And the 18 are not obviously safe: they include `the`, `him`, `came`, `moſt`, `gift` — precisely the ordinary words the module's own PINNED NEGATIVE (line 835) warns crossing the gutter. Reading them back against the note text (`the croſſe was`, `moſt cruel, &`, `came ro paſſe`, `gift to inter-`) they look like note-*initial* words, but "looks like" isn't evidence.

### 2026-08-02 [cb585ee82a13]

`CHAPTER-WORKFLOW.md` already exists and is strong — but read its subtitle: *"distilled from Genesis 1 and 16."* It was written from the only two chapters that reached **100%**, and both were closed by hand-craft on a cold chapter.

The other ten chapters crossed 0.90 by a **different** route — reference repairs, the mixed-leaf fix, the verse-1 anchor slide, and two autonomous passes. So the template teaches the economics of the first two chapters, not of the ten that followed. That's the gap worth closing, and it's why per-chapter workload hasn't dropped.

### 2026-08-02 [67ee43bee9be]

The re-measured S6 mix carries a warning about the obvious next move. Passes took S6 from 568 open cells to 425 — but look at *what* they took: DIVERGE −72 (−36%), INTERLEAVE −21, **MISREAD only −36 (−14%)**.

So MISREAD has *risen* as a share of S6's residue, 44.9% → 51.5%. **The passes hardened the remainder against themselves.** Re-running the same passes is the intuitive next step and would be the low-yield one.

And the examples show why the residue is tractable *differently*: `truit`/`ot`(f→t), `.he`, `vou`/`aud`/`ihal`(u↔v, n→u, s→i), `openod`/`hundrod`(e→o). That's a systematic **confusion set**, not random noise — recognizer-targeted work, not another sweep.

### 2026-08-02 [2f2452a9c335]

Found something the workflow never questions. `reocr_core.MAXW = 2200` **hard-downsamples every page before the recognizer sees it.** Native S9 is 3224×4329 → 2200×2953: a **32% linear, 54% areal** pixel loss.

Every other threshold in this project was swept and documented — the ch15 bound, `ROW_TOL`, `ROW_MAX_DRIFT`, the band edges. **`MAXW` never was.** It's an unexamined magic number at the very top of the stack, gating the input to everything.

And look at what MISREAD (51.5% of S6's residue) is made of: `truit`/`fruite`, `ot`/`of`, `vou`/`you`, `aud`/`and`, `ihal`/`shal`, `openod`/`opened`. f/t, u/v, n/u, s/i, e/o — every one a **fine-stroke distinction carried by a few pixels**. Exactly what a 54% areal downsample destroys.

### 2026-08-02 [90d2215d8118]

**Five of the 34 are reference defects, every one `s_dismas`, every one with an inflated word count** — 62 vs 23, 63 vs 44, 56 vs 46, 25 vs 22, 23 vs 21. That is precisely the apparatus-contamination signature Phase 1 describes, occurring at **verse** scale where no chapter-level mean test can see it.

Worth 5 verses × 4 sources = **20 cells**, recoverable by reference repair rather than OCR. And they sit in ch26, ch47 and ch41 — three of the worst seven.

My router labelled that signal *"a ceiling — never chase."* That is the self-defeat, and it was mine.

### 2026-08-02 [27cd7196d502]

- `HostConfig.LogConfig.Config` is `{}` on the live container while the compose file declares `max-size: 10m` / `max-file: 5`. That empty map is the direct evidence the running container predates the commit — an unbounded json-file log that grows until the disk complains.
- This also confirms the outage is *worth taking*: had the config already matched, the recreate would be pure downtime for nothing.

### 2026-08-02 [99232fdbc054]

This is a **stale-comment-as-load-bearing-assumption** failure, structurally the same class as the B5 prefix bug in the digest work: a constant (`50`) was correct only relative to another value (`300000`) recorded nowhere but a comment. When the referent moved, the constant silently inverted its meaning. The durable fix isn't a better comment — it's removing the coupling entirely, which is what `DISABLE_AUTO_COMPACT=1` does. No percentage, nothing to keep in sync.

### 2026-08-02 [e3e31a6ae1c3]

This reframing matters because it moves the suspect from *"the file wasn't refreshed"* to *"the generator read the wrong bytes."* And there's a known mechanism sitting right there: the Jul 27 forensics found **transcript triplication** — 173 sessions written to 447 files, because the `~/Claude/Jarvis` symlink plus underscore/hyphen path encodings produce up to three project directories per session. If `jicm-prep-context.sh` resolves my session ID against the wrong directory, it gets a real, valid, *abandoned* copy of the transcript.

### 2026-08-02 [4663320a7a08]

- The doc set is **deliberately layered**: `CAMPAIGN-STATUS.md` is *state* (what the board says, what's next), `CHAPTER-WORKFLOW.md` is *method* (the round template, the router, the pinned negatives), `SPRINT-STATUS.md` is *narrative history*. `SPRINT-STATUS.md`'s own header tells you to read the other two first — and its STATE block is now four sessions stale (0.7935, 28 commits). That layering is the reason a stale handoff is survivable: state lives in the artifact, not the prose.
- The docs contain an explicit anti-Goodhart instruction (`CAMPAIGN-STATUS.md:424`): *"a monitor must read the ARTIFACTS (matrices), never a prose document — a heartbeat once grepped this file and silently reported an empty closed-chapter list when it was reworded."* So even the 0.8576 figure I'm quoting is prose; step 0 of any round re-derives it from `.campaign/matrix-genesis-N.json`.

### 2026-08-02 [6f222c41769c]

This is the highest-value finding in the whole doc set and it's worth naming precisely: the campaign's binding constraint is **not** recognition accuracy — it's *attestation provenance*. The project only accepts a ſ-surface closure that some arm **observed**, never one inferred. So a fine-tuned ſ-faithful model that isn't wired into the attestation path leaves ~1,080 correctly-read cells sitting open. The fix is plumbing, not training. `CHAPTER-WORKFLOW.md` B7 rung 1 ("read the page better") is where we are; this is arguably rung 1 already paid for and not collected.

### 2026-08-02 [a43e3b565ada]

Worth noting *why* going to `build()` matters here: `matrix-genesis-N.json` stores `"open": open_cells[:60]` (`chapter_campaign.py:143`). Chapters with more than 60 open cells silently drop the rest — fine for triage display, fatally wrong for a population count. This is the same class of defect the file itself warns about a few lines up, where a 120-char text truncation "fabricated a symptom." Always check whether the artifact you're counting is a *sample*.

### 2026-08-02 [bb5fc0c5c96a]

I made the empty state loud rather than blank on purpose. An empty grid under a book's name reads as *"measured and found perfect"* — the exact opposite of the truth, which is *"not measured"*. The panel now says Exodus "is not passing, failing, or blocked here, it is **unmeasured**", and prints the command that would open a board. Same reasoning as the campaign's rule about denominators: an absent measurement must never look like a clean one.

### 2026-08-02 [1fe0bef5a307]

One thing worth noting from the verification: ch16 sits at 100% with zero open cells, which is exactly why it *couldn't* have shown anything before — the old artifact stored text only for failures, so a perfect chapter was a blank. And the moment it rendered, S6 turned out to read `the wife of Abtam` for `Abram` at a passing 0.972. The bar is a threshold, not a certificate; a view that only shows failures can never tell you what a pass is hiding.

### 2026-08-03 [1cd377d24f7e]

The bulk emit **overwrote measured results with estimates**: it reset p146 to 0.705, the proposal I had already rejected by eye *and* by measurement, and reverted p144 to the clipping default. I built the "an estimate never overturns a measurement" guard for explicit left bounds and then let the right-axis emitter walk straight through it.

And the direction matters: every gain here came from **widening**, while every tightening proposal on these witnesses is either uncorroborated or demonstrably wrong (p146 → 0.705 costs 11 cells).

### 2026-08-03 [9b7ec1bcbaef]

The entire campaign to date — every walk, every probe, +482 cells this session — has been geometry work. And geometry is now the *smaller* of the two remaining pools. We have been optimising the layer we could see, and the larger residue is recognition: text the recognizer never produced.

This is what the research independently converges on. At val 0.9396 we sit at roughly 6% CER, where book-specific models on early print reach ~2%. More ground truth *for this book* is the bottleneck — and forced alignment against a known transcription is the lever we have never pulled.

### 2026-08-05 [5e36c738d42a]

**The measurement substrate was wrong, and it silently shaped the plan.** §1.2 was measured with `pdfimages` against the PDF derivatives. But the PDFs aren't the scans — the JP2 packages are. The PDF wrapper is where MRC composition and JBIG2 binarisation happen, and where the downsampling happened. So two of the plan's three "findings that constrain the design" describe our own derivative, not the corpus.

**Verifying provenance produced a stronger disqualification than measuring pixels did.** I had ruled S01 out on resolution — an argument that turned out to be false for two of its three volumes. Reading the leaves ruled it out properly: every page is watermarked and visibly reprocessed. The bibliographic check wasn't a formality gating the real work; it was the more reliable instrument.

### 2026-08-05 [2d8570b15560]

**A method's null result is only as good as its demonstrated sensitivity.** My "S01 is derivative" call and my "no OT duplicates" call were both nulls from correlation searches. The reason the null is now trustworthy is that the *same* method returns exactly 1.000 on the real S08/S09 duplicate — so it demonstrably detects duplication when present. Without that positive control, a low score means "found nothing," not "nothing there."

**Contamination travels at the leaf, not the file.** I had been reasoning about whole copies — this scan is good, that one is derivative. But the Censure leaf moves between books independently of everything around it. The addressing unit for provenance has to be the leaf.

### 2026-08-07 [f27bf4bc322a]

`verified_pairs` is hand-authored and asserts "these two witnesses match at these pages" — but nothing checks those pages actually appear in **both** witnesses' readings. The guard would happily pass a fabricated pair. That is precisely the doc-vs-code drift `test_counts_vs_doc` exists to prevent, reintroduced one file over.

### 2026-08-08 [a73b0a18bbd9]

**R7.5 is not done.** `OCR_DIR_TO_JP2` is still live in `jp2_page.py` and still routing. Commit `c44ba20` *verified* that this table is the mechanism that sent 48 transcriptions to the wrong image — but verifying a defect is not retiring it. Two routes to the pixels still exist and only one is guarded.

**§0.3's setting-identity test names three criteria — same signature, same catchword, same line-end words — and my R8.4 audit checked none of the first two.** It used printed page number, running head and line breaks. That is arguably stronger on one axis and silently weaker on two, against a constitution that says setting identity is "proved, never assumed."

**§2 has Gates 0a–0d and no gate for setting identity at all** — the exact failure that cost four months has no entry in the section titled "What must be established before Step 0."

### 2026-08-10 [6775c10db1d9]

`OT1-1609-P vs F` records seven pages — but they are `[222, 223, 224, 457, 918, 919, 920]`. Those are **three separated locations**, not seven. §0.3 requires points *"spread through the volume"*, so counting page entries would let R8.4b be discharged by reading three adjacent leaves, which tests nothing about span. The count must be of **separated clusters**.

### 2026-08-10 [8ef8cd508fef]

R5.1's acceptance says "regenerating it twice is byte-identical" — and that clause **could not be executed**: the output path was hard-coded, so the second build would destroy the first. It had been standing in the roadmap unexecutable since it was written. Added `--out`; the second build is running. R5.1 is DONE as to coverage and **OPEN as to determinism** until it compares equal — I'm not counting it met.

### 2026-08-10 [e3f7dd4f097e]

A byte comparison is only a valid determinism test *here* because the writer uses `json.dumps(..., sort_keys=True)`. This project already has the counter-case on record: `coverage-audit-verse.json` is order-nondeterministic on ties, so byte-comparing two of its runs proves nothing. Same test, opposite verdict, decided by the writer.

### 2026-08-11 [eb6b4389bf9d]

`blla.segment` is a **page** segmenter. Handed a 1400×313 strip it shredded it into **59 fragments** — `'Ium.'`, `'th'`, `'A'`, `'mram'` — because it is looking for a page's worth of baselines in a band. And at **21.7 s per band**, 1,160 leaves × 2 bands ≈ **13 h**, which exceeds R2's entire 12 h ceiling before a single signature is parsed.

### 2026-08-11 [563006837b50]

The way out is to stop thresholding for the short line at all. The relative profile already finds **full text lines** reliably — that's the one thing it's good at. So: locate the last full text line, then take *everything below it* as the direction-line strip and recognise that strip. The short line never needs to be detected, only bounded.

### 2026-08-12 [39899d9cbb2f]

- **`--add-dir` grants file access; it does not relocate the settings root.** Genie's first launch ran with *zero* project hooks — no JICM state, no registry, no orientation — because Claude Code discovers `.claude/settings.json` from the launch **cwd**, and `Projects/WVU` had none. The whole lane I'd wired was correct and never invoked. Only caught because Genie's statusline rendered as the user-level v7.4 instead of v9. The fix uses a seam the codebase already had: `JICM_PROJECT_DIR`, which `jicm-gate.sh` and `jicm-stop.sh` already honored — I extended it to `session-start.sh` and the statusline.
- **The chain-collision I predicted happened live, during install.** Styx had the old `idx=12` parsed in memory, so it forked `chain-31bcc85d` onto 12 and Genie landed at 13. Editing a file a daemon already parsed changes nothing until restart.
- **`session_resumable()` hardcoded W0's project dir**, so Genie's deterministic seed could never be found and every launch minted a fresh random UUID — new session, new L2 identity, no continuity. Invisible on launch #1 (nothing to resume yet); it only surfaced on launch #2.

### 2026-08-12 [a5931ed4716c]

- **The namespace separation was enforced in the wrong layer.** I'd bound `JICM_RAG_COLLECTION` and `GRAPHITI_GROUP_ID` in Genie's *launcher env* — which reaches the interactive Claude process and nothing else. The actuator is a **detached process spawned from whatever shell fires the cycle**, so it never saw that env and fell through to the global `sessions` default. Underneath sat a second bug: `jicm-actuate.sh` **hardcoded** `JICM_RAG_COLLECTION="sessions"` for the scrollback ingest, which would have defeated the routing even after the first fix. Both now derive from the lane key in `jicm_key_paths()`, where every other per-key artifact already lives and where no spawner can bypass them.
- **My first hypothesis was wrong, and testing it mattered.** I suspected the gate's 200-line tail window was missing assistant-usage entries during tool-heavy stretches. Measured it: longest gap is 13 lines, zero blind windows in 15 samples. The real mechanism showed up only after the clear — a freshly-resumed session has no assistant-usage yet, so the gate writes `0`. It self-corrects on the next prompt. Had I "fixed" the tail window I'd have shipped a change for a defect that doesn't exist.

### 2026-08-12 [e73f93dba033]

- `genie-core` now holds **26 nodes** (25 entities, 29 edges) while `jarvis-core` sits **unchanged at 5,928**. The entities are unmistakably Genie's: *Anabaena variabilis*, NFixDB, Madin/µGrowthDB, `diazotroph_typestrain_shortlist.csv`. That's the namespace design working at L5, not just L4.
- The ingest took **145 seconds** through LiteLLM → Ollama. That's the cost of an L5 write, which is why it's async and why a dead LiteLLM went unnoticed for a day — nothing blocks on it, so nothing complains when it fails.

### 2026-08-12 [ef880cf36b9e]

- **A pathspec commit was the right tool this time.** The previous two commits needed a record-reset-restage dance because `.gitignore` had unrelated working-tree hunks mixed with mine. Here nothing overlapped, so `git commit <paths>` takes the working-tree content of just those files and leaves the rest of the index alone — your 24 staged deletions verified intact afterward, nothing else swept in.

### 2026-08-12 [460afa6b6638]

- **The gate fix needed a splitting test, not a policy.** "Carry the last value forward" alone would deadlock: after a real `/clear` the context genuinely *is* near-empty, so carrying 205K forward would re-trigger a cycle immediately — an infinite clear loop. The session id separates the two causes cleanly, because a `/clear` mints a new session while a failed read does not. Same id + unreadable → carry. New id → the zero is true. And it can't loop, since a cycle changes the id.
- **Carrying forward is the fail-*loud* direction.** If a lane really sat at 340K and we can't measure it, treating it as 340K keeps JICM armed; writing 0 silently disarms it. Verified exactly that: an unmeasurable lane at 340K now emits `HARD_HALT`, where before it emitted `WATCHING` at zero tokens.
- **`pkill -f "litellm --config"` killed the tmux wrapper too**, because the wrapper's own command line contains that string — so my first outage test destroyed the very pane the failsafe exists to capture. That's my own recorded `pkill -f` self-match lesson biting during a test of an evidence-preservation tool. Re-tested by killing only the PID; scrollback captured correctly.

### 2026-08-12 [c3cf22528ebb]

- **The leak got measurably worse, and the note is now grounded in numbers rather than a reminder.** MLX-embed (pid on `:8000`, 23h16m uptime) shows RSS **86.4 MB** but `phys_footprint` **38 GB** — that's ~39 GB/day against the July baseline of 85 GB over 22 days (~3.9 GB/day). Roughly ten times faster. RSS lying by a factor of 450 is exactly why the recorded diagnosis says to use `footprint -p`, never `ps`.
- **I recorded the LiteLLM-OOM link as a hypothesis, not a finding.** Both unexplained LiteLLM exits happened while swap was near exhaustion (now 28.2 of 29.7 GB), which is suggestive — but no OOM evidence has actually been read. Calling it "caused by the leak" would file the LiteLLM exits under a label and remove them from the hypothesis set without testing, which is the failure mode I've been bitten by twice today. The note names a splitting test instead: does LiteLLM survive a stretch when MLX has just been restarted and swap is healthy?
- Usefully, the failsafe already captures `vm.swapusage` and `vm.loadavg` into every crash log — so the next unattended exit produces the correlation data for free.

### 2026-08-12 [9eb713a1cf9b]

- **Google Drive is already solved.** Your existing `wvu` rclone token is the same Google account and resolves all three Snorkel folders — I listed each one. No new consent, no service account, no new credential.
- **But the three folders are wildly asymmetric**, which reshapes the work: beech is 204 objects / 8.4 MiB (already mirrored into `source-materials/`), otter is **4 objects / 321 MiB** (two big zips plus two docx guides), and starfish is **8 objects / 2 KiB** — a bare Harbor skeleton with no data at all.
- **One live landmine:** `rclone config show wvu` has an empty `client_id`, meaning it rides rclone's *shared* Google client id, which Google is retiring **during 2026**. When it goes, Genie's Drive pipeline dies alongside Jaques'.

### 2026-08-12 [1a3bcec43ef2]

- **My sensing is perfect. My actuation does not exist.** My lane state reads `action: HARD_HALT`, `tokens: 659,767`, `tokens_source: measured` — matching my live transcript exactly. My Stop hook raised `clear-now.dev.signal` **12 minutes ago**. The request to clear me is sitting on disk right now. Nothing is listening.
- **`jicm-supervisor.sh` — the only component that actuates any lane except W0 — is not running, and never was.** No launcher entry, no cron, no launchd agent. Its log last moved **2026-07-25, eighteen days ago**. The legacy watcher is alive but hardcoded to `aion:0`.
- **Every JICM cycle in this system's history was fired by hand.** The log shows 5 `protos`, 1 `genie`, 1 `jaques` — all mine, all `--fire --canary`. **Zero autonomous cycles have ever run.** Genie and Jaques appeared to work because I was standing there pressing the button.

### 2026-08-12 [2c674c823a61]

- **macOS `pgrep` will not match the calling process's ancestors.** `jicm_pane_session()` is built on `pgrep -P <pane_pid>`, so it structurally **cannot resolve the pane of whatever process is invoking it**. Every other lane resolved because I was probing them from outside; mine failed because I was probing from inside.
- **My sense-only test was therefore invalid, not the system.** The supervisor refused to fire on `dev` for a correct reason given where I ran it from. Under launchd it descends from launchd, not from any Claude — so all panes, including mine, resolve.
- This is also a real latent trap: any *self*-actuation path built on this probe is blind to its own pane by construction.

### 2026-08-13 [6a7abef206d1]

- The gate owns the *canonical* token formula, the model→window map, and the threshold clamps — all documented as shared with `cache-telemetry-extractor-v2.py`. A separate lightweight sampler would have to duplicate all three, and the one thing this subsystem has repeatedly proved is that **duplicated derivation drifts silently** (exactly how the `[1m]` suffix bug survived weeks).
- The cost is that the gate is heavy (~15 `jq` forks), so the debounce has to come *before* any parsing work, not after.

### 2026-08-14 [aaf6ad65c801]

- `Tool mcp__claude-in-chrome__navigate not found in render-time tools` + `ToolSearchTool: selected …navigate` shows W13's chrome tools are **deferred**, loaded on demand. Deferred tools are registered *after* the permission engine renders its tool table — which is a second, independent reason a name in `permissions.allow` doesn't short-circuit adjudication.
- The denial is still **fail-closed on a 500**, on both `claude-sonnet-5[1m]` and the `claude-opus-5[1m]` fallback. The error text names a *model*, which is why this read as a model-availability problem for hours rather than a permissions one.

### 2026-08-14 [f5454eea46ae]

- That's §1's finding showing up again from a new angle: `/clear` mints a new *session* but reuses the same *process* (pid 17381). Hooks are cached at process start, so a JICM refresh can never reload hooks — only `/restart-lane` can. The staleness check keys on pid start-time vs config mtime, which is exactly why it sees through the clear.
- W0's retirement gate is therefore not "wait for W0 to turn over naturally" — a clear won't do it. It needs a genuine relaunch, which is Sir's live conversation window and not mine to bounce unprompted.

### 2026-08-14 [918f31c778a1]

- Same session id, new pid, hooks fresh. This proves `/restart-lane` is the *general* remedy for hook staleness — the property JICM refreshes structurally cannot deliver, since `/clear` never replaces the process that cached the hooks.
- It also means the Watcher-retirement gate is no longer blocked on *waiting*. It's blocked on one decision: bouncing W0, which is Sir's live conversation window and not mine to restart unprompted.

### 2026-08-14 [fe644bd2a8d0]

- This is my own recorded gotcha biting from a new angle: *input text ≠ human input*. The actuator's `nudge` verifies that keystrokes landed in the pane, which is a weaker claim than "a user turn was created." A delivery mechanism that reports success on typing will report success on a message that is then overwritten, discarded, or left unsent.
- The correct success criterion is falsifiable and cheap: the target's **transcript grows a `user` record**. That's the check the retrier should have made, and it's the fix worth making to `jicm-actuate.sh nudge`.

### 2026-08-14 [21efec7d5eca]

- `cmd_nudge` opens with `_inject clear-input`. If anyone nudges W13 before your unsent line is dealt with, that line is **silently destroyed** — the same mechanism that swallowed my message is one keystroke from swallowing yours.
- The comment at line 653 already knew clear-input was needed (a stale buffer concatenates), but treated the buffer as always-junk. A human's unsent text is not junk.

### 2026-08-14 [1f5f88dadda7]

- **0.312 must not be read as "the catchword approach scores 0.31."** It's a joint measure of two readers and a scorer, with two known defects outside the catchword half — and the catchword half is the part that works. Reporting the headline number without that decomposition would have condemned the right method for the wrong reason.
- **The head band is the fourth instance of this project's recurring shape.** The foot works because a direction line is *sparse type in white space*; the head is *dense justified text*. The same component-and-gap machinery is being asked to express a distinction it cannot — which is why R2.1f says redesign, not retune.
- I also tightened the agreement test: the prototype accepted `a.startswith(b[:max(3, len(a))])`, so a 2-character misread compared a 2-char prefix and matched almost anything. **A metric that cannot fail does not measure.**

### 2026-08-15 [042b5a8a2f55]

- The three pythons and the `pyright-langserver` are all **03:33:38** old — identical to the head's age. They're MCP servers and the LSP: started with the process, meant to die with it.
- The two `zsh -c source .../shell-snapshots/…` at 11:28 and 5:46 are **Bash tool invocations**. Claude Code routes every Bash call through that snapshot wrapper, which makes it an exact signature for agent-launched work — no guessing by process name or age.

### 2026-08-15 [e54430e4a6ab]

- Fixing a known-bad instrument and getting *the same* number is a real result, not a wasted run: it converts "0.312 is depressed by an unknown amount" into "0.312 is the honest rate for this instrument," which is exactly what a redesign needs to aim at.
- Taking `k` from the **foot** side is what keeps the fix honest. Had I inferred the head-token count from the head row, the head reader would be choosing its own comparison width — it could always pick the split that agrees, and the metric would stop being able to fail.
- Fewer-than-`k` tokens abstains rather than short-reads. Returning `'of'` against `'of flowre'` would manufacture a disagreement of the opposite sign — trading one silent bias for another.

### 2026-08-15 [ecb4b4e538b9]

- Line 134 searches **only** the directory from the registry's `transcript_path`. That dir exists (110 files) but doesn't hold this session, so the search fails and the tool dies — with no fallback attempted.
- The fallback on line 133 is itself dead code: `find "$HOME/.claude/projects" -maxdepth 1` can never match, because transcripts live one level deeper, inside per-project dirs. A guard that can only ever return empty isn't a fallback.

### 2026-08-15 [0de311bed7a4]

- tmux's `display -p '#{pane_start_command}'` returns an **escaped representation**: a never-restarted window (W11) already shows `\\n` for an original `\n`. Feeding that straight back into `respawn-window` bakes the escaped form in as literal text, so every round-trip doubles it.
- The fix is to **unescape once** before respawning — collapse each doubled backslash — which makes the operation idempotent instead of compounding.

### 2026-08-15 [d97e0f56f2dc]

- The Unpaywall hint requires **all** causes to be challenge-like, but two mirrors are `dns-dead` — so `all()` is false and the hint is suppressed exactly when it's most true: every *reachable* mirror is challenge-gated.
- Also worth correcting my earlier aside: through `urllib` (which follows redirects) `.gl` surfaces as **403**, so Genie's original "403 the /search endpoint" matched what the code actually sees. My "302, not 403" was only the raw first hop.

### 2026-08-15 [b141afec22e8]

The `dev-bg-0215a830` ghost needs no new code — its transcript is 219s old only because my *pre-clear* session (`0215a830`) was written to during the 15:08 refresh. That session is dead now, so the transcript stops growing and existing GC collects it at the 2h mark. Ghost → GC (liveness test), duplicate → retire (identity test). Two mechanisms, cleanly divided.

### 2026-08-15 [5d6f89832d0e]

My earlier "three duplicate sets" came from grepping on the basename `mcp_server.py`. Three *different* servers share that filename — `rag-service/`, `ScholarGateway/src/scholar_gateway/`, and `AnnasTools/src/annas_tools/`. Genie's head runs rag + graphiti + pulse + scholar-gateway + annas-tools + arxiv = exactly the 6 servers it should. Per-head sets are correct by design: stdio MCP servers are per-session, so 5 live lanes means 5 sets.

### 2026-08-15 [815e0e8a480a]

`.li` has been a **trusted mirror since the repo's first commit (2026-06-05)** — ~10 weeks. And `_working_domain` is **process-local, never persisted to disk**, with no logs. So there is no record of which mirror any past process selected. I therefore **cannot prove the key was never sent to `.li`** — and by my own standing rule, absence of a measurement is not a measurement of zero. That makes rotation the correct call, not an optional one.

### 2026-08-18 [89c5276816f4]

That `--  (not executed: no claim to check)` line is itself a finding. `score_head_tokens.py` and `score_head_regions.py` — the two modules carrying the project's headline numbers (0.8125 and 0.8760) — are *named* in the verification standard but never *run* by it, because their comments lack the `->` token the parser keys on. That's precisely the failure mode this block exists to prevent: a claim in a document with nothing able to refuse it.

### 2026-08-18 [73b2211d4cf1]

That last exchange is the verification standard earning its keep in real time. Adding three steps to the OPEN register moved `audit_prereq_ceilings`' denominator from 59 to 62, which silently invalidated a claim written in the roadmap. Nothing about the audit changed — but the *document's* description of it went stale the instant I edited a list 2,200 lines away. This is the same coupling that produced R2.2c itself: a number recorded in one place, describing conditions maintained in another, with nothing holding the two together until someone builds the thing that reads both.

### 2026-08-19 [28f11dad6f18]

Between `CHAP. XXIII.` and the first line of scripture, this edition sets a multi-line **italic ARGUMENT** — 4 lines on leaf 403, ~8 on leaf 411. My pre-registration justified `N = 6` as "at most three non-body rows by the edition's design." **The book refutes that count.** This is Sir's anti-circularity rule working as intended: I named the archetype in the book's vocabulary, and the book was able to prove me wrong. Had I sized `N` from the error instead, nothing would have contradicted it.

### 2026-08-19 [6b132eb07c90]

On leaf 411, `region_head` labels the italic argument rows 3–7 as **MainText**. The argument is justified to the full measure, so R3's "is this a body row" test passes on it — and there is no region type for *argument*. So on a chapter-opening leaf the head reader would return the **argument's** opening words as the leaf's first line of scripture. The region gold cannot catch this, because on exactly those leaves it labels no MainText at all. The blind spot and the defect are the same leaves.

### 2026-08-19 [af2228c537e6]

D3 is the quietly important one: **identical to four decimal places** with the rule on. The 121-token gold contains no argument rows, so it *cannot* reward this change — it can only detect collateral damage. A criterion that can only ever hurt you is the most honest kind to pre-register, and it's the reason I could add a fifth region type without re-opening any recorded number.

### 2026-08-19 [060b71a9c1e0]

Two structural things surfaced while building this gold, and both are the *same* shape as defects this project has paid for before:

1. **An enumerator can't prove absence at the wrong grain.** The row-slant census says "leaf 415 has no italic," but the rule fires per *segment* — a row averaging upright can still hold an italic run. So I stopped hand-rolling the segment test (my first attempt returned 25 candidates, all marginal notes the rule could never label, because my copy dropped `in_block`) and instead ran **the rule itself with its two constants widened**. What the enumerator emits is then exactly what the rule can emit, by construction.

2. **The gold was matched to the page by exact float equality.** Its own `_doc` says "score by page-fraction overlap, never by row index" — but the scorer compared `round(y0f, 4)` for identity. If the row clusterer ever shifts a baseline, a gold entry matches nothing and gets silently counted as a *recall miss* — the rule blamed for a defect in the addressing. That's the signature defect again (a correct rule nothing reads), so the scorer now reports **ADDRESSING FAILURE** separately from D1.

### 2026-08-20 [1f2e73f839de]

- I nearly drew a second wrong conclusion: an ad-hoc recount returned 0 for every lane and I said the gate log had rotated. It hadn't. **The Bash tool runs zsh, which doesn't word-split unquoted `$var`** — my two log paths became one bogus filename. The supervisor's identical code was correct all along because it's `#!/bin/bash`. Same family as trap 12: testing outside the real embedding tests a different language.
- So the new audit deliberately tests **behaviour, not config**. Registration lives across four per-project settings files, and reading a file the lane doesn't actually load is precisely how you get a confident wrong answer.

### 2026-08-20 [17124e8fcece]

- The classified payload names its own cause: `{"...tabs_context_mcp":"createIfEmpty=true"}`. That flag **creates a tab** — a mutation — which is why it's adjudicated at all. The read-only form of `tabs_context_mcp` is on Claude Code's built-in safe allowlist and never reaches the broken classifier. So the likely fix is dropping one parameter, not restarting a process.
- This also re-frames my 08-14 retraction: I tested the `permissions.defaultMode` hypothesis *while the classifier was 500-ing*, so that negative was confounded — it could not have succeeded regardless of the setting. A two-cause signal I'd filed under one cause.

### 2026-08-20 [84cf6ac25e41]

- **Do not change your user-level `defaultMode`** — my lane already has the setting remedy 2 would have produced, and it changes nothing. The security-posture change would have bought exactly zero.
- The coherent model, fitting every observation: these chrome tools are **deferred**, so they register *after* the permission engine builds its tool table — which is why permission mode and allow-rules can't short-circuit them. Read-only calls hit a built-in safe list before the classifier; anything mutating (including the `browser_batch` wrapper) falls through to it.
- The error names a *model*, `claude-opus-5[1m]` — the same misdirection I flagged on 08-14, pointing diagnosis at permissions when the fault is an upstream classifier outage.

### 2026-08-20 [4caeaa7f86ba]

- The model that fits everything: these chrome tools are **deferred**, so they register *after* the permission engine builds its tool table — permission mode and allow-rules can't short-circuit them at all. Read-only calls hit a built-in safe list; anything mutating falls through to the classifier. **Split by mutation, not by tool name.**
- My 08-14 retraction was **confounded**: I tested the `defaultMode` hypothesis *while the classifier was already 500-ing*, so that negative couldn't have succeeded regardless of the setting. Same conclusion, but I only earned it for the right reason today.

### 2026-08-20 [65b4d57c4a58]

- Two competing causes for one signal, and I nearly shipped the wrong one: had I skipped the control, I'd have told Jacques to `/clear` — burning his 260K-token session for a remedy that provably doesn't work, since a 5-entry session fails identically.
- The clinching detail is in the error text itself: it claims `claude-opus-5[1m]` is unavailable while that exact model is serving this turn, Jacques' turns, and Protos'. The model is up; the **classifier path** is down. "Wait for the model to recover" was never the right frame.
