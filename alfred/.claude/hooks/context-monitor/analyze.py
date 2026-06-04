#!/usr/bin/env python3
"""Context Monitor — Session Analysis Dashboard

Reads ~/.claude/data/context-monitor.db and prints a formatted health report.

Usage:
    python3 analyze.py            # Last 7 days
    python3 analyze.py --days 30  # Last 30 days
    python3 analyze.py --full     # All time
    python3 analyze.py --sql      # Print raw SQL queries instead

Insights produced:
  1. Top context-consuming files (most token budget consumed by reads)
  2. Compaction timing relative to session length
  3. Session health score trend over time
  4. Cache efficiency by session
  5. Sessions with highest peak context %
  6. Average compaction rate

Part of: AIProjects-7mjp (context-monitor analysis dashboard)
Depends on: AIProjects-ho0u (hook implementation — collects data into DB)
"""

import argparse
import os
import sqlite3
import sys
from datetime import datetime, timedelta

DB_PATH = os.path.join(os.path.expanduser('~'), '.claude', 'data', 'context-monitor.db')

SQL_QUERIES = """\
-- ============================================================
-- Context Monitor Analysis Queries
-- Run against: ~/.claude/data/context-monitor.db
-- ============================================================

-- 1. Top context-consuming files (all time)
--    Which files consume the most token budget when read?
SELECT
    file_path,
    COUNT(*)                                AS read_count,
    SUM(estimated_tokens)                   AS total_tokens,
    AVG(estimated_tokens)                   AS avg_tokens_per_read,
    MAX(file_size_bytes) / 1024             AS max_size_kb
FROM file_reads
GROUP BY file_path
ORDER BY total_tokens DESC
LIMIT 20;

-- 2. Compaction timing — when during a session does it hit?
--    Joins compaction events with session duration to get % into session.
SELECT
    s.session_id,
    s.date,
    s.duration_sec,
    s.turn_count,
    c.pre_tokens,
    c.post_tokens,
    ROUND(100.0 * c.pre_tokens / NULLIF(s.max_tokens, 0), 1) AS trigger_pct_of_peak,
    c.trigger
FROM compaction_events c
JOIN sessions s ON s.session_id = c.session_id
ORDER BY s.date DESC, c.occurred_at;

-- 3. Session health score trend over time
SELECT
    date,
    ROUND(AVG(health_score), 1)     AS avg_health,
    MIN(health_score)               AS min_health,
    MAX(health_score)               AS max_health,
    COUNT(*)                        AS session_count,
    ROUND(AVG(peak_pct), 1)         AS avg_peak_pct,
    SUM(compactions)                AS total_compactions
FROM sessions
GROUP BY date
ORDER BY date DESC
LIMIT 30;

-- 4. Cache efficiency by session
--    High ratio = cache is working well (many reads from cache vs cache fills)
SELECT
    session_id,
    date,
    cache_creation,
    cache_reads,
    ROUND(CAST(cache_reads AS REAL) / NULLIF(cache_creation, 0), 2) AS cache_ratio,
    turn_count,
    health_score
FROM sessions
WHERE cache_creation > 0
ORDER BY cache_ratio DESC
LIMIT 20;

-- 5. Sessions with highest peak context % (at risk of compaction)
SELECT
    session_id,
    date,
    peak_pct,
    compactions,
    turn_count,
    duration_sec / 60               AS duration_min,
    health_score
FROM sessions
ORDER BY peak_pct DESC
LIMIT 10;

-- 6. Compaction rate summary
SELECT
    COUNT(*)                            AS total_sessions,
    SUM(compactions)                    AS total_compactions,
    ROUND(AVG(compactions), 2)          AS avg_compactions_per_session,
    COUNT(CASE WHEN compactions > 0 THEN 1 END) AS sessions_with_compaction,
    ROUND(100.0 * COUNT(CASE WHEN compactions > 0 THEN 1 END) / COUNT(*), 1) AS pct_with_compaction
FROM sessions;
"""


