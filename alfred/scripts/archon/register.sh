#!/usr/bin/env bash
# scripts/archon/register.sh
# Post an Archon registration task to Pulse (closes immediately as audit trail).
#
# Usage: register.sh <manifest.yaml>
# Output: Pulse task ID on stdout
#
# Manifest YAML fields:
#   name         (required) archon identifier, e.g. 'jarvis'
#   version      (optional) semver or build id, default '0.0.0'
#   source       (optional) source identifier, default 'archon-<name>'
#   capabilities (optional) list of capability names (from Archon Protocol v0 §3)
#   domains      (optional) list of domain names
#   emits_kinds  (optional) list of event kinds this archon emits
#
# Example manifest (archon-jarvis.yaml):
#   name: jarvis
#   version: "1.0.0"
#   capabilities: [code, infra, testing]
#   domains: [git, testing, infrastructure]
#   emits_kinds: [session-end-hook, health-check]
#
# Spec reference: .claude/context/patterns/archon-protocol-v0.md §1.2

set -euo pipefail

die()   { echo "error: $1" >&2; exit 1; }
warn()  { echo "warning: $1" >&2; }
usage() { echo "Usage: $(basename "$0") <manifest.yaml>" >&2; exit 1; }

[[ $# -eq 1 ]] || usage
manifest="$1"
[[ -f "$manifest" ]] || die "manifest not found: $manifest"

command -v yq >/dev/null  || die "yq is required (brew install yq)"
command -v jq >/dev/null  || die "jq is required (brew install jq)"
command -v pulse >/dev/null || die "pulse CLI not found in PATH"

# --- parse manifest ---
name=$(yq '.name' "$manifest")
[[ -n "$name" && "$name" != "null" ]] || die "manifest missing required field: 'name'"
echo "$name" | grep -qE '^[a-z][a-z0-9_-]{1,63}$' \
    || die "invalid name '$name': must match [a-z][a-z0-9_-]{1,63}"

version=$(yq '.version // "0.0.0"' "$manifest")
source_id=$(yq ".source // \"archon-${name}\"" "$manifest")
host=$(hostname)
registered_at=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# extract arrays as JSON (always returns valid JSON array, never null)
caps_json=$(yq -o=json '.capabilities // []' "$manifest")
doms_json=$(yq -o=json '.domains // []' "$manifest")
emits_json=$(yq -o=json '.emits_kinds // []' "$manifest")

# --- build metadata JSON for description ---
meta_json=$(jq -n \
    --arg archon "$name" \
    --arg version "$version" \
    --arg host "$host" \
    --argjson caps "$caps_json" \
    --argjson doms "$doms_json" \
    --argjson emits "$emits_json" \
    --arg registered_at "$registered_at" \
    '{archon:$archon,version:$version,host:$host,manifest:{capabilities:$caps,domains:$doms,emits_kinds:$emits},registered_at:$registered_at}')

description="## Archon Registration Metadata
\`\`\`json
${meta_json}
\`\`\`"

# --- build label list ---
labels=(
    "archon:${name}"
    "archon:registration"
    "source:${source_id}"
    "risk:safe"
    "archon-version:v0"
)

while IFS= read -r cap; do
    [[ -n "$cap" ]] && labels+=("capability:${cap}")
done < <(echo "$caps_json" | jq -r '.[]' 2>/dev/null || true)

while IFS= read -r dom; do
    [[ -n "$dom" ]] && labels+=("domain:${dom}")
done < <(echo "$doms_json" | jq -r '.[]' 2>/dev/null || true)

# --- build and run pulse create ---
title="[archon:${name}] Registration"
cmd=(pulse create "$title" --priority 3 --json --description "$description")
for lbl in "${labels[@]}"; do
    cmd+=(--label "$lbl")
done

result=$("${cmd[@]}") || die "pulse create failed: $result"
task_id=$(echo "$result" | jq -r '.id // empty')
[[ -n "$task_id" ]] || die "could not parse task ID from pulse response: $result"

# close immediately — registration tasks are audit-trail only
pulse close "$task_id" --reason "auto-registration complete" >/dev/null 2>&1 \
    || warn "could not close registration task $task_id (task was still created)"

echo "$task_id"
