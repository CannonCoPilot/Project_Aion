#!/usr/bin/env python3
"""
compress-jsonl.py — Stage 1 Raw JSONL Pre-Filter for JICM Pipeline

Processes raw Claude Code JSONL transcripts BEFORE the JQ extraction step
in jicm-prep-context.sh. Applies domain-specific compression techniques
that target the actual data shapes in the transcript:

  1. TYPE FILTER: Remove entries that don't contribute to context
     reconstruction (attachment, ai-title, last-prompt, file-history-snapshot,
     queue-operation, system).

  2. TOOL RESULT DEDUP: Hash tool result content; keep first occurrence,
     replace duplicates with a compact "[seen N times]" annotation.

  3. TOOL OUTPUT TRUNCATION: Results >2KB get head+tail with a truncation
     marker preserving first 500 and last 200 chars.

  4. SYSTEM-REMINDER STRIP: Remove <system-reminder> blocks from user
     text entries (hook-injected content, repeated CLAUDE.md excerpts).

  5. ASSISTANT COMPACTION: Strip tool_use blocks from assistant entries
     (keep only text blocks — the tool_use JSON is action metadata, not
     context-worthy content).

The output is valid JSONL that passes through the existing JQ extraction
pipeline unchanged. Structure is preserved; only content is reduced.

Memory System role:
  Stage: COMPRESS (pre-JQ filter, new Stage 1 in 3-stage NLP pipeline)
  Target: 40-60% reduction on raw JSONL (1-2MB typical)

Requires: Python 3.8+ stdlib only (no dependencies).
"""

import argparse
import hashlib
import json
import re
import sys
from collections import defaultdict

FILTER_TYPES = {"attachment", "ai-title", "last-prompt", "file-history-snapshot", "queue-operation"}
TRUNCATE_THRESHOLD = 2000
TRUNCATE_HEAD = 500
TRUNCATE_TAIL = 200
SYSREM_PATTERN = re.compile(r"<system-reminder>.*?</system-reminder>", re.DOTALL)


class Stats:
    def __init__(self):
        self.input_lines = 0
        self.input_bytes = 0
        self.output_lines = 0
        self.output_bytes = 0
        self.filtered_by_type = defaultdict(int)
        self.tool_results_total = 0
        self.tool_results_deduped = 0
        self.tool_results_truncated = 0
        self.sysrem_stripped = 0
        self.assistant_compacted = 0


