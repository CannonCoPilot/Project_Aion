#!/usr/bin/env python3
"""
compress-input.py — NLP pre-compression for JICM context pipeline

Reads text (stdin or --input FILE), applies compression in the specified mode,
outputs to stdout or --output FILE, and writes compression metrics to a JSON file.

Requires only Python stdlib — no spacy, nltk, transformers, etc.

Modes:
  standard    20-40% token reduction; preserves file paths, task names,
              git state, code blocks, commands
  aggressive  standard + truncate non-code-block lines > 300 chars
  minimal     whitespace normalization only

Exit code 0 on success, non-zero on failure (caller falls back gracefully).
"""

import argparse
import json
import re
import sys


def count_tokens(text: str) -> int:
    """Approximate token count as chars/4."""
    return len(text) // 4


def compress_minimal(text: str) -> str:
    """
    Minimal mode: whitespace normalization only.
    - Collapse 3+ consecutive blank lines -> 1 blank line
    - Trim trailing whitespace from each line
    """
    lines = text.split("\n")
    result = []
    blank_run = 0

    for line in lines:
        stripped = line.rstrip()
        if stripped == "":
            blank_run += 1
            if blank_run <= 1:
                result.append("")
        else:
            blank_run = 0
            result.append(stripped)

    return "\n".join(result)


def compress_standard(text: str) -> str:
    """
    Standard mode: 20-40% token reduction while preserving:
    - file paths, task names, git state, code blocks, commands

    Techniques:
    1. Collapse 3+ consecutive blank lines -> 1 blank line
    2. Deduplicate consecutive identical lines
    3. Remove duplicate paragraphs (keep first, drop later)
    4. Trim trailing whitespace
    5. Remove boilerplate "Resume Instructions" section if repeated
    6. Strip repeated --- divider sequences (3+ consecutive -> 1)
    """
    lines = text.split("\n")

    # Pass 1: trim trailing whitespace + collapse blank runs + dedup consecutive lines
    result = []
    blank_run = 0
    prev_line = None

    for line in lines:
        stripped = line.rstrip()

        if stripped == "":
            blank_run += 1
            if blank_run <= 1:
                result.append("")
            prev_line = ""
        else:
            blank_run = 0
            # Deduplicate consecutive identical non-blank lines
            if stripped == prev_line:
                continue
            result.append(stripped)
            prev_line = stripped

    # Pass 2: collapse repeated --- divider sequences (3+ consecutive -> 1)
    deduped = []
    divider_run = 0
    for line in result:
        if re.match(r"^---+\s*$", line):
            divider_run += 1
            if divider_run <= 1:
                deduped.append(line)
        else:
            divider_run = 0
            deduped.append(line)
    result = deduped

    # Pass 3: remove duplicate paragraphs
    # A paragraph is a blank-line-delimited block of text
    # Split into paragraphs, track seen, keep only first occurrence
    text_rejoined = "\n".join(result)
    paragraphs = re.split(r"\n\n+", text_rejoined)

    seen_paragraphs = set()
    unique_paragraphs = []
    for para in paragraphs:
        para_stripped = para.strip()
        if not para_stripped:
            unique_paragraphs.append(para)
            continue
        # Normalize for comparison (collapse internal whitespace)
        para_key = re.sub(r"\s+", " ", para_stripped)
        # Skip very short paragraphs from dedup (headings, short labels)
        if len(para_key) < 60:
            unique_paragraphs.append(para)
            continue
        if para_key not in seen_paragraphs:
            seen_paragraphs.add(para_key)
            unique_paragraphs.append(para)
        # else: drop duplicate paragraph

    text_rejoined = "\n\n".join(unique_paragraphs)

    # Pass 4: remove repeated "Resume Instructions" sections
    # Keep only the first occurrence of the section
    resume_pattern = re.compile(
        r"(## Resume Instructions\b.*?)(?=\n## |\Z)",
        re.DOTALL | re.IGNORECASE
    )
    matches = list(resume_pattern.finditer(text_rejoined))
    if len(matches) > 1:
        # Keep first, remove subsequent occurrences
        # Process in reverse so offsets stay valid
        for match in reversed(matches[1:]):
            text_rejoined = text_rejoined[: match.start()] + text_rejoined[match.end() :]

    # Final blank-line normalization pass (paragraph dedup may leave extra blanks)
    lines = text_rejoined.split("\n")
    final = []
    blank_run = 0
    for line in lines:
        if line.strip() == "":
            blank_run += 1
            if blank_run <= 1:
                final.append("")
        else:
            blank_run = 0
            final.append(line)

    return "\n".join(final)


