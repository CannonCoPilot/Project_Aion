# Session 38 Summary (2026-03-08/09)

## Work Completed

This session focused on population data accuracy in the Chronicler Explorer. A three-tier audit of how DF tracks populations revealed that `hf_site_links` contains zero `link_type='resident'` records — the six actual link types are home structure, occupation, seat of power, lair, hangout, and home site building. Only 4.3% of HFs (2,066 of 48,273) have any site link, while 91.8% have entity membership links. A canonical demographic glossary was established defining Population, Residents, Citizens, Members, and Site Presence with precise SQL definitions.

Seventeen UI fixes were implemented across three templates: the SG inline Members view gained an Alive/Dead/All toggle, auto-load, compact 25px rows, and Citizen/Link columns; these were mirrored to the SG full-view Members tab; and the Site detail Residents tab gained Citizen, Profession, and Position columns plus a region/co-located details tile. The `is_citizen` computation uses creature_dictionary flags (`has_any_intelligent_speaks` / `has_any_intelligent_learns`) rather than a static field.

## Key Technical Findings

- **DB wipe**: `DROP SCHEMA public CASCADE` is instant; `DELETE FROM worlds` cascades through 500K+ FK checks and takes minutes
- **Entity type column**: The `type` field is now a proper SQL column on `entities`, not stored in JSONB `details`
- **Creature sentience**: No `is_sentient` flag exists in creature_dictionary; sentience is derived from `has_any_intelligent_speaks` / `has_any_intelligent_learns` flags
- **Site residents vs SG members**: Site detail pages use `hf_site_links` (explicit residency, 2,075 links) while SG membership uses `hf_entity_links` (broader political affiliation, 44K+ links). These measure different things.
- **entity_site_links / entity_entity_links**: Tables exist in schema but are empty — Phase 3 CDM APPEND→CONNECT fixes will populate them

## Current State

Phase 2 (Explorer Core) remains COMPLETE. The population UI work is a post-Phase-2 quality improvement. Fresh DB ingestion produced 1,677,998 records with 0 referential integrity issues. All 8 validation checks pass. Next: Phase 3 Stage 3.0 CDM schema fixes.
