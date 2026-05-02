#!/usr/bin/env python3
"""
Pipeline Telemetry Extractor — per-service-event CSV from Pulse task metadata.

Companion to projects/project-aion/reports/token-compression-experimental-design.md
(§4 intent taxonomy, §6 register patterns) and Phase 0.5 of the
token-compression roadmap.

Sibling to cache-telemetry-extractor-v2.py. Where the v2 chat-corpus
extractor reads Claude Code session JSONLs, this extractor reads closed
Pulse tasks from the Pipeline v2 backend and emits one row per service
event (stage / evaluate / orchestrate / execute / review).

Schema (24 columns):
  task_id, service, ts, closed_at, status, labels,
  engine, model, persona,
  prompt_tokens, completion_tokens, duration_ms,
  cache_read, cache_creation, hit_rate,
  intent_class, tool_use_count,
  code_lines, prose_lines, markdown_table_rows, bullet_lines,
  text_block_count, register_violations, cost_usd

Notes on engine-aware NULL handling:
  - cache_read / cache_creation / cost_usd populate only on the Claude-CLI
    route. Ollama route fills 0 (NULL is also acceptable downstream).
  - hit_rate computed only when cache columns are non-zero; otherwise NULL.
  - cache_creation is an aggregate (5m + 1h not separately exposed by the
    Claude CLI --output-format json contract).

Intent classification mirrors v2 chat-corpus extractor §4 first-match
ordering. Orchestrator events are text-poor (no per-service output) and
are always classified `tool_only`.

Connection paths (--source):
  dev   (default)  — `docker exec aifred-dev-postgres psql -U pulse_dev -d pulse_dev`
                     (the dev container is not host-port exposed)
  prod             — `psql postgresql://pulse@localhost:5432/pulse`
                     (production Pulse on jarvis-postgres; password via env)
  custom --dsn     — pass a libpq DSN directly

Usage:
  pipeline-telemetry-extractor.py [--source dev|prod] [--dsn DSN]
       [--since ISO_TS] [--out OUT.csv]
       [--register-markers PATH] [--emit-class-distribution]
"""
import argparse
import csv
import json
import os
import pathlib
import re
import shlex
import subprocess
import sys
from collections import Counter

# ---- Register-pattern handling (parity with cache-telemetry-extractor-v2) ----

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

QUOTE_STRIPPERS = [
    (re.compile(r"```.*?```", re.DOTALL), " "),
    (re.compile(r"`[^`]+`"), " "),
    (re.compile(r'"[^"]*"'), " "),
    (re.compile(r"“[^”]*”"), " "),
]


def strip_quoted_for_register(text):
    for pat, repl in QUOTE_STRIPPERS:
        text = pat.sub(repl, text)
    return text


def load_register_patterns(path):
    if not path or not pathlib.Path(path).exists():
        return [re.compile(p, re.IGNORECASE) for p in DEFAULT_BANNED_PATTERNS]
    try:
        import yaml
    except ImportError:
        sys.stderr.write("WARN: pyyaml unavailable; using default register patterns\n")
        return [re.compile(p, re.IGNORECASE) for p in DEFAULT_BANNED_PATTERNS]
    with open(path) as f:
        data = yaml.safe_load(f)
    patterns = []
    for group in ("ai_assistant_patois", "trailing_offers", "excessive_hedging"):
        for p in data.get(group, []) or []:
            patterns.append(re.compile(p, re.IGNORECASE))
    return patterns or [re.compile(p, re.IGNORECASE) for p in DEFAULT_BANNED_PATTERNS]


def analyze_text(text):
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
    return sum(1 for p in patterns if p.search(strip_quoted_for_register(text)))


def classify(output_tokens, tool_use_count, code_lines, prose_lines,
             table_rows, bullet_lines, total_lines):
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


# ---- Text retrieval per service ----

def text_for_executor(metadata):
    """Pull executor output text. Ollama: response file. Claude-CLI: log JSONL."""
    engine = metadata.get("executor_engine", "ollama")
    if engine == "ollama":
        out_file = metadata.get("output_file")
        if out_file and pathlib.Path(out_file).exists():
            try:
                return pathlib.Path(out_file).read_text(errors="replace")
            except OSError:
                return ""
        return ""
    log_file = metadata.get("executor_log")
    if not log_file or not pathlib.Path(log_file).exists():
        return ""
    chunks = []
    try:
        with open(log_file, errors="replace") as f:
            for line in f:
                try:
                    ev = json.loads(line)
                except json.JSONDecodeError:
                    continue
                msg = ev.get("message", {}) if isinstance(ev, dict) else {}
                content = msg.get("content", []) if isinstance(msg, dict) else []
                if isinstance(content, list):
                    for blk in content:
                        if isinstance(blk, dict) and blk.get("type") == "text":
                            t = blk.get("text", "") or ""
                            if t:
                                chunks.append(t)
    except OSError:
        return ""
    return "\n".join(chunks)


