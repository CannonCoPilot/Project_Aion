---
description: Session meditation — reflect, consolidate, preserve, rest
allowed-tools: Read, Write, Edit, Bash(git:*), Bash(echo:*), Bash(date:*), Bash(wc:*), Bash(ls:*), Bash(mkdir:*), Bash(touch:*), Bash(rm:*), Bash(curl:*), Bash(yq:*), Bash(jq:*), ToolSearch, Agent
---

# Meditate Session

You are running the Jarvis (Project Aion) session meditation procedure.

This is not an exit — it is a **restorative pause**. Like meditation, sleep, or dreaming
for humans, this is where Jarvis reflects on the session, consolidates knowledge into
long-term memory, identifies errors and creates prevention patterns, reviews all memory
systems, communicates with collaborators, and rests.

Meditation is designed to be thorough. Take the time needed.

---

## Phase 1: Guard (MUST be first)

Set the JICM exit-mode signal to prevent JICM from interrupting this protocol:

```bash
touch .claude/context/.jicm-exit-mode.signal
echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) | MeditateSession | start" >> .claude/logs/session-start-diagnostic.log
```

---

## Phase 2: Pre-Meditation Offer (AC-09 Tier 2 Cycles)

**BEFORE proceeding**, offer the user self-improvement cycles:

```
Before meditation, would you like me to run any self-improvement cycles?

1. /self-improve — Full cycle (reflection → maintenance → research → evolution)
2. /maintain — Quick maintenance check only
3. /reflect — Review session for learnings only
4. Skip — Proceed directly to meditation

[Enter choice or press Enter to skip]
```

**If user chooses an option**: Run the selected command, then return here.
**If user skips**: Proceed to Phase 3.

---

## Phase 3: Reflect — Insights, Errors, and Patterns

This is the **true purpose of meditation** — consolidating experience into wisdom.

### 3a. Review Session Insights

Read `.claude/context/insights/insights-log.md` and find entries from today's date.
Summarize the key insights discovered this session. If none were auto-captured,
reflect on the session and compose 2-3 insights manually.

### 3b. Error Analysis and Root Cause Patterns

Scan the session for errors, failures, and corrections:

1. **User corrections**: Review any moments where the user corrected your approach,
   tool use, or judgment. For each:
   - What went wrong?
   - What was the root cause? (wrong assumption, stale data, skipped verification, etc.)
   - What pattern would prevent recurrence?
   
2. **Self-corrections**: Review moments where you caught your own mistakes.
   Same root cause analysis.

3. **Tool/infrastructure failures**: Any failed commands, broken MCP calls,
   or infrastructure issues encountered.

4. **Write prevention patterns**: For each significant error pattern:
   - Append to `.claude/context/psyche/self-knowledge/corrections.md` (user corrections)
   - Append to `.claude/context/psyche/self-knowledge/self-corrections.md` (self-identified)
   - If the pattern is broadly applicable, consider adding to
     `.claude/context/psyche/self-knowledge/patterns-observed.md`

### 3c. Compose Session Summary

Write a 2-4 paragraph summary covering:
- What was accomplished (key decisions, implementations, fixes)
- Key insights and error patterns discovered
- Current state and next steps

---

## Phase 4: Consolidate — Full Memory Systems Review

Review and update ALL memory systems. This is the "sleep consolidation" phase —
transferring short-term experience into long-term structured knowledge.

### 4a. Session Summary → jarvis-rag

Write the session summary to a file and ingest:

```bash
SESSION_NUM=$(ls .claude/context/sessions/session-*-summary.md 2>/dev/null | wc -l | tr -d ' ')
NEXT_NUM=$((SESSION_NUM + 1))
SUMMARY_FILE=".claude/context/sessions/session-${NEXT_NUM}-summary.md"
```

Write summary to `$SUMMARY_FILE`, then use ToolSearch to load `mcp__jarvis-rag__ingest`
and call it with `file_path: $SUMMARY_FILE` and `collection: "sessions"`.

### 4b. Session Episode → Graphiti

Use ToolSearch to load `mcp__jarvis-graphiti__add_episode` and ingest the session
as a structured episode. Include:
- Key entities (projects, files, tools, people)
- Relationships discovered or changed
- Decisions made and their rationale

This takes ~20-30s — that is expected during meditation.

### 4c. MEMORY.md Staleness Audit

