# Insights Archive — 2026-07-01
# Rotated: 2026-07-01T06:52:18Z (1 entries)

### 2026-06-16 [e57539978459]

- **The remote is SSH, not HTTPS** (`git@github.com:...`), so the push authenticated via your SSH key — that's why no PAT injection was needed here, unlike Project_Aion's HTTPS remote which requires the credentials.yaml token.
- **The gitignore + gradient fallback compose cleanly**: ignoring `public/store/*.png` means a fresh clone has no thumbnails, but `StoreTile`'s `onError→gradient` path already handles a missing image — so the Book Store still renders correctly without the binaries. Tracking decision and UI robustness are decoupled.

# Insights Archive — 2026-07-01
# Rotated: 2026-07-01T15:01:37Z (1 entries)

### 2026-06-16 [163abede914d]

The whole feature reduces to one coordinate system. Detection emits `[start,end)` ranges → the deepest-section rule turns them into masked intervals → the *same* intervals gate analysis (`range_is_masked` filter), drive the minimap's mask gutter, and color the Browser text. Backend Python (`layout.py`) and frontend TS (`sectionMasking.ts`) are line-for-line ports of that one rule, so what you edit in the wizard is exactly what analysis honors.

# Insights Archive — 2026-07-01
# Rotated: 2026-07-01T16:50:03Z (1 entries)

### 2026-06-16 [b9120cb3218b]

Jane Eyre yielding 76 sections for ~38 chapters hints the fallback catches each `CHAPTER X` twice (a front-matter chapter list + the body heading). That's acceptable for a *fallback* — the wizard's whole purpose is letting the user drag/merge/delete boundaries, and surfacing 76 editable markers beats surfacing zero. Over-deduping in the parser would risk dropping real headings; the design deliberately pushes that judgment to the human-in-the-loop step.

# Insights Archive — 2026-07-01
# Rotated: 2026-07-01T19:07:47Z (1 entries)

### 2026-06-16 [9ae5fe682cad]

Every fix traces to a *specific* defect the audit harness surfaced, not a guess about "awkward EPUBs." The most instructive was C1: the old KJV gate `"verses" in html and ("red" in html or ...)` looked like two conditions but was really one, because `"red"` is a substring of countless English words. It matched on the plain word "verses" in front-matter prose — so NKJV got a `bible-kjv` label that stripped nothing, while Geneva (whose real markup sits past 15 front-matter files) was never sampled at all. Fixing *where* and *how specifically* we sniff fixed both directions at once.

# Insights Archive — 2026-07-01
# Rotated: 2026-07-01T20:25:05Z (2 entries)

### 2026-06-16 [cfad1cb1d0d5]

The 10 remaining heavy-concat files are deliberately *not* fixed, and that's the right call. They're scholarly Scripture/Apocrypha volumes and Infinite Jest at concat rates of 0.0–1.3 per 1,000 words — i.e., a handful of `wordWord` joins from legitimate inline formatting (footnote anchors, italic emphasis) across hundreds of thousands of words. A broad "concat fix" would have to mutate real prose to chase noise; the audit's *rate* column (not just the absolute ≥50 threshold) is what tells you to leave them alone.

### 2026-06-16 [76b5edba718b]

This is exactly why a milestone commit should stage files by *explicit path*, never `git add -A`. A blanket add here would silently fold 68 unrelated deletions into a commit titled "parser hardening + self-sim masking" — the kind of scope-bleed that makes a commit impossible to revert cleanly later. The investigation lets me stage precisely the 6 milestone files and leave the deletions untouched for a separate decision.

# Insights Archive — 2026-07-01
# Rotated: 2026-07-01T21:50:39Z (1 entries)

### 2026-06-16 [7a481a55bb5d]

This is the difference between *files I changed* and *the atomic unit of working code*. A commit must build and run at its own revision — staging `self_similarity.py` without `layout.py` would pass my local tests (which import the already-present working-tree file) yet be broken for anyone checking out that SHA. The fix isn't to commit broken code, it's to commit the feature's true dependency closure. The **#4 parser work is genuinely self-contained** (no `layout.py` dependency), so it can commit cleanly on its own; **#8 must travel with its backend.**

# Insights Archive — 2026-07-01
# Rotated: 2026-07-01T22:59:02Z (2 entries)

### 2026-06-16 [74ca08feec8d]

The two-commit split wasn't cosmetic — it followed the *dependency closure*. The parser hardening has no link to the masking code, so it stands alone as a `fix:`. The self-similarity masking (#8) is physically inseparable from `layout.py` + `project.masked_intervals()`, which also carry the staged-import and detection work — so those land together as one `feat:` that actually builds at its own revision. Splitting "by feature I worked on" instead of "by what compiles together" would have produced a broken `461895c`-or-`56ca973` checkout.

### 2026-06-16 [97e5434a3c90]

The real lesson here is a layering one: a modal that can *navigate the app underneath itself* is fragile. The wizard conflated "load this project's data" with "make it the active project," and AppLayout treats "active project exists" as "leave the picker." Splitting those two concepts is the durable fix — any future in-picker flow can now hydrate data without triggering navigation.

# Insights Archive — 2026-07-01
# Rotated: 2026-07-01T23:28:59Z (1 entries)

### 2026-06-16 [78939e67b176]

`_compute_tracks` (server.py:948) iterates `registry.dependency_order()` — it runs the analyzers in a topologically-sorted order so dependent tracks (e.g. anything consuming segments) see their inputs first, and it collects per-track failures into a list rather than aborting the whole run. That's why the frontend can safely treat a 200 as "applied" even if one extractor failed: the design degrades per-track, not all-or-nothing. I'll still scan the backend log for any failed tracks and report them.

# Insights Archive — 2026-07-01
# Rotated: 2026-07-02T00:21:17Z (1 entries)

### 2026-06-16 [44cf275ac902]

One nuance worth your eye during testing: the per-type word counts are **raw coverage**, not *effective* masking. For Emma, "Volume" shows 158,086 words "masked," yet the live total is only 0.1% — because masking is **deepest-section-wins**, so the Chapters nested inside a masked Volume are still analyzed. The per-row count answers "does this type map to the right text?"; the live % answers "what actually gets excluded?". If you'd rather the per-row figure reflect *effective* (post-override) words, that's a quick change — flag it.

# Insights Archive — 2026-07-01
# Rotated: 2026-07-02T05:35:06Z (2 entries)

### 2026-06-16 [b11878ebf1de]

The masking model is **deepest-wins**: when a Chapter is nested inside a Volume, the Chapter's mask setting overrides the Volume's for the overlapping span. That makes "words per type" ambiguous — Volume *spans* 158,086 words but *effectively contributes* almost none, because Chapters sit on top of it. The Mask stage currently shows the **raw span** per type, while the live banner shows the **effective** total. The question is whether the per-row numbers should match the banner's semantics.

### 2026-06-16 [8b917173547a]

This is the right call for the stated purpose. The Mask row count and the banner now answer two *complementary* questions rather than redundantly restating the same number: rows verify **mapping fidelity** (is each type pinned to the correct raw spans?), the banner reports **outcome** (how much text actually gets masked after nesting resolves). Collapsing them to one metric would have destroyed the verification signal you explicitly asked for in feedback item #3.

