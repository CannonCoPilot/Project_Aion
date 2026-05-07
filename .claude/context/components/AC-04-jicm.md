# AC-04 JICM — Autonomic Component Specification

**Component ID**: AC-04
**Version**: 7.3.0
**Status**: active
**Last Modified**: 2026-04-24

---

## 1. Identity

### Purpose
Jarvis Intelligent Context Management (JICM) monitors context via an external watcher, triggers fast bash-based compression before lockout, and orchestrates seamless work resumption across /clear boundaries. JICM triggers **continuation**, not session completion.

### Design Principles
1. **Continuation, Not Exit**: Context exhaustion triggers work CONTINUATION
2. **Stop-and-Wait**: Watcher halts Claude, compresses, clears, resumes
3. **Hook-Only Resume**: SessionStart hook injects context; no keystroke injection needed
4. **Absolute Token Threshold**: Trigger on token count (300K default), not percentage
5. **Two-Tier Compression**: Fast bash extraction (Tier 1) + optional local LLM enrichment (Tier 2)

---

## 2. Architecture

### State Machine
```
WATCHING → HALTING → COMPRESSING → CLEARING → RESTORING → WATCHING
```

### Component Inventory
| Artifact | Path | Role |
|----------|------|------|
| Watcher | `.claude/scripts/jicm-watcher.sh` | Main monitoring loop (tmux W1) |
| Prep script | `.claude/scripts/jicm-prep-context.sh` | Two-tier context extraction |
| Shared config | `.claude/scripts/jicm-config.sh` | Centralized JICM paths |
| Session-start hook | `.claude/hooks/session-start.sh` | Context injection on /clear |
| `/jicm` command | `.claude/commands/jicm.md` | Manual JICM cycle (user-facing) |
| `/intelligent-compress` | `.claude/commands/intelligent-compress.md` | Silent compression (watcher calls) |

### Signal Files
| File | Purpose | Created By | Consumed By |
|------|---------|------------|-------------|
| `.compressed-context-ready.md` | Compressed context checkpoint | Prep script | session-start.sh hook |
| `.compression-done.signal` | Prep script completion marker | Prep script | Watcher |
| `.compression-in-progress` | Guard against double compression | /intelligent-compress | session-start.sh |
| `.jicm-state` | Watcher state (tokens, pct, burn rate, ETA) | Watcher | Ennoia, hooks |
| `.jicm-last-compression.json` | Compression metadata (timing, method, sizes) | Prep script | Watcher (post-cycle log) |
| `.jicm-exit-mode.signal` | Suppress JICM during /end-session | end-session command | Watcher |
| `.jicm-sleep.signal` | Ulfhedthnar suppresses threshold checks | ulfhedthnar hook | Watcher |

All signal files live in `.claude/context/` and are gitignored.

---

## 3. Triggers

| Trigger | Condition | Action |
|---------|-----------|--------|
| Token threshold | Tokens >= 300K (configurable via `--token-threshold`) | Full JICM cycle |
| Emergency compact | Context >= 73% | Emergency `/compact` (bypass JICM) |
| Failsafe | "Context limit reached" in TUI | Auto `/clear` |
| Manual | User types `/jicm` or `/intelligent-compress` | Full JICM cycle |
| Idle checkpoint | 30s of Claude idle | Refresh `.compressed-context-ready.md` |

---

## 4. Compression Pipeline

### Two-Tier System (`jicm-prep-context.sh`)

**Tier 1 — Bash Extraction (~1s)**:
1. Find best JSONL transcript (watcher HALT marker `Watcher here. Context is getting heavy` → message count → newest; legacy `[JICM-HALT]` also recognised for backward-compat with older transcripts)
2. Extract recent user + assistant messages from JSONL
3. Extract TodoWrite tasks from JSONL `.todos` array
4. Read session-state.md, scratchpad, active plan, git state
5. Write structured checkpoint to `.compressed-context-ready.md`

