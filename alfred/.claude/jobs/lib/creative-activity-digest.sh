#!/usr/bin/env bash
# creative-activity-digest.sh — Generate activity digest for Aurora Think phase
#
# Aggregates recent session work, AI David decisions, research outputs,
# commits, and in-progress tasks into a single JSON file that Aurora reads
# to generate context-aware surprise ideas.
#
# Output: .claude/agent-output/creative/activity-digest.json
# Called as: creative-think pre_check (always exits 0 so Think runs)

set -uo pipefail

AIPROJECTS="${AIPROJECTS_DIR:-${PROJECT_DIR}}"
OUTPUT_DIR="$AIPROJECTS/.claude/agent-output/creative"
OUTPUT_FILE="$OUTPUT_DIR/activity-digest.json"
SESSION_STATE="$AIPROJECTS/.claude/context/session-state.md"
COMMITS_FILE="$AIPROJECTS/.claude/logs/cross-project-commits.json"
AI_DAVID_DIR="$AIPROJECTS/.claude/agent-output/results/ai-david"
TASK_RESEARCH_DIR="$AIPROJECTS/.claude/agent-output/results/task-research"
DEEP_RESEARCH_DIR="$AIPROJECTS/.claude/agent-output/results/deep-research"

TMPDIR_DIGEST=$(mktemp -d)
trap 'rm -rf "$TMPDIR_DIGEST"' EXIT

mkdir -p "$OUTPUT_DIR"

# ── Extract last N substantive session entries from session-state.md ──
extract_sessions() {
  local count="${1:-3}"
  [[ -f "$SESSION_STATE" ]] || { echo '[]'; return; }

  python3 -c "
import re, json, sys

count = int(sys.argv[1])
text = open(sys.argv[2]).read()
pattern = r'\*\*Previous Session\*\* \((\d{4}-\d{2}-\d{2}), session \d+\):\n(.*?)(?=\n\*\*Previous Session\*\*|\n## |\Z)'
matches = re.findall(pattern, text, re.DOTALL)

results = []
for date, body in matches:
    body = body.strip()
    if body.startswith('No substantive work'):
        continue
    # First non-empty line as summary, strip markdown bold
    lines = [l.strip() for l in body.split('\n') if l.strip()]
    summary = lines[0].replace('**', '') if lines else 'Unknown'
    results.append({'date': date, 'summary': summary[:200]})
    if len(results) >= count:
        break

print(json.dumps(results))
" "$count" "$SESSION_STATE" 2>/dev/null || echo '[]'
}

# ── Extract AI David decisions from last 24h ──
extract_ai_david() {
  local today yesterday
  today=$(date +%Y-%m-%d)
  yesterday=$(date -d '1 day ago' +%Y-%m-%d 2>/dev/null || date -v-1d +%Y-%m-%d)

  # Collect all task entries from recent summary files
  for f in "$AI_DAVID_DIR"/summary-${yesterday}*.json "$AI_DAVID_DIR"/summary-${today}*.json; do
    [[ -f "$f" ]] || continue
    jq -c '.tasks[]?' "$f" 2>/dev/null >> "$TMPDIR_DIGEST/ai-david-raw.jsonl"
  done

  [[ -f "$TMPDIR_DIGEST/ai-david-raw.jsonl" ]] || {
    echo '{"executed":[],"proposed":[],"escalated":[]}'
    return
  }

  python3 -c "
import json, sys

executed, proposed, escalated = set(), set(), set()
for line in open(sys.argv[1]):
    line = line.strip()
    if not line: continue
    try:
        t = json.loads(line)
    except: continue
    title = t.get('title', '')
    action = t.get('action', '')
    if not title: continue
    if action == 'execute': executed.add(title)
    elif action == 'propose': proposed.add(title)
    elif action == 'escalate': escalated.add(title)

print(json.dumps({
    'executed': sorted(executed)[:10],
    'proposed': sorted(proposed)[:10],
    'escalated': sorted(escalated)[:10]
}))
" "$TMPDIR_DIGEST/ai-david-raw.jsonl" 2>/dev/null || echo '{"executed":[],"proposed":[],"escalated":[]}'
}

