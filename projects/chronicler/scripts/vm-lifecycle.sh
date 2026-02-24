#!/bin/bash
# ===========================================================================
# vm-lifecycle.sh — UTM VM Lifecycle Management for Chronicler
# ===========================================================================
# Wraps utmctl for start/stop/status/ip/snapshot/restore operations.
# Designed for Jarvis autonomous control of the DF-Windows VM.
#
# Usage:
#   vm-lifecycle.sh start       # Boot VM, wait for SSH, print IP
#   vm-lifecycle.sh stop        # Graceful shutdown
#   vm-lifecycle.sh suspend     # Suspend to memory
#   vm-lifecycle.sh status      # Print VM status
#   vm-lifecycle.sh ip          # Print VM IP address
#   vm-lifecycle.sh ssh [cmd]   # SSH into VM (optionally run command)
#   vm-lifecycle.sh snapshot <name>   # Create disk snapshot (VM must be stopped)
#   vm-lifecycle.sh restore <name>    # Restore disk snapshot (VM must be stopped)
#   vm-lifecycle.sh snapshots         # List disk snapshots
#   vm-lifecycle.sh health            # Check VM + SSH + services health
# ===========================================================================

# --- Configuration ---
UTMCTL="/Applications/UTM.app/Contents/MacOS/utmctl"
QEMU_IMG="$(which qemu-img 2>/dev/null)"  # Requires: brew install qemu
VM_NAME="DF-Windows"
VM_DISK="/Users/nathanielcannon/Library/Containers/com.utmapp.UTM/Data/Documents/DF-Windows.utm/Data/FBC249A3-0D3A-43A1-B64E-170E9132CE76.qcow2"
SSH_KEY="$HOME/.ssh/df-vm"
SSH_USER="Chronicler"
SSH_TIMEOUT=5
SSH_MAX_WAIT=120  # seconds to wait for SSH after boot

# --- Helpers ---
log() { echo "[vm-lifecycle] $*" >&2; }
err() { echo "[vm-lifecycle] ERROR: $*" >&2; exit 1; }

get_status() {
    "$UTMCTL" status "$VM_NAME" 2>/dev/null
}

get_ip() {
    "$UTMCTL" ip-address "$VM_NAME" 2>/dev/null | head -1
}

wait_for_ssh() {
    local ip="$1"
    local elapsed=0
    log "Waiting for SSH on $ip (max ${SSH_MAX_WAIT}s)..."
    while [ $elapsed -lt $SSH_MAX_WAIT ]; do
        if ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no -o ConnectTimeout=$SSH_TIMEOUT \
               -o BatchMode=yes "$SSH_USER@$ip" "echo ok" >/dev/null 2>&1; then
            log "SSH ready after ${elapsed}s"
            return 0
        fi
        sleep 5
        elapsed=$((elapsed + 5))
    done
    log "SSH not available after ${SSH_MAX_WAIT}s"
    return 1
}

# --- Commands ---
cmd_start() {
    local status
    status=$(get_status)
    case "$status" in
        started)
            log "VM already running"
            ;;
        suspended)
            log "Resuming suspended VM..."
            "$UTMCTL" start "$VM_NAME"
            ;;
        stopped)
            log "Starting VM..."
            "$UTMCTL" start "$VM_NAME"
            ;;
        *)
            err "Unknown VM status: $status"
            ;;
    esac

    # Wait for IP to become available
    log "Waiting for VM network..."
    local ip=""
    local attempts=0
    while [ -z "$ip" ] && [ $attempts -lt 30 ]; do
        sleep 2
        ip=$(get_ip)
        attempts=$((attempts + 1))
    done

    if [ -z "$ip" ]; then
        err "Could not get VM IP after 60s. Check QEMU guest agent."
    fi

    log "VM IP: $ip"

    # Wait for SSH
    if [ -f "$SSH_KEY" ]; then
        if wait_for_ssh "$ip"; then
            echo "$ip"
            return 0
        else
            log "WARNING: SSH not ready. VM is running at $ip but SSH may not be configured yet."
            echo "$ip"
            return 1
        fi
    else
        log "No SSH key at $SSH_KEY — skipping SSH wait"
        echo "$ip"
        return 0
    fi
}

