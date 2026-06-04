"""
JSONL Session Parser — Backfill api_requests from Claude Code session files.

Reads ~/.claude/projects/*//*.jsonl, extracts usage data from assistant turns,
and ingests to the api_requests table with source='jsonl'.

Usage:
    python jsonl_parser.py                    # Parse all projects, skip already-ingested
    python jsonl_parser.py --project Jarvis   # Parse only Jarvis sessions
    python jsonl_parser.py --since 2026-04-20 # Parse sessions modified after date
    python jsonl_parser.py --dry-run          # Print what would be ingested
"""

import argparse
import asyncio
import json
import os
import sys
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from typing import Optional

import asyncpg

# ─── Configuration ───────────────────────────────────────────────────────────

CLAUDE_PROJECTS_DIR = Path(os.getenv("CLAUDE_PROJECTS_DIR", str(Path.home() / ".claude" / "projects")))
DB_HOST = os.getenv("PROXY_DB_HOST", "localhost")
DB_PORT = int(os.getenv("PROXY_DB_PORT", "5433"))  # host port for dev postgres
DB_NAME = os.getenv("PROXY_DB_NAME", "pulse_dev")
DB_USER = os.getenv("PROXY_DB_USER", "pulse_dev")
DB_PASS = os.getenv("PROXY_DB_PASSWORD", "JzmggkPyb8f3NiOy7Z51lV5PDcP15NZS")

# Model pricing (per million tokens, April 2026)
MODEL_PRICING = {
    "claude-opus-4-6":   {"input": 15.00, "output": 75.00, "cache_write": 18.75, "cache_read": 1.50},
    "claude-sonnet-4-6": {"input":  3.00, "output": 15.00, "cache_write":  3.75, "cache_read": 0.30},
    "claude-haiku-4-5":  {"input":  0.80, "output":  4.00, "cache_write":  1.00, "cache_read": 0.08},
}


def compute_cost(model: str, input_t: int, output_t: int, cache_read: int, cache_write: int) -> Decimal:
    pricing = None
    for key, val in MODEL_PRICING.items():
        if model and key in model:
            pricing = val
            break
    if not pricing:
        pricing = MODEL_PRICING["claude-sonnet-4-6"]

    cost = (
        (input_t * pricing["input"] / 1_000_000)
        + (output_t * pricing["output"] / 1_000_000)
        + (cache_write * pricing["cache_write"] / 1_000_000)
        + (cache_read * pricing["cache_read"] / 1_000_000)
    )
    return Decimal(str(round(cost, 6)))


def extract_project_name(project_dir_name: str) -> str:
    """Extract human-readable project name from URL-encoded dir name."""
    # -Users-nathanielcannon-Claude-Jarvis → Jarvis
    parts = project_dir_name.strip("-").split("-")
    return parts[-1] if parts else project_dir_name


def parse_jsonl_file(filepath: Path) -> list[dict]:
    """Parse a single JSONL session file and extract usage records."""
    records = []
    file_session_id = filepath.stem  # UUID from filename (fallback)

    with open(filepath, "r", errors="replace") as f:
        for line_num, line in enumerate(f):
            line = line.strip()
            if not line:
                continue
            try:
                data = json.loads(line)
            except json.JSONDecodeError:
                continue

            if data.get("type") != "assistant":
                continue

            msg = data.get("message", {})
            if not isinstance(msg, dict):
                continue

            usage = msg.get("usage", {})
            if not usage:
                continue

            input_tokens = usage.get("input_tokens", 0)
            output_tokens = usage.get("output_tokens", 0)
            cache_read = usage.get("cache_read_input_tokens", 0)
            cache_write = usage.get("cache_creation_input_tokens", 0)
            speed = usage.get("speed")
            model = msg.get("model", "unknown")

            # Use sessionId from the record, fall back to filename
            session_id = data.get("sessionId") or file_session_id

            # Use requestId from the record as our unique key
            request_id = data.get("requestId")
            if not request_id:
                # Generate a synthetic one from session + line number
                request_id = f"jsonl_{file_session_id}_{line_num}"

            timestamp = data.get("timestamp")
            if timestamp:
                try:
                    ts = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
                except (ValueError, AttributeError):
                    ts = datetime.now(timezone.utc)
            else:
                ts = datetime.now(timezone.utc)

            cost = compute_cost(model, input_tokens, output_tokens, cache_read, cache_write)

            records.append({
                "request_id": request_id,
                "timestamp": ts,
                "model": model,
                "is_streaming": False,  # Can't determine from JSONL
                "session_id": session_id,
                "input_tokens": input_tokens,
                "output_tokens": output_tokens,
                "cache_read_tokens": cache_read,
                "cache_write_tokens": cache_write,
                "speed": speed,
                "cost_usd": cost,
                "http_status": 200,
                "source": "jsonl",
            })

    return records


