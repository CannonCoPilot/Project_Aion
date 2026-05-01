#!/bin/sh
# apply-cod.sh — Chain of Draft System Prompt Injector
#
# Prepends the CoD instruction block to a target system prompt file,
# then records a metrics entry to metrics/log.json.
#
# Usage: apply-cod.sh [OPTIONS] <target-prompt-file>
#
# Options:
#   --template <path>   Path to CoD template (default: templates/chain-of-draft.txt)
#   --dry-run           Print result without modifying target file
#   --force             Overwrite even if CoD marker already present
#   --log <path>        Metrics log path (default: metrics/log.json)
#   --task-id <id>      Task ID for metrics log (optional)
#   --help              Show this help and exit
#
# Exit codes:
#   0  success
#   1  argument / file error
#   2  already applied (use --force to override)
#
# Version: 1.0.0

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILL_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

TEMPLATE="${SKILL_ROOT}/templates/chain-of-draft.txt"
LOG_PATH="${SKILL_ROOT}/metrics/log.json"
DRY_RUN=0
FORCE=0
TASK_ID=""
TARGET=""

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------

while [ $# -gt 0 ]; do
    case "$1" in
        --template)  TEMPLATE="$2"; shift 2 ;;
        --dry-run)   DRY_RUN=1; shift ;;
        --force)     FORCE=1; shift ;;
        --log)       LOG_PATH="$2"; shift 2 ;;
        --task-id)   TASK_ID="$2"; shift 2 ;;
        --help)
            sed -n '/^# Usage/,/^# Version/p' "$0"
            exit 0 ;;
        -*)
            echo "[apply-cod] Unknown option: $1" >&2
            exit 1 ;;
        *)
            TARGET="$1"; shift ;;
    esac
done

if [ -z "${TARGET}" ]; then
    echo "[apply-cod] ERROR: No target prompt file specified." >&2
    exit 1
fi

if [ ! -f "${TEMPLATE}" ]; then
    echo "[apply-cod] ERROR: Template not found: ${TEMPLATE}" >&2
    exit 1
fi

if [ ! -f "${TARGET}" ]; then
    echo "[apply-cod] ERROR: Target file not found: ${TARGET}" >&2
    exit 1
fi

# ---------------------------------------------------------------------------
# Check if CoD already applied
# ---------------------------------------------------------------------------

COD_MARKER="Chain of Draft"

if grep -q "${COD_MARKER}" "${TARGET}" 2>/dev/null; then
    if [ "${FORCE}" -eq 0 ]; then
        echo "[apply-cod] CoD already present in ${TARGET}. Use --force to override." >&2
        exit 2
    else
        echo "[apply-cod] WARNING: CoD marker found — overwriting due to --force" >&2
    fi
fi

# ---------------------------------------------------------------------------
# Measure token sizes (approximate: 1 token ≈ 4 chars)
# ---------------------------------------------------------------------------

template_chars=$(wc -c < "${TEMPLATE}" | tr -d ' ')
target_chars_before=$(wc -c < "${TARGET}" | tr -d ' ')
template_tokens=$(( template_chars / 4 ))
target_tokens_before=$(( target_chars_before / 4 ))

# ---------------------------------------------------------------------------
# Apply template
# ---------------------------------------------------------------------------

TIMESTAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

if [ "${DRY_RUN}" -eq 1 ]; then
    echo "=== DRY RUN: Would prepend the following to ${TARGET} ==="
    cat "${TEMPLATE}"
    echo ""
    echo "=== End of template ==="
    echo "[apply-cod] Dry run complete. No files modified."
    exit 0
fi

# Create temp file with template prepended
TMPFILE="$(mktemp /tmp/apply-cod-XXXXXX)"
cat "${TEMPLATE}" > "${TMPFILE}"
printf '\n\n---\n\n' >> "${TMPFILE}"
cat "${TARGET}" >> "${TMPFILE}"
mv "${TMPFILE}" "${TARGET}"

target_chars_after=$(wc -c < "${TARGET}" | tr -d ' ')
target_tokens_after=$(( target_chars_after / 4 ))
added_tokens=$(( target_tokens_after - target_tokens_before ))

echo "[apply-cod] Applied CoD template to: ${TARGET}"
echo "[apply-cod] Template tokens added: ~${template_tokens}"
echo "[apply-cod] Prompt size before: ~${target_tokens_before} tokens"
echo "[apply-cod] Prompt size after:  ~${target_tokens_after} tokens"

# ---------------------------------------------------------------------------
# Log metrics entry
# ---------------------------------------------------------------------------

mkdir -p "$(dirname "${LOG_PATH}")"

python3 - << PYEOF
import json, os, datetime

log_path = "${LOG_PATH}"
entry = {
    "timestamp": "${TIMESTAMP}",
    "operation": "apply-cod",
    "target_file": "${TARGET}",
    "template_file": "${TEMPLATE}",
    "task_id": "${TASK_ID}" or None,
    "tokens_before": ${target_tokens_before},
    "tokens_after": ${target_tokens_after},
    "tokens_added": ${added_tokens},
    "template_tokens": ${template_tokens},
    "version": "1.0.0"
}

if os.path.exists(log_path) and os.path.getsize(log_path) > 0:
    with open(log_path, "r") as f:
        try:
            data = json.load(f)
        except json.JSONDecodeError:
            data = {"entries": []}
else:
    data = {"entries": []}

data["entries"].append(entry)
data["last_updated"] = "${TIMESTAMP}"

with open(log_path, "w") as f:
    json.dump(data, f, indent=2)

print(f"[apply-cod] Metrics logged to: ${LOG_PATH}")
PYEOF
