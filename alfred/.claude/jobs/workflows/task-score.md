# Score unlabeled open tasks with auto:/risk: labels and fix contradictions

Score unlabeled Pulse tasks with automation routing labels.

REFERENCE: Read .claude/context/tools/pulse-reference.md for the full label
taxonomy, automation readiness definitions, and risk levels. This is the
single source of truth — follow it exactly.

Step 1: Find unlabeled tasks
  pulse list --status open
Filter to tasks missing ALL of: auto:*, waiting:*, parked labels.
If none found, write minimal report and exit.

Step 2: Score each task (max 20 per run) using these rules in priority order:
  1. aurora:building/delivered without aurora:approved → waiting:david
  2. agent:human → waiting:david
  3. type:idea → waiting:david (needs human creative judgment)
  4. recurring:* monitoring tasks → waiting:david (human judgment each cycle)
  5. type:research → auto:candidate (task-research pipeline may handle)
  6. source:headless + deterministic action → auto:candidate
  7. Needs design/planning/multi-service → waiting:david
  8. Default when uncertain → waiting:david (false negatives are safe)

For risk: labels, apply when missing:
  - Single file rename, junk deletion, metadata → risk:safe
  - Multi-file edits, config changes, restructuring → risk:moderate
  - Content deletion, git push, Docker, API calls → risk:destructive

Step 3: Fix contradictory labels
  Find tasks with BOTH auto:ready AND waiting:david → remove auto:ready
  Find tasks with BOTH auto:candidate AND waiting:david → remove auto:candidate

Step 4: Apply labels
  pulse label add <id> "auto:<level>" for each scored task
  pulse label add <id> "risk:<level>" if missing

Step 5: Write JSON report to .claude/agent-output/results/task-score/YYYY-MM-DD.json:
  { "date": "...", "scored": N, "contradictions_fixed": N, "results": [...] }

SAFETY: Only add/remove labels. Never modify task status, description,
or close tasks. Never create new tasks.
