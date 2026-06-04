#!/usr/bin/env bash
# migrate-theme.sh — Migrate hardcoded Tailwind gray/blue colors to semantic theme variables
#
# Usage: bash scripts/migrate-theme.sh [--dry-run]
#
# Replaces gray-* surface/text/border colors and blue accent colors
# with semantic theme tokens defined in src/theme.css.
#
# SKIPS:
#   - src/lib/priorities.ts, src/lib/statuses.ts, src/lib/labels.ts
#   - src/theme.css, src/index.css
#   - Blue colors inside status/semantic maps (handled by NOT replacing blue opacity patterns)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SRC_DIR="$SCRIPT_DIR/../src"
DRY_RUN=false

if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=true
  echo "=== DRY RUN MODE ==="
fi

# Files to skip (semantic color definitions)
SKIP_FILES=(
  "src/lib/priorities.ts"
  "src/lib/statuses.ts"
  "src/lib/labels.ts"
  "src/theme.css"
  "src/index.css"
)

# Build find exclude args
EXCLUDE_ARGS=""
for f in "${SKIP_FILES[@]}"; do
  EXCLUDE_ARGS="$EXCLUDE_ARGS ! -path './$f'"
done

# Collect target files
cd "$SCRIPT_DIR/.."
TARGET_FILES=$(eval "find src -type f \( -name '*.tsx' -o -name '*.ts' \) $EXCLUDE_ARGS" | sort)

total_replacements=0

# Run a single sed replacement across all target files
# Args: $1 = pattern, $2 = replacement, $3 = description
do_replace() {
  local pattern="$1"
  local replacement="$2"
  local desc="$3"
  local count=0

  for file in $TARGET_FILES; do
    if grep -q "$pattern" "$file" 2>/dev/null; then
      local file_count
      file_count=$(grep -c "$pattern" "$file" 2>/dev/null || true)
      count=$((count + file_count))
      if [[ "$DRY_RUN" == false ]]; then
        sed -i "s/$pattern/$replacement/g" "$file"
      fi
    fi
  done

  if [[ $count -gt 0 ]]; then
    printf "  %-45s → %-30s  (%d)\n" "$desc" "$replacement" "$count"
    total_replacements=$((total_replacements + count))
  fi
}

echo ""
echo "=== Migrating Gray Surface Colors ==="
echo ""

# ORDER MATTERS: more specific first (950 before 900, etc.)
# Use word-boundary-like matching: match the class but not when followed by more digits or /
# The pattern handles variant prefixes (hover:, focus:, etc.) by matching the class itself

# bg-gray-950 → bg-surface-base
do_replace 'bg-gray-950' 'bg-surface-base' 'bg-gray-950'

# bg-gray-900 → bg-surface-1  (but NOT bg-gray-900/50 etc — handle opacity variants too)
# We replace bg-gray-900 including opacity suffixes
do_replace 'bg-gray-900' 'bg-surface-1' 'bg-gray-900 (incl /opacity)'

# bg-gray-800 → bg-surface-2
do_replace 'bg-gray-800' 'bg-surface-2' 'bg-gray-800 (incl /opacity)'

# bg-gray-700 → bg-surface-3
do_replace 'bg-gray-700' 'bg-surface-3' 'bg-gray-700'

# bg-gray-600 → bg-surface-muted
do_replace 'bg-gray-600' 'bg-surface-muted' 'bg-gray-600'

# bg-gray-500 → bg-surface-muted
do_replace 'bg-gray-500' 'bg-surface-muted' 'bg-gray-500'

echo ""
echo "=== Migrating Gray Text Colors ==="
echo ""

do_replace 'text-gray-100' 'text-primary' 'text-gray-100'
do_replace 'text-gray-200' 'text-secondary' 'text-secondary'
do_replace 'text-gray-300' 'text-tertiary' 'text-gray-300'
do_replace 'text-gray-400' 'text-muted' 'text-gray-400'
do_replace 'text-gray-500' 'text-faint' 'text-gray-500'
do_replace 'text-gray-600' 'text-disabled' 'text-gray-600'
do_replace 'text-gray-700' 'text-ghost' 'text-gray-700'

echo ""
echo "=== Migrating Gray Border Colors ==="
echo ""

do_replace 'border-gray-800' 'border-default' 'border-gray-800'
do_replace 'border-gray-700' 'border-subtle' 'border-gray-700'
do_replace 'border-gray-600' 'border-muted' 'border-gray-600'

echo ""
echo "=== Migrating Gray Divide Colors ==="
echo ""

