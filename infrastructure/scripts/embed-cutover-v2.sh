#!/bin/bash
# Embedder v2 cutover, phase BUILD driver: fills every `<name>__v2` shadow collection, one batch at a
# time, taking the GPU queue PER BATCH at prio 3 (jicm-gpu-queue.sh, "Long batch work") so lanes'
# post-cycle RAG/digest/Graphiti jobs slip in between. Smallest collections first. Resumable: a rerun
# picks up where it stopped. Non-destructive: source collections are never written.
#   nohup infrastructure/scripts/embed-cutover-v2.sh > .claude/logs/embed-cutover-v2.log 2>&1 &
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PY="$ROOT/infrastructure/.venv/bin/python"
STEP="$ROOT/infrastructure/scripts/embed-cutover-v2.py"
source "$ROOT/.claude/scripts/jicm-gpu-queue.sh"

ts() { date -u +%Y-%m-%dT%H:%M:%SZ; }
# plan prints "<name> <count> shadow <done>"; sort by count so small collections finish first.
names=$("$PY" "$STEP" plan | awk '$1 != "TOTAL" {print $2, $1}' | sort -n | awk '{print $2}')
for name in $names; do
    echo "$(ts) START $name"
    k=0
    while :; do
        k=$((k + 1))
        if ! gpu_acquire 3 "embed-cutover-v2 $name batch $k" 10800; then
            echo "$(ts) ALERT gpu wait timed out on $name batch $k; stopping (rerun resumes)"
            exit 1
        fi
        out=$("$PY" "$STEP" batch "$name" 256 2>&1); rc=$?
        gpu_release
        echo "$out" | sed "s/^/$(ts) /"
        if [ $rc -ne 0 ]; then
            echo "$(ts) ALERT batch failed on $name (rc=$rc); stopping (rerun resumes)"
            exit 1
        fi
        echo "$out" | grep -q '^remaining=0$' && break
    done
    "$PY" "$STEP" verify "$name" | sed "s/^/$(ts) VERIFY /"
done
echo "$(ts) BUILD COMPLETE"
