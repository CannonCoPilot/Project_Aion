# Round 2 Consolidation: User Interface & VM Infrastructure

## Source Documents

- `round1-pair-05.md`: Consolidation of the Explorer UI Enhancement plan (8 phases, Phases 1–7 COMPLETE) and the original Explorer Redesign plan (6-tab domain-specific architecture replacing the generic Schema/Data/Graph tabs).
- `round1-pair-06.md`: Consolidation of the VM Automation plan (5-phase UTM Windows 11 ARM VM control and app packaging strategy) and the original Database Explorer plan (3-tab web UI: Schema Browser, Data Browser, Entity Graph).

---

## All Features & Requirements

### Explorer Web UI — Tab Architecture

- Replace generic Schema/Data/Graph tabs with domain-specific tabs.
- Final tab order: `People | Civilizations | Geography | Events | Database | Graph`
- **Database** tab = existing Schema + Data tabs (renamed from "Explorer"), preserving the SQL runner for ad-hoc queries; power-user access must not be removed.
- **Graph** tab = existing vis.js ego-network graph visualization as a standalone tab, also launchable from any domain detail view via "View graph" buttons.
- Update `_nav.html` to keep top-level pages (Chat / Explorer / Monitoring) and add sub-tabs within Explorer.
- Single-world simplification: hardcode `world_id=8` ("Thadar En" / "Namoram") in frontend API calls; keep `world_id` parameter in routes for schema correctness.
- Explorer is exposed at route `/explorer` within the existing Chronicler web app (not a standalone tool).

### Explorer Web UI — Shared Top Navigation

- Top nav bar with links to: Chat (`/`), Explorer (`/explorer`), Monitoring (`/monitoring`).
- Active page highlighted in amber.
- Implemented as a Jinja2 partial: `_nav.html`.
- Each template sets a `{% set active = "<page>" %}` variable before including the partial.
- `index.html`: Change body to `flex flex-col h-screen`; add nav partial before sidebar; wrap sidebar+main in `<div class="flex flex-1 overflow-hidden">`.
- `monitoring.html`: Replace existing `<header>` block with the nav partial include.

### Explorer Web UI — People Tab

- Unified searchable interface merging historical figures (HFs) and in-game units.
- **Left panel**: Searchable list with type badges (HF/Unit), race filter, alive/dead filter.
- Filter input stored in `peopleResults` array; `filterPeopleList(q)` re-renders matching items.
- Search supports both Dwarvish names and English translations.
- Accent-insensitive search: DF names use diacritics (ö, ü, ï, é) that break plain `ILIKE`; use `unaccent(name) ILIKE unaccent($1)` pattern with `unaccent` extension enabled on the PostgreSQL database.
- **Right panel detail card**:
  - Both Dwarvish and English names prominently displayed.
  - Biographical info: race, caste, birth/death years, computed age.
  - Relationships list (spouse, parent, child, master, etc.) with clickable names.
  - Entity memberships with position titles.
  - Skills table (for units).
  - Key life events (collapsed by default).
  - Graph button: opens ego-network in Graph tab for this entity.

#### Age Display

- Computed at display time, not stored — avoids staleness.
- Living unit/HF with `birth_year` and `game_year`: `"127 (born year 23)"`.
- Living unit/HF with `birth_year` only: `"born year 23"`.
- Dead entity with both years: `"Year 150, age 127 (old age)"`.
- Units without `birth_year` (pre-expansion bridge): gracefully show "?".
- `current_game_year` fetched from `sync_snapshots` (most recent snapshot for world).

#### HF Detail View (`renderHfDetail()`)

- Already comprehensive from legends XML extraction; no structural changes needed.
- Shows: biography, relationships, entity memberships, positions held, site links, identities, events.
- Add: computed age display using `current_game_year`.
- Cross-navigation: when a unit exists for this HF, show linked Unit card with nav-link.

#### Unit Detail View (`renderUnitDetail()`)

- Add biography card (expanded): `birth_year`, computed age, sex, death_cause.
- Relationships section: from `unit.details.relationships` — show Spouse, Mother, Father as nav-links (resolved histfig IDs to names via batch lookup).
- Personality section: 50 traits as compact grid with descriptive labels, values list, needs with satisfaction bars, dreams with accomplished flags.
- Attributes section: 6 physical + 12 mental attributes as bar charts.
- Linked HF card: when `hist_fig_id` exists and HF is found, show "This unit has a corresponding Historical Figure record." with nav-link. When HF not found: "Born after legends export."
- Skills table.
- Both Dwarvish and English names.

#### HF ↔ Unit Linkage Gap Handling

- Unit `hist_fig_id` values (36,469+) can exceed max HF id (35,333) from the legends XML export.
- Gracefully display "No legends record — born after legends export" when HF not found.
- Cross-navigation: Unit detail links to HF record and vice versa when both exist.

### Explorer Web UI — Civilizations Tab

- Browse entities: civilizations, religions, military orders.
- **Left panel**: Entity list grouped by type (Civilization, Religion, Military, Other), with race badges and member counts. Filter input (name/race substring) + sort dropdown (Name A-Z, Name Z-A, Most Members, Most Sites).
- **Right panel detail card**:
  - Entity name, type, race.
  - Positions table: Position | Title (gender-appropriate) | Category (color-coded badge) | Site | Current Holder.
    - Noble: king, queen, duke, baron, count, lord, monarch, emperor, consort — amber badge.
    - Military: general, captain, militia, commander, sheriff, champion, marshal — red badge.
    - Administrator: manager, bookkeeper, broker, expedition leader, mayor, chief medical — blue badge.
    - Other: fallback — stone badge.
  - Gender-appropriate title: `is_female = (holder_sex == 1 or holder_caste == "FEMALE")`, pick `name_female` / `name_male` / `name`.
  - Notable members (leaders, deities, vampires).
  - Controlled sites with links to Geography tab.
  - Related events (wars, conquests).

#### Members Loading

- Load up to 1,000 members (limit raised from prior lower value).
- Columns: Name, Race, Link Type, Position (from `position_name`), Status.
- Clickable column headers → toggle sort ascending/descending.
- Filter input → client-side substring on name/race/position.
- Data stored in `civMembersData`; client-side sort and filter without re-fetch.

### Explorer Web UI — Geography Tab

- Browse sites, regions, and structures with connections to entities and HFs.
- **Left panel**: Sites grouped by type (town, fortress, cave, shrine, etc.). Filter input (name/owner substring) + sort dropdown (Name A-Z, Name Z-A, Most HFs, Most Structures).
- **Right panel detail card**: Site detail with structures, owner civ, notable inhabitants, historical events at this location.
- Regions list with type.
- Cross-linking: clicking a site from the Civilizations tab navigates to Geography tab detail.

