# UTM Windows VM + Chronicler Automation Environment

**Status**: ACTIVE
**Created**: 2026-02-24
**Goal**: Establish full Jarvis autonomous control over a Windows testing environment for Chronicler development, live DF data gathering, and deliverable Windows app packaging.

---

## Context

Jarvis needs autonomous control over a Windows environment for: file transfers, script execution, DFHack console commands, in-game control, and Windows app packaging. The current HomeServer (WIN-48L3R2QLQN0, 192.168.4.194) works for DFHack RPC and SMB file transfer but lacks SSH, remote exec, and auto-start services. The user prefers investing in a UTM VM for full local control.

**End goal**: A deliverable Windows application that runs alongside DF+DFHack, handling databases, local LLM models, and the Chronicler interface.

**Critical risk**: DF is x86-64 only. On Windows 11 ARM in UTM, it runs under Prism x86-64 translation + QEMU ARM virtualization (double emulation). DFHack memory introspection under Prism is untested. **Phase 1 validates this before investing further.**

---

## Phase 0: UTM VM Bootstrap

**Goal**: Working Windows 11 ARM VM with SSH access Jarvis can control.
**Effort**: ~1-2 hours (user handles OS install, Jarvis automates the rest)

### User Steps (requires GUI)
1. Fresh Windows 11 ARM install in UTM (recommended over password recovery)
   - 8 GB RAM, 6 CPU, 64 GB disk, Shared network, Virtualize mode
   - Local account: `Chronicler` / known password (bypass MS account with `oobe\bypassnro`)
2. Install SPICE Guest Tools + QEMU Guest Agent from within Windows

### Jarvis Steps (autonomous after SSH is available)
3. Verify guest agent: `utmctl exec DF-Windows -- cmd.exe /c hostname`
4. Install OpenSSH Server via `utmctl exec`:
   ```
   Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0
   Start-Service sshd; Set-Service -Name sshd -StartupType Automatic
   ```
5. Get VM IP: `utmctl ip-address DF-Windows`
6. Deploy SSH public key via `utmctl file push` → `authorized_keys`
7. Verify: `ssh -i ~/.ssh/df-vm Chronicler@<vm-ip> hostname`
8. Install PowerShell 7: `winget install Microsoft.PowerShell`

### Exit Criteria
- [x] `utmctl exec` returns output from guest — verified: hostname=`WIN-MRGFUCCV202`
- [ ] SSH key-based auth works from Mac (pending: run vm-bootstrap.sh)
- [x] `utmctl ip-address` returns valid IP — verified: `192.168.64.3`

### Jarvis Pre-work Complete
- [x] `vm-lifecycle.sh` created + tested (19-command VM control wrapper, 451 lines)
- [x] `vm-bootstrap.sh` created (OpenSSH + SSH key + SSH config + PS7, 343 lines)
- [x] `vm-config.sh` shared config (auto-detects disk UUID, DRY constants)
- [x] SSH key pair generated: `~/.ssh/df-vm` (ed25519, jarvis-vm-control)
- [x] `utmctl` API fully mapped: list, status, start, stop, suspend, exec, file push/pull, ip-address, clone
- [x] Disk auto-detected: `B4514AD5-3F19-4D5C-9FA8-6BE14C59DE42.qcow2` (14.8 GB)
- [x] `qemu-img` installed via `brew install qemu` (v10.2.1) — snapshot/restore ready
- [x] `exec-capture` + `exec-ps` verified against running VM
- **OS confirmed**: Windows 11 Pro ARM 64-bit (10.0.26200)

### Key Findings
- `utmctl exec` is fire-and-forget — no stdout relay. Use `exec-capture` (simple) or `exec-ps` (complex PS)
- `utmctl file pull` returns exit 0 even on failure — must check output content
- PowerShell takes ~10s to start under Prism ARM emulation — polling with done-marker is essential
- Disk UUID changes on VM re-create — config auto-detects via glob

### Files Created/Updated
- `projects/chronicler/scripts/vm-config.sh` — shared config (auto-detect disk, DRY)
- `projects/chronicler/scripts/vm-lifecycle.sh` — 19-command VM control wrapper
- `projects/chronicler/scripts/vm-bootstrap.sh` — autonomous Phase 0 bootstrap

---

## Phase 1: Risk Validation — Can DF + DFHack Run?

**Goal**: YES/NO answer on DF+DFHack under ARM Windows Prism emulation.
**Effort**: ~2-3 hours (user handles Steam login + initial DF launch)
**This is the make-or-break phase.**