async def ingest_records(pool: asyncpg.Pool, records: list[dict], project: str) -> int:
    """Insert records into api_requests, skipping duplicates."""
    inserted = 0
    async with pool.acquire() as conn:
        for rec in records:
            try:
                result = await conn.execute("""
                    INSERT INTO api_requests (
                        request_id, timestamp, model, is_streaming,
                        session_id, project,
                        input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
                        speed, cost_usd, http_status, source
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
                    ON CONFLICT (request_id) DO NOTHING
                """,
                    rec["request_id"], rec["timestamp"], rec["model"], rec["is_streaming"],
                    rec["session_id"], project,
                    rec["input_tokens"], rec["output_tokens"], rec["cache_read_tokens"], rec["cache_write_tokens"],
                    rec["speed"], rec["cost_usd"], rec["http_status"], rec["source"],
                )
                if result == "INSERT 0 1":
                    inserted += 1
            except Exception as e:
                print(f"  Error inserting {rec['request_id']}: {e}", file=sys.stderr)
    return inserted


async def main():
    parser = argparse.ArgumentParser(description="Parse Claude Code JSONL sessions into api_requests")
    parser.add_argument("--project", help="Only parse sessions for this project name")
    parser.add_argument("--since", help="Only parse files modified after this date (YYYY-MM-DD)")
    parser.add_argument("--dry-run", action="store_true", help="Print records without inserting")
    args = parser.parse_args()

    since_ts = None
    if args.since:
        since_ts = datetime.strptime(args.since, "%Y-%m-%d").replace(tzinfo=timezone.utc).timestamp()

    pool = None
    if not args.dry_run:
        pool = await asyncpg.create_pool(
            host=DB_HOST, port=DB_PORT, database=DB_NAME,
            user=DB_USER, password=DB_PASS, min_size=1, max_size=3
        )

    total_files = 0
    total_records = 0
    total_inserted = 0

    for project_dir in CLAUDE_PROJECTS_DIR.iterdir():
        if not project_dir.is_dir():
            continue

        project_name = extract_project_name(project_dir.name)
        if args.project and args.project.lower() != project_name.lower():
            continue

        jsonl_files = sorted(project_dir.glob("*.jsonl"))
        if not jsonl_files:
            continue

        print(f"\n[{project_name}] Found {len(jsonl_files)} session files")

        for jsonl_file in jsonl_files:
            if since_ts and jsonl_file.stat().st_mtime < since_ts:
                continue

            records = parse_jsonl_file(jsonl_file)
            if not records:
                continue

            total_files += 1
            total_records += len(records)

            session_id = jsonl_file.stem
            total_tokens = sum(r["input_tokens"] + r["output_tokens"] for r in records)
            total_cost = sum(r["cost_usd"] for r in records)

            if args.dry_run:
                print(f"  {session_id[:8]}... {len(records)} turns, {total_tokens:,} tokens, ${total_cost:.4f}")
            else:
                inserted = await ingest_records(pool, records, project_name)
                total_inserted += inserted
                print(f"  {session_id[:8]}... {len(records)} turns, {inserted} new, {total_tokens:,} tokens, ${total_cost:.4f}")

    print(f"\nDone: {total_files} files, {total_records} records, {total_inserted} inserted")

    if pool:
        await pool.close()


if __name__ == "__main__":
    asyncio.run(main())
