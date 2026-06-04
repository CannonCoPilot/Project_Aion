# AudioBookShelf library cleanup and naming enforcement

Scan the AudioBooks library at /mnt/synology_nas/AudioBooks/ for new files
since last run. Use state file .claude/jobs/state/abs-librarian-last-check.timestamp
with find -newer for change detection.

Your permission profile for this run is specified in the Parameters section
below (defaults to "standard" if not provided). Check your persona's
Permission Profiles table to see which action types you may auto-fix.

Follow your persona workflow steps in order:
1. Detect new files (find -newer state file). If none, update timestamp and exit.
2. Scan & classify all issues with action types (delete-junk, delete-empty,
   delete-partial, rename-safe, restructure, sort-loose, delete-content, transform).
3. For each issue: dedup against existing Pulse tasks, create a new task with
   the action:<type> label, then auto-fix + close if the action is within your
   current permission profile, or leave open if not.
4. If any changes were made, trigger ABS library scan via API.
5. Update state timestamp and write summary report (auto-fixed, queued, skipped).
