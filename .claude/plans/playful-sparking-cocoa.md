# Plan: World Management CLI + Ingest Path Fix

## Context

The Chronicler DB currently contains test worlds (Namoram, Ormon) that are not the user's active save game. The correct world is "Tar Thran" / "The Land of Dawning" from `data/legends/region1-post-embark/`. There is no CLI mechanism to list or delete worlds, and the `ingest` command can't accept a subdirectory path. This plan adds proper world management code to the Chronicler package.

## Deliverables

### 1. New module: `chronicler/db/worlds.py` (~70 lines)

World management DB logic, keeping CLI thin.

**Functions:**
- `list_worlds(conn) -> list[dict]` — Returns all worlds with id, name, alt_name, imported_at, and record counts (HFs, events, sites, entities, artifacts)
- `delete_world(conn, world_id) -> dict[str, int]` — Deletes a world and all child rows in FK-safe order within a single transaction. Returns per-table deletion counts. Raises `ValueError` if world doesn't exist.

**`_DELETE_ORDER` constant** — Ordered list of 28 tables to delete before the worlds row itself. Order ensures FK constraints are satisfied:
```
1. event_entity_xref        (FK → history_events)
2. collection_events        (FK → history_event_collections, history_events)
3. collection_subcollections (FK → history_event_collections x2)
4. hf_position_links        (FK → historical_figures, entities)
5. hf_site_links            (FK → historical_figures, sites)
6. hf_entity_links          (FK → historical_figures, entities)
7. hf_links                 (FK → historical_figures x2)
8. entity_positions          (FK → entities)
9. structures               (FK → sites)
10. history_event_collections (FK → worlds)
11. history_events           (FK → worlds)
12. event_relationships      (FK → worlds)
13. historical_figures       (FK → worlds)
14. identities               (FK → worlds)
15. sites                    (FK → worlds)
16. entities                 (FK → worlds)
17. artifacts                (FK → worlds)
18. written_contents         (FK → worlds)
19. historical_eras          (FK → worlds)
20. art_forms                (FK → worlds)
21. rivers                   (FK → worlds)
22. world_constructions      (FK → worlds)
23. landmasses               (FK → worlds)
24. mountain_peaks           (FK → worlds)
25. regions                  (FK → worlds)
26. underground_regions      (FK → worlds)
27-28. units, unit_events, sync_snapshots, game_reports,
       world_map_snapshots, lua_probes, fortress_denizens,
       worldgen_snapshots, world_modpacks
```

**Excluded from delete**: `storyteller_log` (no FK, audit log), `embeddings` (no world_id column).

### 2. Modify: `chronicler/cli.py`

**A. Add `worlds` command group** with two subcommands:

- **`chronicler worlds list`** — Calls `list_worlds()`, displays formatted table
- **`chronicler worlds delete --world-id N [--yes]`** — Deletes one world with confirmation
- **`chronicler worlds delete --all [--yes]`** — Deletes all worlds with confirmation
- `--world-id` and `--all` are mutually exclusive; neither specified = error

**B. Fix `ingest` path resolution:**

Add `_resolve_xml_pair(legends_path, legends_plus_path)` helper that:
- If path is a **directory**: auto-detect `*-legends.xml` and `*-legends_plus.xml` within it
- If path is a **file**: pass through unchanged
- If path is **None**: fall back to `LEGENDS_DIR` auto-detection (existing behavior)
- Auto-detect legends_plus from the same directory as legends when not specified

Change `--legends` and `--legends-plus` Click options to accept both files and directories (`dir_okay=True`).

**Usage after fix:**
```bash
chronicler ingest --legends data/legends/region1-post-embark/
# Auto-detects both files in that subdirectory
```

### 3. New migration: `chronicler/db/migrate_worlds_cascade.sql` (~90 lines)

Adds `ON DELETE CASCADE` to all FK constraints referencing `worlds(id)` and inter-child FKs. Pattern per table:
```sql
ALTER TABLE <table>
    DROP CONSTRAINT IF EXISTS <constraint_name>,
    ADD CONSTRAINT <constraint_name>
        FOREIGN KEY (world_id) REFERENCES worlds(id) ON DELETE CASCADE;
```

Also updates schema.sql to include CASCADE in the canonical definitions (so fresh `init-db` gets it right).

**Tables with direct `worlds(id)` FK** (17): landmasses, mountain_peaks, regions, underground_regions, sites, world_constructions, art_forms, rivers, entities, historical_figures, identities, history_events, history_event_collections, event_relationships, artifacts, written_contents, historical_eras, units, unit_events, sync_snapshots, game_reports, world_map_snapshots, lua_probes, fortress_denizens, worldgen_snapshots, world_modpacks

**Tables with inter-child FKs** (8): structures→sites, hf_links→historical_figures(x2), hf_entity_links→(historical_figures, entities), hf_site_links→(historical_figures, sites), entity_positions→entities, hf_position_links→(historical_figures, entities), collection_events→(history_event_collections, history_events), collection_subcollections→history_event_collections(x2), event_entity_xref→history_events

### 4. New tests: `tests/test_worlds_cli.py` (~150 lines)

Using `click.testing.CliRunner` and mocks (no DB required for unit tests):

- **TestWorldsList**: empty DB message, world display with counts
- **TestWorldsDelete**: missing flags error, mutual exclusion, nonexistent world error, success path, `--all` confirmation prompt, `--all --yes` bypass
- **TestIngestPathResolution**: file passthrough, directory auto-detect, missing file error, legends_plus auto-detect from same dir
- **TestDeleteWorldLogic**: async unit tests with mock conn — ValueError on missing world, transaction used, tables deleted in order

### 5. Update schema.sql (canonical)

Add `ON DELETE CASCADE` to all FK `REFERENCES worlds(id)` clauses and inter-child FKs so that future `init-db` creates the correct constraints from the start.

## Files Modified/Created

| File | Action |
|------|--------|
| `chronicler/db/worlds.py` | **NEW** — list/delete world DB logic |
| `chronicler/cli.py` | **MODIFY** — add `worlds` group, fix `ingest` path resolution |
| `chronicler/db/migrate_worlds_cascade.sql` | **NEW** — migration adding CASCADE |
| `chronicler/db/schema.sql` | **MODIFY** — add CASCADE to canonical FK definitions |
| `tests/test_worlds_cli.py` | **NEW** — unit + CLI tests |

## Verification

1. Run migration: `psql` the cascade migration against live DB
2. `chronicler worlds list` — should show worlds 13 + 14
3. `chronicler worlds delete --all --yes` — should clean both
4. `chronicler worlds list` — should show "No worlds"
5. `chronicler ingest --legends data/legends/region1-post-embark/` — should auto-detect both files and ingest Tar Thran
6. `chronicler worlds list` — should show world 1: Tar Thran / The Land of Dawning
7. `pytest tests/test_worlds_cli.py tests/test_xml_parser.py -v` — all pass
