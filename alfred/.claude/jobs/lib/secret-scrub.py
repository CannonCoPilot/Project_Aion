#!/usr/bin/env python3
"""
secret-scrub.py — Scrub secrets from text before it lands in training data.

Root-cause fix for Failure Mode 2 (capture-pipeline-to-public-git leak).
Origin: the 2026-04 AIfred 3-month leak and loom-colab 2-day leak both
happened because AI tool outputs containing real secrets were serialized
to .claude/data/training/content/ files, then flowed through the Loom
training pipeline into golden_train.jsonl, then got committed to public
repos by a sync job that didn't catch them.

This module is the single chokepoint: every text that lands in the
training captures directory goes through `scrub()` first. Matching
patterns are replaced with `[REDACTED:<rule_name>]` and the redaction
is logged to `.claude/logs/secret-scrub.jsonl` so we know what got
caught and can spot drift.

Usage as a library (Python):
    from secret_scrub import scrub
    scrubbed, redactions = scrub(raw_text, source="interactive:cap-id")

Usage as a CLI filter (Bash):
    echo "$text" | python3 secret-scrub.py --source "capture-id" > out.txt

Integration points (as of T3.2):
    - .claude/jobs/scan-interactive-sessions.sh:write_capture()
      (pipes $prompt_text and $response_text through this before writing)
    - .claude/jobs/lib/stream-parser.py:write_tool_output()
      (calls scrub() on tool output content before f.write())

Created: 2026-04-08 as security-remediation-2026-04 T3.2 (AIProjects-v523)
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from pathlib import Path
from typing import List, Tuple


# ============================================================================
# Pattern rules
# ============================================================================
#
# Ordering matters: highest-confidence prefix-based rules first. Field-based
# rules run last as a safety net for values without known provider prefixes.
# Each entry is (rule_name, compiled_regex, replacement_fn_flag).
#
# replacement_fn_flag:
#   "full"  — replace the entire match with [REDACTED:rule]
#   "field" — replace only the value portion (group 2), keep the field name

RULES = [
    # --- Prefix-based API keys (highest confidence) ---
    ("anthropic-api-key",   re.compile(r"sk-ant-[a-zA-Z0-9_-]{80,}"),                     "full"),
    ("openai-api-key-proj", re.compile(r"sk-proj-[a-zA-Z0-9_-]{100,}"),                   "full"),
    ("openai-api-key",      re.compile(r"sk-[a-zA-Z0-9]{48}(?![a-zA-Z0-9])"),             "full"),
    ("github-pat-classic",  re.compile(r"ghp_[a-zA-Z0-9]{36}(?![a-zA-Z0-9])"),            "full"),
    ("github-pat-fine",     re.compile(r"github_pat_[a-zA-Z0-9_]{82,}"),                  "full"),
    ("github-oauth",        re.compile(r"gho_[a-zA-Z0-9]{36}(?![a-zA-Z0-9])"),            "full"),
    ("gcp-api-key",         re.compile(r"AIzaSy[a-zA-Z0-9_-]{33}"),                       "full"),
    ("gitlab-pat",          re.compile(r"glpat-[a-zA-Z0-9_-]{20}"),                       "full"),
    ("slack-bot-token",     re.compile(r"xoxb-\d+-\d+-[a-zA-Z0-9]{24,}"),                 "full"),
    ("slack-user-token",    re.compile(r"xoxp-\d+-\d+-\d+-[a-f0-9]{32}"),                 "full"),
    ("resend-api-key",      re.compile(r"re_[a-zA-Z0-9]{8,}_[a-zA-Z0-9]{16,}"),           "full"),
    ("perplexity-api-key",  re.compile(r"pplx-[a-zA-Z0-9]{48,}"),                         "full"),
    ("brave-api-key",       re.compile(r"BSA[a-zA-Z0-9_-]{28}(?![a-zA-Z0-9_-])"),         "full"),
    ("aws-access-key",      re.compile(r"AKIA[0-9A-Z]{16}(?![0-9A-Z])"),                  "full"),
    ("sourcegraph-token",   re.compile(r"sgp_[a-f0-9]{40,}"),                             "full"),
    ("stripe-secret",       re.compile(r"sk_live_[a-zA-Z0-9]{24,}"),                      "full"),
    ("stripe-restricted",   re.compile(r"rk_live_[a-zA-Z0-9]{24,}"),                      "full"),

    # --- Format-based (well-defined shapes) ---
    ("telegram-bot-token",  re.compile(r"\b\d{8,10}:AA[a-zA-Z0-9_-]{33}\b"),              "full"),
    ("jwt",                 re.compile(r"\beyJ[a-zA-Z0-9_=-]{8,}\.eyJ[a-zA-Z0-9_=-]{8,}\.[a-zA-Z0-9_=-]{8,}"), "full"),
    ("private-key-pem",     re.compile(
        r"-----BEGIN [A-Z ]+?PRIVATE KEY-----[\s\S]{40,}?-----END [A-Z ]+?PRIVATE KEY-----"
    ), "full"),

    # --- Field-based (lower confidence, safety net for unknown providers) ---
    # Catches WEBHOOK_SECRET=..., API_KEY=..., AUTH_TOKEN=... etc.
    ("secret-field",        re.compile(
        r"(?i)\b(WEBHOOK_SECRET|API_KEY|API_TOKEN|AUTH_TOKEN|AUTH_SECRET|"
        r"BEARER_TOKEN|ACCESS_TOKEN|PRIVATE_KEY|CLIENT_SECRET|ENCRYPTION_KEY)"
        r"\s*[:=]\s*['\"]?([A-Za-z0-9+/=_\-]{16,})['\"]?"
    ), "field"),

    # --- Cloudflare tokens (40-char alphanumeric after Bearer) ---
    ("cloudflare-token",    re.compile(
        r"(?i)(?:cf_|cloudflare[_-]?token\s*[:=]\s*['\"]?)([a-zA-Z0-9_-]{40})\b"
    ), "field"),
]


# ============================================================================
# Audit log
# ============================================================================

def _audit_log_path() -> Path:
    root = Path(os.environ.get("AIPROJECTS_ROOT", os.path.expanduser("~/AIProjects")))
    return root / ".claude" / "logs" / "secret-scrub.jsonl"


def _write_audit(entries: List[dict], source: str) -> None:
    if not entries:
        return
    path = _audit_log_path()
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        record = {
            "iso": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "epoch": int(time.time()),
            "source": source,
            "redaction_count": len(entries),
            "redactions": entries,
        }
        with open(path, "a") as f:
            f.write(json.dumps(record) + "\n")
    except Exception as e:
        # Fail-soft on audit log write — don't crash the capture pipeline
        print(f"secret-scrub: audit log write failed: {e}", file=sys.stderr)


# ============================================================================
# Core scrub function
# ============================================================================

def scrub(text: str, source: str = "unknown") -> Tuple[str, List[dict]]:
    """
    Scrub secrets from text.

    Args:
        text: input string (may be empty)
        source: identifier for audit log (e.g. "interactive:cap-abc123")

    Returns:
        (scrubbed_text, redactions_list)
        redactions_list: [{rule, length, prefix, suffix}, ...]
    """
    if not text:
        return text, []

    redactions: List[dict] = []
    scrubbed = text

    for rule_name, pattern, mode in RULES:
        def make_replacer(name: str, m: re.Match) -> str:
            orig = m.group(0)
            redactions.append({
                "rule": name,
                "length": len(orig),
                "prefix": orig[:4] if len(orig) > 8 else "",
                "suffix": orig[-3:] if len(orig) > 8 else "",
            })
            return f"[REDACTED:{name}]"

        def make_field_replacer(name: str, m: re.Match) -> str:
            # group 1 = field name, group 2 = value
            value = m.group(2)
            redactions.append({
                "rule": name,
                "length": len(value),
                "prefix": value[:4] if len(value) > 8 else "",
                "suffix": value[-3:] if len(value) > 8 else "",
            })
            return f"{m.group(1)}=[REDACTED:{name}]"

        if mode == "field":
            scrubbed = pattern.sub(lambda m, n=rule_name: make_field_replacer(n, m), scrubbed)
        else:
            scrubbed = pattern.sub(lambda m, n=rule_name: make_replacer(n, m), scrubbed)

    if redactions:
        _write_audit(redactions, source)

    return scrubbed, redactions


# ============================================================================
# CLI entrypoint
# ============================================================================

def main() -> int:
    ap = argparse.ArgumentParser(
        description="Scrub secrets from stdin, write cleaned text to stdout."
    )
    ap.add_argument("--source", default="cli",
                    help="Source identifier for audit log (e.g. capture-id)")
    ap.add_argument("--quiet", action="store_true",
                    help="Suppress redaction count on stderr")
    ap.add_argument("--count-only", action="store_true",
                    help="Don't output text, just print redaction count")
    args = ap.parse_args()

    text = sys.stdin.read()
    scrubbed, redactions = scrub(text, source=args.source)

    if args.count_only:
        print(len(redactions))
    else:
        sys.stdout.write(scrubbed)

    if not args.quiet and redactions:
        rule_counts: dict = {}
        for r in redactions:
            rule_counts[r["rule"]] = rule_counts.get(r["rule"], 0) + 1
        summary = ", ".join(f"{r}×{c}" for r, c in sorted(rule_counts.items()))
        print(f"secret-scrub: {len(redactions)} redactions ({summary})",
              file=sys.stderr)

    return 0


if __name__ == "__main__":
    sys.exit(main())
