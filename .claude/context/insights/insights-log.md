# Jarvis Insights Log

Captured automatically by insight-capture.js hook.
Processed by /reflect Phase 5 for Graphiti ingestion.

---

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

### 2026-08-20 [69516811c28c]

- I deliberately left the historical test artifacts alone — wiggum loop results, `experiment-7/7b` captures with `"recorded_by": "W5"`. Under the **old** `launch-jarvis-tmux.sh` the dev window genuinely *was* window 5, so those records were accurate when written. Rewriting them would falsify history rather than repair a misnomer. Say the word and I'll rewrite them anyway.
- The distinction that made this safe: repair everything describing the **current** system; preserve records that were **true at their time**.

### 2026-08-20 [eef4805831c1]

- My first fix half-applied in a genuinely confusing way: the **title** changed to "SUPERVISOR LOG" while the **content** stayed stale. Cause — `jicm-config.sh:510` assigns `JICM_WATCHER_LOOP_LOG` with a *bare* assignment, no `${VAR:-default}`, so sourcing the config silently clobbered my value. Fixed with a HUD-owned `JICM_HUD_LOG_FILE` the config knows nothing about.
- The HUD is a long-running loop, so it caches its script body like the supervisor daemon — and `respawn-window -k` destroyed the window (same failure as MLX-Embed on 08-17). Recreated from the launcher's canonical `new-window` definition.

### 2026-08-20 [6e41f17d893b]

The nudge itself is the bug. In `.claude/scripts/jicm-supervisor.sh:878`:

```bash
if [[ "${n:-0}" -gt 60 ]]; then
    _rest_nudge "$key" "... is at ${n} lines (limit 80). Please prune ..."
```

**The gate fires at `> 60`; the message asserts a limit of 80.** So the band 61–80 produces a nudge whose own text proves no action is required — and the agent receiving it is being told a false premise about its file. This is the project's signature pattern in miniature: a correct rule (warn early at 60) and a consumer that reads it wrong (reports it as the hard limit).

### 2026-08-20 [765f3e4b0ad1]

G5 is the criterion that can fail *while all the bars pass* — it counts how many rows the rule actually touches. If per-segment R4 demotes exactly one token, the one gold entry that exposed the defect, then the rule is fitted to its own witness and the passing numbers mean nothing. That's the same trap R2.2e's E1/E2/E4 fell into: three criteria that only asked whether my mechanism did what I said.
The G3 wording problem is worth noting too — as pre-registered it names the *baseline* as "the shipped pipeline," but if R2.2f is adopted the thing that ships is per-segment R4 with the span qualifier still off. The scorer takes the verdict on the stricter reading and prints both, rather than amending a pre-registration after the fact.

### 2026-08-21 [cfc818a78581]

**A rename is a correctness audit in disguise.** Three of the most serious findings here weren't the rename — they were bugs the rename *exposed* by making a stale identifier suddenly resolve to something live. `pgrep -f 'jicm-watcher\.sh'` was harmless while that name meant a dead script; the moment it named the running daemon, it became a self-match that could permanently shadow W0. Renaming forces you to ask "what does this string actually resolve to now?" of every reference.

**Separate liveness from supervision.** The daemon panel reads process liveness and launchd state as two independent facts, because a live pid with an unloaded job is a distinct failure: it works right now and nothing will restart it. Merging them into one green "UP" would hide exactly the condition worth knowing.

**Monitors fail silently in a specific way — by monitoring the wrong thing.** v1 didn't crash; it confidently rendered a red DOWN for a process nobody cared about, which is worse than a blank panel because it looks like information.

### 2026-08-21 [c114b48e55d0]

H4 is the criterion R2.2f's failure taught me to write. Scoring each link against its own bar is exactly what let a cycle hide: R2.2f couldn't reach its bar because R2.2g was open, and R2.2g's own acceptance never mentions the entry R2.2f owns. H4 turns all three flags on at once and asks the chain a question neither link can answer alone.
The `"reach"` variant's left edge is the genuinely risky half — *any* row with ink in the left margin becomes flush-left, and this project already lost RunningHead recall 1.0000 → 0.7500 once to a promoted row. Hence three settings rather than one, and H3 with no exception.

### 2026-08-21 [c6493eedf2a7]

On leaf 409 the modal left edge `L=200` has 19 rows within tolerance and **12 rows starting left of it**; the left-edge histogram is a smear across bins 143–221, roughly 80px wide. The mode isn't wrong so much as computed at the wrong resolution.
The cause is exact: `block_measure` finds the mode with `EDGE_TOL_P * p` = **13px**, while `classify` then tests in/out of block with `max(0.35p, 0.03·measure)` = **27px**. The estimator's window is half the consumer's. That is *two tolerances for one edge* — the identical failure `region_head`'s own header records having paid for once, surviving in the one place they didn't unify.

### 2026-08-21 [5ce78cff8252]

Under perturbation the y-band scorer is *more* robust but not invariant: orphans fall 41→38 at ×0.6 and 9→3 at ×1.6, with more entries bound in both cases. So the re-key removes some clusterer dependence and not all.
The reason is structural. Binding by y-band still forces each entry to pick **one row**, and when the clusterer splits a line, the entry's ink lies across **two**. A row isn't an address either — the address is the ink's position on the page, in both axes. That's candidate 2: bind entries to tokens by 2-D overlap and let row membership out of the instrument entirely.

### 2026-08-21 [da78a022a864]

`ink2d` and `yband` land on the same accuracies (0.8281 / 0.9231) with orphans 37 vs 38 and 2 vs 3. A completely different addressing scheme produced essentially the same result, which means the movement isn't coming from addressing at all.
The row clusterer feeds `tokens()`. Perturbing it changes **which glyphs are in a row**, so the tokens themselves change shape — a split line yields two half-length token sets. The gold's x-span then over- or under-covers real tokens. **No addressing scheme can be invariant to that, because the clusterer changes the objects being labelled, not merely their names.**
And the roadmap already says so, for splitters: *"a criterion demanding an unchanged score is unachievable and was twice wrongly pre-registered."* I have now pre-registered it a third time, one level up. The rule was written down and nothing read it — the signature defect, in my own criteria.

### 2026-08-21 [f85de2acb260]

