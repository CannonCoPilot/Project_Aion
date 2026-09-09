#!/usr/bin/env python3
"""
Line-level machine-output stripping, for building the human-document arm.

Phase 0 carry-over. The record-level filters in build_corpus.py remove whole
messages that are machine-authored. They cannot help with the remaining problem,
which is INTRA-RECORD: Sir types two hundred words of framing and pastes fifteen
thousand words of kernel panic log, and the whole thing is one `user` record.

Measured on the post-filter human arm: the longest record is 15,368 words and is
a crash report. Several others in the top ten are AutoEval build logs with a
sentence of framing on the front. Counting those as human prose would put build
output into the stylometric baseline for a human writer.

CONSERVATIVE BY DESIGN. Every heuristic here answers "is this line obviously
machine output?" and keeps anything uncertain. Over-stripping is the worse error:
a dropped log line costs nothing, a dropped sentence silently biases the arm we
are trying to characterise. The counts are reported so the damage is visible.
"""

from __future__ import annotations
import re

FENCE = re.compile(r"^\s*(```|~~~)")

MACHINE_LINE = (
    re.compile(r"^\s*\[(Container|INFO|ERROR|WARN|DEBUG|TRACE)\]"),
    re.compile(r"^\s*\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}"),          # ISO timestamp
    re.compile(r"^\s*\d{2}:\d{2}:\d{2}[.,]\d+"),                    # bare clock
    re.compile(r"^\s*(Traceback \(most recent|File \"|\s+at\s+\S+\()"),
    re.compile(r"^\s*[$#>]\s+\S"),                                  # shell prompt
    re.compile(r"^\s*/(Users|opt|usr|var|private|tmp)/\S*\s*$"),    # bare path
    re.compile(r"^\s*(npm|pip|git|docker|make|cargo|go|python\d?)\s+\S+.*$"),
    re.compile(r"^\s*(PASS|FAIL|OK|ERROR|WARNING|SUCCESS|BUILD)\b.*\|"),
    re.compile(r"^\s*\S+\.(py|sh|js|ts|json|ya?ml|toml|log|txt):\d+"),  # file:line
    re.compile(r"^\s*[A-Za-z_]+=[^\s]+(\s+[A-Za-z_]+=[^\s]+)+"),    # env assignments
    re.compile(r"^\s*(sha256|md5|blake\d)[: ]", re.I),
    re.compile(r"^\s*[0-9a-f]{12,}\s*$", re.I),                     # bare hash
    re.compile(r"^\s*Build (status|ID|ARN|Duration)\b", re.I),
)


def _alpha_ratio(s: str) -> float:
    if not s:
        return 0.0
    return sum(c.isalpha() or c.isspace() for c in s) / len(s)


def is_machine_line(line: str) -> bool:
    s = line.strip()
    if not s:
        return False
    if any(p.search(s) for p in MACHINE_LINE):
        return True
    toks = s.split()
    # A long line with no spaces is a path, a URL or a token, never a sentence.
    if len(toks) == 1 and len(s) > 24:
        return True
    # Symbol soup: mostly punctuation and digits.
    if len(s) > 20 and _alpha_ratio(s) < 0.55:
        return True
    return False


def strip_machine(text: str) -> tuple[str, dict]:
    """Return (prose_only, stats). Fenced blocks are removed wholesale."""
    kept, in_fence = [], False
    n_fence = n_line = 0
    for line in text.splitlines():
        if FENCE.match(line):
            in_fence = not in_fence
            n_fence += 1
            continue
        if in_fence:
            n_fence += 1
            continue
        if is_machine_line(line):
            n_line += 1
            continue
        kept.append(line)
    out = "\n".join(kept)
    out = re.sub(r"\n{3,}", "\n\n", out).strip()
    return out, {"fenced_lines_removed": n_fence, "machine_lines_removed": n_line}
