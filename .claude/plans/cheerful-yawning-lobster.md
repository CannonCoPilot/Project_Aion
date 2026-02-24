# JICM Watcher TUI Redesign — CSR Split-Screen Dashboard

## Context

The W1:Watcher terminal output is garbled. The current dashboard uses `printf '\e[8A'` to move the cursor up 8 lines and overwrite in place, but `log()` calls between draws shift the cursor position. The next `\e[8A` lands at the wrong row, producing overlapping box fragments:

```
╔══════════════════════════════════════════════════════╗
╔══════════════════════════════════════════════════════╗
║  JICM v7                          ● WATCHING  ║══════╣2s)
```

**Root cause**: Header and log output share the same unbounded screen buffer with no positional separation.

**Solution**: Use ANSI `tput csr` (Change Scroll Region) to split the terminal into a frozen header panel (rows 0-9) and a scrolling log area (rows 10+). Log output can never corrupt the header; header updates can never corrupt the log.

---

## File Modified

**`/Users/nathanielcannon/Claude/Jarvis/.claude/scripts/jicm-watcher.sh`** — sole file. All changes are within the dashboard, logging, cleanup, and main loop sections.

---

## Technical Approach: CSR Scroll Region

Confirmed working on target system:
- `TERM=xterm-256color` inside tmux, `tput csr 8 44` confirmed available
- tmux 3.4 supports CSR — `capture-pane` sees both frozen header and scroll content
- W1 pane: 189x45, bash 3.2.57 (no associative arrays, no readarray)
- **NOT using alternate screen** (`smcup`/`rmcup`) — W5 reads W1 via `capture-pane` without `-a`

---

## Header Layout (10 rows, 0-9)

```
Row 0:  ┌─ JICM v7 ──────────────────────────────────────────────────────────────────┐
Row 1:  │ State: ● WATCHING     Context: ████████████░░░░░░░░ 48% (95,819 tok)       │
Row 2:  │ Threshold: 70%        Session: 2h 15m      Poll: 21:40:07 (5s)             │
Row 3:  │ Cycles: 23 success, 0 errors    Cooldown: —      Idle ckpts: 47            │
Row 4:  │ Last cycle: 35s (h:4 c:11 cl:12 r:8) success                              │
Row 5:  ├─ Activity ──────────────────────────────────────────────────────────────────┤
Row 6:  │ 21:39:28  48% (95819 tok)                                                  │
Row 7:  │ 21:39:23  47% (93500 tok)                                                  │
Row 8:  │ 21:39:18  47% (93500 tok)                                                  │
Row 9:  └────────────────────────────────────────────────────────────────────────────┘
Row 10+: [scrolling log area — CSR boundary]
```

- **Rows 0, 5, 9**: Static borders (drawn once at init and on SIGWINCH)
- **Rows 1-4**: Dynamic metrics (refreshed every poll cycle)
- **Rows 6-8**: Activity log circular buffer (last 3 readings, most recent first)
- **Row 10+**: Scrolling log — all `log()` output flows here naturally via CSR

Box width: 80 chars (fixed, left-aligned in the 189-col pane).

---

## CSR Lifecycle

```
STARTUP
  ├─ query_terminal_size()           # Read TERM_ROWS, TERM_COLS
  ├─ init_tui()
  │    ├─ tput clear                 # Blank slate
  │    ├─ tput cup 0..9 → draw static borders (rows 0, 5, 9)
  │    ├─ tput csr HEADER_ROWS (TERM_ROWS-1)   # Lock scroll region
  │    └─ tput cup HEADER_ROWS 0     # Cursor in scroll area
  v
MAIN LOOP (every POLL_INTERVAL seconds)
  ├─ log() → echo → stdout          # Scrolls naturally in rows 10+
  ├─ refresh_header()
  │    ├─ tput sc                    # Save cursor (in scroll area)
  │    ├─ tput csr 0 (TERM_ROWS-1)  # LIFT CSR temporarily
  │    ├─ tput civis                 # Hide cursor (anti-flicker)
  │    ├─ tput cup R C → printf      # Update rows 1,2,3,4,6,7,8
  │    ├─ tput csr HEADER_ROWS (TERM_ROWS-1)  # RESTORE CSR
  │    ├─ tput cnorm                 # Show cursor
  │    └─ tput rc                    # Restore cursor to scroll area
  v
SIGWINCH → query_terminal_size() → init_tui()   # Full redraw on resize
SHUTDOWN → tput csr 0 (TERM_ROWS-1) → tput cnorm → exit   # Reset terminal
```

---

## Implementation: Functions to Add

### 1. `query_terminal_size()` — NEW (after line ~168)

Read terminal dimensions via `tput lines`/`tput cols`. Fallback to 45x80. Minimum 20 rows enforced.