The verdict picked `yband` for a bad reason: it was first in a tuple. Both candidates pass every criterion identically, and the pre-registration never stated a tie-break — so the scorer fell back on declaration order, which is not a decision rule.
On principle it must be `ink2d`. The entire purpose of R2.2j is to unblock R2.2i, where a printed line is split across **two** rows; `yband` must still choose one row and would lose the sibling's tokens, while `ink2d` never consults rows at all. The perturbation numbers point the same way — ink2d had fewer orphans than yband at both settings (37 vs 38, 2 vs 3), which is exactly where lines split.

### 2026-08-21 [071c4bd93afa]

Instance #13 is the one I'd most want a future session to see: the rule I violated was written in the **docstring of the file I was editing**. `score_head_regions` says plainly that a criterion demanding an unchanged score under a changed input is unachievable, and notes it had already been wrongly pre-registered twice. I read that file, edited around that paragraph, and pre-registered it a third time.
That's what makes this project's signature defect worth its name — it isn't ignorance of the rule, it's that a correct rule sits somewhere nothing consults at the moment of decision. The remedy has consistently been building the consumer, not writing the rule down more emphatically.

### 2026-08-21 [83e5cb4708af]

R2.2j was adopted yesterday on criteria that perturbed the **row clusterer**. This guard perturbs the **splitter** — a different axis its criteria never touched — and finds the new binding silently dropping a token. That is precisely the failure mode R2.2j was adopted to prevent: its whole deliverable was "report the addressing failure SEPARATELY from the region score." The adoption satisfies its own criteria and violates its own principle on an axis nobody scored.

### 2026-08-21 [a5c4af37a867]

**The Gorilla citation reframes the whole problem.** RAG usually means embedding documents and retrieving passages. Citing an API-calling paper instead says the retrieval unit is a *function call with typed arguments*, so the quality lever is the tool catalog and the resolver, not the embedding model. Most "optimize the chatbot" instincts aim at the wrong layer.

**Extreme atomicity inverts a normal assumption.** Storing every nucleotide as a row makes the schema uniform and joinable, which helps a planner, while making unconstrained generated SQL genuinely dangerous. The same design choice that makes the data agent-friendly makes the naive agent approach unusable.

**Their weakest admitted point is upstream versioning, and that is an agent opportunity.** Because the answer layer can pin and export what the storage layer cannot retain.

### 2026-08-21 [ec930fbb2758]

**The evidence chip is information design, not decoration.** The spine of this brief is that nothing about Lilly's internal system is verified. Encoding Verified / Inference / Correction as a colored chip on each claim makes that structural, so you can't skim past it and accidentally state an inference as fact in the room. That was the one thing worth spending a semantic color on.

**Numbered items earned their numbers.** The design guidance warns that `01 / 02 / 03` markers are usually filler. Here the eight optimization items are genuinely ordered, by how much of the failure surface each removes, so the numbers carry real information.

**The mono face is subject vernacular.** Accessions, gene symbols, repo paths, and article IDs like `gkaf254` live in monospace in this field. Using it for identifiers and the serif for argument keeps the two registers visually separate.

### 2026-08-21 [11bc6ba53467]

**The bug was a mismatch between the measure and its container.** I capped paragraphs at `68ch` (roughly 580px) but let their grid column run about 920px. Text filled the left 580px and left 340px of dead air, which reads exactly as "squished left" even though nothing was technically misaligned.

**The fix was to make the column the measure, not the paragraph.** Width is now derived rather than guessed: `--rail + --gutter + --measure`, so the container width and the reading measure cannot drift apart. Per-element `max-width` caps inside a wider column are the usual cause of this class of bug.

**A missing centering rule made it worse below 1080px.** The sidebar hid but `main` stayed full width with capped text, so it pinned left. It now centers itself when the rail is gone.

### 2026-08-21 [c326f9299b47]

**Found it, and it is a CSS cascade ordering bug, not a math bug.** The `@media (min-width:1080px)` block sets `.toc { display:block }`, but the *base* rule `.toc { display:none }` is written **after** it in the stylesheet. Equal specificity means source order decides, so `display:none` wins at every width. The rail is invisible, but the grid still reserves its `190px` column, and `main` falls into that column instead of the `680px` one.

**That is why it looks "squished left" rather than "narrow and centered".** My previous fix corrected the measure math, which was genuinely wrong, but the real culprit was one rule sitting three lines too low.

**Media queries are not stronger than base rules.** A common mental model is that a matching media query overrides. It does not, unless it comes later or is more specific.

### 2026-08-21 [66f507b64171]

`main` reports five sinks by name: `unlabelled`, `ambiguous`, `collisions`, `orphans`, `abstained`. This was the sixth, and the only one with neither a counter nor a print. The guard asserts `lost <= collisions + orphans`, so every drop through it read as a token disappearing for no stated reason. The rule was written down five times and skipped once.

### 2026-08-21 [42e928c61825]

My own double-run guard produced a false positive. `ps aux | grep -c "[t]est_verification_standard"` counted **2** because the shell process executing that compound command has the pattern in its own argv — the bracket trick defeats the grep self-match but not the *shell's* self-match. This is the same family as the `pgrep -f` trap already in memory: argv is not process identity. Had I trusted it, I'd have skipped the confirmation run believing a suite was already going.

### 2026-08-21 [e972bff5c91d]

The second was worse. My double-run guard, `ps aux | grep -c "[t]est_verification_standard"`, reported 2 processes when there were none. The bracket trick stops grep matching itself, but not the *shell* running the compound command, whose argv contains the pattern. Had I trusted it I would have skipped the confirmation run believing a suite was already in flight. Same family as the `pgrep -f` trap already in memory: argv is not process identity, and a check that fails closed on a false positive silently cancels the work it was guarding.

### 2026-08-22 [03a243908409]

Every leaf's error is now **0, −1, −2 or −3 — never positive**. A near-constant offset across 20 leaves is the signature of a *definitional* mismatch between two counters, not of a clustering failure that would scatter. The strip counter reads peaks over the whole page's ink profile; the clusterer only ever sees `glyph_boxes`, which drops border-touching and out-of-size components. So the counter may be counting things at the page edges that are not type. Tuning the clusterer to close a −35 gap would be exactly the wrong move if the gap is in the bar.

### 2026-08-22 [174a3749bcbe]

