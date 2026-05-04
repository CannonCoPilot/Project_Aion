#!/usr/bin/env python3
"""
Cache Telemetry Extractor v2.1 — intent-class-tagged per-turn telemetry
                                  with thinking-token approximation.

Companion to token-compression-experimental-design.md (§4 taxonomy, §5
tagging procedure, §6 register patterns) and Phase 2 CoD pre-registration.

v2 schema (intent classification + register):
  intent_class, tool_use_count, code_lines, prose_lines,
  markdown_table_rows, bullet_lines, text_block_count, register_violations

v2.1 schema (Phase 2.4.c — thinking-token approximation):
  thinking_block_count, thinking_chars,
  thinking_tokens_est, output_tokens_visible_est

NOTE on thinking_tokens: the Anthropic API for Opus 4.X 1M variant does NOT
expose `usage.thinking_tokens`. Verified via JSONL inspection (2026-05-03):
the `usage` object contains input/output/cache fields only; thinking content
appears as `message.content[].type=="thinking"` blocks with text in
`.thinking`. Output_tokens includes thinking + visible together.

This extractor approximates thinking_tokens by character count divided by 4
(standard English approximation). The constant cancels in relative comparisons
(Stage-2's post-CoD / pre-CoD ratio = post_chars / pre_chars), so the
approximation is methodologically equivalent to using thinking_chars directly.
Both columns are emitted; downstream analysis can use either.

output_tokens_visible_est = output_tokens - thinking_tokens_est. Useful for
distinguishing visible-output brevity (Phase 1.1 Jeeves-Brief target) from
thinking-stream brevity (Phase 2 CoD target). Phase 1.1 + Phase 2 are
orthogonal token streams per roadmap §4.7 stacking rules.

Intent classes (first-match ordering per §4):
  tool_only   — output_tokens < 5 AND tool_use_count > 0
  code_dump   — code_lines / prose_lines >= 0.5 AND code_lines >= 20
  structured  — markdown_table_rows >= 5 OR bullet_lines / total_lines >= 0.6
  analysis    — output_tokens >= 500
  interactive — 100 <= output_tokens < 500
  brief       — 5 <= output_tokens < 100

Usage:
  cache-telemetry-extractor-v2.py <path> [--out OUT.csv]
       [--register-markers PATH] [--emit-class-distribution]
"""
import argparse
import csv
import json
import pathlib
import re
import sys
from collections import Counter

# Default register-markers regex set — used when yaml file is absent.
# When the yaml file exists, its patterns override these.
DEFAULT_BANNED_PATTERNS = [
    r"\bsure!?\b",
    r"\bhappy to help\b",
    r"\bof course!?\b",
    r"\bI'?ll just\b",
    r"\bcertainly,?\b",
    r"\bgladly\b",
    r"\bdefinitely!?\b",
    r"\bgreat!?\b",
    r"\babsolutely!?\b",
    r"\bI'?d be happy\b",
    r"\bperfect!?\b",
    r"\bawesome!?\b",
    r"\blet me know if\b",
    r"\blet me know when\b",
    r"\bjust let me\b",
    r"\bfeel free to\b",
    r"\bdon'?t hesitate\b",
]

FENCED_CODE_RE = re.compile(r"^```")
TABLE_ROW_RE = re.compile(r"^\s*\|.*\|\s*$")
BULLET_RE = re.compile(r"^\s*[-*]\s")

# Phase 0.4: strip fenced code, inline code, and double-quoted spans before
# register-pattern matching. Single quotes (apostrophes) and blockquotes are
# intentionally preserved to avoid cascading false negatives in normal prose.
QUOTE_STRIPPERS = [
    (re.compile(r"```.*?```", re.DOTALL), " "),
    (re.compile(r"`[^`]+`"), " "),
    (re.compile(r'"[^"]*"'), " "),
    (re.compile(r"“[^”]*”"), " "),
]


