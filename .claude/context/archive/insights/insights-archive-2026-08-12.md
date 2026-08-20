# Insights Archive — 2026-08-12
# Rotated: 2026-08-12T17:01:50Z (8 entries)

### 2026-07-09 [335637544e78]

This is the difference between an *identity* metric and a *completeness×identity* metric. `difflib`'s ratio is `2·M/(len₁+len₂)`; if the OCR side is missing verses, the extra unmatched modern text drags the ratio down even when every character the OCR *did* produce is perfect. So a whole-chapter concat conflates "how faithful is the text?" with "how much of the chapter did we capture?" — two axes the QC contract may want separated. I need to quantify which axis is driving the sub-0.90 scores before concluding the scans "fail identity."

### 2026-07-10 [320ac135b584]

The flips reveal *why* archaic-preeminence matters, concretely: e.g. `psalms/130 · S14` scores modern 0.882 (fails the old modern gate) but archaic 0.903 (passes) — a faithful 1582 reading that simply diverges from Janvier's modern edition. The old AND-gate would have discarded a *good* witness; the new gate keeps it. That's the "right yardstick vs. excused failure" principle showing up in the actual numbers, not just the design doc. The report also surfaces `genesis/8` having no archaic reference at all in the baseline — exactly the gap the odr_com backfill (task 8) is meant to close, and now visible for Sir to direct.

### 2026-07-10 [bf2208ddf2ee]

The Janvier `conf-front` is the **Confraternity revision (1941, Challoner-Rheims)** — "Nihil Obstat / Imprimatur: Bishop of Paterson", no mention of Rheims 1582, Cardinal Allen, or Gregory Martin. It is a *different work* from the original 1609–1610 Douay-Rheims whose front matter (title-page, approbatio, preface, privilege, censura) the physical scans S1–S15 actually contain. Scoring original-DR OCR against Confraternity text would be measuring against the **wrong standard** — precisely the kind of laundering the No-Silent-Degradation guardrail forbids. So front/back-matter cannot piggyback on the existing Janvier reference; it needs its own faithful reference.

### 2026-07-11 [d01c3eaa29f0]

This is a classic **multi-source state reconciliation** problem. Three state records disagree: the JICM checkpoint (LLM-compressed, lags), the scratchpad LATEST block (hand-authored, most current), and the filesystem (ground truth). Per my "Empirical Before Claim" discipline, filesystem mtimes are the tiebreaker — and they confirm the scratchpad, not the checkpoint. Trusting the checkpoint would have made me redundantly re-run a completed 90-second audit.

### 2026-07-11 [557e215aa3f8]

This is precisely the zsh word-splitting trap: `for book in $ALL` iterates once over the whole string in zsh, but 76 times in bash. The robust fix isn't to fight the shell with `${=ALL}` — it's to move the expansion into Python via an `"all"` sentinel, so argument handling never depends on shell field-splitting. I'll also add a `QC_OUT` override so full-scope writes to its own file and can't clobber the validated pilot artifact again.

### 2026-07-11 [e4aa4afb33e8]

The clobber is legible right in the artifact: `scope_books: ["genesis exodus leviticus ... 4-esdras"]` — a list with **one** element that is the whole slug list. In bash, `for book in $ALL` would have split on `$IFS` into 76 words; in zsh, unquoted `$ALL` stays a single word, so `argv` was length-1 and matched no skeleton book. Moving the expansion into Python (`argv[0] == "all"` → read slugs from `skeleton.json`) removes the dependency on shell field-splitting entirely — the fix lives where the data lives.

### 2026-07-11 [bbe6a805d83f]

The fix also embodies a defense-in-depth principle worth noting: the `all` sentinel removes the *cause* (shell field-splitting), while `QC_OUT` contains the *blast radius* (a bad run can no longer overwrite a validated artifact). Fixing only the sentinel would have been sufficient to make this run correct, but the output-isolation guard means any *future* mis-invocation degrades to "wrote a junk sidecar file" instead of "destroyed the authority." That's the difference between correcting an error and making the error class non-catastrophic.

### 2026-07-11 [b311aaada5e4]

This verse-content defect is fundamentally a *layout-extraction* problem — pdftotext's linearization puts the decorated initial in an inconsistent stream position, and argument-vs-scripture can't be reliably separated from the flat text layer alone (both are prose; the argument even wraps to lowercase lines). That's precisely what §12 P4R.B "layout-aware re-OCR" exists to solve. It is distinct from the chapter-heading structure defect, which *was* solvable from the text layer and is now fixed.