The rule for this is already written in this very module. `text_runs`' docstring: *"A run that reaches the band's BOTTOM EDGE is the leaf edge / gutter shadow, not type. Leaf 700's '0px strip' was exactly this."* My strip counter reimplemented profile-run detection and did not read it. That is the signature defect again, and it inflated the bar I then used to refute candidate 1. The fix is principled and independent of the candidate: drop runs touching y=0 or y=H.

### 2026-08-22 [9a5620588dc9]

Accuracy went *up* (0.8760 → 0.9000) and MainText up (0.8375 → 0.9178), while scored pairs fell **121 → 90 with 27 orphans**. That is the exact Goodhart pattern this project already documented: `score_head_regions`' own header records that a broken splitter "posts the HIGHEST max-overlap accuracy, 0.9479, by orphaning 25." My S6 bar checked four *rates* and never checked the denominator, so three of its four numbers improved by discarding a quarter of the gold.

### 2026-08-22 [ba7887d60a63]

My seed threshold is `0.25 × prof.max()`, and the profile maximum is set by the densest *full body line*. A running head, a chapter head, or a note line has few glyphs, so its peak never reaches a quarter of that — every short line is discarded as noise. That is why S2 scored a perfect 20/20 while the gold collapsed: S2 counts **body-block** rows, which are exactly the long lines that survive. And RH recall still read 1.0000 because it is computed over bound pairs, so orphaning 13 of 20 running heads *raised* the rate.

### 2026-08-22 [3a5b042bceaa]

The third is the one I nearly banked. The first S6 run showed accuracy **up** 0.8760→0.9000 and MainText **up** 0.8375→0.9178, while scored pairs fell 121→90 with 27 orphans. Three of four numbers improved by discarding a quarter of the gold — precisely the Goodhart `score_head_regions`' own header records ("the broken splitter posts the HIGHEST accuracy by orphaning 25"). S6 as I wrote it bars on four *rates* and never on the denominator, so it could be passed by orphaning. Meanwhile S2 read a perfect 20/20 throughout, because S2 counts body-block rows and the defect only destroyed running heads and notes. A criterion scoped to one region cannot see damage confined to another.

### 2026-08-22 [ce4b548f2592]

**760 far glyphs across the 20 leaves produce exactly 0 rows.** Look at line 328: a glyph farther than `ROW_TOL_P*p` from its nearest seed goes to `buckets[("far", bs, id(bx))]` — a key unique **per glyph object**. So every unexplained glyph becomes its own one-glyph row, and the exit filter `len(r) >= 2` then deletes all of them. The seeded branch *cannot* emit a surviving row from that path, by construction. Chained with the same tolerance the greedy branch uses, those same glyphs form **88 rows**.

The clincher is that this reconciles two numbers that looked incompatible. If 88 real lines were vanishing, S2 should show a big deficit — instead S2 read 20/20 at **+2**. No contradiction: S2 counts **body-block** rows, and the shredded lines are the short ones outside the body block. That is the identical blindness already on the record ("S2 read 20/20 while 13 running heads were orphaned"), now caught a second time by the same mechanism, in the same run.

### 2026-08-22 [6e2e63ed99bc]

I had written "make the far path chain greedily" into the scratchpad as the next step. v12 says not so fast. If those 760 glyphs were **descenders** of lines that already have seeds — `glyph_boxes` returns the box *bottom*, and p/q/y/long-ſ sit well below the baseline — then chaining them fabricates one phantom row per printed line, and the fix is actively harmful. The splitting test is the **sign**: a descender is always below its baseline, never above.

Result: **58.6% below / 41.4% above**, and far glyphs are barely taller than assigned ones (0.510 vs 0.475 pitches). That refutes descenders as the *dominant* cause — but the median offset of **+0.329** and the mild skew say a descender component is genuinely mixed in. So it is neither pure "missed lines" nor pure "descenders," and chaining would recover some real lines while fabricating others. **Not adoptable on this evidence.**

### 2026-08-22 [050f2f9ac5df]

Orphans **10 → 3**, and look at *what* was recovered: `'NVMERI.'`, `'NVMER'`, `'NVMERI'` at **row 0** on leaves 404/406/408/416/418 — that's the running head, the book title (Numbers), which is exactly the RH population S6 was failing on. The far bucket was shredding the running-head line specifically.

The check that matters most here is the **denominator**, because this project has already been burned once this run by rates improving through discarding gold. Entries-binding-none went **13 → 5** and **10 → 2**: more gold is being scored, not less. That is the *inverse* of the Goodhart pattern. It also explains why one accuracy reading *fell* (0.8926 → 0.8712) while the instrument reading rose — previously-unscored entries are now scored, and some score wrong. An honest gain, not a laundered one.

### 2026-08-22 [598e9055d5e2]

Look at leaf 419's gold texts: `'watero ex'`, `'une'`, `'ygamentesth'`. Those aren't transcriptions, they're machine garbage — but the *spans* are real. The regressed entry is `row 2`, and my candidate **adds rows**. `match`'s default `on_line` is `t["row"] == e["row"]` — a **row ordinal** — and `score_head_regions` still says *"A ROW ORDINAL IS NOT AN ADDRESS. DEFAULT 'ordinal' (unchanged) until K1–K4 pass."*

So adding a row renumbers every key below it. That is the exact R2.1i defect this project already paid for once — "changing the splitter renumbered every key and the score collapsed with no region having changed." My A/B is confounded in **both** directions: the 1 new orphan is probably an addressing artefact, and some of the 8 recoveries may be too. The 10→3 number is not yet a result.

### 2026-08-22 [c4e6a78c5ee3]

This is what the denominator check buys. Under **A** the RH rate 0.9231 was computed over **13** entries when the control scores **19** — six running heads simply weren't in the sum, so A's rates and the control's rates were never comparable quantities. **B restores the denominators to control levels** (19/19/79) and drops entries-binding-none from 10 to 2, against a criterion the scorer itself states must be 0.

Only now can the rates be read: on equal denominators B is **+5 MT correct, −1 RH, −2 MN** versus control. So **S6 still fails** — but it now fails for a real reason rather than a bookkeeping one. Candidate 4 stays unadopted, `BASELINE_MODEL=False`.

### 2026-08-22 [4bc82bb8f713]

