#!/usr/bin/env bash
# scripts/archon/task-create.sh
# Ergonomic wrapper around `pulse create` that auto-injects standard Archon labels.
#
# Usage: task-create.sh --archon <name> [options] <title>
#
# Required:
#   --archon <name>         Archon identifier (or set ARCHON_NAME env var)
#
# Common options:
#   --label <label>         Additional labels (repeatable)
#   --capability <cap>      Task capability (code, infra, docs, etc.)
#   --domain <domain>       Subject-matter domain (git, testing, security, etc.)
#   --risk <level>          risk:safe | risk:moderate | risk:destructive (default: risk:safe)
#   --source <id>           Source identifier within archon (default: archon-<name>)
#   --priority <1-4>        Task priority 1=urgent 4=low (default: 3)
#   --description <text>    Task body
#   --workspace <w>         Pulse workspace
#   --correlation-id <id>   Group related emissions; checks for existing open task first
#   --json                  Print full JSON response instead of just the task ID
#
# Auto-injected labels (per Archon Protocol v0 §2.2 and §4.1):
#   archon:<name>           Producer identity
#   archon-event:task-emitted
#   source:<source-id>
#
# Spec reference: .claude/context/patterns/archon-protocol-v0.md

set -euo pipefail

die()  { echo "error: $1" >&2; exit 1; }
warn() { echo "warning: $1" >&2; }

# ---- argument parsing ----
archon="${ARCHON_NAME:-}"
title=""
priority=3
source_id=""
extra_labels=()
extra_args=()  # passthrough to pulse create (--description, --workspace)
correlation_id=""
json_out=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --archon)        archon="$2";           shift 2 ;;
        --source)        source_id="$2";        shift 2 ;;
        --priority|-p)   priority="$2";         shift 2 ;;
        --label|-l)      extra_labels+=("$2");  shift 2 ;;
        --capability)    extra_labels+=("capability:$2"); shift 2 ;;
        --domain)        extra_labels+=("domain:$2");     shift 2 ;;
        --risk)          extra_labels+=("risk:$2");       shift 2 ;;
        --correlation-id) correlation_id="$2";  shift 2 ;;
        --description|-d) extra_args+=(--description "$2"); shift 2 ;;
        --workspace|-w)  extra_args+=(--workspace "$2"); shift 2 ;;
        --json)          json_out=true;          shift ;;
        --help|-h)
            sed -n '2,/^# Spec/p' "$0" | grep '^#' | sed 's/^# \?//'
            exit 0 ;;
        -*)  die "unknown option: $1" ;;
        *)   title="$1"; shift ;;
    esac
done

# ---- validate ----
[[ -n "$archon" ]] || die "archon name required (--archon <name> or \$ARCHON_NAME)"
[[ -n "$title" ]]  || die "task title required as positional argument"
echo "$archon" | grep -qE '^[a-z][a-z0-9_-]{1,63}$' \
    || die "invalid archon name '$archon': must match [a-z][a-z0-9_-]{1,63}"
command -v pulse >/dev/null || die "pulse CLI not found in PATH"

[[ -n "$source_id" ]] || source_id="archon-${archon}"

# ---- duplicate check via correlation-id ----
if [[ -n "$correlation_id" ]]; then
    existing=$(pulse list --status open --label "correlation-id:${correlation_id}" --json 2>/dev/null \
        | jq -r '.[0].id // empty' 2>/dev/null || true)
    if [[ -n "$existing" ]]; then
        warn "open task with correlation-id:${correlation_id} already exists: $existing"
        if $json_out; then
            echo "{\"id\":\"$existing\",\"duplicate\":true}"
        else
            echo "$existing"
        fi
        exit 0
    fi
fi

# ---- build standard label set ----
labels=(
    "archon:${archon}"
    "archon-event:task-emitted"
    "source:${source_id}"
)
[[ -n "$correlation_id" ]] && labels+=("correlation-id:${correlation_id}")
labels+=("${extra_labels[@]+"${extra_labels[@]}"}")

# ---- build and run pulse create ----
cmd=(pulse create "$title" --priority "$priority")
for lbl in "${labels[@]}"; do
    cmd+=(--label "$lbl")
done
cmd+=("${extra_args[@]+"${extra_args[@]}"}")
$json_out && cmd+=(--json)

result=$("${cmd[@]}") || die "pulse create failed: $result"

if $json_out; then
    echo "$result"
else
    # extract ID from result (handles plain-text output or JSON)
    task_id=$(echo "$result" | jq -r '.id // empty' 2>/dev/null || true)
    if [[ -z "$task_id" ]]; then
        # pulse create without --json prints "Created: AION-xxx" style
        task_id=$(echo "$result" | grep -oE 'AION-[0-9a-f]+' | head -1 || true)
    fi
    [[ -n "$task_id" ]] || die "could not parse task ID from: $result"
    echo "$task_id"
fi
