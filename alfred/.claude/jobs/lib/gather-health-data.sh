#!/usr/bin/env bash
# gather-health-data.sh — Pre-gather infrastructure data for health-summary job
#
# Collects docker status, disk usage, and service health into a single text block
# that gets injected into the LLM prompt. The LLM only needs to analyze, not gather.
#
# Output: stdout (text block for prompt injection)
# Called by: executor.sh pre_gather mechanism

set -uo pipefail

echo "## Pre-Gathered Infrastructure Data"
echo ""
echo "### Docker Containers"
echo '```'
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.State}}\t{{.Ports}}' 2>/dev/null || echo "Docker not available"
echo '```'
echo ""

echo "### Disk Usage"
echo '```'
df -h / /Users 2>/dev/null | head -5
echo '```'
echo ""

echo "### Docker Disk Usage"
echo '```'
docker system df 2>/dev/null || echo "Docker not available"
echo '```'
echo ""

echo "### Recent Container Logs (errors only, last 50 lines each)"
for container in $(docker ps --format '{{.Names}}' 2>/dev/null); do
    errors=$(docker logs --tail 50 "$container" 2>&1 | grep -iE '(error|fatal|panic|critical|exception)' | tail -5)
    if [ -n "$errors" ]; then
        echo "#### $container"
        echo '```'
        echo "$errors"
        echo '```'
        echo ""
    fi
done

echo "### Health Check Log (recent)"
HEALTH_LOG="${PROJECT_DIR:-.}/.claude/logs/.health-check-log.json"
if [ -f "$HEALTH_LOG" ]; then
    echo '```json'
    python3 -c "
import json
with open('$HEALTH_LOG') as f:
    entries = json.load(f)
recent = entries[-10:] if len(entries) > 10 else entries
for e in recent:
    print(json.dumps(e, indent=2))
" 2>/dev/null || echo "Could not parse health log"
    echo '```'
else
    echo "No prior health log found."
fi