### 2. `init_tui()` — REPLACES `banner()` (lines 1104-1111)

One-time setup: clear screen, draw static border frame (rows 0, 5, 9), fill dynamic rows with placeholders, set CSR, position cursor in scroll area. Sets `TUI_INITIALIZED=1`.

### 3. `refresh_header()` — REPLACES `draw_dashboard()` (lines 1064-1102)

Atomic header update using `tput sc`/`tput rc`. Updates only dynamic rows (1-4, 6-8). Uses `tput el` (erase to EOL) + fixed-column right border to avoid ANSI color width issues. No `log()` calls between save/restore cursor.

Right border strategy: `printf` content → `tput el` (clear rest of line) → `tput cup ROW (WIDTH-1)` → `printf "│"`. Robust regardless of ANSI escape code lengths.

### 4. `handle_winch()` — NEW (after cleanup, ~line 1128)

SIGWINCH handler: re-query size → `init_tui()`. Log history in scroll area is lost on resize (preserved in log file).

---

## Implementation: Functions to Modify

### 5. `cleanup()` (lines 1117-1124) — ADD CSR reset

Must reset CSR to full terminal, show cursor, move to bottom before exit. Plus an EXIT trap as safety net.

### 6. Signal traps (lines 1126-1128) — ADD WINCH + EXIT

```bash
trap 'cleanup INT' INT
trap 'cleanup TERM' TERM
trap 'cleanup HUP' HUP
trap 'handle_winch' WINCH
# EXIT safety: reset CSR even on unexpected exit
```

### 7. `main()` (line 1135) — `banner` → `init_tui`

### 8. Main loop WATCHING handler (line 1174-1178) — `draw_dashboard` → `refresh_header`

The "Waiting for context data..." message (line 1177) changes from inline `echo -e` to `log INFO` for consistency.

### 9. Main loop COMPRESSING handler (line 1268) — change inline echo to `log JICM`

---

## Implementation: Remove

- `draw_dashboard()` function (lines 1064-1102) — replaced by `refresh_header()`
- `banner()` function (lines 1104-1111) — replaced by `init_tui()`
- `DASHBOARD_DRAWN` variable (line 104) — no longer needed (CSR handles positioning)

---

## Implementation: Unchanged

- `draw_progress_bar()` (1008-1025) — still returns string, called by `refresh_header()`
- `draw_state_indicator()` (1027-1036) — still returns string
- `format_duration()` (1038-1047) — still returns string
- `log_activity()` (1049-1062) — circular buffer, `MAX_LOG_ENTRIES=5`, display last 3 in header
- `log()` (174-195) — **zero changes**. Console echo goes to scroll region automatically via CSR.

---

## New Global Variables (after line ~104)

```bash
TERM_ROWS=0          # Terminal height
TERM_COLS=0          # Terminal width
HEADER_ROWS=10       # Fixed header height (rows 0-9)
HEADER_WIDTH=80      # Box width including borders
TUI_INITIALIZED=0    # Has init_tui() been called?
TUI_HAS_CSR=0        # Does terminal support scroll regions?
```

Remove: `DASHBOARD_DRAWN=0`

---

## Fallback: No CSR Support

If `tput csr` fails (edge-case terminal), set `TUI_HAS_CSR=0` and fall back to the current `\e[8A` overwrite pattern via a `draw_dashboard_legacy()` copy. The script is never worse than today on unsupported terminals.

---

## Verification

1. **Startup**: Header frame renders cleanly with 10 rows of box-drawing characters
2. **Header refresh**: Dynamic rows update every poll cycle; borders stay intact
3. **Log scrolling**: `log()` output scrolls below row 9; header does NOT move
4. **Interleave**: Multiple poll cycles with both header refresh and log output — no corruption
5. **`tmux capture-pane`**: `$HOME/bin/tmux capture-pane -t jarvis:1 -p` shows both header AND log area cleanly
6. **SIGWINCH**: Resize W1 pane → header redraws, scroll region adjusts
7. **Cleanup**: Ctrl-C → terminal left clean (no broken scroll region, cursor visible)
8. **JICM cycle**: Trigger compression → header shows HALTING→COMPRESSING→CLEARING→RESTORING→WATCHING; log area shows timestamped phase entries
9. **W5 compatibility**: Dev scripts that read W1 continue to work unchanged

---

## Risks

| Risk | Mitigation |
|------|-----------|
| `tput csr` not supported | `TUI_HAS_CSR` flag + legacy fallback |
| ANSI colors break column alignment | `tput el` + fixed-column right border |
| Log during atomic header update | No `log()` between `tput sc` and `tput rc` |
| `set -euo pipefail` + tput failures | All `tput` calls guarded with `2>/dev/null \|\| true` |
| Scroll history lost on SIGWINCH | Acceptable — log file preserves full history |
