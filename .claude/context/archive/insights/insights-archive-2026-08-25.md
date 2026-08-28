# Insights Archive — 2026-08-25
# Rotated: 2026-08-25T17:18:54Z (36 entries)

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

# Insights Archive — 2026-08-25
# Rotated: 2026-08-26T02:57:22Z (16 entries)

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