### Explorer Web UI — Events & Timeline Tab

- Browse historical events chronologically with participant filtering.
- **Controls**: Year range slider, event type dropdown, participant search.
- **Event list**: Chronological table with year, type, participants (clickable), location (clickable).
- **Collection view**: Expandable war/battle trees.
- Event collections: WAR, BATTLE, SIEGE, and others.
- Collection detail with sub-events.
- Filtered event list: by year range, event type, HF participant, site, with limit.

### Explorer Web UI — Database Tab (Schema Browser + Data Browser)

- Formerly the "Explorer" page, now the Database tab within the new Explorer architecture.

#### Schema Browser

- Table list with row counts (use `pg_stat_user_tables.n_live_tup` for speed; exact count on detail view).
- Columns, types, primary keys, foreign keys (outgoing + incoming), and indexes per table.
- Table names validated against regex `^[a-z_][a-z0-9_]*$` plus existence check in `information_schema.tables`.
- Two-column layout: table list (left, 280px) + detail panel (right).
- Table list: clickable items showing `table_name (row_count)`, grouped by category (Legends, Geography, Live, Monitoring).
- Detail panel: columns table with PK badge, FK links (clickable → navigate to target table), incoming FKs, indexes.

#### Data Browser

- Table selector dropdown (reuses table list from schema browser).
- Filter bar: text search across text columns + sort column dropdown + ascending/descending toggle.
- Data grid with:
  - Clickable column headers for sorting.
  - FK values as clickable links navigating to the referenced row (carrying `world_id` for composite PKs).
  - JSONB columns as collapsible `<details>` with formatted JSON.
  - Booleans as colored indicators; NULLs as gray italic.
  - Long text truncated with expand-on-click.
- Pagination: Previous/Next buttons, page X of Y display, rows-per-page selector (25 / 50 / 100).
- SQL Runner: collapsible textarea, Run button, results grid, row limit selector, execution time display.
- SQL Runner safety: keyword blocklist (INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE, CREATE, GRANT, REVOKE) as defense-in-depth; primary defense is `conn.transaction(readonly=True)`; wrapped query with enforced LIMIT cap; all dynamic table/column names validated against `information_schema` before interpolation.

### Explorer Web UI — Graph Tab

- vis.js ego-network visualization of historical figures (HFs), entities, and sites.
- Reuses existing Graph tab implementation; launchable from domain views via "View graph" buttons throughout.
- Search box with typeahead → `/api/explorer/graph/search` → results displayed as `Name (type)`.
- World selector dropdown.
- Depth selector: 1-hop / 2-hop / 3-hop radio buttons.
- vis.js canvas: full remaining height, dark background, forceAtlas2Based physics.
- Node info panel: overlay on click showing entity details + "Expand" button.
- Click-to-expand: adds clicked node's 1-hop connections to existing graph incrementally.
- Legend: node shapes and colors.
- Performance guard: node count badge; warning at 500+ nodes; refuse expansion at 1,000+ nodes.
- vis.js loaded from CDN: `https://unpkg.com/vis-network/standalone/umd/vis-network.min.js` (no build step required).
- Graph query pattern: BFS from center node, depth 1–3 (clamped). Each hop:
  1. Fetch frontier HF details from `historical_figures`.
  2. Fetch HF→HF edges from `hf_links` (bidirectional).
  3. Fetch HF→Entity edges from `hf_entity_links` (with `position_name`).
  4. Fetch HF→Site edges from `hf_site_links`.
  5. Build next frontier from discovered HF IDs not yet visited.
