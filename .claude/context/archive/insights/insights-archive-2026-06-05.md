# Insights Archive — 2026-06-05
# Rotated: 2026-06-05T13:49:38Z (1 entries)

### 2026-05-14 [47d2181c2a9c]

**Why the post-call written statement matters more than the call itself.** Phone conversations are interpreted by everyone present through their own lens; written statements are interpreted only by their text. When the ALJ reads your case file before the hearing, the written statement is what they see — not whatever Ryan wrote down about your phone conversation. A clean, neutral, regulatory-cite-loaded written statement framed as testimony is far more impactful than the best phone call. The call's primary purpose is to *create the opening* for the written statement to be added. The statement does the actual work.

# Insights Archive — 2026-06-05
# Rotated: 2026-06-05T15:21:37Z (1 entries)

### 2026-05-14 [db2b023c7727]

**Key plan revisions vs §5 default order**:
(1) Mission Control hoisted to #1 — the WebSocket hook from Task 5.1 already subscribes to one channel; generalizing it to multi-channel is the minimum-viable shared infrastructure for §5.4/§5.5/§5.4. Land that early so other surfaces inherit it.
(2) Village + PC Box sequenced together (5→6) — they share the sprite engine. Cuts repeat work in half.
(3) Branch strategy: continue on `feature/personas-rebuild` (not a new branch) — Phase 1.3 is the same workstream, and CannonCoPilot/Alfred:main FF already includes Phase 1.0-1.2.

# Insights Archive — 2026-06-05
# Rotated: 2026-06-06T02:46:04Z (1 entries)

### 2026-05-15 [0c13e764e91e]

**Three decisions worth flagging for the Phase 1.3 trajectory**:
(1) **Backend fallback chain over data-engineering effort**: The design intended `persona_activity_snapshots` as the heatmap source, but that table is empty in dev (Phase 1.4 will wire snapshot emission). Two options: extend the endpoint to fall back to `decision_events` (cheap, 50 LOC), or seed fake snapshot data (overhead, lies to tests). Picked fallback + transparent `source` field on response — the UI labels "decision_events (fallback)" so reviewers always know the provenance. This pattern generalizes: when a design source is empty, fall back to the next-best available source and surface the substitution explicitly.
(2) **Recharts over D3 — net-zero new dependency**: v5 §5.5 prescribes "D3.js v7" but Recharts is already in deps and wraps D3 internally with a React-native API. Net-zero new dependency cost. The design's tech choices should be re-validated at implementation time against current deps, not slavishly followed when a cheaper-equivalent is in scope. Sankey is the one case where Recharts has no native primitive — I deferred it instead of installing `@nivo/sankey` for a single chart.
(3) **`docker cp` is fast-iteration; image rebuild is persistence**: I patched the container via `docker cp` first for rapid feedback (~5s), validated the response shape, then did a full `docker compose build && up -d` to bake the change in (~30s). If I'd only done `docker cp`, the next compose recreate would have erased the work. Pattern: `docker cp` for iteration loops; rebuild before commit.

