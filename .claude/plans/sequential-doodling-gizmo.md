# Plan: Redesign HF Detail Page Breadcrumbs

## Context

The breadcrumb system across all 17 entity detail pages has three bugs:
1. **Double "Explorer"**: The base template (`detail_base.html`) emits `Explorer ›` before the `{% block breadcrumb %}`, but every template that overrides the block re-emits `Explorer ›` — producing `Explorer › Explorer › ...`
2. **Dead links**: Middle crumbs either link to `/explorer` (the landing page, not a specific tab) or are non-linked `<span>` elements
3. **Missing breadcrumbs**: 8 secondary entity templates define no breadcrumb block, falling through to a generic default that also links to `/explorer`

## Design: Entity-to-Category Mapping

Each entity type maps to a **category** that corresponds to an Explorer tab (linked) or a label (non-linked, for entities without their own tab):

| Entity Type | Category | Breadcrumb |
|-------------|----------|------------|
| Historical Figure | People | Explorer › People › [name] |
| Entity/Civilization | Civilizations | Explorer › Civilizations › [name] |
| Site | Geography | Explorer › Geography › [name] |
| Region | Geography | Explorer › Geography › [name] |
| Underground Region | Geography | Explorer › Geography › [name] |
| Landmass | Geography | Explorer › Geography › [name] |
| Mountain Peak | Geography | Explorer › Geography › [name] |
| River | Geography | Explorer › Geography › [name] |
| World Construction | Geography | Explorer › Geography › [name] |
| Structure | Geography | Explorer › Geography › [parent site] › [name] |
| Artifact | Artifact | Explorer › Artifact › [name] |
| Written Content | Written Content | Explorer › Written Content › [name] |
| Art Form | Art Form | Explorer › Art Form › [name] |
| Event Collection | Events | Explorer › Events › [parent?] › [name] |
| Identity | Identity | Explorer › Identity › [name] |
| Era | Events | Explorer › Events › [name] |
| Years Browser | Events | Explorer › Events › Years & Events |

**Tab-linked categories** (People, Civilizations, Geography, Events) use `<a href="/explorer?tab=...">`.
**Non-tab categories** (Artifact, Written Content, Art Form, Identity) use a non-linked `<span>` since there is no Explorer tab for them.

## Implementation

### 1. Base template stays as-is
`detail_base.html` already correctly emits `Explorer ›` before the block. No change needed.

### 2. Fix 9 existing breadcrumb blocks (remove duplicate `Explorer ›`)

Each template's `{% block breadcrumb %}` must be updated to NOT include `<a href="/explorer">Explorer</a><span>›</span>` — only the category and entity name.

**Files with existing breadcrumb blocks:**
- `hf_detail.html` — `People` → `/explorer?tab=people`
- `entity_detail.html` — `Civilizations` → `/explorer?tab=civs`
- `site_detail.html` — `Geography` → `/explorer?tab=geo`
- `region_detail.html` — `Geography` → `/explorer?tab=geo`
- `artifact_detail.html` — `Artifact` (span, no link)
- `structure_detail.html` — `Geography` → `/explorer?tab=geo` › `[parent site link]`
- `written_content_detail.html` — `Written Content` (span, no link)
- `collection_detail.html` — `Events` → `/explorer?tab=events` › `[parent collection link?]`
- `years_browser.html` — `Events` → `/explorer?tab=events` › `Years & Events`

### 3. Add breadcrumb blocks to 8 secondary templates

**Files missing breadcrumb blocks:**
- `underground_region_detail.html` — `Geography` → `/explorer?tab=geo`
- `landmass_detail.html` — `Geography` → `/explorer?tab=geo`
- `mountain_peak_detail.html` — `Geography` → `/explorer?tab=geo`
- `river_detail.html` — `Geography` → `/explorer?tab=geo`
- `construction_detail.html` — `Geography` → `/explorer?tab=geo`
- `art_form_detail.html` — `Art Form` (span, no link)
- `identity_detail.html` — `Identity` (span, no link)
- `era_detail.html` — `Events` → `/explorer?tab=events`

### 4. No backend changes needed
All breadcrumbs use data already available in templates (`entity_name`, `world_id`, `parent_site`, `parent_collection`).

## Verification

After implementation:
1. Restart the server (`uvicorn chronicler.api.app:app --port 5001`)
2. For each entity type, load a detail page and verify:
   - No duplicate "Explorer" crumb
   - Category link navigates to correct Explorer tab
   - Entity name displays correctly
   - Parent links work (structures → parent site, collections → parent collection)
3. Test at minimum: HF, Site, Structure (nested), Collection (with parent), Artifact (no-tab), Years browser