- All entity/site detail fetches batched with `ANY($1::int[])` — no per-node N+1 queries.
- Node styling:
  - HF (default): dot, stone (#78716c).
  - HF (deity): dot, gold (#f6b93b).
  - HF (vampire): dot, red (#ef4444).
  - HF (necromancer): dot, purple (#a855f7).
  - HF (werebeast): dot, orange (#f97316).
  - HF (ghost): dot, slate (#94a3b8).
  - Entity (civilization): diamond, blue (#3b82f6).
  - Entity (religion): diamond, purple (#a855f7).
  - Site: square, green (#22c55e).
- Edge colors: family=green, spouse=pink, enemy=red, membership=blue (dashed), site link=lime (dashed).
- Node ID prefixing (`hf-123`, `entity-456`, `site-789`) avoids ID collisions between entity types.
- Return format vis.js DataSet-compatible:
  ```json
  {
    "nodes": [{"id": "hf-123", "label": "Urist", "shape": "dot", "color": {...}}],
    "edges": [{"from": "hf-123", "to": "hf-456", "label": "spouse", "color": "#f472b6"}]
  }
  ```

### Explorer Web UI — Knowledge Horizon Filter (Stub, Phase 8, Deferred)

- Concept: filter all Explorer views to show only entities/events within the fortress's "known world."
- UI: "Fortress Knowledge" toggle in tab bar, hidden until horizon data exists.
- `knowledge_horizon` table: `(world_id, entity_type, entity_id, visible BOOLEAN)`.
- Backend: horizon status endpoint + optional `?horizon=true` filter param on existing endpoints.
- Full computation deferred; stub SQL table and endpoint in place for future activation.
- Explorer also serves as the design workbench for tier-propagation logic for this dynamic masking system.

### Explorer Web UI — Cross-Linking Navigation

- Clicking a name in any tab navigates to the relevant tab's detail view.
- "View graph" buttons throughout domain views jump to Graph tab with entity pre-loaded.
- Civilizations → Geography (controlled sites).
- People → Civilizations (entity memberships).
- People → Geography (site links from HF data).
- Unit detail → HF detail (when linked) and vice versa.

### Explorer Web UI — Sidebar Scroll Consistency

- Filter/sort controls in `flex-shrink-0` header; list containers have `overflow-y-auto`.

---

### Unit Data Extraction — DFHack Bridge Lua Script

**File**: `chronicler/dfhack/scripts/chronicler-bridge.lua`

#### Fields Currently Captured (~15 fields out of 100+ available)

- Identity: id, name, english_name, first_name, race (via race_map), caste (in schema but NOT previously in bridge output), profession.
- Position: pos_x/y/z.
- State: is_alive, flags1/2/3, mood, has_mood, had_mood.
- Social: civ_id, hist_fig_id, squad_id, squad_position.
- Emotional: stress, focus, longterm_stress, combat_hardened.
- Physical: pregnancy_timer, pregnancy_spouse, soldier_mood.
- Skills: full skill list (id, rating, experience) via `dwarf_skills` section.
- Emotions: recent emotions (type, thought, strength, severity, year) via `dwarf_emotions` section.

#### New Fields to Extract (High Value, Phase 3)

| Field | Lua Path | Narrative/Analytical Value |
|-------|----------|---------------------------|
| birth_year | `u.birth_year` | Age calculation, generational stories |
| birth_time | `u.birth_time` | Precise birth timing |
| old_year | `u.old_year` | Expected lifespan |
| sex | `u.sex` | Gender for title selection |
| caste (from bridge) | `u.caste` | Currently in schema but not bridge output |
| relationship_ids | `u.relationship_ids[type]` | Spouse, Mother, Father — 9 slots, histfig IDs |
| death_cause | `u.counters.death_cause` | Enriches death events beyond boolean |
| cultural_identity | `u.cultural_identity` | Cultural group beyond civ_id |
| personality traits | `u.status.current_soul.personality.traits[facet]` | 50 facets (Brave, Curious, etc.) |
| personality values | `u.status.current_soul.personality.values[i]` | Core values (Family, Tradition, Power...) |
| personality needs | `u.status.current_soul.personality.needs[i]` | 30 need types with focus_level |
| life goals/dreams | `u.status.current_soul.personality.dreams[i]` | Start family, master skill, etc. |
| physical attrs | `u.body.physical_attrs[type].value` | Strength, Agility, etc. (6 attrs) |
| mental attrs | `u.status.current_soul.mental_attrs[type].value` | Analytical, Focus, etc. (12 attrs) |
| preferences | `u.status.current_soul.preferences[i]` | Likes/dislikes for materials, creatures |
| need states | `u.counters2.hunger_timer` etc. | Hunger, thirst, sleep timers |

#### Expanded `unit_summary` Section Code

```lua
-- Biographical
entry.birth_year = u.birth_year
entry.birth_time = u.birth_time
entry.old_year = u.old_year
entry.sex = u.sex
entry.caste = u.caste

-- Relationships (9 slots, 0-indexed)
entry.relationships = {}
local rel_types = {'PetOwner','Spouse','Mother','Father','LastAttacker','GroupLeader','Draggee','Dragger','RiderMount'}
for i, rtype in ipairs(rel_types) do
    local hfid = u.relationship_ids[i-1]
    if hfid and hfid > -1 then
        entry.relationships[rtype] = hfid
    end
end

-- Death cause (for dead units still in list)
if dfhack.units.isDead(u) then
    entry.death_cause = u.counters.death_cause
end

-- Cultural identity
entry.cultural_identity = u.cultural_identity
```

#### New `dwarf_personality` Bridge Section Code

```lua
local soul = u.status.current_soul
if soul then
    local p = soul.personality
    -- Traits (50 facets, 0-100 scale stored as 0-10000 internally)
    entry.traits = {}
    for i = 0, 49 do
        entry.traits[df.personality_facet_type[i]] = p.traits[i]
    end
    -- Values
    entry.values = {}
    for _, v in ipairs(p.values) do
        table.insert(entry.values, {type=df.value_type[v.type], strength=v.strength})
    end
    -- Needs with focus level
    entry.needs = {}
    for _, n in ipairs(p.needs) do
        table.insert(entry.needs, {type=df.need_type[n.id], focus=n.focus_level, level=n.need_level})
    end
    -- Dreams/goals
    entry.dreams = {}
    for _, d in ipairs(p.dreams) do
        table.insert(entry.dreams, {type=df.goal_type[d.type], accomplished=d.flags.accomplished})
    end
    -- Physical attributes (6)
    entry.physical_attrs = {}
    for i = 0, 5 do
        local attr = u.body.physical_attrs[i]
        entry.physical_attrs[df.physical_attribute_type[i]] = {value=attr.value, max=attr.max_value}
    end
    -- Mental attributes (12)
    entry.mental_attrs = {}
    for i = 0, 11 do
        local attr = soul.mental_attrs[i]
        entry.mental_attrs[df.mental_attribute_type[i]] = {value=attr.value, max=attr.max_value}
    end
end
```

#### Watcher/Sync Update

**Files**: `chronicler/dfhack/watcher.py` and/or `chronicler/sync/sync.py`

- Update unit upsert to write `birth_year`, `sex`, `death_cause`, and `english_name` columns from bridge data.
- Merge expanded bridge fields into `details` JSONB:
  - `relationships` dict → `details.relationships`
  - `cultural_identity` → `details.cultural_identity`
  - Personality data from `dwarf_personality` section → `details.personality` (traits, values, needs, dreams)
  - Attributes → `details.physical_attrs`, `details.mental_attrs`

#### Bridge Data Domains Covered

- `game_time`, `creature_raws`, `unit_summary`, `armies`, `buildings`, `artifacts`, `announcements`.
- v6+ bridge extensions: `dwarf_emotions`, `zones`, `event_collections`, `squads`, `mandates`, `incidents`.

#### Unit ↔ HF Field Mapping Design Doc

**File**: `projects/chronicler/designs/unit-hf-field-mapping.md` (new)

- Fields that exist on BOTH units and HFs (with different column/key names).
- Fields that are Unit-only: skills, labors, personality, needs, position, mood.
- Fields that are HF-only: kill_count, event_count, written works, reputation, spheres.
- For overlapping entities (same person as both Unit and HF): which source is authoritative for each field.
- JSON schema for a "unified person" object the LLM storyteller will use.

---

### VM Autonomous Control Infrastructure

- Jarvis must have full autonomous control over a Windows environment for: file transfers, script execution, DFHack console commands, in-game control, and Windows app packaging.
- The UTM VM (`DF-Windows`) is the primary candidate; the HomeServer (`WIN-48L3R2QLQN0`, 192.168.4.194) is a fallback for DF hosting.
- `utmctl` is the primary interface for VM lifecycle management: `list`, `status`, `start`, `stop`, `suspend`, `exec`, `file push/pull`, `ip-address`, `clone`.
- SSH key-based authentication must be established from Mac to the VM.
- `utmctl exec` is fire-and-forget (no stdout relay) — use `exec-capture` (simple commands) or `exec-ps` (complex PowerShell via base64) for output capture.
- PowerShell 7 must be installed on the VM (`winget install Microsoft.PowerShell`).
- QEMU Guest Agent + SPICE Guest Tools required for guest-agent-based file transfer.
- `qemu-img` (v10.2.1 via Homebrew) must be available on Mac for VM snapshot/restore.
- VM disk UUID changes on re-create — auto-detect via glob pattern, never hardcode.
- `utmctl file pull` returns exit 0 on failure — always validate output content, not `$?`.
- PowerShell takes ~10s to start under Prism ARM emulation — always use polling with done-marker pattern rather than fixed sleep.

#### VM Identity & Configuration

- VM name: `DF-Windows`.
- VM IP: `192.168.64.3`.
- VM hostname: `WIN-MRGFUCCV202`.
- VM OS: Windows 11 Pro ARM 64-bit (10.0.26200).
- SSH key: `~/.ssh/df-vm` (ed25519, label: jarvis-vm-control).
- SSH user on VM: `Chronicler`.
- QEMU disk path: `~/Library/Containers/com.utmapp.UTM/Data/Documents/DF-Windows.utm/Data/*.qcow2`.
- Disk UUID (current, auto-detected): `B4514AD5-3F19-4D5C-9FA8-6BE14C59DE42.qcow2` (14.8 GB).
- `qemu-img` version: 10.2.1 (installed via Homebrew).
- `utmctl` binary: available and fully mapped.
- DFHack RPC port: 5000.
- HTTP file server port: 8889.
- DF install path on VM (planned): `C:\Program Files (x86)\Steam\steamapps\common\Dwarf Fortress\`.
- DF version: 53.10, DFHack version: 53.10-r1.

#### HomeServer Identity

- Hostname: `WIN-48L3R2QLQN0`.
- IP: `192.168.4.194`.
- User: `Nathaniel`, Password: `DwarfF0rtress`.
- OS: Windows 10 Pro x86_64.

#### File Transfer Methods (VM)

- HTTP file server on port 8889: ~105 MB/s. Start via `vm-lifecycle.sh http-serve start`.
- SCP via `vm-lifecycle.sh scp-pull`: ~19 MB/s. Requires `-O -T` flags for Windows paths with spaces/parentheses.
- Guest Agent: emergency-only (~0.24 MB/s, 440x slower than HTTP server).

### VM Phase 0: Bootstrap

- Fresh Windows 11 ARM install in UTM (recommended over password recovery for predictability).
  - 8 GB RAM, 6 CPU, 64 GB disk, Shared network, Virtualize mode.
  - Local account: `Chronicler` / known password (bypass MS account with `oobe\bypassnro`).
- User-performed: SPICE Guest Tools + QEMU Guest Agent install from within Windows.
- Jarvis-autonomous bootstrap steps after guest agent is available:
  - Verify guest agent via `utmctl exec DF-Windows -- cmd.exe /c hostname`.
  - Install OpenSSH Server via `utmctl exec` (PowerShell): `Add-WindowsCapability`, `Start-Service sshd`, `Set-Service -Name sshd -StartupType Automatic`.
  - Retrieve VM IP via `utmctl ip-address DF-Windows`.
  - Deploy SSH public key via `utmctl file push` → `authorized_keys`.
  - Verify SSH key-based auth: `ssh -i ~/.ssh/df-vm Chronicler@<vm-ip> hostname`.
  - Install PowerShell 7 via winget.

### VM Phase 1: DF + DFHack Risk Validation

- Critical risk: DF is x86-64 only. On Windows 11 ARM in UTM, it runs under Prism x86-64 translation + QEMU ARM virtualization (double emulation). DFHack memory introspection under Prism is untested.
- Phase 1 is the make-or-break gate — must be completed before investing further.
- Steps:
  1. Install Steam via SSH (`winget install Valve.Steam`).
  2. User installs DF from Steam (requires interactive Steam login via UTM display).
  3. User verifies DF launches (window renders, no crash).
  4. Jarvis installs DFHack 53.10-r1 (download + extract to DF dir via SCP).
  5. Jarvis configures `remote-server.json` (`allow_remote: true`, port 5000).
  6. Jarvis launches DF with DFHack and opens firewall rule via `netsh`.
  7. Jarvis tests RPC Core methods: `ListUnits`, `GetWorldInfo`, `ListEnums` from Mac.
  8. Jarvis/user deploys + tests Lua bridge (SCP bridge.lua, start repeat job in DFHack console).
  9. Jarvis deploys + tests HTTP server (SCP PS1, start via SSH, curl from Mac).
  10. Jarvis runs performance benchmark: DF FPS, RPC latency, bridge freshness.
- Validation matrix:
  - DF launches under Prism: PASS → continue; FAIL → VM = packaging-only, DF stays on HomeServer.
  - DFHack loads: PASS → continue; FAIL → try without plugins; if still fails, VM = packaging-only.
  - RPC Core methods respond: PASS → continue; FAIL → debug network config.
  - Bridge repeat job runs: PASS → continue; FAIL → try manual Lua execution.
  - Performance >10 FPS: PASS → VM is primary DF host; FAIL → VM = secondary, HomeServer = primary.
- Report: `projects/chronicler/reports/vm-risk-validation.md` — document Phase 1 results.

### VM Phase 2: Automation Stack

- `vm-ssh.sh`: SSH connection wrapper with retry, timeout, key handling.
- `vm-deploy.sh`: SCP-based deployment of Lua scripts, PS1 scripts, and configs.
- `vm-dfhack-cmd.sh`: Execute DFHack console commands via SSH → `dfhack-run`.
- `vm-service-manager.sh`: Start/stop HTTP server, bridge, PostgreSQL.
- VM lifecycle automation: start → wait for SSH → return IP.
- Snapshot management: stop → `qemu-img snapshot -c <name> <qcow2>` → start.
  - qcow2 path: `~/Library/Containers/com.utmapp.UTM/Data/Documents/DF-Windows.utm/Data/*.qcow2`.
- Health check script: ping VM, test SSH, test DFHack RPC, check bridge freshness.
- `vm-deploy-all.sh`: One-command full Chronicler deployment.
- `vm-watch.sh`: Start watcher pointed at VM.
- Chronicler `config.py` update: remove hardcoded HomeServer IP (`192.168.4.194`), add `VM_HOST` auto-detection via `utmctl ip-address`.

### VM Phase 3: Chronicler Full Integration Against VM

- Deploy bridge v6+ via `vm-deploy-all.sh`.
- Start bridge repeat job via SSH → `dfhack-run` or `onMapLoad.init`.
- Run `chronicler watch` against target host.
- Verify all data domains: `game_time`, `creature_raws`, `unit_summary`, `armies`, `buildings`, `artifacts`, `announcements`.
- Verify v6+ bridge extensions: `dwarf_emotions`, `zones`, `event_collections`, `squads`, `mandates`, `incidents`.
- Trigger in-game change → verify `unit_events` row is created.
- Start `chronicler serve` → test web UI.
- Run full 131-test suite.
- 30-minute stability test: verify memory, connections, and data integrity.

### VM Phase 4: HomeServer SSH Enhancement

- HomeServer currently works for DFHack RPC and SMB file transfer but lacks SSH, remote exec, and auto-start services.
- User-performed steps: Install OpenSSH Server via Settings, start and set sshd to Automatic, open firewall on port 22.
- Jarvis-autonomous steps after SSH is available:
  - Deploy SSH public key.
  - Verify key-based auth: `ssh Nathaniel@192.168.4.194 hostname`.
  - Test SCP file deploy.
  - Test remote PowerShell execution.
  - Create Task Scheduler job for auto-start HTTP server on login.
  - Test `dfhack-run` via SSH tunnel: `ssh -L 5001:localhost:5000 Nathaniel@192.168.4.194 -N`.
- Phase 4 runs in parallel with Phases 2–3.

### VM Phase 5: Platform Decision + Windows App Foundation

- Platform decision rule: If VM runs DF at >10 FPS with stable RPC → VM is primary. Otherwise → hybrid (HomeServer for DF, VM for packaging).
- Platform comparison:
  - VM (DF works): Full automation (utmctl + SSH), snapshots, offline dev, ARM Windows target, low complexity.
  - VM (packaging only) + HomeServer (DF): Split automation, partial offline dev, x86 Windows via HomeServer, medium complexity.
  - HomeServer only: SSH-only automation, no snapshots, no offline dev, x86 Windows (majority target), low complexity.
- Deliverable Windows app components:
  - Python runtime: PyInstaller → `chronicler.exe` (build on VM or HomeServer).
  - Database: Embedded PostgreSQL or SQLite (SQLite preferred for single-user simplicity).
  - LLM runtime: Bundled Ollama + Qwen3-1.7B, or llama.cpp for lighter footprint.
  - Web UI: FastAPI + Jinja2 on localhost (already built).
  - DFHack connector: TCP RPC client (already built in `client.py`).
  - Bridge auto-setup: Installer copies Lua script, auto-configures `onMapLoad.init`.
  - System tray: `pystray` for background service with Start/Stop controls.
  - Installer: NSIS or Inno Setup wrapping all components.
- Steps:
  1. Document Phase 1–4 results in `platform-decision.md`.
  2. Choose packaging tool (PyInstaller recommended for maturity).
  3. Create `packaging/` directory with build configs.
  4. Test basic `chronicler.exe` build in VM.
  5. Create installer script.
  6. Test full install → run → verify cycle in clean VM snapshot.
- Report: `projects/chronicler/reports/platform-decision.md` — Phase 5 platform decision documentation.

---

## Implementation Architecture

### Technology Stack

- FastAPI + Jinja2 templates + vanilla JS + Tailwind CSS + vis.js graphs.
- Single `explorer.html` template (grew from ~600 lines JS).
- API routes structured in separate files per domain.
- PostgreSQL with `unaccent` extension for diacritic-tolerant search.
- vis.js loaded from CDN (`https://unpkg.com/vis-network/standalone/umd/vis-network.min.js`) — no build step.
- Server start: `cd /Users/nathanielcannon/Claude/Projects/DwarfCron && .venv/bin/chronicler serve --reload`.

### API Routes

#### People (`chronicler/api/routes/people.py`)

- `GET /api/people/search?q=...&type=all|hf|unit` — Unified search across HFs + units by name (Dwarvish and English); returns type, race, alive/dead status.
- `GET /api/people/hf/{world_id}/{hf_id}` — HF detail: name, race, birth/death, relationships (from `hf_links`), entity memberships (from `hf_entity_links`), site links (from `hf_site_links`), position history (from `hf_position_links`), key events, identities, `current_game_year`.
- `GET /api/people/unit/{unit_id}` — Unit detail: both names, race, profession, skills, labors, position, linked HF (if linkable), civ membership, `current_game_year`, expanded fields from Phase 3.
- `GET /api/people/hf/{world_id}/{hf_id}/events?limit=50` — Events involving this HF.
- `GET /api/people/hf/{world_id}/{hf_id}/relationships` — Graph-ready relationship data.
- Relationship name resolution via batch lookup:
  ```python
  rel_ids = [v for v in relationships.values() if v]
  hf_names = await conn.fetch(
      "SELECT id, name FROM historical_figures WHERE world_id = $1 AND id = ANY($2::int[])",
      world_id, rel_ids)
  name_map = {r["id"]: r["name"] for r in hf_names}
  ```
  Return `resolved_relationships`: `[{type: "Spouse", hf_id: 12345, name: "Urist McHammer"}]`.
- `current_game_year` fetch pattern:
  ```python
  current_year = await conn.fetchval(
      "SELECT game_year FROM sync_snapshots WHERE world_id = $1 "
      "ORDER BY synced_at DESC LIMIT 1", world_id)
  ```
- `unaccent` search pattern: `unaccent(name) ILIKE unaccent($1)` on `name` and `english_name` fields.

#### Civilizations (`chronicler/api/routes/civilizations.py`)

- `GET /api/civilizations?type=...` — List entities with type filter, member counts, site counts.
- `GET /api/civilizations/{world_id}/{entity_id}` — Entity detail.
- `GET /api/civilizations/{world_id}/{entity_id}/positions` — Position hierarchy with current/former holders.
- `GET /api/civilizations/{world_id}/{entity_id}/members?limit=1000` — Paginated member list from `hf_entity_links`.
- Position query:
  ```sql
  SELECT ep.position_id, ep.name, ep.name_male, ep.name_female,
         hpl.hf_id AS holder_hf_id, hf.name AS holder_name,
         hf.sex AS holder_sex, hf.caste AS holder_caste,
         s.id AS site_id, s.name AS site_name
  FROM entity_positions ep
  LEFT JOIN hf_position_links hpl ON ...
  LEFT JOIN historical_figures hf ON ...
  LEFT JOIN sites s ON s.world_id = ep.world_id AND s.owner_entity_id = ep.entity_id
  WHERE ep.world_id = $1 AND ep.entity_id = $2
  ORDER BY ep.name
  ```
- `_categorize_position(name)` helper classifies positions into Noble / Military / Administrator / Other.

#### Geography (`chronicler/api/routes/geography.py`)

- `GET /api/geography/sites?type=...&owner=...` — Sites with owner entity, type filter.
- `GET /api/geography/sites/{world_id}/{site_id}` — Site detail.
- `GET /api/geography/regions` — Regions list with type.

#### Events (`chronicler/api/routes/events.py`)

- `GET /api/events?year_from=...&year_to=...&type=...&hf=...&site=...&limit=100` — Filtered event list.
- `GET /api/events/collections?type=WAR|BATTLE|...` — Event collections.
- `GET /api/events/collections/{world_id}/{id}` — Collection detail with sub-events.

#### Explorer / Database Tab (`chronicler/api/routes/explorer.py`)

- `GET /api/explorer/tables` — All tables with row counts.
- `GET /api/explorer/tables/{name}` — Columns, types, PKs, FKs, indexes.
- `GET /api/explorer/tables/{name}/data?page=1&limit=25&sort=&order=asc&filter=` — Paginated rows with column metadata.
- `POST /api/explorer/query` — Read-only SQL results (SELECT/WITH only, `conn.transaction(readonly=True)`, max 500 rows).
- `graph_search()`: add `unaccent` wrapping on HF, entity, site, unit name searches.
- Add Knowledge Horizon endpoint (stub).
- Do NOT refactor existing `explorer.py` — add new domain route files alongside it.
- Row serialization: `_serialize_row()` helper converts asyncpg types (datetime, Decimal, bytes) to JSON-safe values.

#### Graph Endpoints (in `explorer.py`)

- `GET /api/explorer/graph/hf/{world_id}/{hf_id}?depth=1` — Ego network: HF center + HF/entity/site links.
- `GET /api/explorer/graph/entity/{world_id}/{entity_id}?depth=1` — Entity center + member HFs.
- `GET /api/explorer/graph/site/{world_id}/{site_id}?depth=1` — Site center + linked HFs.
- `GET /api/explorer/graph/search?q=&world_id=` — Typeahead search across HFs, entities, sites.

### Database Schema (`chronicler/db/schema.sql`)

#### Extensions

```sql
CREATE EXTENSION IF NOT EXISTS unaccent;
```
Also run manually against live `chronicler` database.

#### Units Table New Columns

```sql
ALTER TABLE units ADD COLUMN IF NOT EXISTS english_name TEXT;
ALTER TABLE units ADD COLUMN IF NOT EXISTS birth_year INT;
ALTER TABLE units ADD COLUMN IF NOT EXISTS sex SMALLINT;
ALTER TABLE units ADD COLUMN IF NOT EXISTS death_cause TEXT;
```

- `english_name`: populated from existing `details->>'english_name'` JSONB; both `name` and `english_name` written on insert/update.
- `birth_year` and `sex` get dedicated columns (not JSONB) because they are used in queries.
- Rich data (personality, relationships, attributes) stays in `details` JSONB — too varied/nested for columns.

#### Knowledge Horizon Table (Stub)

```sql
CREATE TABLE IF NOT EXISTS knowledge_horizon (
    world_id    INT NOT NULL REFERENCES worlds(id),
    entity_type TEXT NOT NULL,
    entity_id   INT NOT NULL,
    visible     BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (world_id, entity_type, entity_id)
);
```

### VM Scripts

Location: `/Users/nathanielcannon/Claude/Jarvis/projects/chronicler/scripts/`

#### Existing Scripts (Phase 0 Complete)

- `vm-config.sh`: Shared config — auto-detects disk UUID via glob `*.qcow2`, defines DRY constants for VM name, IP, SSH key, user, etc.
- `vm-lifecycle.sh`: 19-command VM control wrapper (451 lines) — covers all `utmctl` operations plus `exec-capture` and `exec-ps` helpers.
- `vm-bootstrap.sh`: Autonomous Phase 0 bootstrap script — OpenSSH install, SSH key deployment, SSH config, PowerShell 7 install (343 lines).

#### Scripts to Be Created

- `vm-install-df.sh` — DF/DFHack install + configuration (Phase 1).
- `vm-test-rpc.py` — RPC validation test script (Phase 1).
- `vm-ssh.sh` — SSH connection wrapper with retry/timeout/key handling (Phase 2).
- `vm-deploy.sh` — SCP-based deployment script for Lua/PS1/configs (Phase 2).
- `vm-dfhack-cmd.sh` — Execute DFHack commands via SSH → `dfhack-run` (Phase 2).
- `vm-service-manager.sh` — Start/stop HTTP server, bridge, PostgreSQL (Phase 2).
- `vm-deploy-all.sh` — One-command full deployment (Phase 2).
- `vm-watch.sh` — Start watcher pointed at VM (Phase 2).

### Chronicler Product Code Files

Location: `/Users/nathanielcannon/Claude/Projects/DwarfCron/`

#### Explorer UI — Files Modified or Created

| Action | File |
|--------|------|
| Create | `chronicler/api/templates/partials/_nav.html` |
| Create | `chronicler/api/routes/explorer.py` |
| Create | `chronicler/api/routes/people.py` |
| Create | `chronicler/api/routes/civilizations.py` |
| Create | `chronicler/api/routes/geography.py` |
| Create | `chronicler/api/routes/events.py` |
| Create | `chronicler/api/templates/explorer.html` |
| Modify | `chronicler/api/app.py` (import + register all new routers; add `/explorer` page route; add `active` context variable to `/` and `/monitoring` routes) |
| Modify | `chronicler/api/templates/index.html` (flex layout, nav partial) |
| Modify | `chronicler/api/templates/monitoring.html` (replace header with nav partial) |
| Modify | `chronicler/config.py` (remove hardcoded `192.168.4.194`, add `VM_HOST` auto-detection via `utmctl ip-address`) |
| Modify | `chronicler/db/schema.sql` (unaccent extension, unit columns, knowledge_horizon table) |
| Modify | `chronicler/dfhack/scripts/chronicler-bridge.lua` (expanded unit field extraction) |
| Modify | `chronicler/dfhack/watcher.py` (handle new bridge fields) |
| Modify | `chronicler/sync/sync.py` (handle new bridge fields) |
| Create | `projects/chronicler/designs/unit-hf-field-mapping.md` (design doc for LLM integration mapping) |

#### Windows App Packaging — Files to Be Created

- `/Users/nathanielcannon/Claude/Projects/DwarfCron/packaging/pyinstaller.spec`
- `/Users/nathanielcannon/Claude/Projects/DwarfCron/packaging/build-windows.sh`

### app.py Modifications

- Import and include `explorer_router` (and all new domain routers) with `/api` prefix.
- Add `GET /explorer` page route rendering `explorer.html`.
- Add `active` context variable to existing `/` and `/monitoring` routes.

### Data Scale Context

- 35K historical figures, 312K events, 208K relationship links, 70 live units (as of original design).
- 109K total records in world "Namoram" (per MEMORY.md).
- 35 PostgreSQL tables with composite PKs.
- 131 tests.
- Units table has ontological parity with HFs — both have relationships, memberships, positions, biographical data — but extraction was historically far less comprehensive for units.

---

## Completion Status

### Explorer UI — Phase-by-Phase Status

- **Explorer Redesign** (original 6-tab domain architecture): COMPLETE (preceded Phase 1–7 enhancements). Domain-specific Explorer built (People, Civilizations, Geography, Events, Database, Graph); all API route files created; cross-linking navigation implemented; HF↔Unit gap handled; SQL runner preserved.
- **Phase 1** (Accent-Insensitive Search): COMPLETE. `unaccent` extension enabled; `unaccent(name) ILIKE unaccent($1)` in `search_people()` and `graph_search()`.
- **Phase 2** (Age Calculation): COMPLETE. `current_game_year` added to HF and Unit responses; frontend computes and displays age in `renderHfDetail()` and `renderUnitDetail()`.
- **Phase 3** (Unit Data Extraction Expansion): COMPLETE. Bridge Lua script expanded with biographical, relationship, personality, attribute fields; `dwarf_personality` section added; schema columns `birth_year`, `sex`, `death_cause` added; watcher/sync updated.
- **Phase 4** (Unit/HF Field Mapping + Detail View Completeness): COMPLETE. HF detail verified complete; unit detail view expanded with all new sections; relationship name resolution in `get_unit()`; field mapping design doc created.
- **Phase 5** (Position Table Enhancement): COMPLETE. Position table renamed to 5-column layout (Position | Title | Category | Site | Current Holder); gender-appropriate title logic; category badges; site nav-links.
- **Phase 6** (Left Panel Sort/Filter): COMPLETE. Filter inputs and sort dropdowns added to People, Civilizations, and Geography tab sidebars; scroll consistency enforced.
- **Phase 7** (Load Members Enhancement): COMPLETE. Member limit raised to 1,000; columns expanded; client-side sort and filter; Position column added.
- **Phase 8** (Knowledge Horizon Filter): DEFERRED — NOT STARTED. Stub SQL table and backend endpoint planned; UI toggle hidden until horizon data exists.

### Database Explorer (from round1-pair-06 source) — Status: PLANNED (Session 32, 2026-02-22)

- Phase 1 (Navigation + Schema Browser): PLANNED.
- Phase 2 (Data Browser): PLANNED.
- Phase 3 (Entity Graph): PLANNED.
- Note: The functionality described in this plan (Schema Browser, Data Browser, Entity Graph) maps directly to the Database tab and Graph tab in the final 6-tab Explorer architecture from round1-pair-05. These are the same system at different stages of planning maturity.

### VM Automation — Status: ACTIVE (created 2026-02-24)

#### Phase 0 Pre-Work — COMPLETE

- [x] `vm-lifecycle.sh` created and tested (19-command VM control wrapper, 451 lines).
- [x] `vm-bootstrap.sh` created (343 lines).
- [x] `vm-config.sh` created with auto-detecting disk UUID.
- [x] SSH key pair generated: `~/.ssh/df-vm` (ed25519).
- [x] `utmctl` API fully mapped.
- [x] Disk UUID auto-detected: `B4514AD5-3F19-4D5C-9FA8-6BE14C59DE42.qcow2` (14.8 GB).
- [x] `qemu-img` installed (v10.2.1).
- [x] `exec-capture` and `exec-ps` verified against running VM.
- [x] OS confirmed: Windows 11 Pro ARM 64-bit (10.0.26200).
- [x] `utmctl exec` returns output — hostname `WIN-MRGFUCCV202` verified.
- [x] `utmctl ip-address` returns valid IP `192.168.64.3`.

#### Phase 0 Pending

- [ ] SSH key-based auth working from Mac (pending: run `vm-bootstrap.sh`).

#### Phases 1–5 — NOT STARTED

- Phase 1 (DF + DFHack Risk Validation): pending SSH bootstrap completion.
- Phase 2 (Automation Stack): pending Phase 1.
- Phase 3 (Full Chronicler Integration): pending Phase 2.
- Phase 4 (HomeServer SSH Enhancement): parallel with Phases 2–3, not started.
- Phase 5 (Platform Decision + Windows App Foundation): pending Phases 1–4.

---

## Design Decisions & Rationale

### Explorer UI Architecture

- **Units and HFs are ontologically the same type of being**: Both have relationships, memberships, positions, biographical data. The disparity was a data extraction gap, not a conceptual one. This drove Phase 3 and the field mapping work.
- **Rich personality/attribute data stays in `details` JSONB**: Too varied and nested for columns. Only query-critical fields (`birth_year`, `sex`, `english_name`) get dedicated columns.
- **Do not refactor `explorer.py`**: Add new domain route files alongside it to avoid breaking existing functionality.
- **Preserve SQL runner**: Keep raw Database tab (formerly Schema/Data) available for ad-hoc queries; do not remove power-user access.
- **Single-world simplification**: Hardcode `world_id` in frontend calls; keep it in route signatures for schema correctness.
- **Personality data in separate bridge section (`dwarf_personality`)**: Keeps `unit_summary` lean; personality data is large and not always needed. Separation allows selective sync without re-syncing all unit fields.
- **Reuse vis.js graph**: The existing ego-network graph is functional; add "View graph" buttons throughout domain views rather than rebuilding graph logic.
- **Age is computed at display time**: Not stored; avoids staleness and is trivial to compute from `birth_year` and `current_game_year`.
- **Member limit raised to 1,000 with client-side sort/filter**: Avoids repeated round-trips for sort/filter operations on a fixed dataset.
- **Gender-appropriate titles**: Use `name_female` / `name_male` / `name` from entity_positions data; derive gender from `sex == 1 OR caste == "FEMALE"`.
- **Knowledge Horizon as a stub**: The concept is architecturally important for an AI storyteller, but computation is non-trivial; stub the table and toggle now, fill later.
- **HF↔Unit gap is a known data limitation**: Units born after the legends XML export have `hist_fig_id` values that exceed the maximum HF id; display graceful fallback rather than an error.
- **Explorer as the design workbench**: The Explorer is the planned design workbench for tier-propagation logic in the Knowledge Horizon (dynamic masking) system.
- **Explorer as new page, not standalone tool**: Keeps unified web app structure; avoids duplicating navigation, config, and DB connection logic.
- **Three-tab structure** (Schema / Data / Graph) provides progressive complexity for different use cases (now embedded as Database + Graph within the 6-tab structure).
- **Shared nav partial**: `_nav.html` avoids duplicating navigation HTML across templates.
- **vis.js from CDN**: Avoids adding a build step to the project.
- **SQL Runner two-layer safety**: keyword blocklist (defense-in-depth) + `conn.transaction(readonly=True)` as the primary guard; max 500 rows enforced.
- **Graph BFS depth clamped at 3**: Prevents runaway query expansion.
- **Graph batched fetches**: All entity/site detail fetches use `ANY($1::int[])` — no per-node N+1 queries.
- **Graph performance limits**: Hard limit at 1,000 nodes (expansion refused); warning at 500.
- **Node ID prefixing**: `hf-123`, `entity-456`, `site-789` avoids ID collisions between entity types in vis.js.

### VM Platform Strategy

- **Prefer UTM VM over HomeServer** for full local control, offline dev, and snapshot capability.
- **HomeServer remains fallback** for DF hosting if VM cannot run DF under Prism double-emulation.
- **Phase 1 risk validation gates all further VM investment** — no premature commitment before the make-or-break emulation test.
- **Snapshot/restore capability** is a key VM advantage for clean Windows app packaging tests.
- **Decision rule is empirical and binary**: >10 FPS with stable RPC = VM primary; otherwise hybrid.
- **Fresh Windows install recommended** over password recovery for predictability.
- **Full autonomous bootstrap after guest agent availability** — user only handles GUI steps (OS install, Steam login, initial DF launch).
- **`exec-capture` / `exec-ps` pattern** chosen because `utmctl exec` cannot relay stdout.
- **Done-marker polling pattern** chosen over fixed sleep because PowerShell startup latency under Prism is variable (~10s).
- **Disk UUID auto-detection via glob** chosen because UUID changes on VM re-create.

### Windows App Architecture Decisions

- **PyInstaller** chosen as packaging tool (recommended for maturity over alternatives).
- **SQLite preferred** over embedded PostgreSQL for single-user app simplicity.
- **Bundled Ollama + Qwen3-1.7B** chosen for LLM runtime; llama.cpp noted as lighter alternative.
- **`pystray`** chosen for system tray background service.
- **NSIS or Inno Setup** for installer.
- **Bridge auto-setup via installer** copying Lua script + configuring `onMapLoad.init`.

### Config Hardcoding Fix

- Remove hardcoded `192.168.4.194` (HomeServer IP) from `config.py`.
- Replace with `VM_HOST` auto-detection via `utmctl ip-address` so config is not environment-specific.

---

## Open Questions & Gaps

### Explorer UI

- **Preferences field extraction**: `u.status.current_soul.preferences[i]` — planned but not yet extracted in the bridge script.
- **Need state extraction**: `u.counters2.hunger_timer` etc. — planned but not yet extracted.
- **LLM storyteller integration**: The unified person JSON schema from the field mapping doc is designed for LLM use, but actual integration with the storyteller has not been specified or implemented.
- **Full Knowledge Horizon computation logic**: How to populate the `knowledge_horizon` table based on actual fortress knowledge is entirely unspecified; stub only.
- **Graph tab — "View graph" buttons from domain views**: The requirement is stated but the specific implementation for each tab's "View graph" entry points is not detailed.
- **Events tab — Year range slider implementation**: Specifically how the slider is implemented (HTML5 range input, JS library?) is not specified.
- **Geography tab — right panel detail**: What exactly constitutes "notable inhabitants" and "historical events at this location" in the site detail card requires schema clarification.
- **Regions in Geography tab**: No detail given on what the Regions list shows beyond "regions list with type."
- **Database tab grouping**: Table grouping categories (Legends, Geography, Live, Monitoring) require a defined mapping from table names to categories; this logic is not specified.
- **Cross-linking from Events tab**: Events tab has clickable participants and locations, but how these navigate to People or Geography tabs is not specified.
- **Civilizations tab — Related events section**: How wars, conquests are fetched and displayed is not detailed.

### VM Infrastructure

- **Phase 1 outcome is unknown**: Whether DF + DFHack will actually run under Prism double-emulation is the central open question. All downstream VM phases depend on this result.
- **DFHack RPC on VM**: MEMORY.md notes that TCP RPC is broken for game-thread calls on DFHack 53.x under Prism (CoreSuspender never acquired from network thread). This means `dfhack-run` over SSH is the required approach — but the VM bootstrap and risk validation plans still describe testing RPC methods. The relationship between the known RPC breakage and the Phase 1 validation plan needs reconciliation.
- **Steam installation on ARM VM**: The plan calls for `winget install Valve.Steam` via SSH, but Steam may not support ARM Windows natively and may require x64 emulation. This is a risk not explicitly addressed.
- **HomeServer SSH**: Requires user action to install OpenSSH Server — no automated path until the user completes this step.
- **`vm-bootstrap.sh` execution**: SSH key-based auth is the last pending Phase 0 item; requires running `vm-bootstrap.sh` and verifying the result.
- **Windows app delivery target**: The deliverable Windows app is described architecturally but no implementation has begun. The SQLite vs. embedded PostgreSQL choice is listed as a preference (SQLite) but not a final decision.
- **ARM vs x86 Windows packaging target**: The VM provides ARM Windows; HomeServer provides x86_64. The majority of end-user machines are likely x86_64. The packaging strategy for targeting the right architecture is not fully resolved.
- **Qwen3-1.7B on Windows**: Whether the bundled Ollama + Qwen3-1.7B will run adequately on typical end-user Windows machines (without dedicated GPU) is not validated.
- **`chronicler.exe` naming and distribution**: No decisions on code signing, distribution channel, or update mechanism for the Windows app.

### Overlap / Reconciliation Between Source Documents

- The Database tab (Schema Browser + Data Browser) and Graph tab in the final 6-tab Explorer architecture (round1-pair-05) directly subsume the full three-tab Database Explorer plan from round1-pair-06. Both describe the same system at different levels of planning maturity. The detailed Schema Browser and Data Browser specifications from round1-pair-06 are the canonical implementation specs for the Database tab in the final architecture.
- The Entity Graph tab (round1-pair-06) and the Graph tab (round1-pair-05) describe the same vis.js visualization. Round1-pair-06 has the most detailed graph endpoint and node styling specifications and is the authoritative source for graph implementation details.
- The `_nav.html` partial and app.py modifications are described in both documents in consistent terms; no conflicts.
