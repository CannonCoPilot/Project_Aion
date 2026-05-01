#!/bin/bash
# token-compression-reminder.sh — one-shot reminder for Phase 1 manual capture.
# Fires a macOS notification, opens the task description, then self-removes
# the LaunchAgent so it doesn't fire again next year.

set -u

LABEL="com.aion.token-compression-reminder"
PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"
TASK_DOC="/Users/nathanielcannon/Claude/Jarvis/.claude/metrics/token-compression/manual-capture-task.md"
LOG="/Users/nathanielcannon/Claude/Jarvis/.claude/logs/token-compression-reminder.log"

echo "[$(date)] Reminder fired" >> "$LOG"

# macOS notification — visible in Notification Center
/usr/bin/osascript -e 'display notification "Capture cache-telemetry + commit before 9pm. See manual-capture-task.md (opening now)." with title "Token-compression Phase 1 — Reminder" subtitle "12 hours until remote verification fires" sound name "Glass"' >> "$LOG" 2>&1

# Open the task description in the default markdown viewer
if [ -f "$TASK_DOC" ]; then
    /usr/bin/open "$TASK_DOC" >> "$LOG" 2>&1
fi

# Self-remove: unload the LaunchAgent and delete the plist
sleep 2  # let the notification render before unload
/bin/launchctl bootout "gui/$(/usr/bin/id -u)/${LABEL}" 2>>"$LOG" || true
/bin/rm -f "$PLIST" >> "$LOG" 2>&1
echo "[$(date)] Self-removed plist" >> "$LOG"
