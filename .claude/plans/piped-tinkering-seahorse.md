# Entity Merge Fix — Implementation Plan

**Status**: In progress — research phase (temporarily exited to disable RTK)

## Context

The Chronicler XML parser (`chronicler/ingest/xml_parser.py`) currently parses entities from `legends.xml` only, which provides `id` + `name` but NOT `type` or `race`. The `legends_plus.xml` file provides `type`, `race`, and rich nested data (positions, professions, worship links, 2,019 sub-entities) but is NOT parsed for entities. Result: all 441 entities in the DB have NULL type and race.

## Research Findings (so far)

- None of the reference repos (weblegends, df-narrator, DwarfFortressLogger, df-ai) do XML merging — they all use live memory
- df-structures defines 11 entity types: Civilization, SiteGovernment, VesselCrew, MigratingGroup, NomadicGroup, Religion, MilitaryUnit, Outcast, PerformanceTroupe, MerchantCompany, Guild
- legends_plus has 2,460 entities (441 with type/race, 2,019 sub-entities without)
- Entity IDs are shared between files — same ID space

## TODO

- [ ] Complete legends_plus XML structure analysis (blocked by RTK — in progress)
- [ ] Design merge logic
- [ ] Determine which nested data to extract
- [ ] Write final plan