The reason this hole survived is worth keeping. `test_region_gold_addressing`'s criterion B *does* police the denominator — "any change in the number of scored tokens must be FULLY ACCOUNTED FOR by reported drops." Candidate 4 satisfies it perfectly: it sheds 5 entries and reports all 5, so 116 + 5 = 121 and the guard stays silent while the rates ride a short denominator. That invariant asks **where** entries went; the S6 hole was about **how many**. An enumerative guard cannot catch a quantitative loss — which makes this instance #15 of the signature defect, and the most pointed one yet, since the module had been *printing* "must be 0" all along while its verdict read neither line.

### 2026-08-24 [034b51a4b058]

**I nearly reported a false failure on the input box.** `C-u` looked like it did nothing across two checks, so I moved toward a different clearing method. Sending one printable character revealed the line had been empty the whole time — the TUI simply had not repainted, and `capture-pane` returns the last painted buffer, not live state.

**That is a stale-instrument reading, not a failed action.** Same family as measuring file mtime and calling it "the conversation advanced." The remedy was the same one that worked before: force the surface to update, then read it, rather than trusting a quiet reading.

**Worth encoding, because the retry would have been destructive.** My next move was going to be sixty backspaces into a pane that was already clear — which would have eaten into whatever the TUI drew next.

### 2026-08-24 [fc3d0560d41c]

**I almost reported a sampler defect that did not exist.** Urist showed three `tool_use` records and zero PostToolUse samples in the gate log — the textbook unregistered-sampler signature. The splitting test saved it: the gate throttles PostToolUse on a 30s debounce, and the marker is stamped by the *prompt* pass too, so a lane whose tools all run inside that window writes no line at all. The debug log settled it with direct evidence of the hook running.

**That means the audit heuristic itself is unreliable**, since it keys on exactly that signature. A check that cries wolf on healthy lanes gets ignored, which is how the real case slips through. Task #10.

**Urist's first act was to refuse an unverified claim.** Asked which window it was in, it ran `tmux display-message`, got `aion:11`, and instead of reporting that, named two readings it could not distinguish from inside and asked for the external test. It was right — `display-message` with no `-t` resolves against the session's active window, which was mine. A fresh lane declining to assert from a self-referential instrument is the best possible first turn.

### 2026-08-24 [38860a15775c]

I hooked `_log` rather than the ten `_log "ALERT …"` call sites, so every alert — including any added later — is delivered *by construction* rather than by someone remembering. And the w0 inbox turned out to be a genuine sink, not a fifth unread channel: its own header says it is **force-loaded at session start via the persona @-import**. I only learned that by reading the file I was about to write into.

### 2026-08-24 [028c04dce4fc]

That falsifies the clean version of my own claim from twenty minutes ago. I wrote "nothing failed at or below 8,000," which was true *of the scaling ladder* and I generalized it into a property of the system. A 7,302-char chunk just produced 51K of output and hit the same cliff.

The honest statement: output size drives the failure, and input size only *correlates* with output size. Chunking still helps — it bounds the blast radius to one chunk and graphiti retries internally — but it does not guarantee staying under the cliff.

### 2026-08-24 [a915124e1a8f]

The argv was still worth reading. "Source says 5400" and "the running process is bounded at 900" are both true simultaneously, and only the timestamps distinguish "stale invocation" from "the fix never took". A file-content check alone would have said fine; a `ps` check alone would have said broken.

### 2026-08-24 [f9fdb9afb087]

This changes the rig design. My reflex would have been `--mcp-config` + `--strict-mcp-config` per [[reference_claude_code_mcp_cli_flags]] — but `--strict-mcp-config` restricts the session to *only* the passed config, which would strip out the very tools under test. The disposable session must inherit the global connector and override only `--model`.

Also note `tengu_cowork_chrome_automode_default: true`. The denial text says "auto mode cannot determine the safety" — so the classifier is the auto-mode safety classifier, which makes the model name in the error a load-bearing detail rather than incidental.

### 2026-08-24 [ce50d41c8c2d]

`STEP1` returned "no claude-in-chrome MCP server is connected in this session" — the headless `-p` session never had the tools at all. Had I omitted the control and run only the mutating call, I'd have gotten a failure and could easily have filed it as "sonnet is denied too", closing #7 on an artifact of the rig. This is the same discipline as the must-fire case from §0.-21: a harness that fails uniformly is a broken harness until proven otherwise.

The cause is structural, and it follows from what I found a moment ago: the extension is a *connector paired to an interactive session*, not a spawnable `mcpServers` entry. No `-p` invocation can carry this test.

### 2026-08-24 [9e34bdb80793]

The error interpolates **whatever model the session is running** into a generic "classifier backend unavailable" template. On opus it says `claude-opus-5[1m]`; on sonnet it says `claude-sonnet-5`. The model name reads like an attribution — "opus is the thing that's unavailable" — but it's a template variable, not a diagnosis.

That is precisely why §0.-20 filed this as high-value-but-untested: every lane ran `AION_MODEL=claude-opus-5[1m]`, so the name appeared in every denial anyone had ever seen, and constant-across-all-observations looks exactly like causal. Task #7's premise was built on a string that could never have varied.

### 2026-08-24 [6a3856ed2836]

This is the property that actually distinguishes the chunked design from the truncation bug it replaced, and it needed measuring rather than reasoning. Under the old code a kill cost the entire night's ingest; here a kill cost only the tail. The +31 is the evidence — and note it had to be read as *net new after dedup*, not against the 48 the log reported, or the numbers would look like a discrepancy.

### 2026-08-24 [df06d6781a0b]

"**Denied by auto mode**", with the UI itself pointing at `/permissions`. That settles a confusion running through this whole investigation: Chrome's auto mode is a *separate* gate from the session permission mode. The pane shows "bypass permissions on" and "denied by auto mode" simultaneously — bypass governs ordinary tools, while browser actions get routed through auto mode's safety classifier regardless.

So the lever is not the model, not allow rules, and not `bypassPermissions`. It is auto mode itself.

### 2026-08-24 [6b2f7cb0b250]

These are Claude Code's ghost-text prompt suggestions, not typed input. `capture-pane` renders placeholder text identically to real text, so the pane *looks* like it holds an unsent human line. The cursor column is the discriminator — the same class of error as §0.-20's unrepainted-buffer trap, where the visible pane and the actual state disagree.

This matters beyond tidiness: TRAP 16 exists to stop me destroying Sir's unsent work, and a rule that fires on *appearance* rather than state would make every idle pane untouchable.

