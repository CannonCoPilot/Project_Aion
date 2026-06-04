# Headroom Audit — Cost Ledger vs Registry Budget Analysis

Analyze the cost ledger to identify over-provisioned and under-provisioned job budgets.
Reference: `.claude/context/systems/cost-management-policy.md`

## Step 1: Load Data

Read the cost ledger and registry defaults:

```bash
# Last 200 entries from cost ledger (covers ~2 weeks at current volume)
tail -200 ${PROJECT_DIR}/.claude/data/cost-ledger.jsonl

# Registry defaults and per-job budgets
cat ${PROJECT_DIR}/.claude/jobs/registry.yaml
```

## Step 2: Compute Per-Job Statistics

For each job that appears in the cost ledger, compute:

- **Run count** — total runs in the window
- **Mean cost** — average cost per run
- **Max cost** — highest single-run cost
- **Std dev** — cost variance (coefficient of variation = stddev/mean)
- **Budget** — configured max_budget_usd (job-level or default)
- **Utilization** — max cost as % of budget
- **Cache hit ratio** — average cache_hit_ratio
- **Failure rate** — % of runs where success=false

## Step 3: Flag Issues

Apply these thresholds (from cost-management-policy.md):

### Over-provisioned (potential tightening candidates)
- Max observed cost < 20% of budget AND 100+ runs

### Approaching ceiling (risk of hitting hard cap)
- Any run exceeded 75% of budget

### Cost anomalies
- Any run cost > mean + 2*stddev (flag the specific runs)

### Low cache efficiency
- Average cache_hit_ratio < 70% (potential for prompt caching optimization)

### Router override rate
- Track % of runs where router_overridden=true per job

## Step 4: Output Report

Write a structured summary with these sections:

1. **Overview** — total runs, total cost, date range, failure rate
2. **Budget Utilization Table** — all jobs sorted by utilization % (ascending)
3. **Flagged Issues** — over-provisioned, approaching ceiling, anomalies
4. **Cache Performance** — jobs ranked by cache_hit_ratio
5. **Recommendations** — specific budget adjustment suggestions (with the caveat that budgets are monitoring ceilings, not optimization targets — reductions require 100+ runs and Sir's review)

Do NOT recommend budget reductions for jobs with fewer than 100 runs.
Do NOT recommend reducing below 2x the max observed cost (3x for high-variance jobs with CV > 1.0).

## Step 5: Record Output

Save the report to the standard output path. The executor handles file placement automatically.