# ── List research topics from last 7 days ──
extract_research() {
  local cutoff
  cutoff=$(date -d '7 days ago' +%s 2>/dev/null || date -v-7d +%s)

  python3 -c "
import os, json, sys

cutoff = int(sys.argv[1])
dirs = sys.argv[2:]
topics = []

for d in dirs:
    if not os.path.isdir(d): continue
    for f in sorted(os.listdir(d)):
        if not f.endswith('.md'): continue
        path = os.path.join(d, f)
        if os.path.getmtime(path) < cutoff: continue
        heading = None
        try:
            with open(path) as fh:
                for line in fh:
                    line = line.strip()
                    if line.startswith('#'):
                        heading = line.lstrip('#').strip()
                        break
        except: pass
        if not heading:
            heading = f.replace('.md','').lstrip('0123456789-_').replace('-',' ')
        topics.append(heading)

print(json.dumps(topics[:10]))
" "$cutoff" "$TASK_RESEARCH_DIR" "$DEEP_RESEARCH_DIR" 2>/dev/null || echo '[]'
}

# ── Extract recent commits (last 3 sessions) ──
extract_commits() {
  [[ -f "$COMMITS_FILE" ]] || { echo '[]'; return; }

  python3 -c "
import json, sys

data = json.load(open(sys.argv[1]))
sessions = data.get('sessions', {})
keys = list(sessions.keys())[-3:]

results = []
for k in keys:
    projects = sessions[k].get('projects', {})
    for proj, info in projects.items():
        commits = info.get('commits', [])
        msgs = list(dict.fromkeys(c.get('message','') for c in commits))  # unique, preserve order
        # Filter out 'session end only' noise
        msgs = [m for m in msgs if m and 'session end only' not in m.lower()]
        if msgs:
            results.append({'project': proj, 'messages': msgs[:5]})

print(json.dumps(results))
" "$COMMITS_FILE" 2>/dev/null || echo '[]'
}

# ── Get in-progress tasks from Pulse ──
extract_in_progress() {
  if ! command -v pulse &>/dev/null; then
    echo '[]'
    return
  fi

  local raw
  raw=$(timeout 3 pulse list --status in_progress 2>/dev/null) || { echo '[]'; return; }

  # Extract titles — pulse list outputs a table with | delimiters
  echo "$raw" | python3 -c "
import sys, json

titles = []
for line in sys.stdin:
    line = line.strip()
    if not line or line.startswith('+') or '---' in line:
        continue
    parts = [p.strip() for p in line.split('|') if p.strip()]
    # Table has: ID | Title | Status | Priority | ...
    # Skip header row
    if len(parts) >= 2 and parts[0] not in ('ID', 'id'):
        titles.append(parts[1])

print(json.dumps(titles[:10]))
" 2>/dev/null || echo '[]'
}

# ── Main: assemble digest ──
main() {
  local timestamp
  timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)

  local sessions_json ai_david_json research_json commits_json in_progress_json

  sessions_json=$(extract_sessions 3)
  ai_david_json=$(extract_ai_david)
  research_json=$(extract_research)
  commits_json=$(extract_commits)
  in_progress_json=$(extract_in_progress)

  # Validate each piece, fallback to safe defaults
  echo "$sessions_json" | jq . >/dev/null 2>&1 || sessions_json='[]'
  echo "$ai_david_json" | jq . >/dev/null 2>&1 || ai_david_json='{"executed":[],"proposed":[],"escalated":[]}'
  echo "$research_json" | jq . >/dev/null 2>&1 || research_json='[]'
  echo "$commits_json" | jq . >/dev/null 2>&1 || commits_json='[]'
  echo "$in_progress_json" | jq . >/dev/null 2>&1 || in_progress_json='[]'

  # Assemble final JSON
  jq -n \
    --arg ts "$timestamp" \
    --argjson sessions "$sessions_json" \
    --argjson ai_david "$ai_david_json" \
    --argjson research "$research_json" \
    --argjson commits "$commits_json" \
    --argjson in_progress "$in_progress_json" \
    '{
      generated: $ts,
      recent_sessions: $sessions,
      ai_david_recent: $ai_david,
      recent_research: $research,
      recent_commits: $commits,
      in_progress_tasks: $in_progress
    }' > "$OUTPUT_FILE"

  echo "Activity digest written to $OUTPUT_FILE"
}

main "$@"

# Always exit 0 so creative-think runs regardless
exit 0