### 2026-08-24 [8536c1b7bd7e]

This is the third time this trap has landed, and it has a new tooth. Previously it produced an empty diffstat and a vacuously clean scan. Here it *also* silently changed what got committed — `git add` failed, but `git commit` succeeded against previously-staged content, so the message and the contents were completely unrelated.

The lesson sharpens: a failed `git add` does not stop the commit behind it. Never chain `add` and `commit` without checking the add succeeded, and never build a pathspec list as a space-joined string under zsh.

### 2026-08-24 [3266711b6f68]

This is the sharpest version of today's recurring failure. The script verified that the pane pid changed, and reported success on that basis. But the pid changing is not the thing anyone cares about — restoring MCP is. So every lane it had ever restarted came back with Graphiti 401ing and Anna's silently supplying nothing, under a green success message.

Had I trusted the tool, I'd have bounced all six Archons and told you MCP was restored with nothing restored.

### 2026-08-24 [8619060a1521]

The window's baked uuid was **stale** — `0215a830…` against my live session `5079671e…`. That's the trap the script warns about: the "Press Enter to --resume" loop would have succeeded *silently* and restored a different session, because the old transcript still exists on disk. It doesn't error, it just resumes the wrong conversation.

This is why the restart resolves the session id from the registry rather than trusting the window. My 2.7 MB session is what comes back.

### 2026-08-24 [93ebdc5f2d12]

The window's baked uuid was **stale** — `0215a830…` while my live session was `5079671e…`. The restart resolved the live id from the registry and rewrote it, so I came back as myself.

Had this gone through the "Press Enter to --resume" path instead, it would have resumed the wrong session **silently**. Not an error — the old transcript still exists on disk, so it loads cleanly and you'd simply be talking to a different, older conversation that believes it's current. I only saw it because I dry-ran from the external session before committing.

### 2026-08-24 [80d75b73903e]

The control is what makes this a real negative. A session without the connector returns "tool not found" for **both** calls, which looks like a denial if you only run the mutating one. That's the void run from §0.-25 that nearly closed the investigation on a rig artifact. Control-then-test is now a two-call protocol, not an optional rigour.

The model name in that error is interpolated into a generic template, not an attribution — refuted by measurement in §0.-25. It survived six days as a false lead only because every lane ran the same `AION_MODEL`, so a constant was indistinguishable from a cause.

### 2026-08-24 [3b18ad6cba16]

Chrome is a **session-paired connector**, not an `mcpServers` entry (§0.-25). My W11 session paired with the *old* extension install at launch. The read-only control still passing tells me the pairing is live, and the error text is the classifier template rather than a connection failure — so the evidence says this isn't staleness. But "the extension was reinstalled" is the one variable that actually moved today, and a session that predates the reinstall cannot rule itself in or out. A **fresh** session pairs from scratch.

### 2026-08-24 [ed8dd6cc2705]

This is a **splitting test**, not a retry. Two hypotheses produce the identical denial in W11: (a) the classifier backend is down globally, and (b) my session's connector pairing predates your reinstall. A fresh session pairs against the new install, so it separates them — one arm passing would mean every lane just needs a relaunch, which is cheap and entirely in my hands.

The trap I'm avoiding: re-running the *same* call in the *same* session and calling the same answer new evidence. That's what "wait and retry" invites, and six days of it produced nothing.

### 2026-08-24 [d17058561f04]

- **Every assumption `restart-watcher.sh` encodes is dead.** v9 accepts no `--threshold`/`--interval` flags (grep returns nothing), writes no PID file, targets W1 (now a live Protos session at 105k tokens), and is launchd-managed with `KeepAlive` — so killing it by PID just makes launchd respawn it.
- **The only thing preventing catastrophe is a typo-grade accident**: `SESSION="${TMUX_SESSION:-jarvis}"` defaults to a session name that no longer exists, so preflight exits 1. Set `TMUX_SESSION=aion` and `respawn-window -k` destroys Protos' 105k-token context with no recovery path.
- v9's real threshold idiom is `JICM_SOFT_TOKENS`/`JICM_HARD_TOKENS` env overrides, and the restart verb is `launchctl kickstart -k`.

### 2026-08-24 [87d1267484ec]

- **`connectedAt` = 14:52:35, but this session started at 17:09.** The extension has held one continuous connection for 2.5 hours — it never dropped. The disconnect/reconnect churn I saw in system reminders was the *client* side (my session re-establishing its MCP connections during the relaunch), not the extension. Those are different failure surfaces with different remedies.

### 2026-08-24 [da09fd213365]

- The control call is a **pure read** that returns a plain-text hint rather than JSON, while the mutating call returns a structured payload. That asymmetry in return *shape* is itself a signal: the tool distinguishes "nothing to report" from "here is state," and only the latter path allocates a `tabGroupId`.
- The extension is clearly reachable and permissioned — a broken bridge would have surfaced a connection error on the *control* call, before any mutation. So this pair also functions as a cheap liveness probe for the Chrome MCP link.
- The session's tab group (`1480451519`) is created lazily on first need, not at session start. That's why the guidance says never to reuse tab IDs across sessions: the group and its tab IDs don't exist until something asks for them.

### 2026-08-24 [614f77c69afb]

- **`now close that tab` is ghost text, not human input** — `cursor_x=2` and zero clients attached to `chromeprobe6`. My own probe recipe warned about exactly this trap; the placeholder here is a *suggested follow-up* rather than the picker's, but the signal is identical. Reporting it as a user message would have invented a collaborator.

### 2026-08-25 [0cdd2093beb0]

- **The winning move was "never ask the broken oracle," not "approve the denial."** Lever 4 approved *after* a denial and the next call failed anyway, because approval doesn't remove the classifier from the code path. Manual mode intercepts *before* the classifier is consulted. Those two look like the same remedy in a summary and are opposite in mechanism.
- **The outage is not fixed — it's routed around.** The upstream classifier is still down; I re-confirmed the exact signature at 17:2x. Worth stating plainly so nobody later reads "chrome works" as "the backend recovered."

### 2026-08-25 [6e83e0c06cff]

- This is exactly why deriving the value beats hardcoding it. A hardcoded `"gzip, deflate"` would be *correct in the container and wasteful in any environment that has brotli*; a hardcoded `"gzip, deflate, br"` would reintroduce the outage. Deriving from `SUPPORTED_DECODERS` is right in both, and the divergence between my two environments proves the divergence is real rather than hypothetical.