def text_for_json_output(metadata, key):
    """Serialize a *_output JSON blob for register/intent analysis."""
    blob = metadata.get(key)
    if not blob:
        return ""
    if isinstance(blob, str):
        return blob
    try:
        return json.dumps(blob, indent=2)
    except (TypeError, ValueError):
        return str(blob)


def tool_use_count_executor(metadata):
    engine = metadata.get("executor_engine", "ollama")
    if engine == "ollama":
        return 0
    log_file = metadata.get("executor_log")
    if not log_file or not pathlib.Path(log_file).exists():
        return 0
    n = 0
    try:
        with open(log_file, errors="replace") as f:
            for line in f:
                try:
                    ev = json.loads(line)
                except json.JSONDecodeError:
                    continue
                msg = ev.get("message", {}) if isinstance(ev, dict) else {}
                content = msg.get("content", []) if isinstance(msg, dict) else []
                if isinstance(content, list):
                    for blk in content:
                        if isinstance(blk, dict) and blk.get("type") == "tool_use":
                            n += 1
    except OSError:
        return 0
    return n


# ---- Per-service row builder ----

def base_row(task, service, ts):
    return {
        "task_id": task["id"],
        "service": service,
        "ts": ts or "",
        "closed_at": task.get("closed_at") or "",
        "status": task.get("status", ""),
        "labels": ";".join(task.get("labels") or []),
        "engine": "",
        "model": "",
        "persona": "",
        "prompt_tokens": 0,
        "completion_tokens": 0,
        "duration_ms": 0,
        "cache_read": 0,
        "cache_creation": 0,
        "hit_rate": "",
        "intent_class": "",
        "tool_use_count": 0,
        "code_lines": 0,
        "prose_lines": 0,
        "markdown_table_rows": 0,
        "bullet_lines": 0,
        "text_block_count": 0,
        "register_violations": 0,
        "cost_usd": "",
    }


def fill_text_columns(row, text, register_patterns,
                      tool_use=0, force_class=None):
    """Populate text-derived columns and intent_class.

    Always classifies — even when text is empty — using completion_tokens
    and tool_use_count. This matches cache-telemetry-extractor-v2.py: a
    row with zero text blocks but nonzero output_tokens still earns a
    class (analysis / interactive / brief by token count).
    """
    row["tool_use_count"] = tool_use
    if text:
        stats = analyze_text(text)
        row["code_lines"] = stats["code_lines"]
        row["prose_lines"] = stats["prose_lines"]
        row["markdown_table_rows"] = stats["table_rows"]
        row["bullet_lines"] = stats["bullet_lines"]
        row["text_block_count"] = 1 if text.strip() else 0
        row["register_violations"] = count_register_violations(text, register_patterns)
    else:
        stats = {"code_lines": 0, "prose_lines": 0,
                 "table_rows": 0, "bullet_lines": 0, "total_lines": 0}
    if force_class:
        row["intent_class"] = force_class
    else:
        row["intent_class"] = classify(
            row["completion_tokens"] or 0,
            tool_use,
            stats["code_lines"], stats["prose_lines"],
            stats["table_rows"], stats["bullet_lines"], stats["total_lines"])


def emit_stage_row(task, register_patterns):
    md = task.get("metadata", {}) or {}
    ts = md.get("staged_at")
    if not ts:
        return None
    row = base_row(task, "stage", ts)
    row["engine"] = "stager"
    text = text_for_json_output(md, "stage_output")
    fill_text_columns(row, text, register_patterns)
    return row


def emit_evaluate_row(task, register_patterns):
    md = task.get("metadata", {}) or {}
    ts = md.get("evaluated_at")
    if not ts:
        return None
    row = base_row(task, "evaluate", ts)
    row["engine"] = "ollama"
    row["model"] = md.get("evaluated_by") or ""
    text = text_for_json_output(md, "evaluate_output")
    fill_text_columns(row, text, register_patterns)
    return row


