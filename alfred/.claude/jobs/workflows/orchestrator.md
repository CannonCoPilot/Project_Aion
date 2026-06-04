# Orchestrator — Classify, route, and sequence all pipeline tasks

Run the Orchestrator routing workflow as defined in your persona prompt.

Check your Parameters section below for `dry_run`. If `dry_run=true`, log all decisions but DO NOT mutate any labels or task state.

1. Load context: Read routing-rules.yaml, risk-policy.yaml, nexus-settings.json
2. Process stage:intake queue: classify each task, apply routing rules, assign personas
3. Process stage:done queue: check for follow-ups, advance parents, close completed work
4. Write decision log to .claude/agent-output/results/orchestrator/decisions-YYYY-MM-DD.jsonl
5. Write summary report

CRITICAL: Log EVERY routing decision with classification, method (deterministic/llm), and reasoning.
Deterministic rules first — only use LLM for tasks with no matching rule.