### 2026-08-25 [4224befbfde3]

- **The health check passing was a dead metric here.** `{"status":"ok"}` proves *a* proxy is listening — it cannot distinguish the old container from the new one. Had I stopped at the 200, I'd have reported a fix that was never deployed. The attribute probe is what actually discriminates.

### 2026-08-25 [68d919c3cec8]

- **`--strict-mcp-config` replaces the entire config, not just the project layer.** It's there for a good reason on Genie — it's what binds `GRAPHITI_GROUP_ID` to `genie-core` instead of the root file's hardcoded `jarvis-core`. But the side effect is that the three strict lanes silently lose Gmail, Calendar, PubMed and Mermaid. Urist and Jacques inherit that cost without needing the benefit.
- **`claude-in-chrome` survives `--strict-mcp-config`** — it's harness-injected, not config-driven. That's why the strict lanes still had chrome tools throughout the outage, and it confirms the earlier finding that the blocker was never per-lane MCP config.

### 2026-08-25 [5c2479628ab5]

- **"Idle" and "busy" aren't contradictory here.** `window_activity` measures *terminal output*, which stops when a pane blocks on input. W0 has been silent 38 minutes precisely *because* it's waiting. The restart script's own liveness probe is the better instrument, and it was right eleven times while the idle timer was misleading.
- The `--yes` I passed governs *my* confirmation, not the lane's. The save-gate still refused to proceed — which is the behaviour you want: a flag that skips the operator's prompt must not also skip the safety interlock.

### 2026-08-25 [262da3ac5021]

Neither fix exists independently of a large body of uncommitted work. `git show HEAD:…/collation_read.py | grep -c "baseline_seeds\|BASELINE_MODEL"` returns **0** — the far-chaining fix lives inside the seeded branch, and *neither* `BASELINE_MODEL` nor `baseline_seeds` has ever been committed. Likewise the S6 bar sits in `score_head_regions.py`, which git has never seen (`??`), and which imports `region_head.py` — also untracked.

So committing "just the two fixes" would produce a commit that doesn't run. `collation_read.py` alone is **+790 lines across 14 hunks** since its last commit on **2026-08-14**; the far-chaining change is a few lines of one hunk. And **21 files in `witness/` are untracked**, including 12 of the `score_*`/`test_*` modules the 38-command suite invokes.

### 2026-08-25 [0b8bd6b8e930]

The Roadmap **already contains** this experiment. It records that `segment` holds RH 1.0000 and gives *"the best MN recall measured (0.9474)"* while MT falls — and it already names the cause: *"a body row's own VERSE NUMBER sits beyond a pitch-wide gap, so the body line is cut short of the measure."* It then names the next candidate: *"the extent of the region run that is **FLUSH TO L OR R**, not the longest — continuous like a justified line, anchored like one, and computed on GLYPH BOXES."*

I ran three candidates and rediscovered two refutations that were already written down. That is instance #17 of this project's signature defect, committed by me, against the very document I was asked to review. My measurement adds one thing — quantifying it at 34% of body-like rows and generalising the cause past verse numbers to stretched word spaces — but the direction was on the page and I didn't read it first.

### 2026-08-25 [7f989314b21e]

`credentials.yaml` is **multi-document** YAML — `safe_load` raised on it. That crash was the good outcome: a laxer parser would have returned document 0 only, swept half the store, and reported clean. A scan that cannot fail isn't a scan.

### 2026-08-25 [d57b6ef885f9]

Both secrets are `${VAR}` expansions; `protos-core` is a namespace, not a credential. But note lines 23–26 and 49–52: this file has **the same rot** I found in the deleted persona configs — no `mcp-hot-reload` wrapper and no `--watch` on graphiti or `jarvis-rag`, and it hardcodes paths where root uses `${VAR:-default}`. Tracking it will make that drift *visible*, which is the main argument for tracking it at all.

### 2026-08-25 [c78b98ee97fb]

The control fires — headless `claude -p` **does** print these warnings, four of them, naming the backup file. That makes the clean run a genuine negative rather than a rig artifact. Without this control I'd have been reporting "no warnings" from a test that might never have shown them, which is the same void-run trap that cost me a day on the Chrome investigation.

### 2026-08-25 [5d09ef543385]

The script contains a guard that fired **against** the more flattering number. Folding same-label seams into the must-not-cut population is legitimate only if no seam spans the text block — so the script checks at run time whether any seam reaches region-gap width. Seven of 39 do, so it refused the fold and reported the stricter accounting. A check that can only ever confirm the answer you want isn't a check; this one had a live way to say no, and did.

### 2026-08-25 [be776ee68264]

**Eleven of the twelve already had a working `Edit(...)` twin**, so deleting them is lossless — including both `Archive/**` denies. Archive protection was being *asserted twice and honoured once*; it was never actually at risk.

**The twelfth was load-bearing.** `Write(.../token-compression/*)` in `alfred/` had no twin, so deleting it would have silently removed a grant. I converted that one to `Edit(...)` instead. Uniform-looking rules are not uniformly redundant — worth checking each before a bulk delete.

### 2026-08-25 [a98a9da4cdac]

This is the project's signature defect with one turn of the screw. The usual form is a correct rule that nothing reads. Here the rule reads faithfully — it just reads a *curated copy* of the document instead of the document. The copy decayed and the audit stayed green throughout. It also connects to R10.3, which already asks this audit to parse complexity classes; the stronger requirement is that it derive its register from the roadmap directly.

### 2026-08-25 [aa3319597c89]

This is exactly the pattern §3.2b names about slant — *"working code that no rule governs… less safe than a gate with no capability, because it will be used and its errors will never be measured."* The project has caught this shape three times (Gate 0d, a rule no code implemented; Gate 0f, a rule no code read; slant, code no rule governs). This is the fourth, and it landed on the single capability you have now asked about twice. A hand-built geometric rule got four candidate implementations, five pre-registered bars and its own roadmap section. A learned layout model got a probe script and no document entry.

### 2026-08-25 [6585f128e211]

