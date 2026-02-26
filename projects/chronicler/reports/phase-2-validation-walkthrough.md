# Phase 2: Explorer Core -- Validation Walkthrough

**Date**: 2026-02-26
**Purpose**: Step-by-step manual verification of all Phase 2 features
**Prerequisites**: Chronicler installed, world "Tar Thran" ingested into PostgreSQL

---

## Quick Start

```bash
cd /Users/nathanielcannon/Claude/Projects/DwarfCron
.venv/bin/chronicler serve --port 8080
```

Open **http://localhost:8080** in your browser.

---

## 1. Explorer Main Page

1. Click **Explorer** in the navigation bar
2. Verify the 6 tabs are present: **People**, **Civilizations**, **Geography**, **Schema**, **Data**, **Graph**
3. Click through each tab — data grids should load with sortable columns and pagination

---

## 2. Historical Figure Detail Page (Most Complex)

1. In the **People** tab, click any historical figure name (or go directly to `/explorer/hf/1`)
2. Verify the following sections appear:
   - Header with name, race, birth/death years
   - Tabs for different sections (relationships, positions, skills, etc.)
   - Cross-linked entity names (clickable links to other entities)
   - Prev/Next navigation buttons in the header
   - Breadcrumb showing Explorer > Historical Figure > [Name]
3. **Perspective rendering**: Event descriptions should use perspective-aware pronouns when referring to the viewed figure (e.g., "he" or "she" instead of repeating the name)
4. **DF Calendar**: Dates should display in DF format (e.g., "1st Granite, Year 5")

**Tip**: Try HF IDs with more data — `/explorer/hf/3` or other IDs with many events.

---

## 3. Entity/Civilization Detail Page

1. Navigate to **Civilizations** tab, click any civilization name (or `/explorer/entity/1`)
2. Verify 5 tabs: **Leaders**, **Sites**, **Members**, **Groups**, **Wars**
3. Leader names and site names should be clickable links
4. War entries should link to event collections

---

## 4. Site Detail Page

1. Navigate to **Geography** tab or click a site link, or go to `/explorer/site/1`
2. Verify 3 tabs: **Structures**, **Properties**, **History**
3. Structure names should be clickable links to structure detail pages
4. Site type and coordinates should be displayed

---

## 5. Artifact Detail Page

1. Go to `/explorer/artifact/1` (or find an artifact through cross-links)
2. Verify chain-of-custody timeline showing who held the artifact and when
3. Creator and material should be displayed if available

---

## 6. Region Detail Page

1. Go to `/explorer/region/1`
2. Verify biome and evilness badges are displayed
3. Associated events should be listed with cross-links

---

## 7. Structure Detail Page

1. Click a structure link from a site page, or go to `/explorer/structure/1`
2. Verify type badges (12+ types: temple, tavern, library, etc.)
3. For temples, verify deity link is displayed

---

## 8. Written Content Detail Page

1. Go to `/explorer/written_content/1`
2. Verify author link, referenced entities, and form type are displayed

---

## 9. Event Collection Detail Page

1. Go to `/explorer/collection/1` (or find one through a war link)
2. Verify hierarchy display: War > Battles > Events
3. Sub-collections should be expandable/linkable

---

## 10. Secondary Entity Pages (Quick Check)

Visit each URL and verify it loads with relevant data:

| Entity | URL | Key Check |
|--------|-----|-----------|
| Underground Region | `/explorer/underground_region/1` | Depth and layer info |
| Landmass | `/explorer/landmass/1` | Name and associated features |
| Mountain Peak | `/explorer/mountain_peak/1` | Height and coordinates |
| River | `/explorer/river/1` | Path and connected sites |
| World Construction | `/explorer/construction/1` | Type and endpoints |
| Art Form | `/explorer/art_form/1` | Form type and description |
| Identity | `/explorer/identity/1` | Associated historical figure |
| Historical Era | `/explorer/era/1` | Date range and events |

---

## 11. Years and Events Browser

1. Go to `/explorer/years`
2. Verify chronological listing of years
3. Click a year to see events for that year
4. Verify prev/next year navigation

---

## 12. Global Search

1. Click the **search bar** in the navigation bar (present on every page)
2. Type "dwarf" — autocomplete suggestions should appear within ~200ms
3. Type an accented character like "o" — results should be accent-insensitive
4. Use arrow keys to navigate suggestions, press Enter to go to a result
5. Verify search works from any page (the nav bar is global)

---

## 13. Hover Popovers

1. On any detail page, hover over a cross-linked entity name
2. After a brief delay, a popover should appear showing a summary of the linked entity
3. Verify popovers work for different entity types (HF links, site links, entity links)

---

## 14. URL Hash Tab Persistence

1. On a detail page with multiple tabs, click a non-default tab
2. The URL should update with a hash (e.g., `#wars`)
3. Copy the URL and paste it in a new tab — the same tab should be selected

---

## 15. JSONB Field Inventory

1. Go to the **Schema** tab in the Explorer
2. Select a table with JSONB columns (e.g., `historical_figures` → `details`)
3. Verify the distinct JSONB keys are listed for that column

---

## 16. Row Detail Overlay

1. In the **Data** tab, click on a table row
2. A detail overlay should appear showing all fields for that row
3. JSONB fields should be expandable

---

## 17. Data Export

1. In the **Data** tab, use the export feature
2. Export as **JSON** — verify valid JSON is downloaded
3. Export as **CSV** — verify valid CSV is downloaded

---

## 18. Cross-Linking Verification

1. On any detail page, click a cross-linked entity name
2. Verify it navigates to the correct detail page for that entity
3. Repeat for several different entity types to confirm links work across all types

---

## Checklist Summary

| # | Feature | Status |
|---|---------|--------|
| 1 | Explorer main page (6 tabs) | |
| 2 | HF detail (24 sections, perspective, calendar) | |
| 3 | Entity/Civ detail (5 tabs) | |
| 4 | Site detail (3 tabs) | |
| 5 | Artifact detail (chain-of-custody) | |
| 6 | Region detail (biome/evilness badges) | |
| 7 | Structure detail (type badges, deity links) | |
| 8 | Written Content detail | |
| 9 | Event Collection detail (hierarchy) | |
| 10 | Secondary entity pages (8 types) | |
| 11 | Years browser | |
| 12 | Global search (autocomplete, accent-insensitive) | |
| 13 | Hover popovers (Tippy.js) | |
| 14 | URL hash tab persistence | |
| 15 | JSONB field inventory | |
| 16 | Row detail overlay | |
| 17 | Data export (CSV/JSON) | |
| 18 | Cross-linking (all entity types) | |

Mark each item after verifying. All 18 items must pass for Phase 2 sign-off.
