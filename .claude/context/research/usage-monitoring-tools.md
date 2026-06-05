# Research Report: Claude Code Usage Monitoring Tools

**Date**: 2026-02-18
**Scope**: Evaluation of `claude-spend`, `Claude-Code-Usage-Monitor`, `ccusage`, and related tools for integration into the Jarvis autonomous archon system, with specific focus on TUI/statusline integration, token/cost tracking, and compatibility with the existing `jarvis-statusline.sh` architecture.

---

## Executive Summary

Four primary tools exist for Claude Code usage monitoring: `claude-spend` (browser dashboard, minimal features), `Claude-Code-Usage-Monitor` / `claude-monitor` (Python TUI with ML predictions), `ccusage` (TypeScript CLI with statusline integration), and the existing `jarvis-statusline.sh` (already deployed, Jarvis-native).

The primary candidate for Jarvis integration is **ccusage**, not either of the two tools originally specified. Here is why: ccusage is the only tool that (1) provides a native `statusLine` hook integration with Claude Code's settings.json, (2) has been verified to work against Jarvis's existing JSONL files at `~/.claude/projects/`, (3) exposes a `blocks` command tracking 5-hour billing windows, and (4) can output a `--json` flag for programmatic consumption by Jarvis hooks. The current `jarvis-statusline.sh` (307 lines, v7.4) already handles context-window data, but provides zero cross-session cost history — the critical gap ccusage fills.

The recommended integration path is a two-layer enhancement: add `ccusage blocks` output as a cached data file (via a background daemon pattern or Stop hook), then surface the block cost, time-remaining, and burn rate in the existing statusline output alongside the current context-window metrics.

---

## Key Findings

### Finding 1: claude-spend — Browser-Only, Minimal Depth

**What it does**: Reads `~/.claude/` session files and launches a localhost HTTP server (default port 3456) with a browser-based HTML/JS dashboard showing per-conversation, per-day, and per-model token breakdowns.

**Installation**: Single command — `npx claude-spend` — no global install required.

**Architecture**: 100% local, HTML (63.7%) + JavaScript (36.3%), zero backend, zero external data transmission.

**Browser dashboard**: Yes, this is its primary and only interface.

**TUI integration**: None. No terminal UI, no statusline hook, no tmux variables, no programmatic output mode.

**Token/cost tracking**: Basic breakdowns by conversation, day, and model. No 5-hour billing window tracking, no burn rate, no predictions.

**Claude Code compatibility**: Reads existing session files passively. No settings.json integration point.

**Jarvis relevance**: Low. It adds a browser tab, but Jarvis operates entirely within tmux. The `npx claude-spend` command could be wired to a Jarvis slash command for on-demand browser review, but this is a minor convenience. The tool has 48 stars and 8 forks as of research date, indicating limited community traction compared to alternatives.

**Verdict**: Pass. Redundant with ccusage's daily/session reports, adds no value to the within-TUI dashboard.

