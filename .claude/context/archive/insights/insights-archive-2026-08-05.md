# Insights Archive — 2026-08-05
# Rotated: 2026-08-06T02:23:47Z (2 entries)

### 2026-07-08 [46eb2eff214d]

Note what the A/B also reveals: *before* the fix, `detect_book` already attested 70 chapters at probe_recall 0.72 — well above the old 0.35 floor. So Psalms wasn't dropped by `BOOK_ALIAS_FLOOR` at all; it was laundered to "0 located" *downstream* by `build_tome_map`'s `NOISE_FRACTION` book-drop. That's the smoking gun for why removing the book-level gates matters independently of the contiguity fix — two different gates, two different failure modes, both hiding the same recoverable data.

### 2026-07-08 [b6ee0e73cfe4]

The key realization: the double-bind design *already contains* the correct replacements for everything these floors were doing. Presence/absence belongs to the **source-index** ("ought-to-contain"), garbage-rejection belongs to **per-verse `ATTEST_THRESHOLD`** and **char-identity in qc_audit** — never to a recall floor. So the floors weren't protecting quality; they were a redundant layer whose *only* unique effect was the ability to launder a mangled-but-present book to zero. That made them pure liability. `book_coverage()` survives, but demoted to a **recorded signal** (`coverage_recall`), never a branch.

