# Check if documentation needs sync with code changes

Read .claude/logs/.doc-sync-state.json (if it exists). This file is
created by the doc-sync-trigger hook and tracks code changes. If the
file exists and has 5+ changes in its "changes" array from the last
24 hours, list which documentation files may need updating. If fewer
than 5 changes, the file doesn't exist, or the changes array is empty,
simply output "No sync needed — no significant changes detected." and
stop. Do not modify any files. Do not search for alternative files.