do_replace 'divide-gray-800' 'divide-default' 'divide-gray-800'
do_replace 'divide-gray-700' 'divide-subtle' 'divide-gray-700'

echo ""
echo "=== Migrating Gray Placeholder Colors ==="
echo ""

do_replace 'placeholder-gray-600' 'placeholder-disabled' 'placeholder-gray-600'
do_replace 'placeholder-gray-500' 'placeholder-faint' 'placeholder-gray-500'

echo ""
echo "=== Migrating Gray Ring Colors ==="
echo ""

do_replace 'ring-gray-' 'ring-border-' 'ring-gray-*'

echo ""
echo "=== Migrating Blue Accent Colors (buttons, focus, inputs only) ==="
echo ""

# These are safe to replace globally — they're accent usage
# bg-blue-600 → bg-accent-hover (buttons)
do_replace 'bg-blue-600' 'bg-accent-hover' 'bg-blue-600'

# bg-blue-500 → bg-accent  (NOTE: this will also catch bg-blue-500/20 etc)
# We do NOT want to replace opacity variants like bg-blue-500/20 used in status badges
# So we replace ONLY exact bg-blue-500 (not followed by /)
# Actually, sed doesn't have lookahead. We need to be more careful.
# Replace bg-blue-500 that is NOT followed by /
# First replace bg-blue-500/ patterns with a temp marker, replace bg-blue-500, then restore
for file in $TARGET_FILES; do
  if grep -q 'bg-blue-500' "$file" 2>/dev/null; then
    if [[ "$DRY_RUN" == false ]]; then
      # Temporarily protect opacity variants
      sed -i 's/bg-blue-500\//BG_BLUE_500_OPACITY\//g' "$file"
      sed -i 's/bg-blue-500/bg-accent/g' "$file"
      # Restore opacity variants
      sed -i 's/BG_BLUE_500_OPACITY\//bg-blue-500\//g' "$file"
    fi
  fi
done
# Count for reporting
bg_blue_500_count=0
for file in $TARGET_FILES; do
  if grep -q 'bg-accent[^-]' "$file" 2>/dev/null || grep -q "bg-accent'" "$file" 2>/dev/null || grep -q 'bg-accent"' "$file" 2>/dev/null || grep -q 'bg-accent ' "$file" 2>/dev/null; then
    c=$(grep -c 'bg-accent' "$file" 2>/dev/null || true)
    bg_blue_500_count=$((bg_blue_500_count + c))
  fi
done
printf "  %-45s → %-30s  (see output)\n" "bg-blue-500 (exact, not /opacity)" "bg-accent"

# bg-blue-400 → bg-accent-light
do_replace 'bg-blue-400' 'bg-accent-light' 'bg-blue-400'

# text-blue-500 → text-accent
do_replace 'text-blue-500' 'text-accent' 'text-blue-500'

# text-blue-400 → text-accent-text
# Same issue: text-blue-400/80 should stay? Actually opacity on text is fine to migrate
do_replace 'text-blue-400' 'text-accent-text' 'text-blue-400'

# text-blue-300 → text-accent-text-light
do_replace 'text-blue-300' 'text-accent-text-light' 'text-blue-300'

# border-blue-600 → border-accent-hover
do_replace 'border-blue-600' 'border-accent-hover' 'border-blue-600'

# border-blue-500 → border-accent-border
# Same approach: protect opacity variants
for file in $TARGET_FILES; do
  if grep -q 'border-blue-500' "$file" 2>/dev/null; then
    if [[ "$DRY_RUN" == false ]]; then
      sed -i 's/border-blue-500\//BORDER_BLUE_500_OPACITY\//g' "$file"
      sed -i 's/border-blue-500/border-accent-border/g' "$file"
      sed -i 's/BORDER_BLUE_500_OPACITY\//border-blue-500\//g' "$file"
    fi
  fi
done
printf "  %-45s → %-30s  (see output)\n" "border-blue-500 (exact)" "border-accent-border"

# border-blue-400 → border-accent-border
do_replace 'border-blue-400' 'border-accent-border' 'border-blue-400'

# Ring accent
do_replace 'ring-blue-500' 'ring-accent' 'ring-blue-500'
do_replace 'ring-blue-400' 'ring-accent' 'ring-blue-400'

# focus:border-blue-500 is handled by the border-blue-500 replacement above
# focus:border-blue-600 is handled by border-blue-600 replacement above

echo ""
echo "========================================="
echo "Total replacements: ~$total_replacements+"
echo "========================================="
echo ""

if [[ "$DRY_RUN" == true ]]; then
  echo "(No files were modified — dry run)"
fi
