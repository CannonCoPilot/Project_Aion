# Weekly Digest

Generate a weekly summary of Nexus job activity, costs, and outcomes.

## Instructions

1. Read the cost ledger and job execution logs from the past 7 days
2. Summarize:
   - Total jobs run, success/failure counts
   - Total API cost for the week
   - Top 3 most expensive jobs
   - Any recurring failures or anomalies
   - Notable outcomes or decisions made
3. Format as a concise report suitable for Telegram delivery
4. If costs exceed the weekly budget threshold, flag it prominently

## Output Format

```
Weekly Digest — {date range}

Jobs: {total} run ({success} OK, {failed} failed)
Cost: ${total} (budget: ${budget})

Top Costs:
1. {job} — ${cost}
2. {job} — ${cost}
3. {job} — ${cost}

{anomalies if any}
```
