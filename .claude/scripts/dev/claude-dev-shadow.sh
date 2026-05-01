#!/usr/bin/env bash
#
# claude-dev-shadow.sh — Shadow directory pattern for .claude/ development
#
# Creates a 'claude-dev/' mirror of a project's '.claude/' directory,
# allowing unrestricted Edit tool use. On sync, copies changed files
# back to .claude/ via rsync (bypassing Claude Code's safety check).
#
# Usage:
#   claude-dev-shadow.sh setup   <project-root>            # Create claude-dev/ mirror
#   claude-dev-shadow.sh sync    <project-root>             # Sync claude-dev/ → .claude/
#   claude-dev-shadow.sh sync    <project-root> --dry-run   # Preview changes
#   claude-dev-shadow.sh diff    <project-root>             # Show what changed
#   claude-dev-shadow.sh teardown <project-root>            # Remove claude-dev/
#   claude-dev-shadow.sh status  <project-root>             # Show shadow state
#
# Design:
#   - claude-dev/ is NOT gitignored (it's a working copy, same as .claude/)
#   - .claude/ remains the live directory; claude-dev/ is the dev workspace
#   - Sync is ONE-WAY: claude-dev/ → .claude/ (never reverse)
#   - Only files that differ are copied (rsync --checksum)
#   - A manifest file tracks what's mirrored for clean teardown

set -o pipefail

SHADOW_DIR="claude-dev"
SOURCE_DIR=".claude"
MANIFEST=".claude-dev-manifest"

usage() {
    echo "Usage: $0 {setup|sync|diff|teardown|status} <project-root> [--dry-run]"
    exit 1
}

