# Insights Archive — 2026-08-03
# Rotated: 2026-08-03T06:13:46Z (1 entries)

### 2026-07-08 [af08f6f299d5]

Two grounding facts sharpen the plan:
- **Identity is token-level today, not character-level** (`consensus_v2.sim()` uses `difflib` on tokens). Your char-level requirement is a real, additive change — not a reuse.
- **Body/marginal separation already exists but is geometry-only** (`load_stream` masks by x-centre band `DEFAULT_BODY 0.11–0.88`). That's *why* the eebo-vol4 `(n)/(o)` footnotes still pollute: at x-centre 428–510 they sit *inside* the body band, so a purely geometric mask can't catch them. Contiguity-based localization needs a **content** signal (parenthetical-marker lines) on top of geometry. The fix is precisely locatable.
And the four book-level gates to remove are named: `consensus_v2` `COVER_FLOOR` (L40/L360), `build_tome_map` `NOISE_FRACTION` (L150), `detect_our_ocr` `BOOK_ALIAS_FLOOR` (L86).

# Insights Archive — 2026-08-03
# Rotated: 2026-08-04T05:31:24Z (1 entries)

### 2026-07-08 [a960b20a42b0]

- **Modern identity** must fold archaic OCR ("The Prophete Dauid") hard enough to match modern Janvier ("The Prophet David") — that's exactly `spelling_glyph_model.fold_diplomatic`'s job (strip silent-e, u/v↔, collapse doubles → a modern-neutral *skeleton* where archaic and modern of the same word collapse identically). It measures **content captured**.
- **Archaic identity** must do the opposite: a *light* fold (ſ→s for the metric, vv→w, u/v/i/j typography) that **keeps** archaic spelling (Prophete≠Prophet), so the OCR must match s-dismas's diplomatic surface. It measures **surface fidelity**.
Same word, two folds, two different questions. Using the aggressive skeleton fold for both would collapse the distinction and let garbage pass the archaic gate.

