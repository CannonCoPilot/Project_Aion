# Consolidation: VM Automation & Database Explorer

## Source Documents

- `buzzing-twirling-newell.md`: Multi-phase plan for establishing Jarvis autonomous control over a UTM Windows 11 ARM VM for Chronicler development, live DF data gathering, and deliverable Windows app packaging — covering VM bootstrap, DF/DFHack risk validation, automation stack, full Chronicler integration, HomeServer SSH enhancement, and the platform decision for a deliverable Windows app.
- `woolly-swinging-naur.md`: Implementation plan for a Chronicler Database Explorer — a three-tab web UI page (Schema Browser, Data Browser, Entity Graph) added to the existing Chronicler web app, with shared top navigation, new API endpoints, and vis.js graph visualization of historical figures, entities, and sites.

---

## Features & Requirements

### Autonomous VM Control Infrastructure

- Jarvis must have full autonomous control over a Windows environment for: file transfers, script execution, DFHack console commands, in-game control, and Windows app packaging.
- The UTM VM (DF-Windows) is the primary candidate; the HomeServer (WIN-48L3R2QLQN0, 192.168.4.194) is a fallback for DF hosting.
- `utmctl` is the primary interface for VM lifecycle management: `list`, `status`, `start`, `stop`, `suspend`, `exec`, `file push/pull`, `ip-address`, `clone`.
- SSH key-based authentication must be established from Mac to the VM.
- `utmctl exec` is fire-and-forget (no stdout relay) — use `exec-capture` (simple commands) or `exec-ps` (complex PowerShell via base64) for output capture.
- PowerShell 7 must be installed on the VM (`winget install Microsoft.PowerShell`).
- QEMU Guest Agent + SPICE Guest Tools required for guest-agent-based file transfer.
- `qemu-img` (v10.2.1 via Homebrew) must be available on Mac for VM snapshot/restore.
- VM disk UUID changes on re-create — auto-detect via glob pattern, never hardcode.
- `utmctl file pull` returns exit 0 on failure — always validate output content, not `$?`.
- PowerShell takes ~10s to start under Prism ARM emulation — always use polling with done-marker pattern rather than fixed sleep.

### Phase 0: VM Bootstrap

- Fresh Windows 11 ARM install in UTM (recommended over password recovery).
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
- SSH key pair: `~/.ssh/df-vm` (ed25519, label: jarvis-vm-control).
- Confirmed VM OS: Windows 11 Pro ARM 64-bit (10.0.26200).
- Confirmed VM hostname: `WIN-MRGFUCCV202`.
- Confirmed VM IP: `192.168.64.3`.

### Phase 1: DF + DFHack Risk Validation

- Critical risk: DF is x86-64 only. On Windows 11 ARM in UTM, it runs under Prism x86-64 translation + QEMU ARM virtualization (double emulation). DFHack memory introspection under Prism is untested.
- Phase 1 is the make-or-break phase — must be completed before investing further.
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

### Phase 2: Automation Stack

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

### Phase 3: Chronicler Full Integration Against VM

- Deploy bridge v6+ via `vm-deploy-all.sh`.
- Start bridge repeat job via SSH → `dfhack-run` or `onMapLoad.init`.
- Run `chronicler watch` against target host.
- Verify all data domains: `game_time`, `creature_raws`, `unit_summary`, `armies`, `buildings`, `artifacts`, `announcements`.
- Verify v6+ bridge extensions: `dwarf_emotions`, `zones`, `event_collections`, `squads`, `mandates`, `incidents`.
- Trigger in-game change → verify `unit_events` row is created.
- Start `chronicler serve` → test web UI.
- Run full 131-test suite.
- 30-minute stability test: verify memory, connections, and data integrity.

### Phase 4: HomeServer SSH Enhancement

- HomeServer: WIN-48L3R2QLQN0, 192.168.4.194, user: `Nathaniel`, password: `DwarfF0rtress`, Windows 10 Pro x86_64.
- Currently works for DFHack RPC and SMB file transfer but lacks SSH, remote exec, and auto-start services.
- User-performed steps: Install OpenSSH Server via Settings, start and set sshd to Automatic, open firewall on port 22.
- Jarvis-autonomous steps after SSH is available:
  - Deploy SSH public key.
  - Verify key-based auth: `ssh Nathaniel@192.168.4.194 hostname`.
  - Test SCP file deploy.
  - Test remote PowerShell execution.
  - Create Task Scheduler job for auto-start HTTP server on login.
  - Test `dfhack-run` via SSH tunnel: `ssh -L 5001:localhost:5000 Nathaniel@192.168.4.194 -N`.
