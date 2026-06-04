#!/bin/bash
# exposure-audit.sh — Nightly public endpoint exposure audit
#
# Walks the Caddyfile, enumerates public hostnames, curls each unauthenticated
# against a set of sensitive paths, compares response codes against an
# allowlist, and alerts on any unexpected 200 response.
#
# This job exists because the google-token-vault was publicly reachable with
# no auth for 13 days (2026-03-25 → 2026-04-07) and no automated check caught
# it. The audit would have caught it on day 1.
#
# Usage:
#   exposure-audit.sh              # run and alert on drift
#   exposure-audit.sh --dry-run    # run without alerting (report only)
#   exposure-audit.sh --report     # print last report
#
# Exit codes:
#   0 — audit ran, no drift
#   1 — audit ran, drift detected (alerted)
#   2 — audit failed to run (config error, caddyfile missing, etc.)
#
# Dependencies: curl, yq, jq
#
# Created: 2026-04-08 as part of security-remediation-2026-04 T3.4 (AIProjects-izlk)
# Pattern: security enforcement — fails closed, alerts loud.

set -euo pipefail

# --- Paths ---

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
JOBS_DIR="$(dirname "$SCRIPT_DIR")"
LIB_DIR="$JOBS_DIR/lib"
AIPROJECTS_DIR="$(dirname "$(dirname "$JOBS_DIR")")"
CADDYFILE="${CADDYFILE_PATH:-$HOME/Docker/mydocker/caddy/Caddyfile}"
ALLOWLIST="$AIPROJECTS_DIR/.claude/registries/public-endpoints-allowlist.yaml"
REPORT_DIR="$AIPROJECTS_DIR/.claude/data/exposure-audit"
LATEST_REPORT="$REPORT_DIR/latest.json"
DATE_STAMP="$(date +%Y-%m-%d-%H%M)"
DATED_REPORT="$REPORT_DIR/${DATE_STAMP}.json"

# --- Options ---

DRY_RUN=false
PRINT_REPORT=false
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    --report) PRINT_REPORT=true ;;
    --help|-h)
      grep '^#' "$0" | head -30 | sed 's/^# //; s/^#//'
      exit 0
      ;;
  esac
done

if [ "$PRINT_REPORT" = true ]; then
  if [ -f "$LATEST_REPORT" ]; then
    jq '.' "$LATEST_REPORT"
    exit 0
  else
    echo "No prior report found at $LATEST_REPORT" >&2
    exit 2
  fi
fi

# --- Preflight ---

mkdir -p "$REPORT_DIR"

for cmd in curl yq jq; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "ERROR: required command '$cmd' not found in PATH" >&2
    exit 2
  fi
done

if [ ! -f "$CADDYFILE" ]; then
  echo "ERROR: Caddyfile not found at $CADDYFILE" >&2
  exit 2
fi

if [ ! -f "$ALLOWLIST" ]; then
  echo "ERROR: allowlist not found at $ALLOWLIST" >&2
  exit 2
fi

# --- Parse Caddyfile for public hostnames ---
# Match lines like: foo.example.com {
# Exclude comments, internal blocks, and commented-out hostnames

parse_hostnames() {
  grep -E '^[a-z][a-z0-9.-]*\.theklyx\.space\s*\{$' "$CADDYFILE" \
    | sed -E 's/^([a-z0-9.-]+)\s*\{$/\1/' \
    | sort -u
}

HOSTNAMES="$(parse_hostnames)"

if [ -z "$HOSTNAMES" ]; then
  echo "ERROR: no public hostnames found in Caddyfile — parser regression?" >&2
  exit 2
fi

HOSTNAME_COUNT="$(echo "$HOSTNAMES" | wc -l)"

# --- Sensitive paths to probe ---
# Kept intentionally small to stay fast (<30s total for ~23 hosts).

SENSITIVE_PATHS=(
  "/"
  "/api"
  "/api/v1"
  "/api/v1/users"
  "/admin"
  "/health"
  "/login"
  "/dashboard"
  "/.env"
  "/config"
)