**Tier 2 — LLM Enrichment (~5-20s, optional)**:
1. Feed condensed Tier 1 data to local LLM (qwen3:8b via Ollama direct)
2. LLM produces structured checkpoint: Current Task, Progress, Critical Context, Key Paths, Next Step
3. Prepend LLM narrative to Tier 1 raw data
4. Falls back to Tier 1 if LLM unavailable or fails

**Post-Compression Validation**:
- Dynamically checks checkpoint against COMPLETE items in current-plans.md
- Logs self-correction if LLM hallucinates completed work as active

**Metadata Output** (`.jicm-last-compression.json`):
- Timestamp, duration, method, LLM model, JSONL file, output size, staleness

---

## 5. Resume Flow

```
1. Watcher sends /clear via tmux
2. /clear triggers session-start.sh hook (source=clear)
3. Hook detects .jicm-state with state=CLEARING
4. Hook reads .compressed-context-ready.md
5. Hook injects content as additionalContext
6. Claude receives compressed context immediately
7. Watcher detects Claude active → transitions to WATCHING
```

No keystroke injection, no idle-hands monitoring, no continuation verifier.

---

## 6. Token Awareness

### Burn Rate Tracking
The watcher computes tokens consumed per minute from consecutive readings and estimates minutes until threshold:

| Field in `.jicm-state` | Description |
|------------------------|-------------|
| `burn_rate_tpm` | Tokens per minute (current rate) |
| `threshold_eta_mins` | Estimated minutes until compression triggers |
| `context_tokens` | Current token count from TUI status line |
| `token_threshold` | Configured trigger point (default 300K) |

### Threshold Architecture
```
0                    300K              ~785K        1M
|──────────────────────|──────────────────|──────────|
      Normal            JICM             LOCKOUT    WINDOW
      Operation         Trigger          CEILING    SIZE

JICM trigger:     300,000 tokens (configurable via --token-threshold)
Native compact:   CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=70 (backup)
Emergency:        73% of window
Lockout ceiling:  ~78.5% ((window - output_reserve - compact_buffer) / window)
```

---

## 7. Shared Configuration

`jicm-config.sh` is sourced by all three JICM scripts (watcher, prep, session-start). Defines paths with fallback defaults so each script still works if the config is missing.

---

## 8. Commands (Post-Consolidation)

| Command | Type | Purpose |
|---------|------|---------|
| `/jicm` | Custom (kept) | Manual JICM cycle — user-facing with verify step |
| `/intelligent-compress` | Custom (kept) | Silent compression — called by watcher |
| `/compact` | Native CC | Claude Code's built-in compaction |
| `/clear` | Native CC | Clear conversation (triggers SessionStart hook) |

**Removed** (v7.3.0): `/checkpoint`, `/context-checkpoint`, `/smart-compact`, `/smart-checkpoint`, `/context-loss`

---

## 9. Failure Modes

| Failure | Detection | Recovery |
|---------|-----------|----------|
| Compression timeout | Timer expiry | Send /clear anyway (Tier 1 fallback) |
| LLM unavailable | Health check fail | Keep Tier 1 output |
| tmux session loss | Watcher exit | Restart via launch-jarvis-tmux.sh |
| Double compression | `.compression-in-progress` guard | Skip if guard exists |
| Stale pane buffer | Restrict parsing to last 5 lines | Avoids scroll history |
| LLM hallucination | Post-compression validation | Log self-correction |

### Graceful Degradation
| Level | Condition | Behavior |
|-------|-----------|----------|
| Full | All systems operational | LLM-enriched checkpoint + hook resume |
| Partial | LLM unavailable | Tier 1 bash checkpoint + hook resume |
| Partial | Watcher not running | Manual `/jicm` + `/clear` required |
| Minimal | tmux unavailable | No automated JICM; manual context management |

---

*AC-04 JICM v7.3.0 — Two-Tier Compression with Token-Aware Monitoring*
