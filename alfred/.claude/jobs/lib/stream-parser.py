#!/usr/bin/env python3
"""
Loom Phase 2: stream-json parser for NEXUS executor.

Reads Claude Code --output-format stream-json JSONL from stdin.
Emits the final result JSON envelope to stdout (identical to --output-format json).
Writes tool call records to a sidecar JSONL file.

Usage:
    claude -p "..." --output-format stream-json --verbose ... \
        | python3 stream-parser.py --tools-file /tmp/tools.jsonl \
                                   --output-dir /tmp/outputs \
                                   --inline-max 1024 \
        > result.json

Exit codes:
    0 - Success (result event found and emitted)
    2 - No result event in stream (truncated/failed)
"""

import argparse
import json
import os
import sys

# Import the secret-scrub library from the same lib/ directory.
# Loaded via SourceFileLoader because the file has a hyphen in its name
# (secret-scrub.py is the canonical filename for the CLI tool, but Python
# import statements can't import hyphenated modules directly).
from importlib.machinery import SourceFileLoader
_scrub_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "secret-scrub.py")
_secret_scrub = SourceFileLoader("secret_scrub", _scrub_path).load_module()
scrub_secrets = _secret_scrub.scrub


def parse_args():
    p = argparse.ArgumentParser(description="Parse stream-json into result + tool calls")
    p.add_argument("--tools-file", help="Path to write tool call JSONL")
    p.add_argument("--output-dir", help="Directory for large tool output files")
    p.add_argument("--inline-max", type=int, default=1024,
                   help="Max bytes for inline tool output (default: 1024)")
    p.add_argument("--no-capture", action="store_true",
                   help="Skip tool call capture, only extract final result")
    return p.parse_args()


def main():
    args = parse_args()

    # Ensure output-dir exists if specified
    if args.output_dir:
        os.makedirs(args.output_dir, exist_ok=True)

    # State tracking
    pending_tool_uses = {}  # tool_use_id -> {name, input, turn, seq}
    tool_calls = []         # completed tool call records
    turn = 0                # incremented on each assistant message
    seq = 0                 # global tool call sequence number
    raw_result_line = None  # preserve original bytes for byte-identical output

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            print("stream-parser: skipping non-JSON line", file=sys.stderr)
            continue

        event_type = event.get("type", "")

        # Filter noise
        if event_type in ("system", "rate_limit_event"):
            continue

        if event_type == "assistant":
            turn += 1
            if args.no_capture:
                continue

            message = event.get("message", {})
            for block in message.get("content", []):
                if block.get("type") == "tool_use":
                    seq += 1
                    tool_use_id = block.get("id", "")
                    pending_tool_uses[tool_use_id] = {
                        "name": block.get("name", "unknown"),
                        "input": block.get("input", {}),
                        "turn": turn,
                        "seq": seq,
                    }

        elif event_type == "user":
            if args.no_capture:
                continue

            message = event.get("message", {})
            for block in message.get("content", []):
                if block.get("type") == "tool_result":
                    tool_use_id = block.get("tool_use_id", "")
                    pending = pending_tool_uses.pop(tool_use_id, None)
                    if pending is None:
                        continue

                    # Extract output content
                    content = block.get("content", "")
                    if isinstance(content, list):
                        # Content can be a list of blocks
                        parts = []
                        for part in content:
                            if isinstance(part, dict):
                                parts.append(part.get("text", part.get("content", str(part))))
                            else:
                                parts.append(str(part))
                        content = "\n".join(parts)
                    elif not isinstance(content, str):
                        content = str(content)

                    is_error = block.get("is_error", False)
                    output_length = len(content.encode("utf-8", errors="replace"))

                    # Scrub secrets BEFORE deciding inline vs file. Tool outputs
                    # are the primary leak vector — they captured the Telegram
                    # token, GitHub PATs, and OpenAI keys that ended up in
                    # public AIfred and loom-colab repos. T3.2 / AIProjects-v523.
                    # The scrub library logs each redaction to
                    # .claude/logs/secret-scrub.jsonl for audit.
                    scrub_source = f"headless:{pending.get('name','?')}:tool-{pending['seq']}"
                    content, _scrub_redactions = scrub_secrets(content, source=scrub_source)
                    output_length = len(content.encode("utf-8"))

                    # Decide inline vs file
                    output_inline = None
                    output_file = None

                    if output_length <= args.inline_max:
                        output_inline = content
                    else:
                        # Write to file, store preview inline
                        output_inline = content[:200]
                        if args.output_dir:
                            fname = f"tool-{pending['seq']}-output.txt"
                            fpath = os.path.join(args.output_dir, fname)
                            with open(fpath, "w", encoding="utf-8") as f:
                                f.write(content)
                            output_file = fname
                        else:
                            print(f"stream-parser: WARNING tool-{pending['seq']} output "
                                  f"truncated ({output_length} bytes > {args.inline_max}), "
                                  f"no --output-dir specified", file=sys.stderr)

                    tool_calls.append({
                        "seq": pending["seq"],
                        "turn": pending["turn"],
                        "tool_use_id": tool_use_id,
                        "tool": pending["name"],
                        "input": pending["input"],
                        "output_length": output_length,
                        "output_inline": output_inline,
                        "output_file": output_file,
                        "is_error": is_error,
                        "duration_ms": None,
                    })

        elif event_type == "result":
            raw_result_line = line  # preserve original bytes — do NOT re-serialize

    # Emit result to stdout (raw line, byte-identical to --output-format json)
    if raw_result_line is None:
        print("stream-parser: ERROR no result event in stream", file=sys.stderr)
        sys.exit(2)

    sys.stdout.write(raw_result_line)
    sys.stdout.write("\n")

    # Write tool calls
    if args.tools_file and tool_calls:
        with open(args.tools_file, "w", encoding="utf-8") as f:
            for tc in tool_calls:
                f.write(json.dumps(tc, ensure_ascii=False))
                f.write("\n")

    # Summary to stderr
    if tool_calls:
        by_tool = {}
        for tc in tool_calls:
            by_tool[tc["tool"]] = by_tool.get(tc["tool"], 0) + 1
        summary = " ".join(f"{k}:{v}" for k, v in sorted(by_tool.items()))
        print(f"stream-parser: {len(tool_calls)} tool calls captured ({summary})",
              file=sys.stderr)
    else:
        print("stream-parser: 0 tool calls captured", file=sys.stderr)


if __name__ == "__main__":
    main()
