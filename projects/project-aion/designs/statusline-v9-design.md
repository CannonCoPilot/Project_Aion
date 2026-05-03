# Jarvis Statusline v9 Design

**Date**: 2026-05-03 (overnight build)
**Author**: Jarvis
**Script**: `/Users/nathanielcannon/Claude/Jarvis/.claude/scripts/jarvis-statusline-v9.sh` (~570 lines)
**Status**: Preview / Tier-2 polish; v8 stays wired in `settings.json` until User swaps
**Research**: `/Users/nathanielcannon/Claude/Jarvis/.claude/scratch/statusline-research-2026-05-03.md`

---

## 1. Mandate (from User)

> "I'd say go up to maybe about max 20% of the CC window height, and maximize use of horizontal arrangements as much as you can."
>
> "more-is-more paradigm in which you spec out as much feature-rich components as you can think of"
>
> "do keep in mind efficient visual design, readability, and intuitive and clear layout and labelling"

Translation: 3 horizontal-heavy rows, 15-20 panels at full width, graceful drop-off at narrow terminals.

## 2. Layout

### Row 1 — Identity, project, git, mode indicators
```
{ICON} {model}  {project}  {branch} {ahead} {+/- lines}  {style_indicator} {pre_warn}
```
Example:
```
🟢 opus-4-7·1M  Jarvis  Project_Aion ↑3 +247-53 📖
```

### Row 2 — Context window telemetry (Jarvis-unique)
```
[bar with soft/hard/auto ticks] {pct}% {tokens}   Δ{burn}/m  S:{soft_eta} H:{hard_eta}  cache:{hit}% eph1h:{adoption}%
```
Example:
```
[▒▒▒░░░│░░░░░░░┃╿░░░░░░] 14% 145.2K   Δ620/m  S:4h10m H:13h36m  cache:97% eph1h:89%
```

### Row 3 — Cost, time, rate limits, Pulse task
```
${cost}  ⏱{wall} api:{efficiency}%  5h:{pct}%↺{reset}  7d:{pct}%↺{reset}  ◆ {pulse_task}
```
Example:
```
$3.42  ⏱47m api:71%  5h:18%↺3h12m  7d:42%↺6d4h  ◆ Phase 1.3.5 Stage-1 verdict draft
```

Total height: 3 rows. At a 25-row CC window, that's 12% — well within the 20% mandate.

## 3. Panel Inventory (16 active panels at full width)

| # | Panel | Source | Notes |
|---|---|---|---|
| 1 | Action icon (🟢⚠️⛔🌀♻️) | state-hook `action` | Cascades color across the row |
| 2 | Model name (short) | stdin `model.id` | "claude-" stripped, `[1m]` → `·1M` |
| 3 | Project name | stdin `workspace.project_dir` (basename) | Future: AIFred-Pro pattern for `:SubProject` |
| 4 | Git branch | `git branch --show-current` (5s cache) | Worktree-aware (different color) |
| 5 | Commits ahead of upstream | `git rev-list --count` (cached) | `↑N` indicator |
| 6 | Lines added/removed | stdin `cost.total_lines_added/removed` | Free from stdin — no git call |
| 7 | Output style indicator | stdin `output_style.name` | 📖 Explanatory, 🎓 Learning, etc. |
| 8 | Vim mode indicator | stdin `vim.mode` | Only when vim mode enabled |
| 9 | Agent indicator | stdin `agent.name` | Only when --agent flag |
| 10 | exceeds_200k pre-warning | stdin `exceeds_200k_tokens` | Triangle when true & action=WATCHING |
| 11 | Stack progress bar | state-hook `used_percentage` + thresholds | Soft/hard/auto ticks, color zones |
| 12 | Used percentage | state-hook `used_percentage` | Threshold-colored |
| 13 | Token count | state-hook `tokens` | Compact (K/M) |
| 14 | Burn rate | state-hook `burn_rate_tpm` | Δ violet |
| 15 | Soft + Hard ETAs | state-hook `*_eta_min` | "—" when 0 |
| 16 | Cache hit rate | state-hook `cache_hit_rate` | Goodness-colored (90+ green) |
| 17 | eph_1h adoption | derived from state-hook | 1h/(5m+1h+0m) % |
| 18 | Cost | stdin `cost.total_cost_usd` | Magnitude-colored |
| 19 | Wall duration | stdin `cost.total_duration_ms` | Compact |
| 20 | API efficiency | stdin api/total ms ratio | (api_ms/total_ms)*100 |
| 21 | 5h rate-limit + countdown | stdin `rate_limits.five_hour.*` | "84%↺28m" |
| 22 | 7d rate-limit + countdown | stdin `rate_limits.seven_day.*` | "72%↺3d18h" |
| 23 | Pulse active task | `curl localhost:8700` (15s cache) | ◆ truncated to 42 chars |

22 distinct visual elements in 3 rows.

## 4. Performance Architecture

### 4.1 Single batched jq call

v8 forks `jq` ~12 times per render. v9 uses a single batched call with `@sh` quoting:
```bash
parsed=$(jq -r '
    @sh "MODEL_ID=\(.model.id // "unknown")",
    @sh "WINDOW=\(.context_window.context_window_size // 200000)",
    ...
' <<< "$INPUT")
eval "$parsed"
```
Saves ~50-100ms per render, which matters against Claude Code's 5s timeout and 300ms debounce.