SCROLLBACK_NOISE_PATTERNS = [
    re.compile(r"^\s*⎿\s+Async hook \w+ completed\s*$"),
    re.compile(r"^\s*⎿\s+Took \d+ms\s*$"),
    re.compile(r"^\s*⎿\s+Async hook \w+ hook success:.*$"),
    re.compile(r"^\s*<system-reminder>.*$"),
    re.compile(r"^\s*</system-reminder>\s*$"),
    re.compile(r"^⏺ (?:Read|Write|Edit|Bash|Agent|Glob|Grep)\(.*\)\s*$"),
    re.compile(r"^\s*\[▒░│┃╿\s\d%]+.*tokens\s*$"),  # HUD/statusline
    re.compile(r"^\s*🟢.*opus.*Project_Aion.*$"),      # Status line
    re.compile(r"^─{20,}\s*$"),                         # Long horizontal dividers
    re.compile(r"^━{20,}\s*$"),                         # Heavy horizontal dividers
]

SCROLLBACK_COLLAPSE_PATTERNS = [
    (re.compile(r"^\s*⎿\s+\d+ lines? (read|written|edited)\s*$"), "[tool output summary]"),
]


def compress_aggressive(text: str) -> str:
    """
    Aggressive mode: standard + domain-specific Claude Code TUI patterns.
    Targets hook notifications, tool-call rendering chrome, permission prompts,
    system-reminder fragments, and long lines outside code blocks.
    """
    text = compress_standard(text)

    lines = text.split("\n")
    result = []
    in_code_block = False
    noise_stripped = 0

    for line in lines:
        if re.match(r"^```", line):
            in_code_block = not in_code_block
            result.append(line)
            continue

        if in_code_block:
            result.append(line)
            continue

        # Strip noise patterns (hook notifications, system-reminders, tool chrome)
        is_noise = False
        for pattern in SCROLLBACK_NOISE_PATTERNS:
            if pattern.match(line):
                is_noise = True
                noise_stripped += 1
                break
        if is_noise:
            continue

        # Collapse verbose tool output summaries
        for pattern, replacement in SCROLLBACK_COLLAPSE_PATTERNS:
            if pattern.match(line):
                line = replacement
                break

        # Truncate long lines outside code blocks
        if len(line) > 300:
            result.append(line[:300] + "[...]")
        else:
            result.append(line)

    # Final pass: collapse runs of 3+ blank lines that noise removal may create
    final = []
    blank_run = 0
    for line in result:
        if line.strip() == "":
            blank_run += 1
            if blank_run <= 1:
                final.append("")
        else:
            blank_run = 0
            final.append(line)

    return "\n".join(final)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="NLP pre-compression for JICM context pipeline"
    )
    parser.add_argument(
        "--mode",
        choices=["standard", "aggressive", "minimal"],
        default="standard",
        help="Compression mode (default: standard)",
    )
    parser.add_argument(
        "--input",
        metavar="FILE",
        help="Input file (default: stdin)",
    )
    parser.add_argument(
        "--output",
        metavar="FILE",
        help="Output file (default: stdout)",
    )
    parser.add_argument(
        "--meta-output",
        metavar="FILE",
        help="Write JSON metrics to this file",
    )
    args = parser.parse_args()

    # Read input
    try:
        if args.input:
            with open(args.input, "r", encoding="utf-8", errors="replace") as f:
                text = f.read()
        else:
            text = sys.stdin.read()
    except (OSError, IOError) as e:
        print("compress-input.py: error reading input: {}".format(e), file=sys.stderr)
        return 1

    tokens_before = count_tokens(text)

    # Apply compression
    try:
        if args.mode == "aggressive":
            compressed = compress_aggressive(text)
        elif args.mode == "minimal":
            compressed = compress_minimal(text)
        else:
            compressed = compress_standard(text)
    except Exception as e:
        print("compress-input.py: compression error: {}".format(e), file=sys.stderr)
        return 1

    # Preserve trailing newline if input had one
    if text.endswith("\n") and not compressed.endswith("\n"):
        compressed += "\n"

    tokens_after = count_tokens(compressed)
    ratio = round(tokens_after / tokens_before, 4) if tokens_before > 0 else 1.0

    # Write output
    try:
        if args.output:
            with open(args.output, "w", encoding="utf-8") as f:
                f.write(compressed)
        else:
            sys.stdout.write(compressed)
    except (OSError, IOError) as e:
        print("compress-input.py: error writing output: {}".format(e), file=sys.stderr)
        return 1

    # Write metrics JSON
    if args.meta_output:
        metrics = {
            "nlp_compression_applied": True,
            "nlp_tokens_before": tokens_before,
            "nlp_tokens_after": tokens_after,
            "nlp_compression_ratio": ratio,
            "nlp_mode": args.mode,
        }
        try:
            with open(args.meta_output, "w", encoding="utf-8") as f:
                json.dump(metrics, f, indent=2)
                f.write("\n")
        except (OSError, IOError) as e:
            # Non-fatal -- metrics loss is acceptable
            print(
                "compress-input.py: warning -- could not write meta-output: {}".format(e),
                file=sys.stderr,
            )

    return 0


if __name__ == "__main__":
    sys.exit(main())