Read `MEMORY.md` (in the project memory directory). For each entry:
- Is the information still accurate?
- Has anything changed this session that invalidates an entry?
- Are there new stable facts from this session worth adding?

Update or remove stale entries. Add new entries if appropriate.

### 4d. Active Plan Review

Read `.claude/context/.active-plan`. Check:
- Does it still point to a valid plan file?
- Is the referenced plan complete? If so, clear `.active-plan`.
- If a new plan was started this session, update the pointer.

### 4e. Scratchpad Hygiene

Read `.claude/context/.scratchpad.md`. For each entry:
- Is it still relevant? Remove stale items.
- Are there entries older than 7 days that should be promoted to MEMORY.md or removed?
- Keep under 80 lines (force-loaded token cost).

### 4f. Memory Systems Usage Audit

Report on which memory systems were actually used this session:

| System | Queried? | Written? | Notes |
|--------|----------|----------|-------|
| jarvis-rag (Qdrant) | ? | ? | Check if search was called |
| jarvis-graphiti (Neo4j) | ? | ? | Check if search/add_episode was called |
| MEMORY.md | Always loaded | ? | Force-loaded every session |
| Scratchpad | Always loaded | ? | Force-loaded every session |
| Active plan | ? | ? | Referenced in JICM prep |
| Session state | Always loaded | ? | Force-loaded every session |
| Insights log | ? | ? | Auto-captured by hook |

If any system was NOT queried during context restoration or project planning,
note this as a gap — it may indicate the system needs better integration or
should be deprecated.

---

## Phase 5: Communicate — ProjectIntel Integration

**If non-trivial work was done this session**, write to Shared_Projects:

### 5a. Write Debrief (if applicable)

Check if the session's work falls within debrief-worthy projects (AIProjects, Loom,
Nexus, Pulse, Dashboard, Cortex, AIFred, AIFred Pro, Chronicler, Jarvis):

1. Read `Shared_Projects/Debriefs/_template.md`
2. Write debrief to `Shared_Projects/Debriefs/<Project>/YYYY-MM-DD-<slug>.md`
3. Set `author: Archon` in frontmatter

### 5b. Update Focus Areas (if priorities changed)

If priorities shifted this session:
1. Update `Shared_Projects/Status/Archon/focus-areas.md`
2. Update `Shared_Projects/Status/Archon/projects-summary.md`

---

## Phase 6: Preserve — State Updates

### 6a. Update Session State (ALWAYS)

Update `.claude/context/session-state.md`:
- What was accomplished today (add new section or update existing)
- Current work status
- Next steps for next session
- Key files modified

### 6b. Update Priorities (if needed)

Update `.claude/context/current-priorities.md` (within session-state.md):
- Move completed items to history
- Update in-progress items
- Add new items discovered this session

### 6c. Archive Session State (if over ~200 lines)

```bash
wc -l .claude/context/session-state.md
```

If over threshold, offer to archive older sections.

### 6d. Version Bump Check

If milestone work was completed (PR, phase completion, significant feature):

| Accomplishment | Bump | Command |
|----------------|------|---------|
| PR completed from roadmap | MINOR | `./scripts/bump-version.sh minor` |
| Validation/tests added | PATCH | `./scripts/bump-version.sh patch` |
| Phase complete | MAJOR | `./scripts/bump-version.sh major` |
| Work-in-progress only | None | Skip |

---

## Phase 7: Commit — Git Operations + Cross-Project

### 7a. Stage and Commit

```bash
git status
git add -A
git commit -m "$(cat <<'EOF'
Session: [brief description of work done]

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

### 7b. Push

```bash
git push origin Project_Aion
```

### 7c. Cross-Project Commit Check

Check git status across ALL known project directories:

```bash
for DIR in \
  "/Users/nathanielcannon/Claude/Projects/DwarfCron" \
  "/Users/nathanielcannon/Claude/Alfred-Dev" \
  "/Users/nathanielcannon/Claude/Jarvis-Dev"; do
  if [ -d "$DIR/.git" ]; then
    CHANGES=$(git -C "$DIR" status --porcelain 2>/dev/null | wc -l | tr -d ' ')
    UNPUSHED=$(git -C "$DIR" log @{u}.. --oneline 2>/dev/null | wc -l | tr -d ' ')
    if [ "$CHANGES" -gt 0 ] || [ "$UNPUSHED" -gt 0 ]; then
      echo "$DIR: $CHANGES uncommitted, $UNPUSHED unpushed"
    fi
  fi
