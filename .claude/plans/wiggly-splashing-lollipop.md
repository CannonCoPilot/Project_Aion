# Plan: Fast File Transfer for Chronicler VM

## Context

File transfers from DF-Windows VM used `utmctl file pull` (QEMU Guest Agent over serial port), achieving 1-5 MB/s. Four legends XMLs (863 MB total) took over 1.5 hours. SSH is already bootstrapped on the VM with key auth, making SCP available at 40-80 MB/s — a 10-40x improvement. A proven PowerShell HTTP server exists in `experiments/deploy-bridge.py` that can serve as the fallback method.

## Files to Modify

| File | Action |
|------|--------|
| `projects/chronicler/scripts/vm-config.sh` | Add `FILE_SERVE_PORT=8889` |
| `projects/chronicler/scripts/vm-lifecycle.sh` | Add 5 functions, smart dispatcher, dispatch entries, health check, usage |
| `projects/chronicler/scripts/file-server.ps1` | **Create** — standalone PowerShell HTTP server (extracted from `experiments/deploy-bridge.py:31-107`, port changed to 8889) |
| `.claude/skills/chronicler-ops/SKILL.md` | Add Workflow 0 (file transfer hierarchy), update Workflow 3, add connection/gotcha entries |

## Implementation

### Step 1: vm-config.sh — Add port constant

Add `FILE_SERVE_PORT=8889` after line 29 (`BRIDGE_HTTP_PORT=8888`). Separate port avoids conflict with bridge's game data endpoint.

### Step 2: file-server.ps1 — Create standalone HTTP server

Extract PowerShell code from `experiments/deploy-bridge.py` lines 31-107 (currently embedded as a Python string with `\r\n`). Changes from original:
- Port: `8888` → `8889`
- Title: "Chronicler File Server" (distinguishes from bridge)
- Content-Type: `application/octet-stream` for non-JSON files (original hardcodes `application/json`)
- Otherwise identical (v2 hardening: per-request try/catch, auto-restart, error logging)

### Step 3: vm-lifecycle.sh — Add transfer functions

**3a. Rename `cmd_pull()` → `cmd_pull_ga()`** (lines 292-298). Keep as explicit Guest Agent path.

**3b. New `cmd_pull()`** — smart dispatcher: tries SCP if SSH key exists and SSH reachable, else falls back to GA with a warning.

**3c. `cmd_scp_pull()`** — single file SCP download with timing:
- Uses `$SSH_KEY`, `$SSH_USER` from vm-config.sh
- Forward-slash paths (Windows SCP accepts them)
- Escaped quotes around guest path (handles spaces in "Program Files")
- Logs elapsed time for benchmarking

**3d. `cmd_scp_pull_multi()`** — parallel multi-file SCP:
- First arg: local destination directory
- Remaining args: guest paths
- Background `scp &` per file, `wait` for all
- Reports total time and any failures
- Bash 3.2 compatible (no arrays, simple `$pids` string)

**3e. `cmd_http_serve()`** — start/stop/status for PowerShell file server:
- `start`: Deploy `file-server.ps1` via SCP, start via SSH in background; fallback to `utmctl file push` + `exec-ps` if no SSH
- `stop`: Kill file-server PowerShell process via SSH
- `status`: Curl health check on port 8889
- Includes idempotency check (curl before starting)

**3f. `cmd_http_pull()`** — download via HTTP file server:
- URL-encodes spaces in filename
- Curl with `--max-time 600` (10 min safety)
- Logs elapsed time

**3g. Update dispatch table** (after line 428) — add entries for: `scp-pull`, `scp-pull-multi`, `http-serve`, `http-pull`, `pull-ga`

**3h. Update `cmd_health()`** (after line 275) — add file server port check

**3i. Update usage text** (lines 430-449) — document new commands

### Step 4: chronicler-ops SKILL.md — Add file transfer workflow

**4a. New "Workflow 0: File Transfer"** — insert before current Workflow 1. Documents:
- Method 1: SCP (primary, 40-80 MB/s) — single + parallel examples
- Method 2: HTTP file server (fallback, 50-120 MB/s) — start/download/stop
- Method 3: Guest Agent (emergency, 1-5 MB/s) — with double-backslash warning
- Speed comparison table
- Performance baselines (filled in after benchmarks)

**4b. Update Workflow 3** step 1 — replace bare `scp` commands with `vm-lifecycle.sh scp-pull-multi`

**4c. Update Connection Details** — add File Server row (port 8889)

**4d. Update Gotchas table** — add SCP path format, large file transfer, HTTP startup entries

### Step 5: Benchmark

Transfer `autosave_1-00250-01-15-legends.xml` (already on VM) using each method:

1. SCP benchmark: `time vm-lifecycle.sh scp-pull 'C:/Program Files (x86)/Steam/steamapps/common/Dwarf Fortress/autosave 1-00250-01-15-legends.xml' /tmp/bench-scp.xml`
2. HTTP benchmark: `vm-lifecycle.sh http-serve start`, then `time vm-lifecycle.sh http-pull 'autosave 1-00250-01-15-legends.xml' /tmp/bench-http.xml`
3. Verify file integrity: `diff` against existing local copy
4. Fill actual numbers into SKILL.md performance baselines
5. Clean up `/tmp/bench-*.xml`

## Verification

1. `vm-lifecycle.sh scp-pull` transfers a file successfully with timing output
2. `vm-lifecycle.sh scp-pull-multi` transfers 2+ files in parallel
3. `vm-lifecycle.sh http-serve start` → `http-serve status` shows "running"
4. `vm-lifecycle.sh http-pull` downloads a file from the running server
5. `vm-lifecycle.sh pull` auto-dispatches to SCP when SSH is available
6. `vm-lifecycle.sh health` shows file server status
7. Benchmark numbers populated in SKILL.md
