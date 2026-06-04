#!/usr/bin/env python3
"""SQLite writer for context-monitor session summaries.

Usage:
    echo '<json>' | python3 sqlite-writer.py

Reads a session summary JSON from stdin, writes to ~/.claude/data/context-monitor.db.

Schema:
  sessions table — one row per session
  compaction_events table — one row per compaction within a session
  file_reads table — top files read in a session
"""

import json
import os
import sqlite3
import sys

DB_PATH = os.path.join(os.path.expanduser('~'), '.claude', 'data', 'context-monitor.db')


def init_db(db):
    db.executescript("""
        CREATE TABLE IF NOT EXISTS sessions (
            session_id     TEXT PRIMARY KEY,
            date           TEXT NOT NULL,
            started_at     TEXT NOT NULL,
            ended_at       TEXT,
            cwd            TEXT,
            git_branch     TEXT,
            duration_sec   INTEGER,
            turn_count     INTEGER,
            max_tokens     INTEGER,
            final_tokens   INTEGER,
            peak_pct       REAL,
            cache_creation INTEGER,
            cache_reads    INTEGER,
            output_tokens  INTEGER,
            compactions    INTEGER DEFAULT 0,
            memory_writes  INTEGER DEFAULT 0,
            file_reads     INTEGER DEFAULT 0,
            health_score   REAL
        );

        CREATE TABLE IF NOT EXISTS compaction_events (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id     TEXT NOT NULL REFERENCES sessions(session_id),
            occurred_at    TEXT NOT NULL,
            pre_tokens     INTEGER,
            post_tokens    INTEGER,
            trigger        TEXT
        );

        CREATE TABLE IF NOT EXISTS file_reads (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id     TEXT NOT NULL REFERENCES sessions(session_id),
            occurred_at    TEXT NOT NULL,
            file_path      TEXT,
            file_size_bytes INTEGER,
            estimated_tokens INTEGER
        );

        CREATE INDEX IF NOT EXISTS idx_sessions_date ON sessions(date);
        CREATE INDEX IF NOT EXISTS idx_file_reads_session ON file_reads(session_id);
        CREATE INDEX IF NOT EXISTS idx_file_reads_path ON file_reads(file_path);
    """)
    db.commit()


def compute_health_score(peak_pct, compaction_count, file_reads_count, cache_reads, cache_creation):
    score = 100.0
    score -= peak_pct * 0.3
    score -= compaction_count * 15
    if file_reads_count > 50:
        score -= 10
    if cache_creation > 0 and cache_reads / cache_creation > 10:
        score += 10
    return max(0.0, min(100.0, round(score, 1)))


def write_session(data):
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    db = sqlite3.connect(DB_PATH)
    db.execute("PRAGMA journal_mode=WAL")
    init_db(db)

    session_id = data.get('session_id')
    if not session_id:
        return

    peak_pct = data.get('peak_context_pct', 0.0)
    compactions = data.get('compaction_count', 0)
    file_read_count = data.get('file_reads', 0)
    cache_creation = data.get('cache_creation_tokens', 0)
    cache_reads = data.get('cache_read_tokens', 0)

    health = compute_health_score(peak_pct, compactions, file_read_count, cache_reads, cache_creation)

    date = data.get('timestamp', '')[:10]

    db.execute("""
        INSERT OR REPLACE INTO sessions
          (session_id, date, started_at, ended_at, cwd, git_branch,
           duration_sec, turn_count, max_tokens, final_tokens, peak_pct,
           cache_creation, cache_reads, output_tokens, compactions,
           memory_writes, file_reads, health_score)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        session_id, date,
        data.get('started_at', data.get('timestamp', '')),
        data.get('timestamp'),
        data.get('cwd'),
        data.get('git_branch'),
        data.get('duration_seconds'),
        data.get('turn_count'),
        data.get('max_context_tokens'),
        data.get('final_context_tokens'),
        peak_pct,
        cache_creation,
        cache_reads,
        data.get('output_tokens'),
        compactions,
        data.get('memory_writes', 0),
        file_read_count,
        health
    ))

    # Write compaction events
    for evt in data.get('compaction_events', []):
        db.execute("""
            INSERT INTO compaction_events (session_id, occurred_at, pre_tokens, post_tokens, trigger)
            VALUES (?, ?, ?, ?, ?)
        """, (
            session_id,
            data.get('timestamp', ''),
            evt.get('pre_tokens'),
            evt.get('post_tokens'),
            evt.get('trigger', 'auto')
        ))

    # Write top file reads
    for fr in data.get('top_file_reads', []):
        db.execute("""
            INSERT INTO file_reads (session_id, occurred_at, file_path, file_size_bytes, estimated_tokens)
            VALUES (?, ?, ?, ?, ?)
        """, (
            session_id,
            data.get('timestamp', ''),
            fr.get('file_path'),
            fr.get('file_size_bytes'),
            fr.get('estimated_tokens')
        ))

    db.commit()
    db.close()
    print('OK')


if __name__ == '__main__':
    raw = sys.stdin.read().strip()
    if not raw:
        sys.exit(0)
    data = json.loads(raw)
    write_session(data)