def strip_quoted_for_register(text):
    """Remove fenced/inline code and quoted spans so register-pattern
    matching does not fire on meta-mentions of banned phrases inside
    illustrative quotations."""
    for pat, repl in QUOTE_STRIPPERS:
        text = pat.sub(repl, text)
    return text


def load_register_patterns(path):
    """Load banned patterns from yaml; fall back to defaults."""
    if not path or not pathlib.Path(path).exists():
        return [re.compile(p, re.IGNORECASE) for p in DEFAULT_BANNED_PATTERNS]
    try:
        import yaml
    except ImportError:
        sys.stderr.write("WARN: pyyaml not available; using default register patterns\n")
        return [re.compile(p, re.IGNORECASE) for p in DEFAULT_BANNED_PATTERNS]
    with open(path) as f:
        data = yaml.safe_load(f)
    patterns = []
    for group in ("ai_assistant_patois", "trailing_offers", "excessive_hedging"):
        for p in data.get(group, []) or []:
            patterns.append(re.compile(p, re.IGNORECASE))
    return patterns or [re.compile(p, re.IGNORECASE) for p in DEFAULT_BANNED_PATTERNS]


def analyze_text(text):
    """Count code/prose/table/bullet lines in a text block."""
    lines = text.split("\n")
    in_code = False
    code_lines = 0
    table_rows = 0
    bullet_lines = 0
    blank_lines = 0
    for line in lines:
        if FENCED_CODE_RE.match(line):
            in_code = not in_code
            continue
        if in_code:
            code_lines += 1
            continue
        if not line.strip():
            blank_lines += 1
            continue
        if TABLE_ROW_RE.match(line):
            table_rows += 1
            continue
        if BULLET_RE.match(line):
            bullet_lines += 1
    total_non_code = len(lines) - code_lines
    prose_lines = max(total_non_code - blank_lines - table_rows - bullet_lines, 0)
    return {
        "code_lines": code_lines,
        "prose_lines": prose_lines,
        "table_rows": table_rows,
        "bullet_lines": bullet_lines,
        "total_lines": len(lines),
    }


def count_register_violations(text, patterns):
    stripped = strip_quoted_for_register(text)
    return sum(1 for p in patterns if p.search(stripped))


def classify(output_tokens, tool_use_count, code_lines, prose_lines,
             table_rows, bullet_lines, total_lines):
    """Return intent class per first-match ordering of design doc §4."""
    if output_tokens < 5 and tool_use_count > 0:
        return "tool_only"
    code_ratio = code_lines / max(prose_lines, 1)
    if code_ratio >= 0.5 and code_lines >= 20:
        return "code_dump"
    bullet_ratio = bullet_lines / max(total_lines, 1)
    if table_rows >= 5 or bullet_ratio >= 0.6:
        return "structured"
    if output_tokens >= 500:
        return "analysis"
    if output_tokens >= 100:
        return "interactive"
    return "brief"