cmd_stop() {
    local status
    status=$(get_status)
    if [ "$status" = "stopped" ]; then
        log "VM already stopped"
        return 0
    fi
    log "Stopping VM..."
    "$UTMCTL" stop "$VM_NAME"
    # Wait for stop
    local attempts=0
    while [ "$(get_status)" != "stopped" ] && [ $attempts -lt 30 ]; do
        sleep 2
        attempts=$((attempts + 1))
    done
    if [ "$(get_status)" = "stopped" ]; then
        log "VM stopped"
    else
        err "VM did not stop within 60s"
    fi
}

cmd_suspend() {
    log "Suspending VM..."
    "$UTMCTL" suspend "$VM_NAME"
}

cmd_status() {
    get_status
}

cmd_ip() {
    local ip
    ip=$(get_ip)
    if [ -n "$ip" ]; then
        echo "$ip"
    else
        err "No IP available. Is the VM running with guest agent?"
    fi
}

cmd_ssh() {
    local ip
    ip=$(get_ip)
    if [ -z "$ip" ]; then
        err "No VM IP. Is the VM running?"
    fi
    if [ $# -gt 0 ]; then
        ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no -o ConnectTimeout=$SSH_TIMEOUT \
            "$SSH_USER@$ip" "$@"
    else
        ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$SSH_USER@$ip"
    fi
}

require_qemu_img() {
    if [ -z "$QEMU_IMG" ]; then
        err "qemu-img not found. Install with: brew install qemu"
    fi
}

cmd_snapshot() {
    require_qemu_img
    local name="$1"
    if [ -z "$name" ]; then
        err "Usage: vm-lifecycle.sh snapshot <name>"
    fi
    local status
    status=$(get_status)
    if [ "$status" != "stopped" ]; then
        err "VM must be stopped for snapshot. Current status: $status"
    fi
    if [ ! -f "$VM_DISK" ]; then
        err "Disk image not found: $VM_DISK"
    fi
    log "Creating snapshot '$name'..."
    "$QEMU_IMG" snapshot -c "$name" "$VM_DISK"
    log "Snapshot '$name' created"
}

cmd_restore() {
    require_qemu_img
    local name="$1"
    if [ -z "$name" ]; then
        err "Usage: vm-lifecycle.sh restore <name>"
    fi
    local status
    status=$(get_status)
    if [ "$status" != "stopped" ]; then
        err "VM must be stopped for restore. Current status: $status"
    fi
    if [ ! -f "$VM_DISK" ]; then
        err "Disk image not found: $VM_DISK"
    fi
    log "Restoring snapshot '$name'..."
    "$QEMU_IMG" snapshot -a "$name" "$VM_DISK"
    log "Snapshot '$name' restored"
}

cmd_snapshots() {
    require_qemu_img
    if [ ! -f "$VM_DISK" ]; then
        err "Disk image not found: $VM_DISK"
    fi
    "$QEMU_IMG" snapshot -l "$VM_DISK"
}

cmd_clone() {
    local name="$1"
    if [ -z "$name" ]; then
        err "Usage: vm-lifecycle.sh clone <name>"
    fi
    local status
    status=$(get_status)
    if [ "$status" != "stopped" ]; then
        err "VM must be stopped for clone. Current status: $status"
    fi
    log "Cloning VM as '$name'..."
    "$UTMCTL" clone "$VM_NAME" --name "$name"
    log "Clone '$name' created"
}

cmd_health() {
    echo "=== VM Health Check ==="
    local status
    status=$(get_status)
    echo "VM Status: $status"

    if [ "$status" != "started" ]; then
        echo "VM not running — skipping network checks"
        return 1
    fi

    local ip
    ip=$(get_ip)
    echo "VM IP: ${ip:-UNAVAILABLE}"

    if [ -z "$ip" ]; then
        echo "Guest agent: NOT RESPONDING"
        return 1
    fi
    echo "Guest agent: OK"

    # SSH check
    if [ -f "$SSH_KEY" ]; then
        if ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no -o ConnectTimeout=$SSH_TIMEOUT \
               -o BatchMode=yes "$SSH_USER@$ip" "echo ok" >/dev/null 2>&1; then
            echo "SSH: OK"
        else
            echo "SSH: FAILED"
        fi
    else
        echo "SSH: NO KEY ($SSH_KEY not found)"
    fi

    # DFHack RPC check (port 5000)
    if nc -z -w 2 "$ip" 5000 2>/dev/null; then
        echo "DFHack RPC (5000): LISTENING"
    else
        echo "DFHack RPC (5000): NOT AVAILABLE"
    fi

    # Bridge HTTP check (port 8888)
    if curl -sf --max-time 2 "http://$ip:8888/" >/dev/null 2>&1; then
        echo "Bridge HTTP (8888): OK"
    else
        echo "Bridge HTTP (8888): NOT AVAILABLE"
    fi
}

cmd_push() {
    local local_file="$1"
    local guest_path="$2"
    if [ -z "$local_file" ] || [ -z "$guest_path" ]; then
        err "Usage: vm-lifecycle.sh push <local-file> <guest-path>"
    fi
    if [ ! -f "$local_file" ]; then
        err "Local file not found: $local_file"
    fi
    log "Pushing $local_file → $guest_path"
    "$UTMCTL" file push "$VM_NAME" "$guest_path" < "$local_file"
    log "Push complete"
}

cmd_pull() {
    local guest_path="$1"
    if [ -z "$guest_path" ]; then
        err "Usage: vm-lifecycle.sh pull <guest-path>"
    fi
    "$UTMCTL" file pull "$VM_NAME" "$guest_path"
}

cmd_exec() {
    if [ $# -eq 0 ]; then
        err "Usage: vm-lifecycle.sh exec <command> [args...]"
    fi
    "$UTMCTL" exec "$VM_NAME" --cmd "$@"
}

# --- Main dispatch ---
case "${1:-}" in
    start)     cmd_start ;;
    stop)      cmd_stop ;;
    suspend)   cmd_suspend ;;
    status)    cmd_status ;;
    ip)        cmd_ip ;;
    ssh)       shift; cmd_ssh "$@" ;;
    snapshot)  cmd_snapshot "$2" ;;
    restore)   cmd_restore "$2" ;;
    snapshots) cmd_snapshots ;;
    clone)     cmd_clone "$2" ;;
    health)    cmd_health ;;
    push)      shift; cmd_push "$@" ;;
    pull)      shift; cmd_pull "$@" ;;
    exec)      shift; cmd_exec "$@" ;;
    *)
        echo "Usage: vm-lifecycle.sh {start|stop|suspend|status|ip|ssh|exec|push|pull|snapshot|restore|snapshots|clone|health}"
        echo ""
        echo "Commands:"
        echo "  start              Boot VM, wait for SSH, print IP"
        echo "  stop               Graceful shutdown"
        echo "  suspend            Suspend to memory"
        echo "  status             Print VM status"
        echo "  ip                 Print VM IP address"
        echo "  ssh [cmd]          SSH into VM (or run command)"
        echo "  exec <cmd...>      Execute command via QEMU guest agent"
        echo "  push <local> <guest-path>  Upload file to VM via guest agent"
        echo "  pull <guest-path>          Download file from VM via guest agent"
        echo "  snapshot <name>    Create disk snapshot (requires: brew install qemu)"
        echo "  restore <name>     Restore disk snapshot (requires: brew install qemu)"
        echo "  snapshots          List disk snapshots (requires: brew install qemu)"
        echo "  clone <name>       Clone entire VM (no qemu-img needed)"
        echo "  health             Check VM + SSH + services health"
        exit 1
        ;;
esac
