#!/usr/bin/env python3
"""
token-extractor.py — Claude Code Session JSONL Token Metric Extractor

Parses Claude Code session JSONL files and extracts per-session token usage metrics.

Usage:
    token-extractor.py <jsonl_file_or_dir> [OPTIONS]

Options:
    --format <json|table|csv>   Output format (default: json)
    --aggregate                 Aggregate all files in a directory into one summary
    --session-id <id>           Filter to a specific session ID
    --out <path>                Write output to file instead of stdout

Pricing model (claude-sonnet-4):
    input:       $3.00 / MTok
    output:      $15.00 / MTok
    cache_write: $3.75 / MTok
    cache_read:  $0.30 / MTok

Exit codes:
    0 — success
    1 — argument / file error
    2 — parse error (non-fatal, partial results returned)
"""

import json
import sys
import os
import math
import argparse
from pathlib import Path
from datetime import datetime, timezone

# ---------------------------------------------------------------------------
# Pricing constants (per token, not per million)
# ---------------------------------------------------------------------------

PRICE_INPUT       = 3.00   / 1_000_000   # $3/MTok
PRICE_OUTPUT      = 15.00  / 1_000_000   # $15/MTok
PRICE_CACHE_WRITE = 3.75   / 1_000_000   # $3.75/MTok
PRICE_CACHE_READ  = 0.30   / 1_000_000   # $0.30/MTok


# ---------------------------------------------------------------------------
# JSONL parsing helpers
# ---------------------------------------------------------------------------

def _parse_line(line):
    """Parse a single JSONL line; return dict or None on failure."""
    line = line.strip()
    if not line:
        return None
    try:
        return json.loads(line)
    except json.JSONDecodeError:
        return None


def extract_session_metrics(filepath, filter_session_id=None):
    """
    Parse a single JSONL session file and return a list of session metric dicts.

    A single file may contain interleaved entries for multiple sessions (e.g.,
    subagents), so we group by sessionId.

    Returns:
        list[dict]  — one dict per session found in the file
    """
    filepath = Path(filepath)

    # session_id -> accumulated metrics
    sessions = {}

    try:
        with filepath.open("r", encoding="utf-8", errors="replace") as fh:
            for line in fh:
                entry = _parse_line(line)
                if entry is None:
                    continue

                # Only care about assistant entries that carry usage data
                if entry.get("type") != "assistant":
                    continue

                message = entry.get("message") or {}
                usage = message.get("usage") or {}
                if not usage:
                    continue

                session_id = entry.get("sessionId") or "unknown"
                if filter_session_id and session_id != filter_session_id:
                    continue

                ts_str = entry.get("timestamp")
                ts = None
                if ts_str:
                    try:
                        ts = datetime.fromisoformat(ts_str.rstrip("Z")).replace(
                            tzinfo=timezone.utc
                        )
                    except ValueError:
                        pass

                if session_id not in sessions:
                    sessions[session_id] = {
                        "session_id": session_id,
                        "source_file": str(filepath),
                        "timestamp_start": ts,
                        "timestamp_end": ts,
                        "turn_count": 0,
                        "input_tokens_total": 0,
                        "output_tokens_total": 0,
                        "cache_creation_tokens_total": 0,
                        "cache_read_tokens_total": 0,
                    }

                s = sessions[session_id]
                s["turn_count"] += 1

                # Update timestamp window
                if ts is not None:
                    if s["timestamp_start"] is None or ts < s["timestamp_start"]:
                        s["timestamp_start"] = ts
                    if s["timestamp_end"] is None or ts > s["timestamp_end"]:
                        s["timestamp_end"] = ts

                # Accumulate token counts
                s["input_tokens_total"] += usage.get("input_tokens", 0)
                s["output_tokens_total"] += usage.get("output_tokens", 0)

                # cache_creation_input_tokens (flat) or nested cache_creation object
                cc = usage.get("cache_creation_input_tokens", 0)
                if cc == 0:
                    cc_obj = usage.get("cache_creation") or {}
                    if isinstance(cc_obj, dict):
                        cc = sum(
                            v for v in cc_obj.values() if isinstance(v, (int, float))
                        )
                s["cache_creation_tokens_total"] += int(cc)

                cr = usage.get("cache_read_input_tokens", 0)
                s["cache_read_tokens_total"] += int(cr)

    except (OSError, IOError) as exc:
        sys.stderr.write(
            "[token-extractor] WARNING: could not read {}: {}\n".format(filepath, exc)
        )
        return []

    # Post-process each session
    result = []
    for sid, s in sessions.items():
        inp   = s["input_tokens_total"]
        out   = s["output_tokens_total"]
        cc    = s["cache_creation_tokens_total"]
        cr    = s["cache_read_tokens_total"]
        total = inp + out + cc + cr
        effective = inp + out

        # cache_ratio = cache_read / (cache_read + cache_creation + input) * 100
        denominator = cr + cc + inp
        cache_ratio = (cr / denominator * 100) if denominator > 0 else 0.0

        cost = (
            inp   * PRICE_INPUT
            + out * PRICE_OUTPUT
            + cc  * PRICE_CACHE_WRITE
            + cr  * PRICE_CACHE_READ
        )

        def _fmt_ts(ts):
            if ts is None:
                return None
            return ts.strftime("%Y-%m-%dT%H:%M:%SZ")

        result.append({
            "session_id":                sid,
            "source_file":               s["source_file"],
            "timestamp_start":           _fmt_ts(s["timestamp_start"]),
            "timestamp_end":             _fmt_ts(s["timestamp_end"]),
            "turn_count":                s["turn_count"],
            "input_tokens_total":        inp,
            "output_tokens_total":       out,
            "cache_creation_tokens_total": cc,
            "cache_read_tokens_total":   cr,
            "total_tokens_all":          total,
            "effective_tokens":          effective,
            "cache_ratio":               round(cache_ratio, 4),
            "estimated_cost_usd":        round(cost, 6),
        })

    return result


