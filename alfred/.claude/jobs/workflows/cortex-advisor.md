# Cortex Advisor — Weekly Learning Health Analysis

Run your full analysis workflow (Steps 1-7 from your persona prompt).

Focus on:
1. Load system state from Cortex API endpoints
2. Check for prior recommendations to avoid duplicates
3. Analyze coverage, failures, and drift
4. Generate prioritized recommendations
5. Write run report

Quality level: **standard** (full analysis across all dimensions).

Output files:
- Recommendations: `.claude/agent-output/results/cortex/recommendations.jsonl` (append)
- Report: `.claude/agent-output/results/cortex/report-YYYY-MM-DD.json`