- Phase 4 runs in parallel with Phases 2-3.

### Phase 5: Platform Decision + Windows App Foundation

- Platform decision rule: If VM runs DF at >10 FPS with stable RPC → VM is primary. Otherwise → hybrid (HomeServer for DF, VM for packaging).
- Platform comparison:
  - VM (DF works): Full automation (utmctl + SSH), snapshots, offline dev, ARM Windows target, low complexity.
  - VM (packaging only) + HomeServer (DF): Split automation (utmctl for packaging, SSH for DF), partial offline dev, x86 Windows via HomeServer, medium complexity.
  - HomeServer only: SSH-only automation, no snapshots, no offline dev, x86 Windows (majority), low complexity.
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
  1. Document Phase 1-4 results in `platform-decision.md`.
  2. Choose packaging tool (PyInstaller recommended for maturity).
  3. Create `packaging/` directory with build configs.
  4. Test basic `chronicler.exe` build in VM.
  5. Create installer script.
  6. Test full install → run → verify cycle in clean VM snapshot.

### Database Explorer — Web UI Feature

- Add a new Explorer page to the existing Chronicler web app at route `/explorer`.
- Explorer comprises three tabs: Schema Browser, Data Browser, Entity Graph.
- Also add shared top navigation across all Chronicler web pages.

#### Shared Top Navigation

- Top nav bar with links to: Chat (`/`), Explorer (`/explorer`), Monitoring (`/monitoring`).
- Active page highlighted in amber.
- Implemented as a Jinja2 partial: `_nav.html`.
- Each template sets a `{% set active = "<page>" %}` variable before including the partial.
- `index.html`: Change body to `flex flex-col h-screen`; add nav partial before sidebar; wrap sidebar+main in `<div class="flex flex-1 overflow-hidden">`.
- `monitoring.html`: Replace existing `<header>` block with the nav partial include.

#### Schema Browser (Tab 1)

- Table list with row counts (use `pg_stat_user_tables.n_live_tup` for speed; exact count on detail view).
- Columns, types, primary keys, foreign keys (outgoing + incoming), and indexes per table.
- Table names validated against regex `^[a-z_][a-z0-9_]*$` plus existence check in `information_schema.tables`.
- Two-column layout: table list (left, 280px) + detail panel (right).
- Table list: clickable items showing `table_name (row_count)`, grouped by category (Legends, Geography, Live, Monitoring).
- Detail panel: columns table with PK badge, FK links (clickable → navigate to target table), incoming FKs, indexes.
- API endpoint: `GET /api/explorer/tables` → all tables with row counts.
- API endpoint: `GET /api/explorer/tables/{name}` → columns, types, PKs, FKs, indexes.

#### Data Browser (Tab 2)

- Table selector dropdown (reuses table list from schema tab).
- Filter bar: text search across text columns + sort column dropdown + ascending/descending toggle.
- Data grid with:
  - Clickable column headers for sorting.
  - FK values as clickable links navigating to the referenced row (carrying `world_id` for composite PKs).
  - JSONB columns as collapsible `<details>` with formatted JSON.
  - Booleans as colored indicators; NULLs as gray italic.
  - Long text truncated with expand-on-click.
- Pagination: Previous/Next buttons, page X of Y display, rows-per-page selector (25 / 50 / 100).
- SQL Runner: collapsible textarea, Run button, results grid, row limit selector, execution time display.
- API endpoint: `GET /api/explorer/tables/{name}/data?page=1&limit=25&sort=&order=asc&filter=` → paginated rows with column metadata.
- API endpoint: `POST /api/explorer/query` → read-only SQL results (SELECT/WITH only, `conn.transaction(readonly=True)`, max 500 rows).
- Row serialization helper `_serialize_row()` converts asyncpg types (datetime, Decimal, bytes) to JSON-safe values.
- SQL Runner safety: keyword blocklist (INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE, CREATE, GRANT, REVOKE) as defense-in-depth; primary defense is `conn.transaction(readonly=True)`; wrapped query with enforced LIMIT cap; all dynamic table/column names validated against `information_schema` before interpolation.