# ---------------------------------------------------------------------------
# Directory scanning
# ---------------------------------------------------------------------------

def collect_jsonl_files(path):
    """Return all .jsonl files under path (max depth 2)."""
    path = Path(path)
    files = []
    if path.is_file() and path.suffix == ".jsonl":
        return [path]

    # Walk up to 2 levels deep (top-level + UUID subdirs)
    for item in path.iterdir():
        if item.is_file() and item.suffix == ".jsonl":
            files.append(item)
        elif item.is_dir():
            for sub in item.iterdir():
                if sub.is_file() and sub.suffix == ".jsonl":
                    files.append(sub)

    return sorted(files)


# ---------------------------------------------------------------------------
# Aggregation
# ---------------------------------------------------------------------------

def aggregate_sessions(sessions):
    """Compute summary statistics over a list of session metric dicts."""
    n = len(sessions)
    if n == 0:
        return {
            "session_count": 0,
            "total_tokens": 0,
            "avg_total_tokens": 0,
            "avg_cache_ratio": 0.0,
            "total_cost_usd": 0.0,
            "avg_cost_usd": 0.0,
            "avg_input_tokens": 0,
            "avg_output_tokens": 0,
            "avg_cache_creation_tokens": 0,
            "avg_cache_read_tokens": 0,
        }

    def _avg(key):
        return round(sum(s.get(key, 0) for s in sessions) / n)

    def _avg_f(key):
        return round(sum(s.get(key, 0.0) for s in sessions) / n, 6)

    total_tokens = sum(s.get("total_tokens_all", 0) for s in sessions)
    total_cost   = sum(s.get("estimated_cost_usd", 0.0) for s in sessions)
    avg_cr       = sum(s.get("cache_ratio", 0.0) for s in sessions) / n

    return {
        "session_count":              n,
        "total_tokens":               total_tokens,
        "avg_total_tokens":           _avg("total_tokens_all"),
        "avg_cache_ratio":            round(avg_cr, 4),
        "total_cost_usd":             round(total_cost, 6),
        "avg_cost_usd":               round(total_cost / n, 6),
        "avg_input_tokens":           _avg("input_tokens_total"),
        "avg_output_tokens":          _avg("output_tokens_total"),
        "avg_cache_creation_tokens":  _avg("cache_creation_tokens_total"),
        "avg_cache_read_tokens":      _avg("cache_read_tokens_total"),
    }


# ---------------------------------------------------------------------------
# Output formatters
# ---------------------------------------------------------------------------

def format_json(sessions, summary):
    return json.dumps({"sessions": sessions, "summary": summary})


