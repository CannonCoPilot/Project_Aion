# Review Pulse tasks and flag stale items

Review current task state using Pulse. Run:
- pulse list --status open (all open tasks)
- pulse list --status in_progress (active work)
Read .claude/context/session-state.md for current status. Identify tasks
that appear stale or that have been in_progress for a long time without
activity. Output a summary of recommendations. Do not modify any files
or tasks.