#### Entity Graph (Tab 3)

- vis.js ego-network visualization of historical figures (HFs), entities, and sites.
- Search box with typeahead → `/api/explorer/graph/search` → results displayed as `Name (type)`.
- World selector dropdown.
- Depth selector: 1-hop / 2-hop / 3-hop radio buttons.
- vis.js canvas: full remaining height, dark background, forceAtlas2Based physics.
- Node info panel: overlay on click showing entity details + "Expand" button.
- Click-to-expand: adds clicked node's 1-hop connections to existing graph incrementally.
- Legend: node shapes and colors.
- Performance guard: node count badge; warning at 500+ nodes; refuse expansion at 1000+.
- vis.js loaded from CDN: `https://unpkg.com/vis-network/standalone/umd/vis-network.min.js` (no build step required).
- Graph query pattern: BFS from center node, depth 1-3 (clamped). Each hop:
  1. Fetch frontier HF details from `historical_figures`.
  2. Fetch HF→HF edges from `hf_links` (bidirectional).
  3. Fetch HF→Entity edges from `hf_entity_links` (with `position_name`).
  4. Fetch HF→Site edges from `hf_site_links`.
  5. Build next frontier from discovered HF IDs not yet visited.
- All entity/site detail fetches batched with `ANY($1::int[])` — no per-node queries.
- API endpoints:
  - `GET /api/explorer/graph/hf/{world_id}/{hf_id}?depth=1` → ego network: HF center + HF/entity/site links.
  - `GET /api/explorer/graph/entity/{world_id}/{entity_id}?depth=1` → entity center + member HFs.
  - `GET /api/explorer/graph/site/{world_id}/{site_id}?depth=1` → site center + linked HFs.
  - `GET /api/explorer/graph/search?q=&world_id=` → typeahead search across HFs, entities, sites.
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
- Return format vis.js DataSet-compatible:
  ```json
  {
    "nodes": [{"id": "hf-123", "label": "Urist", "shape": "dot", "color": {...}}],
    "edges": [{"from": "hf-123", "to": "hf-456", "label": "spouse", "color": "#f472b6"}]
  }
  ```

---

## Implementation Details

### VM Scripts (Jarvis dev artifacts)

Location: `/Users/nathanielcannon/Claude/Jarvis/projects/chronicler/scripts/`

- `vm-config.sh`: Shared config — auto-detects disk UUID via glob `*.qcow2`, defines DRY constants for VM name, IP, SSH key, user, etc.
- `vm-lifecycle.sh`: 19-command VM control wrapper (451 lines) — covers all `utmctl` operations plus `exec-capture` and `exec-ps` helpers.
- `vm-bootstrap.sh`: Autonomous Phase 0 bootstrap script — OpenSSH install, SSH key deployment, SSH config, PowerShell 7 install (343 lines).

Scripts to be created:

- `vm-install-df.sh` — DF/DFHack install + configuration (Phase 1).
- `vm-test-rpc.py` — RPC validation test script (Phase 1).
- `vm-ssh.sh` — SSH connection wrapper with retry/timeout/key handling (Phase 2).
- `vm-deploy.sh` — SCP-based deployment script for Lua/PS1/configs (Phase 2).
- `vm-dfhack-cmd.sh` — Execute DFHack commands via SSH → `dfhack-run` (Phase 2).
- `vm-service-manager.sh` — Start/stop HTTP server, bridge, PostgreSQL (Phase 2).
- `vm-deploy-all.sh` — One-command full deployment (Phase 2).
- `vm-watch.sh` — Start watcher pointed at VM (Phase 2).

### Chronicler Product Code

Location: `/Users/nathanielcannon/Claude/Projects/DwarfCron/`

Files modified or created for Database Explorer:

| Action  | File |
|---------|------|
| Create  | `chronicler/api/templates/partials/_nav.html` |
| Create  | `chronicler/api/routes/explorer.py` |
| Create  | `chronicler/api/templates/explorer.html` |
| Modify  | `chronicler/api/app.py` |
| Modify  | `chronicler/api/templates/index.html` |
| Modify  | `chronicler/api/templates/monitoring.html` |
| Modify  | `chronicler/config.py` (remove hardcoded `192.168.4.194`, add VM_HOST auto-detection) |

Files to be created for Windows app packaging:

