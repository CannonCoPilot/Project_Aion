# /vm — UTM VM Lifecycle Control

**Purpose**: Quick access to DF-Windows VM operations — start, stop, status, SSH, PowerShell, snapshots.

**Usage**: `/vm [subcommand] [args...]`

---

## Overview

Wraps `projects/chronicler/scripts/vm-lifecycle.sh` for convenient VM management. The VM runs Windows 11 ARM (Prism x86-64 emulation) with DF+DFHack.

## Subcommands

| Subcommand | Description |
|------------|-------------|
| *(none)* | Show status, IP, and quick health summary |
| `start` | Boot VM, wait for SSH ready, print IP |
| `stop` | Graceful shutdown |
| `suspend` | Suspend to memory (fast resume) |
| `ssh <cmd>` | Run command on VM via SSH |
| `ps <command>` | Run complex PowerShell on VM (base64 encoded, no quoting issues) |
| `health` | Full health check (VM + SSH + DFHack RPC + Bridge) |
| `deploy <local-file> <guest-path>` | Push file to VM via SCP or guest agent |
| `snapshot <name>` | Create named disk snapshot (VM must be stopped) |
| `restore <name>` | Restore disk snapshot (VM must be stopped) |
| `snapshots` | List all disk snapshots |
| `bootstrap` | Run full Phase 0 bootstrap (OpenSSH + SSH key + config) |

## Implementation

```bash
SCRIPTS="/Users/nathanielcannon/Claude/Project_Aion/projects/chronicler/scripts"
VM="$SCRIPTS/vm-lifecycle.sh"
```

### Default (no args) — Quick Status
```bash
$VM status      # started/stopped/suspended
$VM ip          # VM IP address
# Quick health: SSH + DFHack RPC + Bridge
```

### `start`
```bash
$VM start
# Prints IP when SSH is ready
```

### `stop`
```bash
$VM stop
```

### `ssh <cmd>`
```bash
$VM ssh "$@"
```

### `ps <command>`
```bash
$VM exec-ps "$@"
```

### `health`
```bash
$VM health
```

### `deploy <local-file> <guest-path>`
Prefer SCP (if SSH is set up) over `utmctl file push` for reliability:
```bash
VM_IP=$($VM ip)
scp -i ~/.ssh/df-vm "$1" "Jarvis@${VM_IP}:$2"
```

### `snapshot <name>` / `restore <name>`
```bash
$VM snapshot "$1"
$VM restore "$1"
```

### `bootstrap`
```bash
$SCRIPTS/vm-bootstrap.sh
```

## Environment

- **VM Name**: DF-Windows
- **Hostname**: WIN-MRGFUCCV202
- **OS**: Windows 11 Pro ARM 64-bit (10.0.26200)
- **IP**: Dynamic (usually 192.168.64.3)
- **SSH Key**: `~/.ssh/df-vm`
- **SSH User**: Jarvis
- **Scripts**: `projects/chronicler/scripts/vm-{config,lifecycle,bootstrap}.sh`

## Key Gotchas

- `utmctl exec` is fire-and-forget — use `exec-capture` or `exec-ps` for output
- `utmctl file pull` returns exit 0 on failure — check output content
- PowerShell takes ~10s to start under Prism ARM — polling required
- Snapshots require VM stopped + `qemu-img` installed (`brew install qemu`)
