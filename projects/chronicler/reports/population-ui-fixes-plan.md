# Population UI Fixes & Validation Plan

## Status: COMPLETE (2026-03-08)

## Fixes Completed

### A. Site Government — Explorer Inline View (explorer.html)
- [x] A1. Members table: Add Alive/Dead/All toggle filter, default to Alive
- [x] A2. Members table: Fix "X total, showing Y" title to update with filtering
- [x] A3. Members table: Remove 'Load Members' button, load all by default
- [x] A4. Members table: Set row height ~25px with scrollbar for overflow
- [x] A5. Members table: Add 'Citizen' yes/no column
- [x] A6. Members table: Add 'Link' column (link_type from hf_entity_links)

### B. Site Government — Full View Members Tab (entity_detail.html)
- [x] B1. Members table: Add Alive/Dead/All toggle filter, default to Alive
- [x] B2. Members table: Fix "showing Y" to update with filtering
- [x] B3. Members table: Remove 'Load All' button, load all by default
- [x] B4. Members table: Set row height ~25px with scrollbar
- [x] B5. Members table: Add 'Citizen' yes/no column
- [x] B6. Members table: Add 'Link' column (link_type)

### C. Site — Full View Page (site_detail.html)
- [x] C1. Residents tab: Add 'Citizen' yes/no column
- [x] C2. Residents tab: Add 'Profession' column
- [x] C3. Residents tab: Add 'Position' column
- [x] C4. Reorder tabs: Structures, Residents, History, Ownership, Properties
- [x] C5. Add details tile (upper right): region name, co-located sites/lairs/caves

### D. Database Re-ingestion
- [x] D1. Wipe database (DROP SCHEMA public CASCADE; CREATE SCHEMA public;)
- [x] D2. Re-apply schema.sql
- [x] D3. Re-ingest legends XML data (1,677,998 records, world_id=1)
- [x] D4. Verify ingestion completed successfully (0 referential integrity issues)

### E. Validation & Report
- [x] E1. Re-run all verification queries — all pass
- [x] E2. Check UI display for all page types — all HTTP 200
- [x] E3. Final report: `population-ui-validation-report.md` — 0 regressions