- `/Users/nathanielcannon/Claude/Projects/DwarfCron/packaging/pyinstaller.spec`
- `/Users/nathanielcannon/Claude/Projects/DwarfCron/packaging/build-windows.sh`

### Database Explorer — app.py Modifications

- Import and include `explorer_router` with `/api` prefix.
- Add `GET /explorer` page route rendering `explorer.html`.
- Add `active` context variable to existing `/` and `/monitoring` routes.

### Database Explorer — explorer.py Route Module

- All endpoints in `chronicler/api/routes/explorer.py`.
- Schema endpoints (Phase 1): `GET /api/explorer/tables`, `GET /api/explorer/tables/{name}`.
- Data endpoints (Phase 2): `GET /api/explorer/tables/{name}/data`, `POST /api/explorer/query`.
- Graph endpoints (Phase 3): four endpoints for HF/entity/site graph + search.
- Row serialization: `_serialize_row()` helper converts asyncpg-specific types to JSON-safe values.

### explorer.html Template

- Same Tailwind CSS config/theme as existing pages.
- Three-tab internal navigation via JavaScript tab switching.
- Schema tab: two-column layout (280px table list + detail panel).
- Data tab: table selector, filter bar, data grid, pagination, SQL Runner.
- Graph tab: world selector, search box, depth radio buttons, vis.js canvas, node info panel, legend.
- vis.js loaded from CDN (no build step).

### VM Infrastructure Details