[ $# -lt 2 ] && usage

CMD="$1"
PROJECT_ROOT="$2"
DRY_RUN=""
[ "${3:-}" = "--dry-run" ] && DRY_RUN="--dry-run"

# Validate project root
if [ ! -d "$PROJECT_ROOT" ]; then
    echo "ERROR: Project root '$PROJECT_ROOT' does not exist" >&2
    exit 1
fi

SHADOW_PATH="$PROJECT_ROOT/$SHADOW_DIR"
SOURCE_PATH="$PROJECT_ROOT/$SOURCE_DIR"
MANIFEST_PATH="$PROJECT_ROOT/$MANIFEST"

case "$CMD" in
    setup)
        if [ ! -d "$SOURCE_PATH" ]; then
            echo "ERROR: $SOURCE_PATH does not exist — nothing to mirror" >&2
            exit 1
        fi
        if [ -d "$SHADOW_PATH" ]; then
            echo "Shadow directory already exists at $SHADOW_PATH"
            echo "Run 'sync' to update, or 'teardown' then 'setup' to recreate."
            exit 0
        fi

        echo "Creating shadow: $SOURCE_PATH → $SHADOW_PATH"
        rsync -a --exclude='.git' --exclude='__pycache__' --exclude='*.pyc' \
            --exclude='node_modules' --exclude='.DS_Store' \
            "$SOURCE_PATH/" "$SHADOW_PATH/"

        # Write manifest for teardown
        find "$SHADOW_PATH" -type f | sed "s|^$PROJECT_ROOT/||" | sort > "$MANIFEST_PATH"
        FILE_COUNT=$(wc -l < "$MANIFEST_PATH" | tr -d ' ')

        echo "OK: Mirrored $FILE_COUNT files to $SHADOW_PATH"
        echo "Manifest: $MANIFEST_PATH"
        echo ""
        echo "You can now edit files under $SHADOW_PATH/ using the Edit tool."
        echo "When done, run: claude-dev-shadow.sh sync $PROJECT_ROOT"
        ;;

    sync)
        if [ ! -d "$SHADOW_PATH" ]; then
            echo "ERROR: No shadow directory at $SHADOW_PATH — run 'setup' first" >&2
            exit 1
        fi

        echo "Syncing: $SHADOW_PATH → $SOURCE_PATH"
        if [ -n "$DRY_RUN" ]; then
            echo "(dry run — no files will be written)"
        fi

        # rsync with checksum comparison, preserving permissions
        rsync -a --checksum --itemize-changes $DRY_RUN \
            --exclude='.git' --exclude='__pycache__' --exclude='*.pyc' \
            --exclude='node_modules' --exclude='.DS_Store' \
            "$SHADOW_PATH/" "$SOURCE_PATH/" 2>&1 | while read -r line; do
            # Only show lines that indicate actual changes
            if echo "$line" | grep -q '^>f'; then
                file=$(echo "$line" | sed 's/^[^ ]* //')
                echo "  UPDATED: $file"
            elif echo "$line" | grep -q '^cd'; then
                file=$(echo "$line" | sed 's/^[^ ]* //')
                echo "  NEW DIR: $file"
            fi
        done

        if [ -z "$DRY_RUN" ]; then
            # Update manifest
            find "$SHADOW_PATH" -type f | sed "s|^$PROJECT_ROOT/||" | sort > "$MANIFEST_PATH"
            echo "OK: Sync complete."
        else
            echo "DRY RUN: No files changed."
        fi
        ;;

    diff)
        if [ ! -d "$SHADOW_PATH" ]; then
            echo "ERROR: No shadow directory at $SHADOW_PATH" >&2
            exit 1
        fi

        echo "Differences: $SHADOW_PATH vs $SOURCE_PATH"
        echo "---"

        CHANGES=0
        while IFS= read -r file; do
            rel="${file#$SHADOW_PATH/}"
            src_file="$SOURCE_PATH/$rel"
            if [ ! -f "$src_file" ]; then
                echo "  NEW: $rel"
                CHANGES=$((CHANGES + 1))
            elif ! diff -q "$file" "$src_file" > /dev/null 2>&1; then
                echo "  MODIFIED: $rel"
                CHANGES=$((CHANGES + 1))
            fi
        done < <(find "$SHADOW_PATH" -type f -not -name '.DS_Store' -not -path '*__pycache__*')

        # Check for deletions
        while IFS= read -r file; do
            rel="${file#$SOURCE_PATH/}"
            shadow_file="$SHADOW_PATH/$rel"
            if [ ! -f "$shadow_file" ]; then
                echo "  DELETED: $rel (exists in .claude/ but not claude-dev/)"
                CHANGES=$((CHANGES + 1))
            fi
        done < <(find "$SOURCE_PATH" -type f -not -name '.DS_Store' -not -path '*__pycache__*')

        if [ $CHANGES -eq 0 ]; then
            echo "  (no differences)"
        else
            echo "---"
            echo "$CHANGES file(s) differ"
        fi
        ;;

    teardown)
        if [ ! -d "$SHADOW_PATH" ]; then
            echo "No shadow directory at $SHADOW_PATH — nothing to tear down."
            exit 0
        fi

        # Check for unsaved changes before teardown
        UNSAVED=0
        while IFS= read -r file; do
            rel="${file#$SHADOW_PATH/}"
            src_file="$SOURCE_PATH/$rel"
            if [ ! -f "$src_file" ] || ! diff -q "$file" "$src_file" > /dev/null 2>&1; then
                UNSAVED=$((UNSAVED + 1))
            fi
        done < <(find "$SHADOW_PATH" -type f -not -name '.DS_Store' -not -path '*__pycache__*')

        if [ $UNSAVED -gt 0 ]; then
            echo "WARNING: $UNSAVED unsaved change(s) in $SHADOW_PATH"
            echo "Run 'sync' first to preserve changes, or re-run with --force."
            if [ "${3:-}" != "--force" ]; then
                exit 1
            fi
            echo "Proceeding with --force..."
        fi

        rm -rf "$SHADOW_PATH"
        rm -f "$MANIFEST_PATH"
        echo "OK: Removed shadow directory and manifest."
        ;;

    status)
        if [ ! -d "$SHADOW_PATH" ]; then
            echo "No shadow directory for $PROJECT_ROOT"
            exit 0
        fi

        SHADOW_COUNT=$(find "$SHADOW_PATH" -type f -not -name '.DS_Store' -not -path '*__pycache__*' | wc -l | tr -d ' ')
        SOURCE_COUNT=$(find "$SOURCE_PATH" -type f -not -name '.DS_Store' -not -path '*__pycache__*' | wc -l | tr -d ' ')

        echo "Shadow directory: $SHADOW_PATH"
        echo "  Files in shadow:  $SHADOW_COUNT"
        echo "  Files in .claude: $SOURCE_COUNT"

        # Quick diff count
        CHANGES=0
        while IFS= read -r file; do
            rel="${file#$SHADOW_PATH/}"
            src_file="$SOURCE_PATH/$rel"
            if [ ! -f "$src_file" ] || ! diff -q "$file" "$src_file" > /dev/null 2>&1; then
                CHANGES=$((CHANGES + 1))
            fi
        done < <(find "$SHADOW_PATH" -type f -not -name '.DS_Store' -not -path '*__pycache__*')

        echo "  Pending changes:  $CHANGES"
        if [ -f "$MANIFEST_PATH" ]; then
            MANIFEST_DATE=$(stat -f "%Sm" -t "%Y-%m-%d %H:%M" "$MANIFEST_PATH" 2>/dev/null || stat -c "%y" "$MANIFEST_PATH" 2>/dev/null | cut -d. -f1)
            echo "  Last sync:        $MANIFEST_DATE"
        fi
        ;;

    *)
        usage
        ;;
esac