def content_to_str(content) -> str:
    """Normalize tool result content to string for hashing/truncation."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for item in content:
            if isinstance(item, dict):
                parts.append(item.get("text", item.get("content", str(item))))
            else:
                parts.append(str(item))
        return "\n".join(parts)
    return str(content)


def hash_content(content) -> str:
    text = content_to_str(content)
    return hashlib.md5(text.encode("utf-8", errors="replace")).hexdigest()[:16]


def truncate_tool_output(content) -> str:
    text = content_to_str(content)
    if len(text) <= TRUNCATE_THRESHOLD:
        return text
    head = text[:TRUNCATE_HEAD]
    tail = text[-TRUNCATE_TAIL:]
    omitted = len(text) - TRUNCATE_HEAD - TRUNCATE_TAIL
    return f"{head}\n[...truncated {omitted} chars...]\n{tail}"


def strip_system_reminders(text: str) -> str:
    return SYSREM_PATTERN.sub("", text).strip()


def compact_assistant_content(content) -> tuple:
    """Keep only text blocks; replace tool_use-only entries with placeholder.
    Returns (compacted_content, was_modified)."""
    if not isinstance(content, list):
        return content, False
    text_items = []
    tool_names = []
    for item in content:
        if isinstance(item, dict):
            if item.get("type") == "text":
                text_items.append(item)
            elif item.get("type") == "tool_use":
                tool_names.append(item.get("name", "unknown"))
            # thinking blocks silently dropped — internal reasoning
    if text_items:
        return text_items, len(text_items) < len(content)
    if tool_names:
        placeholder = {"type": "text", "text": f"[tool calls: {', '.join(tool_names)}]"}
        return [placeholder], True
    return content, False


def process_jsonl(input_stream, output_stream, tail_lines: int = 0) -> Stats:
    stats = Stats()
    tool_seen = {}
    lines = list(input_stream)

    if tail_lines > 0:
        lines = lines[-tail_lines:]

    for raw_line in lines:
        raw_line = raw_line.rstrip("\n")
        if not raw_line:
            continue

        stats.input_lines += 1
        stats.input_bytes += len(raw_line.encode())

        try:
            entry = json.loads(raw_line)
        except json.JSONDecodeError:
            output_stream.write(raw_line + "\n")
            stats.output_lines += 1
            stats.output_bytes += len(raw_line.encode())
            continue

        entry_type = entry.get("type", "")

        # 1. Type filter
        if entry_type in FILTER_TYPES:
            stats.filtered_by_type[entry_type] += 1
            continue

        # 2. Tool result dedup + truncation
        if entry_type == "user":
            content = entry.get("message", {}).get("content", [])
            if isinstance(content, list):
                new_content = []
                for item in content:
                    if isinstance(item, dict) and item.get("type") == "tool_result":
                        stats.tool_results_total += 1
                        tc_raw = item.get("content", "")
                        tc = content_to_str(tc_raw)
                        h = hash_content(tc_raw)

                        if h in tool_seen:
                            tool_seen[h]["count"] += 1
                            stats.tool_results_deduped += 1
                            item = dict(item)
                            item["content"] = f"[duplicate tool output — seen {tool_seen[h]['count']} times, first at entry {tool_seen[h]['first_entry']}]"
                            new_content.append(item)
                        else:
                            tool_seen[h] = {"count": 1, "first_entry": stats.input_lines}
                            if len(tc) > TRUNCATE_THRESHOLD:
                                stats.tool_results_truncated += 1
                                item = dict(item)
                                item["content"] = truncate_tool_output(tc_raw)
                            new_content.append(item)

                    elif isinstance(item, dict) and item.get("type") == "text":
                        # 4. System-reminder strip
                        text = item.get("text", "")
                        if "<system-reminder>" in text:
                            stats.sysrem_stripped += 1
                            item = dict(item)
                            item["text"] = strip_system_reminders(text)
                            if item["text"]:
                                new_content.append(item)
                        else:
                            new_content.append(item)
                    else:
                        new_content.append(item)

                entry["message"]["content"] = new_content

        # 5. Assistant compaction (tool_use → placeholder, thinking → dropped)
        elif entry_type == "assistant":
            msg = entry.get("message", {})
            content = msg.get("content", [])
            if isinstance(content, list):
                compacted, was_modified = compact_assistant_content(content)
                if was_modified:
                    stats.assistant_compacted += 1
                    entry["message"]["content"] = compacted

        out_line = json.dumps(entry, ensure_ascii=False, separators=(",", ":"))
        output_stream.write(out_line + "\n")
        stats.output_lines += 1
        stats.output_bytes += len(out_line.encode())

    return stats


def main() -> int:
    parser = argparse.ArgumentParser(description="Stage 1 raw JSONL pre-filter for JICM")
    parser.add_argument("--input", metavar="FILE", help="Input JSONL (default: stdin)")
    parser.add_argument("--output", metavar="FILE", help="Output JSONL (default: stdout)")
    parser.add_argument("--tail", type=int, default=0, help="Process only last N lines (0=all)")
    parser.add_argument("--stats", action="store_true", help="Print compression stats to stderr")
    parser.add_argument("--stats-json", metavar="FILE", help="Write stats to JSON file")
    args = parser.parse_args()

    try:
        if args.input:
            with open(args.input, "r", encoding="utf-8", errors="replace") as f:
                input_lines = f.readlines()
        else:
            input_lines = sys.stdin.readlines()
    except (OSError, IOError) as e:
        print(f"compress-jsonl.py: read error: {e}", file=sys.stderr)
        return 1

    try:
        if args.output:
            out_f = open(args.output, "w", encoding="utf-8")
        else:
            out_f = sys.stdout
    except (OSError, IOError) as e:
        print(f"compress-jsonl.py: write error: {e}", file=sys.stderr)
        return 1

    try:
        stats = process_jsonl(iter(input_lines), out_f, tail_lines=args.tail)
    finally:
        if args.output and out_f != sys.stdout:
            out_f.close()

    if stats.input_bytes > 0:
        ratio = stats.output_bytes / stats.input_bytes
        reduction = 1.0 - ratio
    else:
        ratio = 1.0
        reduction = 0.0

    if args.stats:
        print(f"Stage 1 JSONL compression: {stats.input_bytes} → {stats.output_bytes} bytes "
              f"({reduction*100:.1f}% reduction)", file=sys.stderr)
        print(f"  Lines: {stats.input_lines} → {stats.output_lines}", file=sys.stderr)
        print(f"  Filtered by type: {dict(stats.filtered_by_type)}", file=sys.stderr)
        print(f"  Tool results: {stats.tool_results_total} total, "
              f"{stats.tool_results_deduped} deduped, "
              f"{stats.tool_results_truncated} truncated", file=sys.stderr)
        print(f"  System-reminders stripped: {stats.sysrem_stripped}", file=sys.stderr)
        print(f"  Assistant entries compacted: {stats.assistant_compacted}", file=sys.stderr)

    if args.stats_json:
        stats_data = {
            "input_bytes": stats.input_bytes,
            "output_bytes": stats.output_bytes,
            "input_lines": stats.input_lines,
            "output_lines": stats.output_lines,
            "compression_ratio": round(ratio, 4),
            "reduction_pct": round(reduction * 100, 1),
            "filtered_by_type": dict(stats.filtered_by_type),
            "tool_results_total": stats.tool_results_total,
            "tool_results_deduped": stats.tool_results_deduped,
            "tool_results_truncated": stats.tool_results_truncated,
            "sysrem_stripped": stats.sysrem_stripped,
            "assistant_compacted": stats.assistant_compacted,
        }
        try:
            with open(args.stats_json, "w") as f:
                json.dump(stats_data, f, indent=2)
        except (OSError, IOError):
            pass

    return 0


if __name__ == "__main__":
    sys.exit(main())