- VM name: `DF-Windows`.
- VM IP: `192.168.64.3`.
- VM hostname: `WIN-MRGFUCCV202`.
- VM OS: Windows 11 Pro ARM 64-bit (10.0.26200).
- SSH key: `~/.ssh/df-vm` (ed25519).
- SSH user on VM: `Chronicler`.
- QEMU disk path: `~/Library/Containers/com.utmapp.UTM/Data/Documents/DF-Windows.utm/Data/*.qcow2`.
- Disk UUID (current): `B4514AD5-3F19-4D5C-9FA8-6BE14C59DE42.qcow2` (14.8 GB; auto-detected, not hardcoded).
- `qemu-img` version: 10.2.1 (installed via Homebrew).
- `utmctl` binary: available and fully mapped.
- DFHack RPC port: 5000.
- HTTP file server port: 8889.
- DF install path on VM (planned): `C:\Program Files (x86)\Steam\steamapps\common\Dwarf Fortress\`.
- DF version: 53.10, DFHack version: 53.10-r1.

### DFHack / Bridge Architecture

- Bridge v6+ Lua script deploys via SCP to VM.
- Bridge starts as a repeat job via SSH → `dfhack-run` or via `onMapLoad.init`.
- Data domains covered by bridge: `game_time`, `creature_raws`, `unit_summary`, `armies`, `buildings`, `artifacts`, `announcements`.
- v6+ bridge extensions: `dwarf_emotions`, `zones`, `event_collections`, `squads`, `mandates`, `incidents`.
- HTTP file server for bulk data transfer: ~105 MB/s, port 8889.
- SCP for file transfer via `vm-lifecycle.sh scp-pull`: ~19 MB/s (requires `-O -T` flags for Windows paths).

### Reports to Be Created

- `projects/chronicler/reports/vm-risk-validation.md` — Phase 1 results documentation.
- `projects/chronicler/reports/platform-decision.md` — Phase 5 platform decision.

---

## Status & Completion

### VM Automation (buzzing-twirling-newell.md) — Status: ACTIVE (created 2026-02-24)

Phase 0 pre-work — COMPLETE:
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

Phase 0 in progress / pending:
- [ ] SSH key-based auth working from Mac (pending: run `vm-bootstrap.sh`).

Phase 1 — NOT STARTED: DF/DFHack risk validation pending SSH bootstrap completion.

Phase 2 — NOT STARTED: Automation stack scripts to be created after Phase 1.

Phase 3 — NOT STARTED: Full Chronicler integration pending Phase 2.

Phase 4 — NOT STARTED: HomeServer SSH enhancement, runs in parallel with Phases 2-3.

Phase 5 — NOT STARTED: Platform decision and Windows app foundation pending Phases 1-4.

### Database Explorer (woolly-swinging-naur.md) — Status: PLANNED (created 2026-02-22, Session 32)

Pre-context: Gap Closure plan already complete — 35 PostgreSQL tables with composite PKs, 131 tests, enriched storyteller.

Phase 1 (Navigation + Schema Browser) — Status: PLANNED.

Phase 2 (Data Browser) — Status: PLANNED.

Phase 3 (Entity Graph) — Status: PLANNED.

---

## Key Decisions & Design Choices

### VM Platform Strategy

- Prefer UTM VM over HomeServer for full local control, offline dev, and snapshot capability.
- HomeServer remains a fallback for DF hosting if VM cannot run DF under Prism double-emulation.
- Phase 1 risk validation gates all further VM investment — no premature commitment.
- Snapshot/restore capability is a key VM advantage for clean Windows app packaging tests.
- Decision rule is empirical and binary (>10 FPS with stable RPC = VM primary; otherwise hybrid).

### VM Bootstrap Design

- Fresh Windows install recommended over password recovery for predictability.
- Full autonomous bootstrap after guest agent availability — user only handles GUI steps (OS install, Steam login, initial DF launch).
- `exec-capture` / `exec-ps` pattern chosen because `utmctl exec` cannot relay stdout.
- Done-marker polling pattern chosen over fixed sleep because PowerShell startup latency under Prism is variable (~10s).
- Disk UUID auto-detection via glob chosen because UUID changes on VM re-create.

### Windows App Architecture Decisions

- PyInstaller chosen as packaging tool (recommended for maturity over alternatives).
- SQLite preferred over embedded PostgreSQL for single-user app simplicity.
- Bundled Ollama + Qwen3-1.7B chosen for LLM runtime; llama.cpp noted as lighter alternative.
- `pystray` chosen for system tray background service.
- NSIS or Inno Setup for installer.
- Bridge auto-setup via installer copying Lua script + configuring `onMapLoad.init`.

### Database Explorer Architecture Decisions

- Explorer implemented as a new page (`/explorer`) within the existing Chronicler web app rather than a standalone tool.
- Three-tab structure (Schema / Data / Graph) provides progressive complexity for different use cases.
- Shared nav partial (`_nav.html`) avoids duplicating navigation HTML across templates.
- vis.js loaded from CDN to avoid adding a build step to the project.
- SQL Runner uses two layers of safety: keyword blocklist (defense-in-depth) + `conn.transaction(readonly=True)` as the primary guard.
- Graph BFS depth clamped at 3 to prevent runaway query expansion.
- All entity/site detail fetches in graph queries batched with `ANY($1::int[])` to avoid per-node N+1 queries.
- Performance hard limit at 1000 nodes — expansion refused above this threshold; warning at 500.
- Node ID prefixing (`hf-123`, `entity-456`, `site-789`) avoids ID collisions between entity types in vis.js.
- Explorer also serves as the design workbench for tier-propagation logic in the upcoming Knowledge Horizon (dynamic masking) system.

### Chronicler Config Hardcoding Fix

- Remove hardcoded `192.168.4.194` (HomeServer IP) from `config.py`.
- Replace with `VM_HOST` auto-detection via `utmctl ip-address` so config is not environment-specific.

---

## Metrics & Targets

### VM Performance Targets

- DF FPS: >10 FPS under Prism emulation required for VM to be designated primary DF host.
- Bridge freshness: measured as part of Phase 1 benchmark.
- RPC latency: measured as part of Phase 1 benchmark.

### Chronicler Integration Targets

- Watcher stability: 10+ cycles with 0 errors.
- Test suite: all 131 tests passing.
- Stability test: 30-minute run with no memory leaks, connection drops, or data integrity failures.
- Web UI: renders live data from VM.

### Database Explorer Targets

- Schema tab: must correctly load row counts for all tables including `historical_figures` (60K+ rows).
- Data tab: must paginate correctly through `historical_figures` (60K+ rows).
- SQL Runner: read-only queries succeed, write queries rejected.
- Graph tab: 2-hop graph must stay under 500 nodes for most figures.
- Graph performance: expansion refused at 1000+ nodes.

### Windows App Delivery

- `chronicler.exe` must build and run on Windows (VM or HomeServer).
- Full install → run → verify cycle must pass in a clean VM snapshot.

### Existing Baseline (pre-Explorer)

- 35 PostgreSQL tables with composite PKs.
- 131 tests.
- PostgreSQL `chronicler` database on localhost:5432 (CDM schema, 109K records, world "Namoram").