def emit_orchestrate_row(task, register_patterns):
    md = task.get("metadata", {}) or {}
    ts = md.get("orchestrated_at")
    if not ts:
        return None
    row = base_row(task, "orchestrate", ts)
    row["engine"] = "orchestrator"
    fill_text_columns(row, "", register_patterns, force_class="tool_only")
    return row


def emit_execute_row(task, register_patterns):
    md = task.get("metadata", {}) or {}
    ts = md.get("executed_at")
    if not ts:
        return None
    row = base_row(task, "execute", ts)
    row["engine"] = md.get("executor_engine", "ollama")
    row["model"] = md.get("executor_model") or md.get("model") or ""
    row["persona"] = md.get("executor_persona") or ""

    telem = md.get("telemetry", {}) or {}
    if row["engine"] == "ollama":
        row["prompt_tokens"] = int(telem.get("prompt_tokens") or 0)
        row["completion_tokens"] = int(telem.get("completion_tokens") or 0)
        row["duration_ms"] = int(telem.get("duration_ms") or 0)
    else:
        row["prompt_tokens"] = int(telem.get("input_tokens") or 0)
        row["completion_tokens"] = int(telem.get("output_tokens") or 0)
        row["duration_ms"] = int(telem.get("duration_ms") or 0)
        row["cache_read"] = int(telem.get("cache_read_tokens") or 0)
        row["cache_creation"] = int(telem.get("cache_creation_tokens") or 0)
        cost = telem.get("total_cost_usd")
        if cost is not None:
            row["cost_usd"] = float(cost)
        denom = (row["cache_read"] + row["cache_creation"] + row["prompt_tokens"])
        if denom:
            row["hit_rate"] = round(row["cache_read"] / denom, 4)

    text = text_for_executor(md)
    tool_use = tool_use_count_executor(md)
    fill_text_columns(row, text, register_patterns, tool_use=tool_use)
    return row


def emit_review_row(task, register_patterns):
    md = task.get("metadata", {}) or {}
    ts = md.get("reviewed_at")
    if not ts:
        return None
    row = base_row(task, "review", ts)
    rt = md.get("review_telemetry", {}) or {}
    # Phase 1.3.5: review_telemetry now includes engine marker on Claude-CLI route.
    row["engine"] = rt.get("engine") or "ollama"
    row["model"] = md.get("reviewed_by") or rt.get("model") or ""

    if row["engine"] == "ollama":
        row["prompt_tokens"] = int(rt.get("prompt_tokens") or 0)
        row["completion_tokens"] = int(rt.get("completion_tokens") or 0)
        row["duration_ms"] = int(rt.get("total_duration_ms") or 0)
    else:
        row["prompt_tokens"] = int(rt.get("input_tokens") or 0)
        row["completion_tokens"] = int(rt.get("output_tokens") or 0)
        row["duration_ms"] = int(rt.get("duration_ms") or 0)
        row["cache_read"] = int(rt.get("cache_read_tokens") or 0)
        row["cache_creation"] = int(rt.get("cache_creation_tokens") or 0)
        cost = rt.get("total_cost_usd")
        if cost is not None:
            row["cost_usd"] = float(cost)
        denom = (row["cache_read"] + row["cache_creation"] + row["prompt_tokens"])
        if denom:
            row["hit_rate"] = round(row["cache_read"] / denom, 4)

    text = text_for_json_output(md, "review_output")
    fill_text_columns(row, text, register_patterns)
    return row


SERVICE_BUILDERS = [
    emit_stage_row,
    emit_evaluate_row,
    emit_orchestrate_row,
    emit_execute_row,
    emit_review_row,
]


def emit_rows_for_task(task, register_patterns):
    rows = []
    for builder in SERVICE_BUILDERS:
        r = builder(task, register_patterns)
        if r:
            rows.append(r)
    return rows


# ---- DB connection ----

QUERY_TEMPLATE = (
    "SELECT row_to_json(t) FROM ("
    "SELECT id, title, status, labels, "
    "to_char(closed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"') AS closed_at, "
    "metadata "
    "FROM tasks "
    "WHERE status = 'closed' "
    "{since_clause}"
    "ORDER BY closed_at DESC NULLS LAST"
    ") t"
)


