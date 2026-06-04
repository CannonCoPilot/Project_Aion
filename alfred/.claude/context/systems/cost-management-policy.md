# Nexus Cost Management Policy

**Status**: Active
**Created**: 2026-03-26
**Applies to**: All Nexus jobs defined in `registry.yaml`

---

## Budget Philosophy

Budgets in `registry.yaml` are **monitoring ceilings**, not optimization targets. They exist to:

1. **Prevent runaway spend** — hard cap so a confused LLM can't loop indefinitely
2. **Establish a cost envelope** — know the maximum possible daily/weekly spend
3. **Collect baseline data** — intentionally generous budgets let the cost ledger capture true cost distributions before tightening

Budgets should NOT be lowered until there is sufficient data to establish safe ceilings. Premature optimization risks killing jobs mid-execution on legitimate high-complexity tasks.

### When to Tighten a Budget

A budget is eligible for reduction when ALL of these conditions are met:

- **100+ recorded runs** for that job in `cost-ledger.jsonl`
- **Max observed cost < 50% of budget** across the last 30 days
- **No upward trend** in cost over the observation window
- **Sir has reviewed** the recommendation (headroom-audit produces the data, human decides)

Even when eligible, maintain a **minimum 2x safety margin** over max observed cost. High-variance jobs (CV > 1.0) get a **3x margin**.

---

## Cost Cap Tiers

Three severity tiers for cost monitoring, evaluated per-run:

| Tier | Threshold | Action |
|------|-----------|--------|
| **Normal** | < 50% of budget | No action |
| **Elevated** | 50-75% of budget | Log as INFO in cost-ledger — headroom-audit flags these |
| **Warning** | 75-100% of budget | Log as WARNING — headroom-audit includes in summary |
| **Hard cap** | 100% of budget | Claude Code enforces — execution stops |

Note: The hard cap is enforced by Claude Code's `--max-cost` parameter, not by executor.sh. Executor passes `max_budget_usd` from registry to the CLI invocation.

---

## Budget Defaults and Overrides

### Resolution Order

```
CLI --budget-override > nexus-settings.json job_overrides > registry.yaml per-job > registry.yaml defaults
```

### Default: $2.00 (registry.yaml)

Appropriate for most monitoring, maintenance, and lightweight analysis jobs. Jobs that need more must declare it explicitly with a comment explaining why.

### Per-Job Override Conventions

When setting a per-job budget, document the rationale:

```yaml
max_budget_usd: 25.00  # High ceiling — task-executor handles heterogeneous work, $8.58 max observed (2026-03-26)
```

### Runtime Overrides (nexus-settings.json)

The `job_overrides` section in `nexus-settings.json` can override budgets at runtime. These are temporary and should include an expiration note. The dashboard recurring-jobs API can set these.

---

## Headroom Audit

A scheduled Nexus job (`headroom-audit`, weekly) that parses `cost-ledger.jsonl` against `registry.yaml` limits and produces a summary report.

### What It Checks

1. **Over-provisioned budgets** — jobs where max observed cost < 20% of budget (potential tightening candidates)
2. **Approaching ceilings** — jobs where any run exceeded 75% of budget (risk of hitting hard cap)
3. **Cost trends** — week-over-week changes per job (rising costs may indicate prompt drift or increased task complexity)
4. **Cache efficiency** — jobs with cache hit ratio < 70% (potential for prompt caching optimization)
5. **Router override rate** — jobs where the LLM router is frequently overridden (may indicate stale routing data)

### Output

Summary report written to `agent-output/results/headroom-audit/`. Delivered via dashboard notification (severity: info unless warning-tier issues found).

### Cadence

- **Weekly** (Sunday 6 AM) — standard
- **On model release** — manual trigger via `dispatcher.sh --run headroom-audit` when a new Claude model drops
- **On budget change** — run after any registry.yaml budget adjustment to establish new baseline

---

## Anomaly Detection

A run is flagged as anomalous if its cost exceeds **mean + 2 standard deviations** for that job (computed from the last 50 runs). Anomalies are:

- Logged as WARNING in the cost-ledger entry
- Included in the next headroom-audit summary
- NOT escalated to Telegram (anomalies are expected for high-variance jobs like task-executor)

Persistent anomalies (3+ in a 24-hour window for the same job) ARE escalated to dashboard as a warning notification.

---

## Cost Ledger Reference

**File**: `.claude/data/cost-ledger.jsonl`
**Written by**: `executor.sh` (post-execution block)
**Format**: JSONL, one entry per job run

```json
{
  "ts": "2026-03-26T15:51:57Z",
  "job": "ai-david",
  "model": "sonnet",
  "engine": "claude-code",
  "cost": 1.002,
  "input_tokens": 45000,
  "output_tokens": 3200,
  "cache_read_tokens": 41000,
  "cache_creation_tokens": 2000,
  "cache_hit_ratio": 0.952,
  "duration_s": 45,
  "success": true,
  "router_model": "sonnet",
  "router_overridden": false
}
```

---

## Cross-References

| What | Where |
|------|-------|
| Budget defaults | `registry.yaml` → `defaults.max_budget_usd` |
| Per-job budgets | `registry.yaml` → `jobs.<name>.max_budget_usd` |
| Runtime overrides | `nexus-settings.json` → `job_overrides.<name>.max_budget_usd` |
| Cost ledger (raw data) | `.claude/data/cost-ledger.jsonl` |
| Executor budget handling | `executor.sh` (passes to `claude --max-cost`) |
| Pipeline cost cap | `nexus-settings.json` → `pipeline_runner.max_dispatches_per_hour` |
| Cost report utility | `.claude/jobs/lib/cost-report.sh` |
| LLM router pricing | Pulse `llm-router-config` setting |
| Headroom audit job | `registry.yaml` → `jobs.headroom-audit` |
