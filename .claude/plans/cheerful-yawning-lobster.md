# JICM v7.1 — Fix HALT Interruption, Session Targeting, and Data Enrichment

## Context

After monitoring 3 JICM compression cycles (#25-#27) on W0:Jarvis while it worked on the Chronicler project, we identified 4 critical issues causing **task drift after compression**:

1. **Double-ESC HALT interruption**: `wait_for_idle()` sends a second ESC immediately after the HALT prompt is submitted, interrupting Jarvis's "Understood" response before it completes.
2. **Cross-session JSONL contamination**: `find_best_jsonl()` selects by message count — W5:Jarvis-dev's 8MB/4102-line JSONL always beats W0's smaller, frequently-compressed sessions (96-472 lines). Result: W0 resumes with W5's conversation context, causing task drift.
3. **Thin LLM input**: Condensed input includes only 5 lines of plan title, no archived checkpoint data for multi-cycle continuity.
4. **No multi-plan tracking**: `.active-plan` tracks one file path. No `@`-imported reference for current/recent plans.

**Root Cause Trace (Double-ESC)**:
```
do_halt()                               (jicm-watcher.sh)
  L823: tmux_send_escape                ← ESC #1 (correct: clears pending input)
  L824: sleep 0.3
  L832: tmux_send_prompt "[JICM-HALT]"  ← Sends HALT text + Enter
  L835: wait_for_idle()                 ← Enters wait loop
    L448: trigger_idle_check()          ← IMMEDIATE call
      L367: tmux_send_escape            ← ESC #2 — INTERRUPTS the HALT response
```

---

## Fix 1: Eliminate Double-ESC in HALT Flow

**File**: `/Users/nathanielcannon/Claude/Jarvis/.claude/scripts/jicm-watcher.sh`

Add a `skip_trigger` parameter to `wait_for_idle()`. When called from `do_halt()`, skip the initial `trigger_idle_check()` (which sends ESC) and instead wait for the HALT response to complete before polling.

### Changes

**`wait_for_idle()` (~L442-481)**: Add `skip_trigger` parameter:

```bash
wait_for_idle() {
    local max_wait=${1:-30}
    local skip_trigger=${2:-false}
    local waited=0

    if [[ "$skip_trigger" != "true" ]]; then
        # Original: send ESC and check pattern
        local state
        state=$(trigger_idle_check)
        if [[ "$state" == "idle" ]]; then
            WAIT_RESULT="idle"
            log INFO "Idle confirmed via triggered check"
            return 0
        fi
    else
        # After HALT: give Jarvis time to generate "Understood", then check
        sleep 3
        local pane
        pane=$(tmux_capture)
        if echo "$pane" | grep -qiE '(understood|halted|stopping)'; then
            WAIT_RESULT="idle"
            log INFO "HALT acknowledged — proceeding"
            return 0
        fi
    fi

    # Polling loop (unchanged)
    while [[ $waited -lt $max_wait ]]; do
        sleep 2
        waited=$((waited + 2))
        # ... existing poll logic ...
    done

    WAIT_RESULT="timeout"
    return 0
}
```

**`do_halt()` (~L835)**: Pass `true` for skip_trigger:

```bash
# Change:  wait_for_idle "$HALT_TIMEOUT"
# To:
wait_for_idle "$HALT_TIMEOUT" true
```

---

## Fix 2: Session-Targeted JSONL Selection

**File**: `/Users/nathanielcannon/Claude/Jarvis/.claude/scripts/jicm-prep-context.sh`

Replace `find_best_jsonl()` (~L111-132) with a two-priority selection:

1. **Priority 1 — HALT marker**: Search for the JSONL containing `[JICM-HALT]` in recent entries. This text appears ONLY in W0's JSONL (because the watcher sends HALT only to W0). Guaranteed correct targeting during compression cycles.

2. **Priority 2 — Recency-capped message count**: For idle checkpoints (no HALT marker), use the existing message-count heuristic BUT only consider files modified in the last 10 minutes. This prevents stale, large W5 sessions from being selected.

```bash
find_best_jsonl() {
    local dir="$1"

    # Priority 1: JSONL with most recent [JICM-HALT] marker (compression trigger)
    local halt_match=""
    for f in $(ls -t "$dir"/*.jsonl 2>/dev/null | head -5); do
        if tail -200 "$f" | grep -q '\[JICM-HALT\]' 2>/dev/null; then
            halt_match="$f"
            break
        fi
    done
    if [[ -n "$halt_match" ]]; then
        echo "JSONL targeted via [JICM-HALT] marker: $(basename "$halt_match")" >&2
        echo "$halt_match"
        return 0
    fi

    # Priority 2: Message count, but only files modified in last 10 min
    local best="" best_count=0
    local cutoff=$(( $(date +%s) - 600 ))
    for f in $(ls -t "$dir"/*.jsonl 2>/dev/null | head -5); do
        local fmtime
        fmtime=$(stat -f %m "$f" 2>/dev/null || echo 0)
        [[ $fmtime -lt $cutoff ]] && continue

        local count
        count=$(tail -5000 "$f" 2>/dev/null \
            | jq -c "$JQ_USER_FILTER" 2>/dev/null \
            | wc -l | tr -d ' ')
        if [[ $count -gt $best_count ]]; then
            best="$f"
            best_count=$count
        fi
    done

    if [[ -n "$best" ]]; then
        echo "JSONL selected via message count (${best_count} msgs): $(basename "$best")" >&2
        echo "$best"
    else
        ls -t "$dir"/*.jsonl 2>/dev/null | head -1
    fi
}
```

---

## Fix 3: Enrich LLM Input with Plan Body + Archived Checkpoint

**File**: `/Users/nathanielcannon/Claude/Jarvis/.claude/scripts/jicm-prep-context.sh`

### 3a: Plan body in LLM condensed input (~L366-373)

Change `head -5` to `head -50` for plan content in the LLM input builder:

```bash
# Change:   head -5 "$plan_path"
# To:
head -50 "$plan_path"
echo "..."
```

### 3b: Add archived checkpoint for multi-cycle continuity

Insert after the plan section in the LLM input builder (~L373):

```bash
# Most recent archived checkpoint (multi-cycle continuity signal)
ARCHIVE_DIR="$PROJECT_DIR/.claude/logs/jicm/archive"
if [[ -d "$ARCHIVE_DIR" ]]; then
    LATEST_ARCHIVE=$(ls -t "$ARCHIVE_DIR"/compressed-*.md 2>/dev/null | head -1)
    if [[ -n "$LATEST_ARCHIVE" ]]; then
        echo "## Previous Checkpoint (last compression)"
        sed -n '/^## Current Task/,/^## Key Paths/p' "$LATEST_ARCHIVE" 2>/dev/null \
            | head -30
        echo ""
    fi
fi
```

---

## Fix 4: Create `current-plans.md` with `@` Import

### 4a: New file

**Create**: `/Users/nathanielcannon/Claude/Jarvis/.claude/context/current-plans.md`

```markdown
# Current Plans

## Active
- [Chronicler Monitoring System](.claude/plans/effervescent-bouncing-feather.md) — observability for Chronicler/Qwen3

## Recently Completed
- [JICM Checkpoint Enrichment](.claude/plans/cheerful-yawning-lobster.md) — two-tier compression

## Reference
- [Overnight Session 28b](.claude/plans/overnight-session-28b-plan.md) — infrastructure sprint
- [Mac Studio Roadmap](.claude/plans/mac-studio-db-ai-roadmap.md) — long-term roadmap
```

### 4b: Update plan-tracker.js

**File**: `/Users/nathanielcannon/Claude/Jarvis/.claude/hooks/plan-tracker.js`

After writing `.active-plan`, also add new plans to `current-plans.md` Active section:

```javascript
const currentPlansFile = path.join(projectDir, '.claude/context/current-plans.md');
try {
    let content = fs.readFileSync(currentPlansFile, 'utf8');
    const planName = files[0].name.replace('.md', '');
    if (!content.includes(planName)) {
        content = content.replace(
            /^## Active\n/m,
            `## Active\n- [${planName}](${files[0].fullPath}) — (auto-tracked)\n`
        );
        fs.writeFileSync(currentPlansFile, content);
    }
} catch (e) { /* Non-fatal */ }
```

### 4c: Update CLAUDE.md `@` import

**File**: `/Users/nathanielcannon/Claude/Jarvis/CLAUDE.md`

Replace the Active Plan section's `@` reference:
```
# Before:
@.claude/plans/overnight-session-28b-plan.md