def build_psql_cmd(source, dsn, since):
    since_clause = f"AND closed_at >= '{since}'::timestamptz " if since else ""
    sql = QUERY_TEMPLATE.format(since_clause=since_clause)
    if dsn:
        return ["psql", dsn, "-At", "-c", sql]
    if source == "dev":
        return [
            "docker", "exec", "aifred-dev-postgres",
            "psql", "-U", "pulse_dev", "-d", "pulse_dev",
            "-At", "-c", sql,
        ]
    if source == "prod":
        prod_dsn = os.environ.get("PULSE_PROD_DSN")
        if not prod_dsn:
            sys.exit("ERROR: --source prod requires PULSE_PROD_DSN env var "
                     "(e.g. postgresql://pulse:PASSWORD@localhost:5432/pulse)")
        return ["psql", prod_dsn, "-At", "-c", sql]
    sys.exit(f"ERROR: unknown --source {source}")


def fetch_tasks(source, dsn, since):
    cmd = build_psql_cmd(source, dsn, since)
    try:
        proc = subprocess.run(cmd, check=True, capture_output=True, text=True)
    except subprocess.CalledProcessError as e:
        sys.stderr.write(f"psql command failed: {' '.join(shlex.quote(c) for c in cmd)}\n")
        sys.stderr.write(e.stderr)
        sys.exit(2)
    for line in proc.stdout.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            yield json.loads(line)
        except json.JSONDecodeError:
            sys.stderr.write(f"WARN: skipping malformed row: {line[:200]}\n")


# ---- Output ----

CSV_FIELDS = [
    "task_id", "service", "ts", "closed_at", "status", "labels",
    "engine", "model", "persona",
    "prompt_tokens", "completion_tokens", "duration_ms",
    "cache_read", "cache_creation", "hit_rate",
    "intent_class", "tool_use_count",
    "code_lines", "prose_lines", "markdown_table_rows", "bullet_lines",
    "text_block_count", "register_violations", "cost_usd",
]


def emit_distribution(all_rows):
    total = len(all_rows)
    if not total:
        print("No rows extracted.", file=sys.stderr)
        return
    counts = Counter(r["intent_class"] for r in all_rows)
    print(f"Intent-class distribution (n={total}):", file=sys.stderr)
    print(f"  {'class':<14s}  {'count':>8s}  {'pct':>8s}", file=sys.stderr)
    classes = ("tool_only", "brief", "interactive", "analysis",
               "code_dump", "structured")
    for cls in classes:
        n = counts.get(cls, 0)
        pct = n / total * 100
        marker = "  (rare)" if pct < 1 else ""
        print(f"  {cls:<14s}  {n:>8d}  {pct:>7.2f}%{marker}", file=sys.stderr)
    by_service = Counter(r["service"] for r in all_rows)
    print(f"\nService distribution (n={total}):", file=sys.stderr)
    for svc in ("stage", "evaluate", "orchestrate", "execute", "review"):
        print(f"  {svc:<12s}  {by_service.get(svc, 0):>6d}", file=sys.stderr)
    by_engine = Counter((r["service"], r["engine"]) for r in all_rows
                        if r["service"] in ("execute", "review"))
    if by_engine:
        print("\nEngine routing (execute/review):", file=sys.stderr)
        for (svc, eng), n in sorted(by_engine.items()):
            print(f"  {svc:<10s}  {eng:<12s}  {n:>6d}", file=sys.stderr)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", choices=["dev", "prod"], default="dev",
                    help="Pulse DB target (default dev via docker exec)")
    ap.add_argument("--dsn", default=None,
                    help="Override libpq DSN (skips --source)")
    ap.add_argument("--since", default=None,
                    help="ISO timestamp; only tasks closed at/after this time")
    ap.add_argument("--out", default="-", help="CSV output (default stdout)")
    ap.add_argument("--register-markers",
                    default=".claude/skills/token-compression/templates/register-markers.yaml",
                    help="Path to register-markers.yaml")
    ap.add_argument("--emit-class-distribution", action="store_true",
                    help="Print intent-class share table to stderr")
    args = ap.parse_args()

    register_patterns = load_register_patterns(args.register_markers)

    out = sys.stdout if args.out == "-" else open(args.out, "w")
    writer = csv.DictWriter(out, fieldnames=CSV_FIELDS)
    writer.writeheader()

    all_rows = []
    task_count = 0
    for task in fetch_tasks(args.source, args.dsn, args.since):
        task_count += 1
        for row in emit_rows_for_task(task, register_patterns):
            writer.writerow(row)
            if args.emit_class_distribution:
                all_rows.append(row)

    sys.stderr.write(f"Extracted {len(all_rows) if all_rows else '?'} rows "
                     f"from {task_count} tasks (source={args.source})\n")
    if args.emit_class_distribution:
        emit_distribution(all_rows)


if __name__ == "__main__":
    main()