- **"All MCP servers disconnected"** at session start looked like the silent zero-MCP failure from §0.-35. It was startup latency — servers reconnect in waves. The real check is whether they resolve *eventually*, not whether they're present in the first second.
- **My warning count of "1"** was my own `grep` command echoed into the pane, matching its own search string. Same self-match trap as polling for a token your input contains. The actual count is zero.

### 2026-08-25 [625cf431ced4]

Genie, Jaques and Urist all get `GRAPHITI_GROUP_ID` exported by the launcher. **Protos does not** — its launch line exports only four variables. So a `${GRAPHITI_GROUP_ID:-protos-core}` default would normally fire correctly *and* let a chain fork override it, which is the lever for the §0.-30 open question about N chains sharing one namespace.

But that only holds if the variable is genuinely unset. If it leaks in from the tmux server env as `jarvis-core`, Protos would silently write into W0's graph — the precise pollution §0.-30 warned about.

### 2026-08-25 [99b96e5e37a4]

Verified by launch, not by parse: `your_group_id` resolved to **`protos-core`** — so the `${GRAPHITI_GROUP_ID:-protos-core}` default fired correctly and did *not* fall through to `jarvis-core`. Graphiti also authenticated and read the graph, which proves `${NEO4J_PASSWORD}` expanded too. And `mcp-hot-reload` itself is proven working, since graphiti resolved *through* the wrapper.

### 2026-08-25 [37d561a39222]

The diagnosis that made everything else fall into place: the aim was in the documents, but only as **fragments** — "archetype first" in one section, "reading order" inside a list in three others, "shapes from ink" as a section title. A project whose aim lives in fragments optimises whichever fragment is nearest to hand. This one did exactly that: four hand-built span rules and five pre-registered bars against a 19-entry gold, while four of the eight steps had no code. §3.0 exists so the aim is stated **once**, in one place, and governs.

### 2026-08-25 [b2c9b2d27d97]

This is why the standard is expensive and why it's worth it: it refuses to let a documented number drift from a computed one. It caught me doing exactly that. I rewrote the ceiling audit's claim *history* to record 72 → 81 but left its leading fraction reading `1/72` while the command had started printing `8/81`. Prose updated, number missed — and the checker reads the number.

### 2026-08-25 [e201ecb7dbc3]

`MN 0/19` reads like blindness and isn't. The MarginNote entries bind to **tight** boxes — median 0.0039 of page area, not the half-page `Text` block — so Surya **localises the notes as distinct objects** and simply has no *name* for them. Its vocabulary is modern-document: Caption, Footnote, PageHeader, Table, Code, ChemicalBlock. No marginalia class. That makes the repair a **class-inventory fine-tune of a working detector**, not a detector built from scratch — materially cheaper than R14.1 assumed. It also confirms the hybrid §3.2 item 5 specifies: the hand-built geometric component is currently **the only thing in the project that can name a marginal note**.

### 2026-08-25 [8847bbb2a9b7]

That last catch is worth naming because it is the session's pattern in miniature. Nothing was false — 20/20 is a real number the command really prints, and the suite was genuinely green. But the *headline* was the flattering fraction, and a status line is read by people who will not open the scorer. This project keeps finding the same disease in new organs: a correct register nobody reads, a correct rule nothing consumes, a correct number placed where it misleads. The register caught two of my own instances today ("strikethrough is not removal", and a ceiling line invisible without a literal C-token) — the instruments are now good enough to catch their author.

### 2026-08-26 [6e0cd94162d1]

The most useful thing R14.0 found was not a score but a distinction: `MarginNote 0/19` looked like blindness and turned out to be a **labelling** failure on a **working detector** — the notes bind to tight boxes, so Surya sees them and has no name for them. That flipped R14.1 from "train a detector" to "fine-tune a class inventory," which is a different order of cost. It only surfaced because the scorer reported bound-box *size* alongside recall — a column added during the architect pass, specifically to expose whether `MainText 80/80` was real. The check written to catch my own flattering number is what produced the session's best finding.

### 2026-08-26 [8126a5012b0d]

The consequence is sharp: **the one class distant supervision cannot label is the one the entire programme is blocked on.** Marginalia is what Surya scores 0/19 on, what the MN gap is about, and what R2.2's four refuted span rules were chasing. Had I gone straight to R14.1, the fine-tune would have taught the model every class *except* the one it was redirected to fix — and that would have surfaced only after training, as a mysteriously unimproved marginalia score.

### 2026-08-26 [d77564d76bf7]

**The obvious fix — copy root's config — would have been a silent no-op.** `mcp-hot-reload` resolves watch globs against `process.cwd()` (confirmed in its source: `path.join(process.cwd(), …)`). Protos' cwd is `alfred/`, not the repo root, so root's relative `infrastructure/rag-service/…` would resolve to `alfred/infrastructure/…` — a path that doesn't exist. Hot reload would watch *nothing* while looking perfectly configured.

That's worse than having no wrapper: a broken feature that reports as present. The other five lanes' relative paths are fine precisely because their cwd *is* the repo root. A path is only portable relative to a cwd you've actually verified.

### 2026-08-26 [9ffc83792423]

R14.6a's own finding was the false one. It reported *"no transcribed side-note corpus is on this disk"* — true of `reconstruction/reads/`, false of the disk. That's the third time in this arc a "nothing exists" verdict came from a single-location search, and the project's Executive Summary already records the pattern: a witness excluded on a mistaken one-line description, never re-tested, producing a false *"nothing survives"* verdict at the most consequential point in the New Testament. **An absence is a claim and inherits the evidential standard of any other claim.** This time the mistaken description was mine.

### 2026-08-26 [54166f450ff7]

**Blocking discards the reason's guarantee, so I use two paths.** A blocked `UserPromptSubmit` definitely stops the payload reaching the model, but whether its `reason` string is *injected into my context* (vs. shown only to you) isn't documented. So the hook does both: it emits `reason`/`systemMessage` on the block, **and** drops a `.pending.json` marker. On your very next prompt — which is small — the hook injects the invitation via `additionalContext`, a field the docs explicitly define as "Text injected into model context." The guaranteed path carries the payload even if the best-effort one is silent.

### 2026-08-26 [ceaa422389e9]

**The dual-ratio estimator earned its keep.** It reported 504,761–1,009,523 tokens for `panic.txt`. The real failure was **1,002,000** — the high bound is off by 0.75%. A conventional chars÷4 estimate would have said 480K and looked survivable, which is precisely the reasoning error that produced a 2M-token prompt.

