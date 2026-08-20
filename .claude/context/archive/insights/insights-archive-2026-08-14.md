# Insights Archive — 2026-08-14
# Rotated: 2026-08-14T22:39:39Z (8 entries)

### 2026-07-11 [40010ddbef4f]

The −18 archaic-pass delta is the *right* direction. Before the splice, some genesis-26/psalms-52 scan-verses false-passed against a wrong or backfilled reference (the misnumbered "chapter 25", the severed psalm heading). Now they score against the faithful 1610 archaic surface — which is stricter — so a few correctly flip pass→fail. A truer reference that *lowers* the pass count is strengthening the re-OCR case, not degrading it. `modern` stayed flat because the splice only touched archaic (s_dismas) reads.

### 2026-07-11 [f6070f35b51f]

Adding john was a clean scope test: because the report generator is data-driven off `skeleton.json` (not a hardcoded book list), the only code change needed was one line in `PILOT_BOOKS` — the audit, rollups, testament grouping, and all figures absorbed the 5th book automatically. The faithfulness proof is that john's 413 archaic passes showed up as *exactly* +413 in the report's global count. That decoupling of scope-config from render-logic is what makes "confirm each iteration" cheap to iterate.

### 2026-07-11 [1fec58284da9]

The banner is the highest-leverage change of the whole batch, because it closes the loop on *why* v5 "didn't look like an update." The delta logic keys on `input_sha256`: when the audit JSON is byte-identical (a report-code change like v6), it says "presentation-only"; when the audit data changes (a splice or a new book), it shows the verse/book deltas. So from now on, one glance at the top tells you both *which* version you're on and *whether the underlying numbers moved* — a stale tab becomes self-evident instead of silently misleading.

### 2026-07-11 [8999ca179c41]

The load-bearing design decision was the *union*: `expected_witnesses ∪ actually-attesting`, not just one or the other. Filtering purely on "does it attest" would have hidden an expected source that failed to localize at all — silently erasing a real coverage gap. Filtering purely on "expected" would have dropped a source that unexpectedly *does* attest. The union hides only what's both **not expected and not present** — the genuinely spurious gray rows — while keeping every real gap visible. That's the No-Silent-Degradation line drawn precisely: a missing witness that *should* be there stays on screen as a gap; one that was never supposed to be there disappears.

### 2026-07-12 [200c354792ee]

Two raw-count comparisons are **scope-confounded**, and Sir specifically asked for *rates* and *proportions* for exactly this reason:
- **v4→v5** flagged "REGRESSED" — but the pass *rate* only dropped because adding John enlarged the denominator with a hard book. That's a scope change, not a quality regression.
- **v7→v8** flagged apparatus_worklist 2→3 as "regressed" — but the worklist grew because we *added* the NT preface to tracking, i.e. more coverage, not worse quality.
So raw counts across a changed universe aren't like-for-like. I'll drive verdicts off rates/proportions (per Sir's list) and explicitly flag scope changes so a scope expansion is never mislabeled as a regression.

### 2026-07-12 [f5cee998216c]

- The SKILL.md project-binding (line 85) reads `Projects/palimpsest/core/.scratch/...` — but a future session invoking this skill runs from `/Users/nathanielcannon/Claude/Project_Aion`, where that relative path resolves to a non-existent `Project_Aion/Projects/...`. A skill's "one non-negotiable gate" pointing at an unresolvable path is a silent trap.
- This is exactly why the "verify a named path before recommending it" rule exists — the skill *reads* complete, but a path claim is only true relative to a specific cwd, and skills get invoked from the primary working dir.
- Absolute paths are the fix for cross-directory reference docs: no cwd ambiguity, resolves identically from any Archon session.

### 2026-07-12 [aaff92ff2e1b]

- A skill or reference doc "reading complete" is not the same as "correct" — a path claim is only true relative to a specific cwd, and skills are invoked from the primary working dir, not from wherever the deliverable lives.
- The stale checkpoint is the useful lesson here: JICM captured intent-in-progress, so the right resume move was to **check disk reality first** rather than re-execute the TODO list and duplicate finished work.

### 2026-07-12 [b66697c0cccc]

- Two distinct repos share the `Claude/` parent: `Project_Aion` (my cwd, where the skill lives) and `Jarvis`. The lock error surfaced Jarvis's git-dir because a background watcher process was committing there — a good reminder that in a multi-Archon workspace, git write-locks can appear from processes you didn't start.
- The guardrail "investigate the lock holder, don't delete it" paid off: had I force-removed it, I could have corrupted an in-flight watcher commit. Waiting cost seconds and the lock cleared itself.

