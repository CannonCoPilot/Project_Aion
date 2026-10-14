#!/bin/bash
# Embedder v2 cutover, Graphiti part driver: re-embeds every Neo4j entity name and edge fact with v2
# (graphiti-reembed-v2.py), one batch at a time, taking the GPU queue PER BATCH at prio 3 so lanes'
# post-cycle jobs slip in between. Resumable: a rerun picks up where it stopped.
#   NEO4J_PASSWORD=... nohup infrastructure/scripts/graphiti-reembed-v2.sh > .claude/logs/graphiti-reembed-v2.log 2>&1 &
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PY="$ROOT/infrastructure/.venv/bin/python"
STEP="$ROOT/infrastructure/scripts/graphiti-reembed-v2.py"
source "$ROOT/.claude/scripts/jicm-gpu-queue.sh"

ts() { date -u +%Y-%m-%dT%H:%M:%SZ; }
"$PY" "$STEP" plan | sed "s/^/$(ts) PLAN /"
for kind in entity edge; do
    echo "$(ts) START $kind"
    k=0
    while :; do
        k=$((k + 1))
        if ! gpu_acquire 3 "graphiti-reembed-v2 $kind batch $k" 10800; then
            echo "$(ts) ALERT gpu wait timed out on $kind batch $k; stopping (rerun resumes)"
            exit 1
        fi
        out=$("$PY" "$STEP" batch "$kind" 256 2>&1); rc=$?
        gpu_release
        echo "$out" | sed "s/^/$(ts) $kind /"
        if [ $rc -ne 0 ]; then
            echo "$(ts) ALERT batch failed on $kind (rc=$rc); stopping (rerun resumes)"
            exit 1
        fi
        echo "$out" | grep -q '^remaining=0$' && break
    done
    "$PY" "$STEP" verify "$kind" | sed "s/^/$(ts) VERIFY /"
done
echo "$(ts) GRAPHITI REEMBED COMPLETE"