**Failure modes fail open, not closed.** If the spill write fails, the hook *passes the prompt through unguarded* with a warning rather than blocking. Blocking with no copy on disk would destroy your input outright — strictly worse than the overflow it prevents. Same for malformed stdin and pruning errors: never wedge a turn over housekeeping.

**Position 1 of 12 is load-bearing.** The other eleven `UserPromptSubmit` hooks — `relevance-retrieval.js`, `context-health-monitor.js`, and friends — each receive the full prompt. Running first means none of them ever has to parse a 2MB string.

### 2026-08-27 [811bf5fa1ba8]

**The generator edit is the one that actually matters.** `alfred/.claude/settings.json` is headed *"generated by profile-loader.js"* — and that script does `fs.writeFileSync(SETTINGS_PATH, ...)` at `:707` from a literal built at `:413`. It never reads the existing file. A hand-added `statusLine` would have been silently wiped the next time anyone ran the profile loader, and the drift would have reappeared with no obvious cause. I verified via `--dry-run` that the generator now emits it. Fixing the output without fixing the generator would have been a fix with an expiry date.

**Absolute paths, not `$CLAUDE_PROJECT_DIR`.** DwarfCron's own `_comment` already documents why: that variable resolves to the satellite dir, which has no `.claude/scripts/`, so a relative path renders nothing — silently. I matched the convention the file already argued for.

**The user-level fallback closes the loop.** Pointing `~/.claude/settings.json` at v9 too means any *future* lane inherits the standard rather than the stale Feb script. Without it, this exact drift recurs the next time an Archon is added.

### 2026-08-27 [f8c9f03339be]

- **The bug class this project keeps hitting has one shape: a correct rule that nothing reads.** Gate 0f was a rule no code read; Gate 0d a rule no code implemented; R13 an artefact no code loads. Today's addition: a gate *register* no parser consulted. The repair pattern is always the same — turn the prose into a parser and give it a proven negative.
- **An audit written *after* a hand-fix always passes, and a passing run proves nothing.** The only honest acceptance is to reconstruct the pre-fix state and show the audit rejects it. That is why `--selftest` embeds the old documents rather than asserting coverage.
- **Reading a table cell "positionally" vs "last non-empty" looks like style and is a correctness decision.** Last-non-empty would have silently reported an *unowned* gate row as owned by whatever its `n` cell happened to say — the audit built to find unowned rows hiding one.

### 2026-08-27 [0c5305a640b0]

- **The verification standard runs every command without its arguments**, and nothing warned of it. Enrolling `build_recog_gold.py --check` made the suite run it *bare* — which took the cutting path and blanked all 51 hand-keyed truth files. The keying had to be redone. Cutting is now opt-in and refuses to clobber. Any script whose no-argument behaviour is destructive will be run destructively by that block.
- **Checks 1–4 of the injection proof would all pass on a stamp plumbed to a recogniser that is never consulted.** Only check 5 — *does the text change* — distinguishes a working mechanism from a well-named label. When broken output equals healthy output, you have to validate the mechanism.

### 2026-08-27 [0c23724964a4]

**This session produced a textbook instance of the failure you're describing.** The five Loom design documents — 82KB, directly relevant to the Loom evaluation — sat in `alfred/.claude/context/systems/` the whole time. No memory tier surfaced them. I found them by accident, in a grep run for an unrelated purpose. A semantic layer keyed on "Loom" would have surfaced them in the first second. That's the argument in one incident: the knowledge existed, was indexed nowhere the model reads, and appeared only by luck.

**The vision already exists in Aion as a stub.** `relevance-retrieval.js` is a `UserPromptSubmit` hook whose own header calls it *"the rattlesnake reflex for memory recall."* But it's keyword **regex** → file map, capped at **800 characters**, one injection per prompt, no network. That's 0.012% of the corpus per prompt. It's a lookup table wearing the costume of a retrieval system — and it's already wired into exactly the right place in the request lifecycle.

### 2026-08-27 [a8c7b1664384]

**Claude Code owns the transcript; Loom doesn't** — and that asymmetry is decisive. If Loom appends context in flight, the client never records it, so next turn it sends history *without* the injection and Loom injects again. Every injected token pays the **1.25× cache-write** premium and yields a **0× read**, forever. If the hook injects instead, the content enters the transcript, becomes part of the stable prefix, and is read at **0.1× on every subsequent turn**.

Same content, roughly **12× cheaper** from the hook. That falls straight out of the published multipliers — it isn't a modelling assumption.

**And the gateway is still exactly right for single-shot callers.** Nexus jobs have no conversation state to diverge from and no hook layer at all. That observation is what lets *one* implementation serve both worlds.

### 2026-08-27 [84b2fa676a31]

**The API is stateless. There is no session on the server.** Claude Code re-uploads the *entire* conversation on every single turn — all 300K tokens of it, every time. What feels like "the model remembering our conversation" is actually the client replaying the whole transcript on each request.

**Prompt caching is therefore not memory — it is a receipt.** The server keeps precomputed attention state for byte-sequences it has processed before. When your re-uploaded prefix matches one, it skips the recomputation and charges you 0.1× instead of 1.0×. Nothing is *stored* for you; you're just not billed twice for the same work.

This reframes "invalidation" entirely. **Invalidating a cache loses no data and breaks no functionality** — the conversation continues perfectly. You just silently pay 10× for that turn. That's precisely what makes it dangerous: it is a pure cost failure with no visible symptom.

### 2026-08-28 [15ae875d33d0]

- **Building a step is the cheapest way to test the reason you filed it.** I attributed 41 cut boxes to the missing angle. Rotating the frame moved the count the *wrong way* and the correlation came back at +0.051 — the premise was false, and only implementing it revealed that. The rotation is still correct groundwork; the causal story was not.
- **"Exactly unchanged" can be a warning as much as a pass.** GOLD-HEADBAND held at 115/121 through the rotation, but that is because every gold here scores *labels*, and the tilt's real cost is a *boundary* error — a box 17% too tall on leaf 409. The instrument is blind to the axis where the defect lives.
- **A criterion can be circular and still look rigorous.** My clause "the estimated angle should correlate with measured row tilt" could only ever return 1.0, since the estimator *is* the row tilt. Pre-registration doesn't protect you if the criterion tests the instrument against itself.