### Steps
| # | Action | Who | Notes |
|---|--------|-----|-------|
| 1.1 | Install Steam | Jarvis | `winget install Valve.Steam` via SSH |
| 1.2 | Install DF from Steam | User | Steam requires interactive login (UTM display) |
| 1.3 | Verify DF launches | User | Check window renders, no crash |
| 1.4 | Install DFHack 53.10-r1 | Jarvis | Download + extract to DF dir via SCP |
| 1.5 | Configure `remote-server.json` | Jarvis | `allow_remote: true`, port 5000 |
| 1.6 | Launch DF with DFHack, open firewall | Jarvis | `netsh` firewall rule via SSH |
| 1.7 | Test RPC Core methods | Jarvis | `ListUnits`, `GetWorldInfo`, `ListEnums` from Mac |
| 1.8 | Deploy + test Lua bridge | Jarvis/User | SCP bridge.lua, start repeat job in DFHack console |
| 1.9 | Deploy + test HTTP server | Jarvis | SCP PS1, start via SSH, curl from Mac |
| 1.10 | Performance benchmark | Jarvis | DF FPS, RPC latency, bridge freshness |

### Validation Matrix
| Test | Pass | Fail | Consequence |
|------|------|------|-------------|
| DF launches under Prism | Continue | **VM = packaging-only; DF stays on HomeServer** |
| DFHack loads | Continue | Try without plugins; if fails, VM = packaging-only |
| RPC Core methods respond | Continue | Debug network config |
| Bridge repeat job runs | Continue | Try manual Lua execution |
| Performance >10 FPS | **VM is primary DF host** | VM = secondary; HomeServer = primary DF host |

### Exit Criteria
- Documented YES/NO with performance numbers
- If YES: RPC returns data, bridge JSON fetchable
- If NO: Failure mode documented, HomeServer confirmed as DF host

### Files to Create
- `projects/chronicler/scripts/vm-install-df.sh` — DF/DFHack install + config
- `projects/chronicler/scripts/vm-test-rpc.py` — RPC validation test
- `projects/chronicler/reports/vm-risk-validation.md` — results

---

## Phase 2: Automation Stack

**Goal**: Full Jarvis autonomous control — deploy, execute, monitor, recover.
**Effort**: ~3-4 hours (fully autonomous)
**Entry**: Phase 0 complete + Phase 1 results known

### 2A: SSH Automation Toolkit
- `vm-ssh.sh` — connection wrapper with retry, timeout, key handling
- `vm-deploy.sh` — SCP-based deployment (Lua scripts, PS1, configs)
- `vm-dfhack-cmd.sh` — execute DFHack console commands via SSH → `dfhack-run`
- `vm-service-manager.sh` — start/stop HTTP server, bridge, PostgreSQL

### 2B: utmctl Integration
- Lifecycle: start → wait for SSH → return IP
- Snapshots: stop → `qemu-img snapshot -c <name> <qcow2>` → start
  - qcow2 path: `~/Library/Containers/com.utmapp.UTM/Data/Documents/DF-Windows.utm/Data/*.qcow2`
- Health check: ping VM, SSH, DFHack RPC, bridge freshness

### 2C: Chronicler Config Updates
- Update `config.py` defaults: `DFHACK_HOST=localhost` (not hardcoded HomeServer IP)
- Add `VM_HOST` auto-detection via `utmctl ip-address`
- Create `vm-deploy-all.sh` — one-command full deployment
- Create `vm-watch.sh` — start watcher pointed at VM

### Exit Criteria
- `vm-lifecycle.sh start` boots VM, waits for SSH, returns IP
- `vm-deploy-all.sh` deploys all components in one command
- Snapshot create/restore cycle works
- Health check reports all green

### Key Files Modified
- `/Users/nathanielcannon/Claude/Projects/DwarfCron/chronicler/config.py` — remove hardcoded 192.168.4.194

---

## Phase 3: Chronicler Full Integration

**Goal**: Validate complete data pipeline against VM (or HomeServer if Phase 1 failed).
**Effort**: ~2-3 hours

### Steps
1. Deploy bridge v6+ via `vm-deploy-all.sh`
2. Start bridge repeat job (via SSH → `dfhack-run` or `onMapLoad.init`)
3. Run `chronicler watch` against target host
4. Verify all data domains: game_time, creature_raws, unit_summary, armies, buildings, artifacts, announcements
5. Verify v6+ extensions: dwarf_emotions, zones, event_collections, squads, mandates, incidents
6. Trigger in-game change → verify `unit_events` row
7. Start `chronicler serve` → test web UI
8. Run full 131-test suite
9. 30-minute stability test (memory, connections, data integrity)

### Exit Criteria
- 10+ watcher cycles with 0 errors
- All 131 tests pass
- Web UI renders live data
- Change events detected and stored

---

## Phase 4: HomeServer SSH Enhancement (parallel with Phases 2-3)

**Goal**: SSH on HomeServer for automation parity + empirical comparison.
**Effort**: ~1 hour (user runs initial install, Jarvis automates rest)

### User Steps
1. Install OpenSSH Server: Settings > Apps > Optional Features > OpenSSH Server
2. Start service: `Start-Service sshd; Set-Service -Name sshd -StartupType Automatic`
3. Open firewall: `netsh advfirewall firewall add rule name=OpenSSH dir=in action=allow protocol=TCP localport=22`

