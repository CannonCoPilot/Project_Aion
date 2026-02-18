# Plan: Launcher Script Fix — W0 Continue + Path Corrections

## Context

The user wants to work through remaining Milestones from W0:Jarvis and needs the ability to `--continue` when Claude exits (context exhaustion, `/exit`, crash). Currently, W0's tmux window dies when Claude exits because the window's initial command IS Claude — when it exits, tmux destroys the window.

Additionally, the dev session (W5) references a stale project directory identifier (`-Users-aircannon-Claude-Jarvis`) that doesn't exist on this Mac Studio.

## Changes

### File: `/Users/nathanielcannon/Claude/Jarvis/.claude/scripts/launch-jarvis-tmux.sh`

#### 1. W0 Restart Loop (lines 190-196)

**Current**: Claude runs as the tmux window command. When it exits, window closes.

```bash
CLAUDE_CMD="claude --dangerously-skip-permissions --verbose --debug ..."
if [[ "$FRESH_MODE" != "true" ]]; then
    CLAUDE_CMD="$CLAUDE_CMD --continue"
fi
"$TMUX_BIN" new-session -d -s "$SESSION_NAME" -n "Jarvis" -c "$PROJECT_DIR" \
    "export $CLAUDE_ENV && $CLAUDE_CMD"
```

**New**: Wrap in a loop. First run uses `$CLAUDE_CMD` (fresh or --continue per mode). After exit, prompt user — Enter restarts with `--continue`, Ctrl-C exits the window.

```bash
CLAUDE_BASE="claude --dangerously-skip-permissions --verbose --debug --debug-file ..."
CLAUDE_CONTINUE="$CLAUDE_BASE --continue"

if [[ "$FRESH_MODE" != "true" ]]; then
    CLAUDE_FIRST="$CLAUDE_CONTINUE"
else
    CLAUDE_FIRST="$CLAUDE_BASE"
fi

# Build restart wrapper: first run → prompt → --continue loop
WRAPPER="export $CLAUDE_ENV && $CLAUDE_FIRST; while true; do echo ''; echo 'Claude exited. Press Enter to --continue, or Ctrl-C to close.'; read; $CLAUDE_CONTINUE; done"

"$TMUX_BIN" new-session -d -s "$SESSION_NAME" -n "Jarvis" -c "$PROJECT_DIR" "$WRAPPER"
```

#### 2. Fix Dev Session Project Dir (lines 119, 246)

**Current**: Hardcoded stale identifier.
```bash
JARVIS_DEV_SESSION_FILE="$HOME/.claude/projects/-Users-aircannon-Claude-Jarvis/${JARVIS_DEV_SESSION_ID}.jsonl"
```

**New**: Derive dynamically from `$PROJECT_DIR` to prevent future path drift.
```bash
# Derive Claude project dir from the actual working directory
CLAUDE_PROJECT_SLUG=$(echo "$PROJECT_DIR" | sed 's|^/||; s|/|-|g')
JARVIS_DEV_SESSION_FILE="$HOME/.claude/projects/-${CLAUDE_PROJECT_SLUG}/${JARVIS_DEV_SESSION_ID}.jsonl"
```

This produces `-Users-nathanielcannon-Claude-Jarvis` from `/Users/nathanielcannon/Claude/Jarvis` — matching what Claude Code actually creates. Future path changes won't require manual updates.

Both occurrences (lines 119 and 246) get the same fix. The slug computation goes near the top of the script (after `PROJECT_DIR` is set), so it's computed once and reused.

#### 3. Minor: Version Bump in Banner

Update banner from `v2.1` to `v2.2` to reflect the restart-loop addition.

## Verification

1. Run the launcher: `bash .claude/scripts/launch-jarvis-tmux.sh`
2. Verify W0 starts Claude with `--continue`
3. Exit Claude (type `/exit`)
4. Verify the window stays alive with the restart prompt
5. Press Enter — verify Claude restarts with `--continue`
6. With `--fresh` flag, verify first launch has no `--continue` but subsequent restarts do
7. With `--dev` flag, verify W5 session file path resolves correctly