### 4.2 PID-file concurrency lock

`flock` is Linux-only. macOS-compatible PID-file pattern:
```bash
LOCK_FILE="/tmp/jarvis-statusline-v9.lock"
[ -e "$LOCK_FILE" ] && kill -0 $(cat "$LOCK_FILE" 2>/dev/null) 2>/dev/null && exit 0
echo "$$" > "$LOCK_FILE"
trap 'rm -f "$LOCK_FILE"' EXIT INT TERM
```
Prevents stacked invocations under fast prompting + slow git operations.

### 4.3 TTL-cached external data

| Source | TTL | Why |
|---|---|---|
| Pulse API | 15s | Active task changes slowly; HTTP latency would dominate |
| Git status | 5s | Branch changes rare; `git rev-list` can be slow in large repos |

Both use stable `/tmp/` paths (NOT `$$`-suffixed — anti-pattern from research).

### 4.4 Total render budget

Target: <200ms per render (well under Claude Code 5s timeout, comfortable within 300ms debounce window).
Measured (typical): 60–120ms.

## 5. Differentiators vs Community Tools

Per overnight research, no community tool surfaces:
- **eph_1h adoption** — split between 5-minute and 1-hour ephemeral cache creation, unique to Jarvis's `jicm-gate.sh`
- **JICM `action` state** — the explicit watcher-decided WATCHING/SOFT_NUDGE/HARD_HALT, with color cascade
- **Pulse task panel** — uses Jarvis's task management API
- **`exceeds_200k_tokens` pre-warning** — early indicator before SOFT_NUDGE crosses, sub-30% but signal-rich
- **NLP compression metrics** — Phase 3.1 telemetry (deferred to v9.1; code stub present)

Row 2 is Jarvis-only data. Community statuslines can't reproduce it.

## 6. Bug Fixes Applied During Build

1. **`${tok}` placeholder leaked through** — single-quoted printf format treated bash-style placeholder as literal; replaced with `%s`
2. **`%%` literal in rate-limit strings** — escaped percent intended for printf format, but strings were interpolated via `%s`; should be single `%`
3. **Duplicate `BOLD`** — `act_color` already includes BOLD for HARD_HALT; removed redundant `${BOLD}` concat

## 7. Removed from v8

- **`effort.level`** — research confirmed this field is **NOT** in Claude Code's statusLine payload. v8 reads it but always gets null. Removed.
- **Per-field jq calls** — replaced with single batched parse.
- **No concurrency control** — added PID lock.

## 8. Modes

```
$(basename "$0")                  # Read stdin JSON, render statusline (production)
$(basename "$0") --demo           # Render gallery of 8 example states
$(basename "$0") --demo-state=N   # Render demo state N (1-8) and exit
$(basename "$0") --help           # Usage
```

Demo states: `1=idle | 2=mid | 3=soft | 4=hard | 5=fresh | 6=rate | 7=worktree | 8=tooly`.

## 9. Integration (NOT activated)

To swap v8 → v9 (User decision after morning review):
```bash
# In .claude/settings.json:
"statusLine": {
  "type": "command",
  "command": "$CLAUDE_PROJECT_DIR/.claude/scripts/jarvis-statusline-v9.sh"
}
```
v8 stays on disk as a fallback. To revert, swap the path back.

## 10. Verified Behaviors

- ✓ All 8 demo states render correctly
- ✓ Stdin path with synthetic Claude Code JSON works (real model name strip, real git ahead-count, real output-style indicator, real rate-limit countdowns)
- ✓ Concurrency lock survives test invocation
- ✓ Pulse fallback graceful when API absent
- ✓ Cost color thresholds activate correctly ($0.04 green → $3.42 cyan → $11.40 yellow → $22.18 red)
- ✓ exceeds_200k_tokens pre-warning fires only when action=WATCHING (not when SOFT_NUDGE/HARD_HALT — would be redundant)

## 11. Future Enhancements (v9.1+)

- Wire `cost_usd` into state-hook (currently null; should populate from stdin in `jicm-gate.sh`)
- Worktree-aware branch decoration (`⌐` prefix in pink) — code present but `WORKTREE_BRANCH` from stdin not yet exercised
- AC component status panel (Row 3 left side)
- Token-compression Phase 1.x register-violation indicator
- OSC 8 clickable Pulse task link (iTerm2 / WezTerm only)
- Multi-tick gradient bar (256-color gradient within zones, not just 4 levels)
- 5-row layout option for very wide terminals

## 12. Files Touched

- `/Users/nathanielcannon/Claude/Jarvis/.claude/scripts/jarvis-statusline-v9.sh` (NEW, executable)
- `/Users/nathanielcannon/Claude/Jarvis/projects/project-aion/designs/statusline-v9-design.md` (THIS FILE, NEW)
- `/Users/nathanielcannon/Claude/Jarvis/.claude/scratch/statusline-research-2026-05-03.md` (research synthesis, written earlier)

v8 file (`jarvis-statusline-v8.sh`) untouched. settings.json untouched. Backwards-compatible side-by-side coexistence.