### Jarvis Steps (once SSH is up)
4. Deploy SSH public key
5. Verify key-based auth: `ssh Nathaniel@192.168.4.194 hostname`
6. Test SCP file deploy
7. Test remote PowerShell execution
8. Create Task Scheduler job for auto-start HTTP server on login
9. Test `dfhack-run` via SSH tunnel: `ssh -L 5001:localhost:5000 Nathaniel@192.168.4.194 -N`

### Exit Criteria
- SSH key auth works
- SCP deploy works
- Remote command execution works
- HTTP server auto-starts

---

## Phase 5: Decision + Windows App Foundation

**Goal**: Select platform, begin deliverable app scaffolding.
**Effort**: ~4-6 hours
**Entry**: Phases 1-4 complete

### 5A: Platform Decision

| Factor | VM (DF works) | VM (packaging only) + HomeServer (DF) | HomeServer only |
|--------|---------------|---------------------------------------|-----------------|
| Automation | Full (utmctl + SSH) | Split: utmctl for packaging, SSH for DF | SSH only |
| Snapshots | Yes | For packaging only | No |
| Offline dev | Yes (local) | Partial (need HomeServer for DF) | No (LAN required) |
| End-user match | ARM Windows (minority) | x86 Windows via HomeServer | x86 Windows (majority) |
| Complexity | Low (single target) | Medium (two targets) | Low (single target) |

**Decision rule**: If VM runs DF at >10 FPS with stable RPC → VM is primary. Otherwise → hybrid (HomeServer for DF, VM for packaging).

### 5B: Deliverable App Components

| Component | Implementation | Notes |
|-----------|----------------|-------|
| Python runtime | PyInstaller → `chronicler.exe` | Build on VM or HomeServer |
| Database | Embedded PostgreSQL or SQLite | SQLite for single-user simplicity |
| LLM runtime | Bundled Ollama + Qwen3-1.7B | Or llama.cpp for lighter footprint |
| Web UI | FastAPI + Jinja2 on localhost | Already built |
| DFHack connector | TCP RPC client | Already built in `client.py` |
| Bridge auto-setup | Installer copies Lua script | Auto-configure `onMapLoad.init` |
| System tray | `pystray` | Background service with Start/Stop |
| Installer | NSIS or Inno Setup | Wraps all components |

### Steps
1. Document Phase 1-4 results in `platform-decision.md`
2. Choose packaging tool (PyInstaller recommended for maturity)
3. Create `packaging/` directory with build configs
4. Test basic `chronicler.exe` build in VM
5. Create installer script
6. Test full install → run → verify cycle in clean VM snapshot

### Files to Create
- `/Users/nathanielcannon/Claude/Projects/DwarfCron/packaging/pyinstaller.spec`
- `/Users/nathanielcannon/Claude/Projects/DwarfCron/packaging/build-windows.sh`
- `projects/chronicler/reports/platform-decision.md`

---

## Dependency Graph

```
Phase 0 (VM Bootstrap)
    │
    ├──────────────────── Phase 4 (HomeServer SSH) [parallel]
    │                           │
    v                           │
Phase 1 (Risk: DF in VM?)      │
    │                           │
    v                           v
Phase 2 (Automation Stack) ←── comparison data
    │
    v
Phase 3 (Chronicler Integration)
    │
    v
Phase 5 (Decision + App Foundation)
```

---

## Risk Register

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| DF won't launch under Prism | Medium | High | HomeServer fallback; VM = packaging only |
| DFHack memory hooks fail under Prism | Medium-High | High | Bridge architecture bypasses CoreSuspend; only need basic RPC |
| UTM VM too slow for DF (<10 FPS) | Medium | Medium | Increase VM resources (M4 Max has headroom); or HomeServer for DF |
| QEMU guest agent unavailable | Low | Medium | Fall back to SSH-only (skip utmctl exec/file) |
| Prism lacks AVX2 for DF | Low | High | Check Windows update status; Oct 2025 Prism update adds AVX2 |
| Password recovery fails on existing VM | Medium | Low | Fresh install (already recommended) |

---

## Verification

After all phases, the following must be demonstrable:
1. `vm-lifecycle.sh start` → VM boots, SSH ready, IP returned (Phase 0+2)
2. `vm-deploy-all.sh` → all Chronicler components deployed in one command (Phase 2)
3. `chronicler watch --bridge-host <target>` → runs 10+ cycles, 0 errors (Phase 3)
4. `qemu-img snapshot -c baseline <qcow2>` + restore → VM returns to known state (Phase 2)
5. `ssh Nathaniel@192.168.4.194 hostname` → HomeServer responds (Phase 4)
6. `chronicler.exe` built and runs on Windows (Phase 5)
