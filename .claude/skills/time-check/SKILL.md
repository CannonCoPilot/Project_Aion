---
name: time-check
model: haiku
version: 1.0.0
description: Current date, time, and elapsed-time calculations. Consult before commenting on time passage.
---

## When to Use

- Before referencing elapsed time ("it's been X since...")
- When greeting or signing off (time-of-day awareness)
- When calculating session duration
- When timestamping entries in logs or debriefs

## Quick Reference

```bash
# Current date and time (local)
date "+%A, %B %d, %Y at %H:%M %Z"

# UTC timestamp (for logs/files)
date -u +%Y-%m-%dT%H:%M:%SZ

# Time of day category
HOUR=$(date +%H)
if [ $HOUR -ge 5 ] && [ $HOUR -lt 12 ]; then echo "morning"
elif [ $HOUR -ge 12 ] && [ $HOUR -lt 17 ]; then echo "afternoon"
elif [ $HOUR -ge 17 ] && [ $HOUR -lt 21 ]; then echo "evening"
else echo "night"; fi

# Elapsed minutes since a file was last modified
echo $(( ($(date +%s) - $(stat -f %m "$FILE" 2>/dev/null || echo $(date +%s))) / 60 ))

# Session duration (approx, from session-state.md mtime)
echo $(( ($(date +%s) - $(stat -f %m .claude/context/session-state.md 2>/dev/null || echo $(date +%s))) / 60 )) minutes
```

## Rules

- **ALWAYS** run `date` before commenting on time passage — never guess
- Use local time for user-facing output, UTC for log entries
- Include timezone in user-facing output
- For session duration, use session-state.md mtime as approximation
