#!/bin/sh
# detect-phase.sh — Consumption Phase Detector
#
# STUB: TC-07 (Build compression mode auto-detection) is pending.
# Uses heuristic pattern-matching. Replace with ML detection in TC-07.
#
# Usage: detect-phase.sh [OPTIONS]
#   --input <file>                  Input file to analyse (default: stdin)
#   --confidence-threshold <float>  Min confidence threshold (default: 0.60)
#   --help                          Show help and exit
#
# Output (stdout): JSON  {"phase":"<name>","confidence":<float>,"reason":"<str>"}
#
# Phases: startup, reasoning, tool_output, session_state,
#         user_response, input_preprocessing, unknown
#
# Exit codes: 0=success, 1=error
# Version: 0.1.0-stub

set -e

INPUT_FILE=""
CONFIDENCE_THRESHOLD="0.60"

while [ $# -gt 0 ]; do
    case "$1" in
        --input)               INPUT_FILE="$2"; shift 2 ;;
        --confidence-threshold) CONFIDENCE_THRESHOLD="$2"; shift 2 ;;
        --help)
            sed -n '/^# Usage/,/^# Version/p' "$0"; exit 0 ;;
        -*)
            echo "[detect-phase] Unknown option: $1" >&2; exit 1 ;;
        *)  INPUT_FILE="$1"; shift ;;
    esac
done

if [ -n "${INPUT_FILE}" ]; then
    if [ ! -f "${INPUT_FILE}" ]; then
        echo "[detect-phase] ERROR: File not found: ${INPUT_FILE}" >&2; exit 1
    fi
    CONTENT_FILE="${INPUT_FILE}"
else
    TMPF=$(mktemp /tmp/detect-phase-XXXXXX)
    cat > "${TMPF}"
    CONTENT_FILE="${TMPF}"
fi

python3 - "${CONTENT_FILE}" "${CONFIDENCE_THRESHOLD}" << 'PYEOF'
import sys, json, re

content_file = sys.argv[1]
threshold = float(sys.argv[2])

with open(content_file) as f:
    content = f.read()

char_count = len(content)
scores = {}

# startup signals
startup_pats = [r"world.generat", r"session.start", r"loading context",
                r"initializ", r"CLAUDE\.md"]
s = min(sum(0.25 for p in startup_pats if re.search(p, content, re.I)), 0.90)
if s > 0: scores["startup"] = (s, "startup signals")

# reasoning signals
reasoning_pats = [r"think step by step", r"let me reason", r"chain of thought",
                  r"<thinking>", r"my reasoning", r"step \d+:", r"\btherefore\b"]
s = min(sum(0.20 for p in reasoning_pats if re.search(p, content, re.I)), 0.90)
if s > 0: scores["reasoning"] = (s, "reasoning signals")

# tool_output signals
cb = len(re.findall(r"```", content))
s = 0.0
if cb >= 2: s += 0.40
if char_count > 1000 and cb >= 2: s += 0.30
tool_pats = [r"tool.call", r"tool.result", r"tool.use", r"bash.output"]
s += min(sum(0.20 for p in tool_pats if re.search(p, content, re.I)), 0.30)
s = min(s, 0.90)
if s > 0: scores["tool_output"] = (s, "tool output signals")

# session_state signals
sess_pats = [r"session.state", r"checkpoint", r"current.task", r"next.step",
             r"status.*idle|status.*running", r"^## "]
s = min(sum(0.20 for p in sess_pats if re.search(p, content, re.I | re.M)), 0.90)
if s > 0: scores["session_state"] = (s, "session state signals")

# user_response signals
user_pats = [r"^(hi|hello|sure|of course|here is|here's)", r"user.response"]
s = min(sum(0.25 for p in user_pats if re.search(p, content, re.I | re.M)), 0.80)
if s > 0: scores["user_response"] = (s, "user response signals")

# default for medium-length unclassified content
if not scores and 100 <= char_count <= 5000:
    scores["input_preprocessing"] = (0.65, "unclassified medium content default")

if char_count < 50:
    scores["unknown"] = (0.90, "content too short to classify")

best_phase, best_score, best_reason = "unknown", 0.0, "no phase exceeded threshold"
for phase, (sc, reason) in scores.items():
    if sc > best_score:
        best_score, best_phase, best_reason = sc, phase, reason

if best_score < threshold:
    best_phase = "unknown"
    best_reason = f"best score {best_score:.2f} below threshold {threshold}"

print(json.dumps({"phase": best_phase, "confidence": round(best_score, 4),
                  "reason": best_reason}))
PYEOF
