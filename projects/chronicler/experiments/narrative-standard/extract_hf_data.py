#!/usr/bin/env python3
"""
Narrative Gold-Standard: Database Extraction Script
====================================================
Subject: HF 19639 — Minaro Autumnalsculpt "the Windy"
Purpose: Extract ALL database facts about this historical figure
         across every relevant table for biography construction.

Methodology:
  1. Core HF record (historical_figures)
  2. Relationships (hf_links)
  3. Entity memberships (hf_entity_links)
  4. Position history (hf_position_links)
  5. Site connections (hf_site_links)
  6. All events where HF participates (history_events + event_entity_xref)
  7. Artifacts associated
  8. Written contents authored
  9. Identities / alternate names
  10. Related HFs (look up names for all referenced HF IDs)
  11. Related entities (look up names)
  12. Related sites (look up names)

Output: JSON files + human-readable summaries
"""

import asyncio
import json
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))))

HF_ID = 19639
WORLD_ID = 1
OUTPUT_DIR = os.path.dirname(os.path.abspath(__file__))
DB_DSN = "postgresql://jarvis:OSDbeydP6TOBGoJUym6rTBfULKJYqqPE@localhost:5432/chronicler"


async def query(conn, label, sql, *args):
    """Execute query, print summary, return rows as list of dicts."""
    rows = await conn.fetch(sql, *args)
    result = [dict(r) for r in rows]
    print(f"  [{label}] → {len(result)} rows")
    return result


