#!/usr/bin/env python3
"""
Parse Claude Code session JSONL files and extract per-turn cache telemetry.

Output: CSV with columns
  session_id, turn_n, ts, input_tokens, cache_read,
  eph_5m, eph_1h, output_tokens, hit_rate
"""
import json, sys, csv, pathlib, argparse

def parse_session(path):
    rows = []
    with open(path) as f:
        for turn_n, line in enumerate(f):
            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                continue
            usage = event.get("message", {}).get("usage", {})
            if not usage:
                continue
            input_tokens = usage.get("input_tokens", 0)
            cache_read = usage.get("cache_read_input_tokens", 0)
            cache_creation = usage.get("cache_creation", {}) or {}
            eph_5m = cache_creation.get("ephemeral_5m_input_tokens", 0) if isinstance(cache_creation, dict) else 0
            eph_1h = cache_creation.get("ephemeral_1h_input_tokens", 0) if isinstance(cache_creation, dict) else 0
            output_tokens = usage.get("output_tokens", 0)
            denom = cache_read + eph_5m + eph_1h + input_tokens
            hit_rate = (cache_read / denom) if denom else 0.0
            rows.append({
                "session_id": event.get("sessionId", ""),
                "turn_n": turn_n,
                "ts": event.get("timestamp", ""),
                "input_tokens": input_tokens,
                "cache_read": cache_read,
                "eph_5m": eph_5m,
                "eph_1h": eph_1h,
                "output_tokens": output_tokens,
                "hit_rate": round(hit_rate, 4),
            })
    return rows

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("path", help="Session JSONL file or directory")
    ap.add_argument("--out", default="-", help="Output CSV path (default stdout)")
    args = ap.parse_args()

    p = pathlib.Path(args.path)
    files = [p] if p.is_file() else sorted(p.rglob("*.jsonl"))

    out = sys.stdout if args.out == "-" else open(args.out, "w")
    fields = ["session_id", "turn_n", "ts", "input_tokens", "cache_read",
              "eph_5m", "eph_1h", "output_tokens", "hit_rate"]
    w = csv.DictWriter(out, fieldnames=fields)
    w.writeheader()
    for f in files:
        for row in parse_session(f):
            w.writerow(row)

if __name__ == "__main__":
    main()