def format_table(sessions, summary):
    """Return a human-readable table string."""
    lines = []
    header = (
        "{:<40s}  {:>12s}  {:>12s}  {:>12s}  {:>12s}  {:>11s}  {:>14s}"
    ).format(
        "Session ID",
        "Input Tok",
        "Output Tok",
        "Cache Write",
        "Cache Read",
        "Cache Ratio",
        "Cost USD",
    )
    sep = "-" * len(header)
    lines.append(sep)
    lines.append(header)
    lines.append(sep)

    for s in sessions:
        sid = s.get("session_id", "")
        if len(sid) > 38:
            sid = sid[:36] + ".."
        lines.append(
            "{:<40s}  {:>12,d}  {:>12,d}  {:>12,d}  {:>12,d}  {:>10.1f}%  {:>14.6f}".format(
                sid,
                s.get("input_tokens_total", 0),
                s.get("output_tokens_total", 0),
                s.get("cache_creation_tokens_total", 0),
                s.get("cache_read_tokens_total", 0),
                s.get("cache_ratio", 0.0),
                s.get("estimated_cost_usd", 0.0),
            )
        )

    lines.append(sep)
    lines.append(
        "Sessions: {}  |  Total tokens: {:,}  |  Avg cache ratio: {:.1f}%  |  Total cost: ${:.4f}".format(
            summary.get("session_count", 0),
            summary.get("total_tokens", 0),
            summary.get("avg_cache_ratio", 0.0),
            summary.get("total_cost_usd", 0.0),
        )
    )
    return "\n".join(lines)


def format_csv(sessions, summary):
    """Return CSV string with header."""
    fields = [
        "session_id", "source_file", "timestamp_start", "timestamp_end",
        "turn_count", "input_tokens_total", "output_tokens_total",
        "cache_creation_tokens_total", "cache_read_tokens_total",
        "total_tokens_all", "effective_tokens", "cache_ratio",
        "estimated_cost_usd",
    ]
    rows = [",".join(fields)]
    for s in sessions:
        rows.append(",".join(str(s.get(f, "")) for f in fields))
    return "\n".join(rows)


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Extract token metrics from Claude Code session JSONL files.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "path",
        help="Path to a single .jsonl file or a directory of session files.",
    )
    parser.add_argument(
        "--format",
        choices=["json", "table", "csv"],
        default="json",
        dest="fmt",
        help="Output format (default: json)",
    )
    parser.add_argument(
        "--aggregate",
        action="store_true",
        help="Aggregate all files in a directory into one summary (no per-session list).",
    )
    parser.add_argument(
        "--session-id",
        default=None,
        metavar="ID",
        help="Filter output to a specific session ID.",
    )
    parser.add_argument(
        "--out",
        default=None,
        metavar="PATH",
        help="Write output to this file instead of stdout.",
    )

    args = parser.parse_args()

    target = Path(args.path)
    if not target.exists():
        sys.stderr.write(
            "[token-extractor] ERROR: path does not exist: {}\n".format(target)
        )
        sys.exit(1)

    # Collect files
    if target.is_file():
        files = [target]
    else:
        files = collect_jsonl_files(target)

    if not files:
        sys.stderr.write(
            "[token-extractor] WARNING: no .jsonl files found under {}\n".format(target)
        )
        # Emit empty result set
        empty = {"sessions": [], "summary": aggregate_sessions([])}
        output = json.dumps(empty)
        if args.out:
            Path(args.out).parent.mkdir(parents=True, exist_ok=True)
            Path(args.out).write_text(output)
        else:
            print(output)
        sys.exit(0)

    # Parse all files
    all_sessions = []
    for fp in files:
        all_sessions.extend(extract_session_metrics(fp, filter_session_id=args.session_id))

    summary = aggregate_sessions(all_sessions)

    # Format
    if args.fmt == "json":
        output = format_json(all_sessions, summary)
    elif args.fmt == "table":
        output = format_table(all_sessions, summary)
    elif args.fmt == "csv":
        output = format_csv(all_sessions, summary)
    else:
        output = format_json(all_sessions, summary)

    # Write
    if args.out:
        Path(args.out).parent.mkdir(parents=True, exist_ok=True)
        Path(args.out).write_text(output)
    else:
        print(output)


if __name__ == "__main__":
    main()
