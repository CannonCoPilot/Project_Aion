# LLM review of pipeline watchdog actions — pattern analysis, rule recommendations, upstream fix suggestions

Run the pipeline review workflow as described in your persona prompt.

Key files to read for context:
- .claude/data/pipeline-health.jsonl (watchdog output — your primary input)
- .claude/context/tools/label-taxonomy.yaml (canonical label rules)
- .claude/context/systems/stage-lifecycle.md (stage definitions)
- .claude/jobs/lib/routing-rules.yaml (routing decisions)
- .claude/context/systems/workflow-inventory.md (task paths)

Write your review report to:
  .claude/agent-output/results/pipeline-reviewer/<timestamp>.json

If you find critical patterns (watchdog making wrong fixes, infinite loops,
systematic bad label states from a persona), escalate via QUESTION.