async def main():
    import asyncpg
    conn = await asyncpg.connect(DB_DSN)
    data = {}

    print("=" * 60)
    print(f"EXTRACTING ALL DATA FOR HF {HF_ID}")
    print("=" * 60)

    # ── 1. Core HF Record ──────────────────────────────────────────
    print("\n1. Core HF record")
    data['hf_core'] = await query(conn, 'historical_figures',
        "SELECT * FROM historical_figures WHERE id = $1 AND world_id = $2",
        HF_ID, WORLD_ID)

    # ── 2. Relationships (hf_links) ────────────────────────────────
    print("\n2. Relationships")
    data['hf_links'] = await query(conn, 'hf_links',
        """SELECT * FROM hf_links
           WHERE world_id = $1 AND (hf_id = $2 OR target_hf_id = $2)
           ORDER BY hf_id, link_type""",
        WORLD_ID, HF_ID)

    # ── 3. Entity memberships (hf_entity_links) ───────────────────
    print("\n3. Entity memberships")
    data['hf_entity_links'] = await query(conn, 'hf_entity_links',
        "SELECT * FROM hf_entity_links WHERE world_id = $1 AND hf_id = $2",
        WORLD_ID, HF_ID)

    # ── 4. Position history (hf_position_links) ───────────────────
    print("\n4. Position history")
    data['hf_position_links'] = await query(conn, 'hf_position_links',
        "SELECT * FROM hf_position_links WHERE world_id = $1 AND hf_id = $2",
        WORLD_ID, HF_ID)

    # ── 5. Site connections (hf_site_links) ────────────────────────
    print("\n5. Site connections")
    data['hf_site_links'] = await query(conn, 'hf_site_links',
        "SELECT * FROM hf_site_links WHERE world_id = $1 AND hf_id = $2",
        WORLD_ID, HF_ID)

    # ── 6. Events ──────────────────────────────────────────────────
    print("\n6a. Events (direct participation via event_entity_xref)")
    data['event_xref'] = await query(conn, 'event_entity_xref',
        """SELECT x.*, e.event_type, e.year, e.seconds, e.details
           FROM event_entity_xref x
           JOIN history_events e ON e.id = x.event_id AND e.world_id = x.world_id
           WHERE x.world_id = $1 AND x.entity_id = $2 AND x.entity_type = 'hf'
           ORDER BY e.year, e.seconds""",
        WORLD_ID, HF_ID)

    print("6b. Events (via denormalized hf_id_1/hf_id_2 columns)")
    data['events_by_hf_cols'] = await query(conn, 'events_hf_cols',
        """SELECT id, event_type, year, seconds, details
           FROM history_events
           WHERE world_id = $1 AND (hf_id_1 = $2 OR hf_id_2 = $2)
           ORDER BY year, seconds""",
        WORLD_ID, HF_ID)

    print("6c. Events (referenced in details JSONB)")
    data['events_in_details'] = await query(conn, 'events_jsonb_ref',
        """SELECT id, event_type, year, seconds, details
           FROM history_events
           WHERE world_id = $1 AND (
             details->>'hfid' = $2 OR details->>'hfid1' = $2 OR details->>'hfid2' = $2
             OR details->>'slayer_hfid' = $2 OR details->>'group_hfid' = $2
             OR details->>'snatcher_hfid' = $2 OR details->>'attacker_hfid' = $2
             OR details->>'defender_hfid' = $2 OR details->>'trickster_hfid' = $2
             OR details->>'woundee_hfid' = $2 OR details->>'wounder_hfid' = $2
             OR details->>'doer_hfid' = $2 OR details->>'hist_fig_id' = $2
             OR details->>'seeker_hfid' = $2 OR details->>'target_hfid' = $2
           )
           ORDER BY year, seconds""",
        WORLD_ID, str(HF_ID))

    # ── 7. Event relationships ─────────────────────────────────────
    print("\n7. Event relationships")
    # Get all event IDs from all event sources
    event_ids = set()
    for ev in data['event_xref']:
        event_ids.add(ev['event_id'])
    for ev in data['events_by_hf_cols']:
        event_ids.add(ev['id'])
    for ev in data['events_in_details']:
        event_ids.add(ev['id'])

    if event_ids:
        data['event_relationships'] = await query(conn, 'event_relationships',
            """SELECT * FROM event_relationships
               WHERE world_id = $1 AND event_id = ANY($2::int[])
               ORDER BY event_id""",
            WORLD_ID, list(event_ids))
    else:
        data['event_relationships'] = []

    # ── 8. Artifacts ───────────────────────────────────────────────
    print("\n8. Artifacts")
    data['artifacts'] = await query(conn, 'artifacts',
        """SELECT * FROM artifacts
           WHERE world_id = $1 AND (
             details->>'creator_hfid' = $2 OR details->>'holder_hfid' = $2
           )""",
        WORLD_ID, str(HF_ID))

    # ── 9. Written contents ────────────────────────────────────────
    print("\n9. Written contents")
    data['written_contents'] = await query(conn, 'written_contents',
        """SELECT * FROM written_contents
           WHERE world_id = $1 AND (
             details->>'author_hfid' = $2
             OR details::text LIKE '%"' || $2 || '"%'
           )""",
        WORLD_ID, str(HF_ID))

    # ── 10. Identities ─────────────────────────────────────────────
    print("\n10. Identities")
    data['identities'] = await query(conn, 'identities',
        "SELECT * FROM identities WHERE world_id = $1 AND histfig_id = $2",
        WORLD_ID, HF_ID)

    # ── 11. Collection events ──────────────────────────────────────
    print("\n11. Collection events (wars/battles/etc involving HF)")
    # First find collections that reference HF events
    if event_ids:
        data['collection_events'] = await query(conn, 'collection_events',
            """SELECT ce.*, hec.id as coll_id, hec.name as coll_name,
                      hec.type as coll_type, hec.start_year, hec.end_year,
                      hec.details as coll_details
               FROM collection_events ce
               JOIN history_event_collections hec
                    ON hec.id = ce.collection_id AND hec.world_id = ce.world_id
               WHERE ce.world_id = $1 AND ce.event_id = ANY($2::int[])""",
            WORLD_ID, list(event_ids))
    else:
        data['collection_events'] = []

    # ── 12. Resolve all referenced HF names ────────────────────────
    print("\n12. Resolving referenced HF names")
    hf_ids = set()
    for link in data['hf_links']:
        hf_ids.add(link['hf_id'])
        if link.get('target_hf_id'):
            hf_ids.add(link['target_hf_id'])
    # Also scan event details for HF references
    for ev in data['events_in_details']:
        d = ev.get('details', {}) or {}
        for k, v in d.items():
            if 'hfid' in k.lower() or 'hist_fig' in k.lower():
                try:
                    hf_ids.add(int(v))
                except (ValueError, TypeError):
                    pass
    hf_ids.discard(HF_ID)  # We already have the subject

    if hf_ids:
        data['referenced_hfs'] = await query(conn, 'referenced_hfs',
            """SELECT id, name, race, caste, birth_year, death_year,
                      is_deity, is_force, is_vampire, is_necromancer, is_werebeast, is_ghost
               FROM historical_figures
               WHERE world_id = $1 AND id = ANY($2::int[])""",
            WORLD_ID, list(hf_ids))
    else:
        data['referenced_hfs'] = []

    # ── 13. Resolve entity names ───────────────────────────────────
    print("\n13. Resolving entity names")
    entity_ids = set()
    for link in data['hf_entity_links']:
        entity_ids.add(link['entity_id'])
    for ev in data['events_in_details']:
        d = ev.get('details', {}) or {}
        for k, v in d.items():
            if 'entity_id' in k.lower() or 'civ_id' in k.lower():
                try:
                    entity_ids.add(int(v))
                except (ValueError, TypeError):
                    pass

    if entity_ids:
        data['referenced_entities'] = await query(conn, 'referenced_entities',
            "SELECT id, name, type FROM entities WHERE world_id = $1 AND id = ANY($2::int[])",
            WORLD_ID, list(entity_ids))
    else:
        data['referenced_entities'] = []

    # ── 14. Resolve site names ─────────────────────────────────────
    print("\n14. Resolving site names")
    site_ids = set()
    for link in data['hf_site_links']:
        site_ids.add(link['site_id'])
    for ev in data['events_in_details']:
        d = ev.get('details', {}) or {}
        for k, v in d.items():
            if 'site_id' in k.lower():
                try:
                    site_ids.add(int(v))
                except (ValueError, TypeError):
                    pass

    if site_ids:
        data['referenced_sites'] = await query(conn, 'referenced_sites',
            "SELECT id, name, type, details FROM sites WHERE world_id = $1 AND id = ANY($2::int[])",
            WORLD_ID, list(site_ids))
    else:
        data['referenced_sites'] = []

    # ── 15. Resolve region names ───────────────────────────────────
    print("\n15. Resolving region names")
    region_ids = set()
    for ev in data['events_in_details']:
        d = ev.get('details', {}) or {}
        for k, v in d.items():
            if 'region_id' in k.lower() or 'subregion_id' in k.lower():
                try:
                    region_ids.add(int(v))
                except (ValueError, TypeError):
                    pass

    if region_ids:
        data['referenced_regions'] = await query(conn, 'referenced_regions',
            "SELECT id, name, type FROM regions WHERE world_id = $1 AND id = ANY($2::int[])",
            WORLD_ID, list(region_ids))
    else:
        data['referenced_regions'] = []

    # ── 16. Structures ─────────────────────────────────────────────
    print("\n16. Structures (linked to sites)")
    struct_ids = set()
    for ev in data['events_in_details']:
        d = ev.get('details', {}) or {}
        if 'structure_id' in d:
            try:
                struct_ids.add(int(d['structure_id']))
            except (ValueError, TypeError):
                pass

    if struct_ids:
        data['referenced_structures'] = await query(conn, 'referenced_structures',
            "SELECT * FROM structures WHERE world_id = $1 AND id = ANY($2::int[])",
            WORLD_ID, list(struct_ids))
    else:
        data['referenced_structures'] = []

    # ── SAVE ───────────────────────────────────────────────────────
    # Custom JSON serializer for dates/datetimes
    def default_serializer(obj):
        if hasattr(obj, 'isoformat'):
            return obj.isoformat()
        raise TypeError(f"Object of type {type(obj)} is not JSON serializable")

    outpath = os.path.join(OUTPUT_DIR, 'raw_extraction.json')
    with open(outpath, 'w') as f:
        json.dump(data, f, indent=2, default=default_serializer)
    print(f"\n{'=' * 60}")
    print(f"Data saved to {outpath}")

    # Print summary stats
    print(f"\n{'=' * 60}")
    print("EXTRACTION SUMMARY")
    print(f"{'=' * 60}")
    for key, rows in data.items():
        print(f"  {key}: {len(rows)} records")

    total_events = len(set(
        [e['event_id'] for e in data['event_xref']] +
        [e['id'] for e in data['events_by_hf_cols']] +
        [e['id'] for e in data['events_in_details']]
    ))
    print(f"\n  TOTAL UNIQUE EVENTS: {total_events}")

    await conn.close()


if __name__ == '__main__':
    asyncio.run(main())