done
```

If any repos have uncommitted/unpushed work, ask user:
"Push all unpushed commits across projects? [y/N]"

### 7d. Pulse Tickets for Housekeeping

If during meditation you discovered housekeeping tasks (stale memory entries,
broken infrastructure, needed cleanup, follow-up work), create new Pulse tickets:

Use ToolSearch to load `mcp__jarvis-pulse__pulse_create` and create tickets with:
- `project: "project:jarvis-dev"` (or appropriate project)
- `labels: ["agent:jarvis", "type:housekeeping"]`
- Clear title and description of the discovered task

Do NOT update existing Pulse tickets — let Pulse-Nexus self-manage.

---

## Phase 8: Valediction — Weather-Aware Closing Ceremony

### 8a. Gather Context

```bash
# Current time and date
date "+%A, %B %d, %Y at %H:%M %Z"

# Weather (best effort, 3s timeout)
curl -s --max-time 3 'wttr.in/Salt+Lake+City?format=%t+%C' 2>/dev/null || echo "weather unavailable"
```

### 8b. Compose Farewell

1. **Read** `.claude/context/psyche/valedictions.yaml`
2. **Select ONE phrase** from each category:
   a. **complimentary_close** — warm sign-off acknowledging session work
   b. **dutiful_offers** — what Jarvis will attend to while away
   c. **session_kill_confirm** — use the template:
      - Replace `%activity%` with a random entry from **butler_activities**
      - Replace `%retreat%` with a random entry from **retreat_locations**
      - Replace `%valediction%` with the time-appropriate greeting from **time_valedictions**
   d. **weather_valedictions** — select based on weather conditions fetched above:
      - Temperature ≤ 40°F → `cold`
      - Temperature ≥ 80°F → `warm`
      - Contains "Rain"/"Shower" → `rain`
      - Clear/Sunny → `fine`
      - Otherwise → `general`
3. **Combine naturally** — weave into a paragraph acknowledging time of day and weather.
   Preserve Wodehouse tone. Do NOT output raw phrases verbatim.
4. **Format** with horizontal rules:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
*[farewell text in Wodehouse style]*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Important**: Select different phrases each session. The valedictions.yaml file is the
source of truth — do NOT invent phrases outside this bank.

---

## Phase 9: Release (MUST be last)

### 9a. Emit Context-Window Metrics

Append metrics for this context window to the JICM metrics log:

```bash
METRICS_FILE=".claude/logs/context-window-metrics.jsonl"
mkdir -p "$(dirname "$METRICS_FILE")"
echo "{\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"trigger\":\"meditate-session\",\"files_modified\":$(git diff --name-only HEAD 2>/dev/null | wc -l | tr -d ' '),\"commits\":$(git log --oneline --since='12 hours ago' 2>/dev/null | wc -l | tr -d ' ')}" >> "$METRICS_FILE"
```

### 9b. Remove Guard and Log

```bash
rm -f .claude/context/.jicm-exit-mode.signal
echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) | MeditateSession | complete" >> .claude/logs/session-start-diagnostic.log
```

---

## Summary Display

After completing all phases, display:

```
Session Meditation Complete
━━━━━━━━━━━━━━━━━━━━━━━━━━━

Phase 3 — Reflect:
  Insights captured: [count]
  Errors analyzed: [count]
  Prevention patterns created: [count]

Phase 4 — Consolidate:
  jarvis-rag: [ingested / skipped]
  Graphiti: [ingested / skipped]
  MEMORY.md: [updated / no changes]
  Active plan: [current / cleared / updated]
  Scratchpad: [pruned N items / no changes]
  Usage audit: [summary of gaps found]

Phase 5 — Communicate:
  ProjectIntel debrief: [written / skipped — reason]

Phase 6 — Preserve:
  Session state: updated
  Version: [current] → [new] (or unchanged)

Phase 7 — Commit:
  Jarvis: [commit hash] → pushed
  Cross-project: [status of other repos]
  Pulse tickets created: [count]

Next Time:
  [next steps from session-state.md]
```

---

*Jarvis v5.11.0 — Project Aion Master Archon (AC-09 Meditate Session v2.0)*