def parse_session(path, register_patterns):
    rows = []
    with open(path) as f:
        for turn_n, line in enumerate(f):
            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                continue
            msg = event.get("message", {})
            usage = msg.get("usage", {})
            if not usage:
                continue

            content = msg.get("content", [])
            tool_use_count = 0
            text_block_count = 0
            thinking_block_count = 0
            thinking_chars = 0
            agg = {"code_lines": 0, "prose_lines": 0, "table_rows": 0,
                   "bullet_lines": 0, "total_lines": 0}
            register_violations = 0

            if isinstance(content, list):
                for blk in content:
                    btype = blk.get("type") if isinstance(blk, dict) else None
                    if btype == "tool_use":
                        tool_use_count += 1
                    elif btype == "text":
                        text = blk.get("text", "") or ""
                        if text:
                            text_block_count += 1
                            stats = analyze_text(text)
                            for k in agg:
                                agg[k] += stats[k]
                            register_violations += count_register_violations(
                                text, register_patterns)
                    elif btype == "thinking":
                        # Phase 2.4.c — approximate thinking_tokens from chars
                        # since usage.thinking_tokens is not in the API response.
                        thinking_text = blk.get("thinking", "") or ""
                        if thinking_text:
                            thinking_block_count += 1
                            thinking_chars += len(thinking_text)

            input_tokens = usage.get("input_tokens", 0)
            cache_read = usage.get("cache_read_input_tokens", 0)
            cache_creation = usage.get("cache_creation", {}) or {}
            eph_5m = cache_creation.get("ephemeral_5m_input_tokens", 0) if isinstance(cache_creation, dict) else 0
            eph_1h = cache_creation.get("ephemeral_1h_input_tokens", 0) if isinstance(cache_creation, dict) else 0
            output_tokens = usage.get("output_tokens", 0)
            denom = cache_read + eph_5m + eph_1h + input_tokens
            hit_rate = (cache_read / denom) if denom else 0.0

            intent_class = classify(
                output_tokens, tool_use_count,
                agg["code_lines"], agg["prose_lines"],
                agg["table_rows"], agg["bullet_lines"], agg["total_lines"])

            # Phase 2.4.c thinking-token approximation
            thinking_tokens_est = thinking_chars // 4
            output_tokens_visible_est = max(output_tokens - thinking_tokens_est, 0)

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
                "intent_class": intent_class,
                "tool_use_count": tool_use_count,
                "code_lines": agg["code_lines"],
                "prose_lines": agg["prose_lines"],
                "markdown_table_rows": agg["table_rows"],
                "bullet_lines": agg["bullet_lines"],
                "text_block_count": text_block_count,
                "register_violations": register_violations,
                "thinking_block_count": thinking_block_count,
                "thinking_chars": thinking_chars,
                "thinking_tokens_est": thinking_tokens_est,
                "output_tokens_visible_est": output_tokens_visible_est,
            })
    return rows


def emit_distribution(all_rows):
    """Print intent-class share table per design doc §5.2."""
    total = len(all_rows)
    counts = Counter(r["intent_class"] for r in all_rows)
    print("Intent-class distribution (n={}):".format(total), file=sys.stderr)
    print("  {:<14s}  {:>8s}  {:>8s}".format("class", "count", "pct"), file=sys.stderr)
    for cls in ("tool_only", "brief", "interactive", "analysis",
                "code_dump", "structured"):
        n = counts.get(cls, 0)
        pct = (n / total * 100) if total else 0
        marker = "  (rare)" if total and pct < 1 else ""
        print("  {:<14s}  {:>8d}  {:>7.2f}%{}".format(cls, n, pct, marker),
              file=sys.stderr)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("path", help="Session JSONL file or directory")
    ap.add_argument("--out", default="-", help="Output CSV path (default stdout)")
    ap.add_argument("--register-markers",
                    default=".claude/skills/token-compression/templates/register-markers.yaml",
                    help="Path to register-markers.yaml")
    ap.add_argument("--emit-class-distribution", action="store_true",
                    help="Print intent-class share table to stderr")
    args = ap.parse_args()

    register_patterns = load_register_patterns(args.register_markers)

    p = pathlib.Path(args.path)
    files = [p] if p.is_file() else sorted(p.rglob("*.jsonl"))

    out = sys.stdout if args.out == "-" else open(args.out, "w")
    fields = ["session_id", "turn_n", "ts", "input_tokens", "cache_read",
              "eph_5m", "eph_1h", "output_tokens", "hit_rate",
              "intent_class", "tool_use_count", "code_lines", "prose_lines",
              "markdown_table_rows", "bullet_lines", "text_block_count",
              "register_violations",
              # Phase 2.4.c — thinking-token approximation
              "thinking_block_count", "thinking_chars",
              "thinking_tokens_est", "output_tokens_visible_est"]
    w = csv.DictWriter(out, fieldnames=fields)
    w.writeheader()
    all_rows = []
    for f in files:
        for row in parse_session(f, register_patterns):
            w.writerow(row)
            if args.emit_class_distribution:
                all_rows.append(row)

    if args.emit_class_distribution:
        emit_distribution(all_rows)


if __name__ == "__main__":
    main()