def fmt_tokens(n):
    if n is None:
        return "—"
    if n >= 1000:
        return f"{n/1000:.1f}k"
    return str(n)


def bar(value, max_value, width=20, char="█"):
    if not max_value:
        return " " * width
    filled = int(round(value / max_value * width))
    return char * filled + "░" * (width - filled)


def run_dashboard(conn, days=7, full=False):
    if full:
        date_filter = ""
        date_args = []
    else:
        cutoff = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
        date_filter = "WHERE date >= ?"
        date_args = [cutoff]

    print("=" * 60)
    print("  Context Monitor — Session Health Report")
    if full:
        print("  Scope: All time")
    else:
        print(f"  Scope: Last {days} days")
    print("=" * 60)

    # ── Summary ──────────────────────────────────────────────
    row = conn.execute(f"""
        SELECT
            COUNT(*)                                AS sessions,
            ROUND(AVG(health_score), 1)             AS avg_health,
            ROUND(AVG(peak_pct), 1)                 AS avg_peak,
            SUM(compactions)                        AS total_compactions,
            ROUND(AVG(turn_count), 1)               AS avg_turns,
            ROUND(AVG(duration_sec) / 60.0, 1)      AS avg_min
        FROM sessions {date_filter}
    """, date_args).fetchone()

    if not row or row[0] == 0:
        print("\n  No sessions recorded yet.")
        print("  Hooks run at session end — data accumulates after use.\n")
        return

    sessions, avg_health, avg_peak, total_compactions, avg_turns, avg_min = row
    print(f"\n  Sessions:      {sessions}")
    print(f"  Avg health:    {avg_health}/100")
    print(f"  Avg peak ctx:  {avg_peak}%")
    print(f"  Compactions:   {total_compactions}")
    print(f"  Avg turns:     {avg_turns}")
    print(f"  Avg duration:  {avg_min} min")

    # ── Insight 1: Top context-consuming files ────────────────
    print("\n" + "─" * 60)
    print("  INSIGHT 1 — Top Context-Consuming Files")
    print("─" * 60)
    rows = conn.execute(f"""
        SELECT
            fr.file_path,
            COUNT(*)                    AS reads,
            SUM(fr.estimated_tokens)    AS total_tokens
        FROM file_reads fr
        JOIN sessions s ON s.session_id = fr.session_id
        {date_filter.replace('WHERE', 'WHERE s.')}
        GROUP BY fr.file_path
        ORDER BY total_tokens DESC
        LIMIT 10
    """, date_args).fetchall()

    if rows:
        max_tok = rows[0][2] or 1
        for path, reads, tokens in rows:
            short = path.replace(os.path.expanduser('~'), '~') if path else '(unknown)'
            if len(short) > 40:
                short = '…' + short[-39:]
            b = bar(tokens or 0, max_tok, width=15)
            print(f"  {b} {fmt_tokens(tokens):>6}t  ×{reads:>3}  {short}")
    else:
        print("  No file read data yet.")

    # ── Insight 2: Compaction timing ──────────────────────────
    print("\n" + "─" * 60)
    print("  INSIGHT 2 — Compaction Timing (% of session at trigger)")
    print("─" * 60)
    rows = conn.execute(f"""
        SELECT
            ROUND(100.0 * c.pre_tokens / NULLIF(s.max_tokens, 0), 0) AS trigger_pct,
            c.pre_tokens,
            c.post_tokens,
            s.date
        FROM compaction_events c
        JOIN sessions s ON s.session_id = c.session_id
        {date_filter.replace('WHERE', 'WHERE s.')}
        ORDER BY s.date DESC
        LIMIT 15
    """, date_args).fetchall()

    if rows:
        avg_trigger = sum(r[0] for r in rows if r[0]) / len(rows)
        print(f"  Avg trigger point: {avg_trigger:.0f}% of peak context")
        print()
        for trigger_pct, pre, post, date in rows:
            reduction = ((pre - post) / pre * 100) if pre and post and pre > 0 else None
            red_str = f"  ↓{reduction:.0f}% after" if reduction else ""
            print(f"  {date}  triggered at {trigger_pct or '?':>3}% context{red_str}")
    else:
        print("  No compaction events recorded yet.")

    # ── Insight 3: Health score over time ─────────────────────
    print("\n" + "─" * 60)
    print("  INSIGHT 3 — Session Health Score Over Time")
    print("─" * 60)
    rows = conn.execute(f"""
        SELECT
            date,
            ROUND(AVG(health_score), 1) AS avg_health,
            COUNT(*)                    AS count,
            ROUND(AVG(peak_pct), 1)     AS avg_peak,
            SUM(compactions)            AS compactions
        FROM sessions
        {date_filter}
        GROUP BY date
        ORDER BY date DESC
        LIMIT 14
    """, date_args).fetchall()

    if rows:
        for date, health, count, peak, compactions in rows:
            b = bar(health or 0, 100, width=20)
            comp_str = f"  ⚡{compactions}" if compactions else ""
            print(f"  {date}  {b}  {health or 0:>5.1f}/100  ×{count}{comp_str}")
    else:
        print("  No session health data yet.")

    # ── Insight 4: Cache efficiency ───────────────────────────
    print("\n" + "─" * 60)
    print("  INSIGHT 4 — Cache Efficiency (cache_reads / cache_fills)")
    print("─" * 60)
    row = conn.execute(f"""
        SELECT
            ROUND(AVG(CAST(cache_reads AS REAL) / NULLIF(cache_creation, 0)), 2) AS avg_ratio,
            ROUND(SUM(cache_reads) * 100.0 / NULLIF(SUM(cache_creation) + SUM(cache_reads), 0), 1) AS cache_hit_pct
        FROM sessions
        {date_filter}
        WHERE cache_creation > 0
    """, date_args).fetchone()

    if row and row[0]:
        print(f"  Avg cache ratio:   {row[0]}x  (higher = cache reused more)")
        print(f"  Overall cache hit: {row[1]}%")
    else:
        print("  No cache data yet.")

    # ── Insight 5: At-risk sessions ───────────────────────────
    print("\n" + "─" * 60)
    print("  INSIGHT 5 — Highest Peak Context Sessions")
    print("─" * 60)
    rows = conn.execute(f"""
        SELECT date, peak_pct, compactions, turn_count, health_score
        FROM sessions
        {date_filter}
        ORDER BY peak_pct DESC
        LIMIT 5
    """, date_args).fetchall()

    if rows:
        for date, peak, compactions, turns, health in rows:
            b = bar(peak or 0, 100, width=15)
            comp_str = f"⚡{compactions} " if compactions else ""
            print(f"  {date}  {b}  {peak or 0:>5.1f}%  {comp_str}{turns or 0} turns  health={health or 0:.0f}")
    else:
        print("  No sessions yet.")

    print("\n" + "=" * 60 + "\n")


def main():
    parser = argparse.ArgumentParser(description="Context Monitor analysis dashboard")
    parser.add_argument("--days", type=int, default=7, help="Days of history (default: 7)")
    parser.add_argument("--full", action="store_true", help="All-time data")
    parser.add_argument("--sql", action="store_true", help="Print raw SQL queries instead of running")
    args = parser.parse_args()

    if args.sql:
        print(SQL_QUERIES)
        return

    if not os.path.exists(DB_PATH):
        print(f"Database not found: {DB_PATH}")
        print("Hooks have been installed — data will accumulate as sessions end.")
        print("Run: python3 analyze.py  (after a few sessions)")
        sys.exit(0)

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        run_dashboard(conn, days=args.days, full=args.full)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
