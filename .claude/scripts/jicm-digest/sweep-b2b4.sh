#!/bin/bash
# B2 (prompt layout) x B4 (fact-sheet ordering) full factorial, 32B, grounded.
# 2 layouts x 2 orders x 5 transcripts = 20 runs. Both factors are now deconfounded:
# the recency sheet carries the (N x) counts exactly as the freq sheet does.
# NOTE: no `set -euo pipefail` (macOS/Bash 3.2 house rule; a non-zero grep would kill it).
cd "$(dirname "$0")" || exit 1
OUT="sweep-b2b4-2026-07-28.jsonl"
RUNID="b2b4-$$"
: > "$OUT"
for SID in 91bcac6a f56d4d98 bc145f04 ca5d3fee 01d1ae83; do
  for LAYOUT in tx fs; do
    for ORDER in recency freq; do
      TAG="${RUNID}|${SID}|${LAYOUT}|${ORDER}"
      echo "[$(date +%H:%M:%S)] $TAG" >&2
      python3 tdigest.py "$SID" --model qwen3-32b-nothink:latest \
        --grounded --reason-cap 300 --temp 0 --npred 2200 \
        --order "$ORDER" --layout "$LAYOUT" --tag "$TAG" >> "$OUT" 2>>sweep-b2b4.err
    done
  done
done
echo "[$(date +%H:%M:%S)] DONE $(wc -l < "$OUT") rows" >&2