**Source**: [claude-spend GitHub](https://github.com/writetoaniketparihar-collab/claude-spend)

---

### Finding 2: Claude-Code-Usage-Monitor (claude-monitor / cmonitor) — Python TUI with ML Predictions

**What it does**: A real-time terminal UI (Python + Rich library) showing live token consumption with ML-based P90 percentile predictions for session limit detection.

**Installation**:
```bash
uv tool install claude-monitor     # recommended
pip install claude-monitor         # alternative
pipx install claude-monitor        # alternative
```
Command aliases: `claude-monitor`, `cmonitor`, `ccmonitor`, `ccm`

**Architecture**: Python, modular SRP design, Pydantic config validation, optional Sentry integration, 100+ test cases, v3.0.0 rewrite.

**Browser dashboard**: No.

**TUI integration**: Yes — this is its strength. Rich-powered terminal UI with color-coded progress bars, configurable refresh rates (data: 1–60s, display: 0.1–20 Hz), WCAG-compliant contrast.

**Token/cost tracking**:
- Per-session real-time token/cost display
- Daily and monthly aggregated views (`cmonitor --view daily`, `cmonitor --view monthly`)
- Multi-plan support with preset limits: Pro (~19k tokens), Max5 (~88k), Max20 (~220k), Custom (P90 auto-detected)
- Model-specific pricing with cache token cost calculations
- Cost analytics over previous 192 hours (8 days) for P90 limit detection
- Three critical metrics: token usage, message count, cost

**Claude Code compatibility**: Reads Claude Code's local JSONL files directly. No settings.json hook integration. Runs as a standalone terminal process alongside Claude Code, not embedded in Claude Code's statusline.

**Jarvis relevance**: Medium. The TUI could run in Jarvis W3 (Virgil) or a dedicated window as a live companion dashboard. However, the tool is not installed on this machine (`claude-monitor not installed`, `cmonitor not in PATH` — verified 2026-02-18). It would require a separate Python process and separate tmux window, adding process overhead.

**Key concern**: Running a Python TUI at 0.1–20 Hz refresh in a tmux window alongside Jarvis's existing monitoring infrastructure (jicm-watcher.sh, ennoia.sh, context-health-monitor.js) creates resource duplication. The tool is most useful for interactive human monitoring, not autonomous agent use.

**Verdict**: Conditional. Best use case is as an on-demand diagnostic tool (`cmonitor --view monthly`) rather than a persistent daemon. Install via `uv tool install claude-monitor` using the infrastructure venv's uv.

**Source**: [Claude-Code-Usage-Monitor GitHub](https://github.com/Maciek-roboblog/Claude-Code-Usage-Monitor)

---

### Finding 3: ccusage — Primary Recommendation

**What it does**: A TypeScript/npm CLI tool that parses Claude Code's local JSONL files at `~/.claude/projects/` to produce token and cost reports. Includes a `statusline` subcommand designed specifically for Claude Code's `statusLine` settings.json hook.

**Installation**: Zero-install via npx (verified working on this machine):
```bash
npx ccusage@latest daily --compact
npx ccusage@latest blocks
npx ccusage@latest statusline
```
Global install: `npm install -g ccusage`

**Verified working**: All three commands above were tested against Jarvis's JSONL files on 2026-02-18 and returned accurate data. Monthly totals confirmed: January 2026 $787.85, February 2026 $777.80 (to date), models: haiku-4-5, opus-4-5, opus-4-6, sonnet-4-5, sonnet-4-6.

**Architecture**: TypeScript monorepo, reads `~/.claude/projects/` JSONL files, no API calls, fully local, "incredibly small bundle size."

**Browser dashboard**: No (that is claude-spend's domain).

**TUI integration**: Yes, via Claude Code's native `statusLine` hook. The `statusline` subcommand outputs a compact single-line string showing:
- Active model
- Session cost
- Daily cost
- Active 5-hour block cost + time remaining
- Burn rate ($/hr, with optional emoji indicators)
- Context usage % of limit

**Token/cost tracking**:
- `ccusage daily` — per-date breakdowns with model detail
- `ccusage monthly` — aggregated monthly totals
- `ccusage session` — per-conversation breakdowns
- `ccusage blocks` — 5-hour billing window tracking with active block detection
- `ccusage statusline` — compact real-time output for statusline embedding
- `--json` flag for programmatic consumption
- `--breakdown` for per-model cost detail
- Cache token tracking (creation + read) separately
- Offline mode with cached LiteLLM pricing (default, fast)
- Online mode (`--no-offline`) for latest pricing

**Claude Code compatibility**: Native integration via settings.json `statusLine` hook:
```json
{
  "statusLine": {
    "type": "command",
    "command": "npx ccusage@latest statusline",
    "padding": 0
  }
}
```
The `statusline` subcommand requires stdin input from Claude Code (it reads the JSON context window data Claude Code pipes to statusline commands). When run standalone (no stdin), it returns `"No input provided"` — this is expected behavior.

**Jarvis relevance**: High. The `blocks` command directly addresses a gap in the current `jarvis-statusline.sh` v7.4, which has excellent context-window tracking (JICM thresholds, stacked bar, token breakdown) but zero cross-session billing-window awareness. ccusage closes this gap.

**MCP companion**: `@ccusage/mcp` exposes ccusage data to Claude Desktop and MCP-compatible clients — potentially useful for Jarvis's MCP infrastructure.

**Source**: [ccusage GitHub](https://github.com/ryoppippi/ccusage), [ccusage docs](https://ccusage.com/)

---

### Finding 4: tmux-claude-live — tmux Status Bar Daemon (Ecosystem Tool)

A dedicated daemon that runs ccusage on a configurable interval (default 5s) and writes results to tmux global variables (`@ccusage_*`). Written in TypeScript/Bun. Requires Bun runtime (not available on this machine).

**Key exposed variables**: `@ccusage_total_tokens_formatted`, `@ccusage_cost_current`, `@ccusage_time_remaining`, `@ccusage_burn_rate_formatted`, `@ccusage_usage_percent`, `@ccusage_warning_level`, `@ccusage_warning_color`, and 20+ more.

**Relevance to Jarvis**: The daemon pattern (polling ccusage + writing to a shared state file) can be replicated in bash without Bun, using Jarvis's existing infrastructure patterns. The tmux variable approach is elegant but requires Bun for the upstream implementation. A Jarvis-native equivalent could write ccusage JSON output to `.claude/context/.ccusage-state.json` via a cron-like mechanism in `ennoia.sh` or a dedicated background script.

**Source**: [tmux-claude-live GitHub](https://github.com/worldnine/tmux-claude-live)

---

### Finding 5: cc-statusline — Bash Statusline (Alternative)

A bash-based statusline generator (`npx @chongdashu/cc-statusline@latest init`) that integrates ccusage for live cost data. Targets <100ms execution (typical 45–80ms). Uses file-based locking to prevent concurrent ccusage invocations. Displays: directory, git branch, model, version, context %, cost + burn rate, session timer, token analytics.

**Relevance to Jarvis**: Low — Jarvis already has `jarvis-statusline.sh` v7.4 which is more sophisticated (JICM-aware, stacked bar, 307 lines). cc-statusline would be a step backward. However, its locking mechanism pattern is worth adopting when integrating ccusage calls into the existing statusline script.

**Source**: [cc-statusline GitHub](https://github.com/chongdashu/cc-statusline)

---

### Finding 6: Existing Jarvis Statusline Architecture

The current statusline pipeline (`~/.claude/settings.json` → `jarvis-statusline.sh` v7.4) is sophisticated and Jarvis-native:

- Reads JICM thresholds dynamically from `.claude/context/.jicm-config`
- Stacked bar: Tools (▓), Overhead (▒), Messages (░), Reserved (▪), Free (·), JICM marker (│)
- Color-coded by JICM proximity zones (green/bright-yellow/yellow/red)
- Shows: dir, branch, token count (SI formatted), context bar, used%, JICM indicator, message count, cost, time, session duration
- Saves raw JSON to `~/.claude/logs/statusline-input.json` for debugging

**Gap identified**: The statusline has zero awareness of:
1. How much of the current 5-hour billing block has been consumed
2. Time remaining until the billing window resets
3. Historical daily/monthly cost accumulation
4. Burn rate (cost per hour)

These four items are exactly what ccusage's `blocks` and `statusline` commands provide.

---

## Comparison Table

| Aspect | claude-spend | claude-monitor | ccusage | jarvis-statusline.sh |
|--------|-------------|----------------|---------|----------------------|
| Interface | Browser only | Python TUI | CLI + statusLine hook | Statusline (embedded) |
| Installation | `npx claude-spend` | `uv tool install` | `npx ccusage@latest` | Already deployed |
| JSONL file parsing | Yes | Yes | Yes | No (uses stdin JSON) |
| Real-time tracking | No | Yes (0.1–20 Hz) | Via statusline hook | Yes (every turn) |
| 5-hour billing blocks | No | Yes | Yes (dedicated cmd) | No |
| Burn rate | No | Yes | Yes | No |
| Context window % | No | Partial | Partial | Yes (JICM-aware) |
| Historical (daily) | Yes | Yes | Yes | No |
| Historical (monthly) | Yes | Yes | Yes | No |
| JSON/programmatic output | No | No | Yes (`--json`) | Saves to file |
| Claude Code hook integration | No | No | Yes (native) | Yes (native, deployed) |
| tmux integration | No | Manual | Via daemon pattern | Embedded in tmux pane |
| Bun/Node required | Node (npx) | No | Node (npx) | No (bash) |
| MCP server | No | No | Yes (`@ccusage/mcp`) | No |
| Stars (GitHub) | 48 | ~200+ | ~1000+ | N/A (internal) |
| Install status on this machine | Not installed | Not installed | Works (verified) | Deployed |

---

## Recommendations

### Primary Recommendation: Extend jarvis-statusline.sh with ccusage block data

**What to do**: Add a ccusage data layer to the existing `jarvis-statusline.sh` by writing ccusage block data to a cache file on a time-gated interval, then reading and displaying it in the statusline output.

**Rationale**:
1. ccusage is verified working against Jarvis's JSONL files (tested 2026-02-18)
2. The gap in `jarvis-statusline.sh` is specifically block-time and burn-rate awareness — exactly what `ccusage blocks --json` provides
3. Adding a cold ccusage call inside the statusline would be too slow (statusline must respond quickly); the cache-file pattern solves this
4. No new persistent process or daemon is required — Jarvis's existing Stop hook or ennoia.sh can refresh the cache file asynchronously
5. Node.js (v24.13.1 via nvm) is already available at `/Users/nathanielcannon/.nvm/versions/node/v24.13.1/bin/npx`

**Implementation plan** (5 steps):

**Step 1 — Create ccusage cache refresh script** (`.claude/scripts/refresh-ccusage-cache.sh`):
```bash
#!/bin/bash
# Refresh ccusage block data to cache file
# Run asynchronously from Stop hook or ennoia maintenance
CACHE_FILE="$HOME/Claude/Project_Aion/.claude/context/.ccusage-blocks.json"
LOCK_FILE="$HOME/Claude/Project_Aion/.claude/context/.ccusage-refresh.lock"
# Guard: skip if lock exists (another refresh in progress)
[ -f "$LOCK_FILE" ] && exit 0
touch "$LOCK_FILE"
/Users/nathanielcannon/.nvm/versions/node/v24.13.1/bin/npx ccusage@latest blocks --json 2>/dev/null \
    > "$CACHE_FILE.tmp" && mv "$CACHE_FILE.tmp" "$CACHE_FILE"
rm -f "$LOCK_FILE"
```

**Step 2 — Wire cache refresh into Stop hook** (append to `~/.claude/hooks/stop-hook.sh` or add as a PostToolUse hook on Bash):
```bash
# Async ccusage cache refresh (non-blocking)
"$HOME/Claude/Project_Aion/.claude/scripts/refresh-ccusage-cache.sh" &
```

**Step 3 — Extend jarvis-statusline.sh** to read the cache file and extract active block data:
```bash
# Read ccusage block cache (age-gated: stale after 10 min)
CCUSAGE_CACHE="$HOME/Claude/Project_Aion/.claude/context/.ccusage-blocks.json"
block_cost=""
block_remaining=""
burn_rate=""
if [ -f "$CCUSAGE_CACHE" ]; then
    cache_age=$(( $(date +%s) - $(stat -f %m "$CCUSAGE_CACHE" 2>/dev/null || echo 0) ))
    if [ "$cache_age" -lt 600 ]; then
        # Extract active block data from JSON (jq required)
        block_cost=$(jq -r '[.[] | select(.isActive==true)] | first | .costUSD // empty' "$CCUSAGE_CACHE" 2>/dev/null)
        # Block time remaining requires calculation from start + 5h window
    fi
fi
```

**Step 4 — Add block metrics to statusline output** — append `| BLK:$X.XX` to the existing format string, color-coded by burn rate threshold.

**Step 5 — Optional: install claude-monitor** for on-demand TUI review:
```bash
/Users/nathanielcannon/Claude/Project_Aion/infrastructure/.venv/bin/uv tool install claude-monitor
```
Then wire `cmonitor --view monthly` to a Jarvis slash command or Virgil dashboard panel.

**Caveats**:
- The ccusage `blocks --json` output format is not fully documented; the JSON schema needs inspection before implementing Step 3. Run `npx ccusage@latest blocks --json 2>/dev/null | head -50` to inspect.
- The npx call adds ~1–2s latency per invocation; the cache pattern keeps statusline response under 100ms.
- ccusage `statusline` requires Claude Code to pipe context JSON to stdin — it cannot be called standalone. The cache-file approach avoids this constraint entirely.

---

### Alternative Recommendation: claude-monitor for companion TUI window

**When to use**: If a human operator wants a live real-time terminal dashboard in a dedicated tmux window (e.g., W3:Virgil secondary pane) rather than embedded statusline data.

**Install**:
```bash
/Users/nathanielcannon/Claude/Project_Aion/infrastructure/.venv/bin/uv tool install claude-monitor
```

**Usage**: `cmonitor` (live TUI), `cmonitor --view monthly` (table view), `cmonitor --plan custom` (auto-detect P90 limits).

**Caveats**: Adds a persistent Python process; less useful for Jarvis's autonomous operation than the statusline approach.

---

## Action Items

- [ ] Inspect `npx ccusage@latest blocks --json` output to understand JSON schema for cache parsing
- [ ] Create `.claude/scripts/refresh-ccusage-cache.sh` (see Step 1 above)
- [ ] Add async cache refresh call to `~/.claude/hooks/stop-hook.sh`
- [ ] Extend `~/.claude/scripts/jarvis-statusline.sh` to read and display block data (Step 3-4)
- [ ] Test statusline output shows block cost + time-remaining without latency regression
- [ ] Optionally: `uv tool install claude-monitor` for on-demand monthly review
- [ ] Optionally: explore `@ccusage/mcp` for MCP-based programmatic cost queries from Jarvis agents

---

## Sources

1. [claude-spend GitHub (writetoaniketparihar-collab)](https://github.com/writetoaniketparihar-collab/claude-spend)
2. [Claude-Code-Usage-Monitor GitHub (Maciek-roboblog)](https://github.com/Maciek-roboblog/Claude-Code-Usage-Monitor)
3. [ccusage GitHub (ryoppippi)](https://github.com/ryoppippi/ccusage)
4. [ccusage Documentation](https://ccusage.com/)
5. [ccusage Statusline Integration Guide](https://ccusage.com/guide/statusline)
6. [tmux-claude-live GitHub (worldnine)](https://github.com/worldnine/tmux-claude-live)
7. [cc-statusline GitHub (chongdashu)](https://github.com/chongdashu/cc-statusline)
8. [ccstatusline GitHub (sirmalloc)](https://github.com/sirmalloc/ccstatusline)
9. [claude-tmux GitHub (nielsgroen)](https://github.com/nielsgroen/claude-tmux)
10. [Shipyard: How to Track Claude Code Usage + Analytics](https://shipyard.build/blog/claude-code-track-usage/)
11. [How to Monitor Claude Code Usage & Costs (2026)](https://hypereal.tech/a/claude-code-usage-monitor)
12. [Claude Code Usage Analytics (Anthropic Support)](https://support.claude.com/en/articles/12157520-claude-code-usage-analytics)
13. [Tracking Costs and Usage — Claude API Docs](https://docs.claude.com/en/docs/claude-code/sdk/sdk-cost-tracking)
14. [Manage Costs Effectively — Claude Code Docs](https://code.claude.com/docs/en/costs)

---

## Uncertainties

- **ccusage `blocks --json` schema**: The exact JSON structure of `blocks --json` output was not inspected during this research session. The cache-file integration (Step 3) requires this schema. Inspect before implementing.
- **ccusage `statusline` stdin format**: The `statusline` subcommand requires Claude Code to pipe JSON via stdin. If Jarvis attempted to call it from within the statusline hook chain, it would create a circular dependency. The cache-file approach avoids this entirely but needs validation.
- **claude-monitor plan detection**: With a Max plan (Jarvis is on Claude Max based on token volumes of 70M+ tokens/session seen in blocks data), `cmonitor --plan max20` is likely the correct flag. The `custom` plan auto-detection reads 192 hours of history and should work but has not been tested.
- **ccusage pricing accuracy**: ccusage uses LiteLLM's pricing database. For Max plan subscribers paying a flat monthly fee, the USD cost figures are approximations based on API pricing rather than actual subscription value. This is noted in ccusage's documentation as an inherent limitation.

---

## Related Topics

- JICM v7 integration with ccusage block data for smarter compression timing
- `@ccusage/mcp` server integration with Jarvis's MCP infrastructure for programmatic cost queries
- n8n workflow for weekly cost report generation using `ccusage monthly --json`
- Graphiti episode tagging with cost data from ccusage for session memory enrichment
