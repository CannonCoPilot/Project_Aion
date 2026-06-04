# Check for Claude Code, MCP, and watched upgrade tasks

Run the upgrade discovery workflow in two phases.

PHASE 1 — Claude Code & MCP Updates:
Check external sources (GitHub releases at
https://github.com/anthropics/claude-code/releases, documentation at
https://code.claude.com/docs/en/, Anthropic blog) for Claude
Code and MCP updates. Compare findings against the baselines in
.claude/skills/upgrade/data/baselines.json. Store any new discoveries in
.claude/skills/upgrade/data/pending-upgrades.json with proper IDs and
metadata. If you find new updates, create a Pulse task:
pulse create "Upgrade: [component] to [version]" -t task -p 2
-l "domain:infrastructure,project:aiprojects,source:headless,waiting:external"
-d "Discovered via headless upgrade-discover. Details: [release notes URL]"

IMPORTANT: After completing Phase 1, write your findings to
.claude/agent-output/results/upgrade-discovery-YYYY-MM-DD.md
before starting Phase 2. This ensures a partial report exists
even if execution hits turn limits.

PHASE 2 — Watched Upgrade Tasks:
Query Pulse for tasks waiting on external releases:
pulse list --status open --label waiting:external
For each task found:
1. Read the task description to understand what release/update is being tracked
2. Search the web for the current status of that release (version numbers,
   release dates, changelogs, compatibility notes)
3. Prepare upgrade content: release summary, breaking changes, compatibility
   with our environment, recommended migration steps
4. Update the task description with your findings using:
   pulse update <id> -d "Original: <existing description>\n\n---\n## Upgrade Research (<date>)\n<your findings>"
5. Add the waiting:david label to signal the task has been researched and needs review:
   pulse update <id> --add-label "waiting:david"
Do NOT close these tasks — they are ready for human review and implementation.

Generate a final discovery report summarizing both phases, appending
Phase 2 findings to the report file written after Phase 1.
