# Insights Archive — 2026-08-26
# Rotated: 2026-08-26T20:29:03Z (1 entries)

### 2026-07-27 [60fc1067702f]

Worth flagging one thing I hit while wiring V10: five not-located matter rows carry no scores, `sc.para[0]` threw on `undefined`, and because `renderAll()` ran every section in one unguarded sequence, that exception **silently deleted V11 — the OPEN ledger — from the page**. A report that drops its own blocking list because of an unrelated crash reads as "nothing is blocking." `renderAll` now isolates each section, and absence renders as `not located` / `n/a` rather than vanishing.