# After:
@.claude/context/current-plans.md
```

### 4d: Update prep script to read current-plans.md

**File**: `/Users/nathanielcannon/Claude/Jarvis/.claude/scripts/jicm-prep-context.sh`

In the Tier 1 output builder (~L270-279), read from `current-plans.md` and include the first active plan's body:

```bash
CURRENT_PLANS="$PROJECT_DIR/.claude/context/current-plans.md"
if [[ -f "$CURRENT_PLANS" ]]; then
    echo "## Active Plans"
    sed -n '/^## Active/,/^## /p' "$CURRENT_PLANS" | grep -v '^## [^A]' | head -10
    echo ""

    # Include body of first active plan
    FIRST_PLAN=$(sed -n '/^## Active/,/^## /p' "$CURRENT_PLANS" \
        | grep -oE '\([^)]+\.md\)' | head -1 | tr -d '()')
    if [[ -n "$FIRST_PLAN" ]]; then
        # Resolve relative path
        local plan_full="$PROJECT_DIR/$FIRST_PLAN"
        if [[ -f "$plan_full" ]]; then
            head -50 "$plan_full"
            echo "..."
            echo ""
        fi
    fi
fi
```

---

## Files Modified

| File | Changes |
|------|---------|
| `.claude/scripts/jicm-watcher.sh` | Fix 1: `wait_for_idle()` skip_trigger param + `do_halt()` call |
| `.claude/scripts/jicm-prep-context.sh` | Fix 2: HALT-marker JSONL targeting; Fix 3: plan body + archive; Fix 4d: current-plans reader |
| `.claude/hooks/plan-tracker.js` | Fix 4b: maintain current-plans.md |
| `.claude/context/current-plans.md` | Fix 4a: NEW — plan index |
| `CLAUDE.md` | Fix 4c: `@` import current-plans.md |

---

## Verification

1. **HALT no longer interrupted**: Trigger compression, check watcher log for "HALT acknowledged" (not "Interrupted"), verify W0 shows "Understood"
2. **JSONL targeting**: With W5 running, trigger W0 compression — log should show "targeted via [JICM-HALT] marker" and select W0's JSONL (not the 8MB W5 file)
3. **Enriched checkpoint**: Archived checkpoint should contain 50-line plan context and "Previous Checkpoint" section from prior cycle
4. **Plan tracking**: ExitPlanMode should update both `.active-plan` and `current-plans.md`
5. **End-to-end**: Run W0 on Chronicler with W5 concurrent, let 2 compressions complete, verify W0 resumes Chronicler (not JICM work) each time

---

## Design Decisions

- **`[JICM-HALT]` as session fingerprint**: Already in the protocol, zero-cost. Appears ONLY in W0's JSONL. Reliable session targeting without needing tmux window IDs in JSONL records.
- **10-minute recency cap**: Prevents 27-hour W5 sessions from being selected during idle checkpoints (which lack HALT markers). Active sessions are always modified within the last few minutes.
- **`skip_trigger` boolean vs separate function**: Adding a parameter is simpler than duplicating the polling loop. The only difference is whether the initial ESC is sent.
- **3s sleep after HALT**: Jarvis needs ~2-3s to generate "Understood." Net ~2.5s increase per compression cycle — negligible given cycles run every 15-30 minutes.
- **`current-plans.md` manually maintained sections**: Auto-tracking adds new plans. Moving Active→Completed is manual — plan lifecycle is a judgment call.
