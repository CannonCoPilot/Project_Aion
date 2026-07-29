#!/bin/bash
# Does trimming MORE of the oldest transcript improve recovery?
# Prompted by an n=1 observation: 01d1ae83 scored 0.667 at trim 4048 vs 0.381 at trim 3087.
#
# Design: 5 transcripts x 4 forced-drop levels (0/10/20/30% of the oldest prose), shipping config
# otherwise, --trim-quantum 1 so quantisation does not add a second varying factor.
#
# The metric stays neutral by construction: the recovery target is the union of top-15-by-frequency
# and top-15-by-recency computed from the WHOLE session BEFORE any trimming, so dropping content
# cannot make the target easier. A run that drops 30% is still scored against everything.
#
# No `set -euo pipefail` (macOS Bash 3.2 house rule).
cd "$(dirname "$0")" || exit 1
OUT="sweep-trim-2026-07-28.jsonl"
RUNID="trim-$$"
: > "$OUT"
for SID in 91bcac6a f56d4d98 bc145f04 ca5d3fee 01d1ae83; do
  for FR in 0.0 0.10 0.20 0.30; do
    TAG="${RUNID}|${SID}|${FR}"
    echo "[$(date +%H:%M:%S)] $TAG" >&2
    python3 tdigest.py "$SID" --model qwen3-32b-nothink:latest \
      --grounded --reason-cap 300 --temp 0 --npred 2200 \
      --order recency --layout tx --fs-allowance 900 --trim-quantum 1 \
      --drop-frac "$FR" --tag "$TAG" >> "$OUT" 2>>sweep-trim.err
  done
done
echo "[$(date +%H:%M:%S)] DONE $(wc -l < "$OUT") rows" >&2
