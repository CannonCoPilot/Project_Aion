---
description: Token usage analytics — daily, monthly, billing blocks, session limits
allowed-tools: Bash(npx:*), Bash(jq:*), Bash(cat:*), Bash(date:*), Read
---

# Usage Dashboard

Display token usage analytics from ccusage and cmonitor data.

**Argument**: `$ARGUMENTS` (optional: `today`, `daily`, `monthly`, `blocks`, `browser`)

## Execution

### 1. Determine View

Parse the argument to determine which view to show:

| Argument | View |
|----------|------|
| (empty) or `today` | Today's usage + active billing block |
| `daily` | Last 7 days breakdown |
| `monthly` | Monthly totals with model breakdown |
| `blocks` | Active and recent billing blocks |
| `browser` | Launch claude-spend browser dashboard |

### 2. Gather Data

**For `today` view** — run both commands in parallel:

```bash
# Today's daily data + active block
/Users/nathanielcannon/.nvm/versions/node/v24.13.1/bin/npx ccusage@latest daily --json 2>/dev/null
```

```bash
# Active block from cache (fast, no npx latency)
cat /Users/nathanielcannon/Claude/Jarvis/.claude/context/.ccusage-blocks.json 2>/dev/null
```

Extract today's entry from the daily JSON: `.daily[-1]` (last entry is today).
Extract active block from blocks JSON: `.blocks[] | select(.isActive==true)`.

**For `daily` view**:

```bash
/Users/nathanielcannon/.nvm/versions/node/v24.13.1/bin/npx ccusage@latest daily --json 2>/dev/null
```

Use `.daily[-7:]` for last 7 days and `.totals` for the aggregate.

**For `monthly` view**:

```bash
/Users/nathanielcannon/.nvm/versions/node/v24.13.1/bin/npx ccusage@latest monthly --json 2>/dev/null
```

Use `.monthly` for per-month data and `.totals` for the aggregate.

**For `blocks` view**:

```bash
/Users/nathanielcannon/.nvm/versions/node/v24.13.1/bin/npx ccusage@latest blocks --json 2>/dev/null
```

Use `.blocks[-5:]` for the 5 most recent blocks. Highlight the active one.

**For `browser` view**:

```bash
/Users/nathanielcannon/.nvm/versions/node/v24.13.1/bin/npx claude-spend --port 3456 --no-open &
echo "Dashboard running at http://localhost:3456"
```

Then report the URL — no further data processing needed.

### 3. Format Output

Present the data as a markdown report. Use this format for each view:

#### Today View

```markdown
## Usage Report — Today ($DATE)

### Active Billing Block
| Metric | Value |
|--------|-------|
| Block Start | $START_TIME |
| Time Remaining | $REMAINING |
| Block Cost | $$COST |
| Burn Rate | $$RATE/hr |

### Today's Usage
| Metric | Value |
|--------|-------|
| Total Tokens | $TOKENS (formatted with commas) |
| Total Cost | $$COST |
| Input Tokens | $INPUT |
| Output Tokens | $OUTPUT |
| Cache Read | $CACHE_READ |
| Models Used | $MODELS |
```

#### Daily View

```markdown
## Usage Report — Last 7 Days

| Date | Tokens | Cost | Models |
|------|--------|------|--------|
| 2026-02-19 | 23.3M | $14.97 | opus-4-6, sonnet-4-6 |
| ... | ... | ... | ... |

**7-Day Total**: $TOKENS tokens, $$COST
```

Format large token counts with SI suffixes (23.3M, 59.9M, etc.) for readability.

#### Monthly View

```markdown
## Usage Report — Monthly

| Month | Tokens | Cost | Top Model |
|-------|--------|------|-----------|
| 2026-01 | 874.7M | $787.85 | opus-4-5 |
| 2026-02 | 936.6M | $790.71 | opus-4-6 |

**All-Time Total**: $TOTAL_TOKENS tokens, $$TOTAL_COST

### Model Breakdown (Current Month)
| Model | Cost | % of Total |
|-------|------|-----------|
| opus-4-6 | $648.92 | 82.1% |
| ... | ... | ... |
```

#### Blocks View

```markdown
## Billing Blocks — Recent

| # | Start | End | Cost | Tokens | Models | Status |
|---|-------|-----|------|--------|--------|--------|
| 1 | Feb 19 09:00 | Feb 19 14:00 | $14.97 | 23.3M | opus-4-6 | **ACTIVE** |
| ... | ... | ... | ... | ... | ... | ... |
```

### 4. Formatting Rules

- Token counts: Use SI suffixes — `1,234` below 10K, `23.3M` for millions, `874.7M` for hundreds of millions
- Costs: Always `$X.XX` format
- Times: Local timezone (America/Denver), `MMM DD HH:MM` format
- Models: Shorten names — `claude-opus-4-6` → `opus-4-6`, `claude-haiku-4-5-20251001` → `haiku-4.5`
- Active blocks: Bold or mark with indicator

---

*Usage Dashboard v1.0.0 — Jarvis Skill*