# --- Probe one URL ---
# Returns just the HTTP response code. Timeout-bounded.

probe() {
  local url="$1"
  curl -sS -k -o /dev/null -w '%{http_code}' \
    --max-time 8 \
    --connect-timeout 4 \
    -A "nexus-exposure-audit/1.0" \
    "$url" 2>/dev/null || echo "000"
}

# --- Check if a code is accepted for a host+path ---
#
# Resolution order:
#   1. Host-specific expected codes for this exact path (highest precedence)
#   2. Host-specific all_paths_accepted (e.g. SPA catchall)
#   3. Global default_accepted_codes

is_accepted() {
  local host="$1"
  local path="$2"
  local code="$3"

  # Host-specific expected codes for this exact path
  local expected
  expected="$(yq -r ".hostnames.\"$host\".expected.\"$path\" // [] | join(\" \")" "$ALLOWLIST" 2>/dev/null || echo "")"

  if [ -n "$expected" ]; then
    for ec in $expected; do
      if [ "$code" = "$ec" ]; then return 0; fi
    done
    return 1
  fi

  # Host-level all_paths_accepted (e.g. SPA catchall — any 200 is fine on any path)
  local all_paths
  all_paths="$(yq -r ".hostnames.\"$host\".all_paths_accepted // [] | join(\" \")" "$ALLOWLIST" 2>/dev/null || echo "")"
  if [ -n "$all_paths" ]; then
    for ec in $all_paths; do
      if [ "$code" = "$ec" ]; then return 0; fi
    done
    # Fall through to default if not in all_paths_accepted (so 500 still fails)
  fi

  # Fall back to default accepted codes
  local default_codes
  default_codes="$(yq -r '.default_accepted_codes | join(" ")' "$ALLOWLIST" 2>/dev/null || echo "401 403 404 301 302 307 308 000")"

  for ec in $default_codes; do
    if [ "$code" = "$ec" ]; then return 0; fi
  done
  return 1
}

# --- Check if a host is declared in the allowlist ---

is_declared() {
  local host="$1"
  local declared
  declared="$(yq -r ".hostnames | has(\"$host\")" "$ALLOWLIST" 2>/dev/null || echo "false")"
  [ "$declared" = "true" ]
}

# --- Run probes ---

printf '{\n' > "$DATED_REPORT"
printf '  "audit_timestamp": "%s",\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$DATED_REPORT"
printf '  "hostname_count": %s,\n' "$HOSTNAME_COUNT" >> "$DATED_REPORT"
printf '  "dry_run": %s,\n' "$DRY_RUN" >> "$DATED_REPORT"
printf '  "findings": [\n' >> "$DATED_REPORT"

DRIFT_COUNT=0
UNDECLARED_COUNT=0
FINDINGS=()
FIRST_FINDING=true

while IFS= read -r host; do
  [ -z "$host" ] && continue

  # Warn if host isn't in the allowlist at all
  if ! is_declared "$host"; then
    UNDECLARED_COUNT=$((UNDECLARED_COUNT + 1))
    FINDINGS+=("UNDECLARED: $host — new service not in allowlist, all probes using default rules")
  fi

  for path in "${SENSITIVE_PATHS[@]}"; do
    url="https://${host}${path}"
    code="$(probe "$url")"

    if ! is_accepted "$host" "$path" "$code"; then
      DRIFT_COUNT=$((DRIFT_COUNT + 1))
      FINDINGS+=("DRIFT: $url returned HTTP $code (not in allowlist)")

      if [ "$FIRST_FINDING" = false ]; then
        printf ',\n' >> "$DATED_REPORT"
      fi
      FIRST_FINDING=false
      printf '    {"type":"drift","host":"%s","path":"%s","code":"%s","url":"%s"}' \
        "$host" "$path" "$code" "$url" >> "$DATED_REPORT"
    fi
  done

  # Also record undeclared hosts as findings in the JSON
  if ! is_declared "$host"; then
    if [ "$FIRST_FINDING" = false ]; then
      printf ',\n' >> "$DATED_REPORT"
    fi
    FIRST_FINDING=false
    printf '    {"type":"undeclared","host":"%s"}' "$host" >> "$DATED_REPORT"
  fi
