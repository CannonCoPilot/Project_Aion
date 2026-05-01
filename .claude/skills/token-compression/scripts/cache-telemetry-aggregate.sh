#!/usr/bin/env bash
# Aggregate cache-telemetry CSV into per-session summary.
# Usage: cache-telemetry-aggregate.sh <csv-file>
set -u
CSV="${1:?usage: $0 <csv-file>}"
awk -F, 'NR>1 {
  s[$1]++; cr[$1]+=$5; e5[$1]+=$6; e1[$1]+=$7; in_[$1]+=$4; out[$1]+=$8
}
END {
  printf "%-40s %6s %10s %10s %10s %8s\n", "session_id", "turns", "input", "cache_read", "eph_1h", "hit%"
  for (k in s) {
    denom = cr[k]+e5[k]+e1[k]+in_[k]
    rate = (denom>0) ? (cr[k]/denom)*100 : 0
    printf "%-40s %6d %10d %10d %10d %7.1f%%\n", k, s[k], in_[k], cr[k], e1[k], rate
  }
}' "$CSV"
