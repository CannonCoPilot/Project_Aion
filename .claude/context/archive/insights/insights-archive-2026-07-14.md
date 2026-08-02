# Insights Archive — 2026-07-14
# Rotated: 2026-07-14T17:00:38Z (1 entries)

### 2026-07-01 [198243ade3f6]

The network trace confirms the complete #12j contract now holds:
- **Phyletic tree paints in 9ms** (was 30s+ / never) — overview no longer waits on any costed scan.
- **`corpus-repeats` on select: false** — the costed cross-member scan no longer auto-runs on selection.
- **corpus-graph POSTs: 0** — GET-first reads the persisted graph; the re-root trace shows only `GET corpus-graph` + `GET phyletic-tree?root=…`, never a rebuild.
- **repeats fetches: 0 before Corpus tab, 1 after** — the scan runs exactly once, lazily, only when its sub-tab is opened.