done <<< "$HOSTNAMES"

printf '\n  ],\n' >> "$DATED_REPORT"
printf '  "drift_count": %s,\n' "$DRIFT_COUNT" >> "$DATED_REPORT"
printf '  "undeclared_count": %s\n' "$UNDECLARED_COUNT" >> "$DATED_REPORT"
printf '}\n' >> "$DATED_REPORT"

cp "$DATED_REPORT" "$LATEST_REPORT"

# --- Report to stdout ---

echo "Exposure audit complete — $HOSTNAME_COUNT hostnames scanned"
echo "  Drift findings:     $DRIFT_COUNT"
echo "  Undeclared hosts:   $UNDECLARED_COUNT"
echo "  Report: $DATED_REPORT"

if [ ${#FINDINGS[@]} -gt 0 ]; then
  echo ""
  echo "FINDINGS:"
  for f in "${FINDINGS[@]}"; do
    echo "  - $f"
  done
fi

# --- Alert on drift ---

TOTAL_ISSUES=$((DRIFT_COUNT + UNDECLARED_COUNT))

if [ "$TOTAL_ISSUES" -eq 0 ]; then
  echo ""
  echo "✓ No drift — all public endpoints match allowlist"
  exit 0
fi

if [ "$DRY_RUN" = true ]; then
  echo ""
  echo "[DRY RUN] Would alert on $TOTAL_ISSUES issue(s), but --dry-run is set"
  exit 1
fi

# Build alert message (shortened for Telegram)
ALERT_MSG="🚨 EXPOSURE AUDIT DRIFT

$DRIFT_COUNT unexpected responses, $UNDECLARED_COUNT undeclared hosts

"
for f in "${FINDINGS[@]:0:8}"; do
  ALERT_MSG+="- $f
"
done
if [ ${#FINDINGS[@]} -gt 8 ]; then
  ALERT_MSG+="
... +$((${#FINDINGS[@]} - 8)) more
"
fi
ALERT_MSG+="
Report: $DATED_REPORT"

# Send Telegram alert (best-effort, don't fail the job if it errors)
if [ -x "$LIB_DIR/send-telegram.sh" ]; then
  "$LIB_DIR/send-telegram.sh" --message "$ALERT_MSG" 2>&1 | tail -3 || \
    echo "WARN: Telegram alert failed (see above)" >&2
fi

# Create a Pulse task for manual review
if command -v pulse &>/dev/null; then
  TASK_TITLE="Exposure audit drift ($DRIFT_COUNT drifts, $UNDECLARED_COUNT undeclared) — $(date +%Y-%m-%d)"
  TASK_DESC="Nightly exposure audit flagged $TOTAL_ISSUES issue(s).

Findings:
$(printf '  - %s\n' "${FINDINGS[@]}")

Report: $DATED_REPORT
Allowlist: $ALLOWLIST
Script: $0

To resolve:
1. Review the report and determine which findings are real drift vs. allowlist updates needed
2. For real drift (unexpected public exposure): fix the Caddyfile / service config
3. For allowlist updates (intentional exposure): update $ALLOWLIST
4. Re-run: bash $0 --dry-run to verify clean

Runs nightly at 03:00 via Nexus job 'exposure-audit'."

  pulse create "$TASK_TITLE" -t task -p 1 \
    -l "domain:security,project:nexus,source:headless,waiting:david,risk:safe,severity:high,incident:exposure-audit" \
    --description "$TASK_DESC" 2>&1 | tail -3 || \
    echo "WARN: Pulse task creation failed" >&2
fi

exit 1
