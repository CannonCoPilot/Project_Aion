---
name: usage-dashboard
model: haiku
version: 1.0.0
description: Token usage analytics — daily, monthly, billing blocks, session limits
replaces: Manual ccusage/cmonitor CLI calls
---

## Quick Reference

| Need | Command |
|------|---------|
| Today's usage + block | `/usage` or `/usage today` |
| Last 7 days | `/usage daily` |
| Monthly summary | `/usage monthly` |
| Active billing block | `/usage blocks` |
| Launch browser dashboard | `/usage browser` |

## Data Sources

| Source | Binary | Output Format | Data |
|--------|--------|--------------|------|
| ccusage | `npx ccusage@latest` via `/Users/nathanielcannon/.nvm/versions/node/v24.13.1/bin/npx` | `--json` | Daily, monthly, blocks, totals |
| cmonitor | `/Users/nathanielcannon/.local/bin/cmonitor` | TUI (Rich) | Realtime session, P90 limits |
| claude-spend | `npx claude-spend` | Browser localhost:3456 | Visual dashboard |
| ccusage cache | `.claude/context/.ccusage-blocks.json` | JSON file | Cached block data (refreshed by Stop hook) |

## Tool Paths

```
NPX="/Users/nathanielcannon/.nvm/versions/node/v24.13.1/bin/npx"
CMONITOR="/Users/nathanielcannon/.local/bin/cmonitor"
CCUSAGE_CACHE="$HOME/Claude/Jarvis/.claude/context/.ccusage-blocks.json"
```
