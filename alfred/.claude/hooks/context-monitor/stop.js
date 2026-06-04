#!/usr/bin/env node
/**
 * Context Monitor — Stop Hook
 *
 * Runs when Claude Code session ends. Reads session JSONL to extract token
 * metrics and writes a session_end event to JSONL + SQLite.
 *
 * Part of: AIProjects-ho0u (context monitoring system)
 * Design doc: .claude/context/projects/context-monitor-design.md
 */

const { execFile } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const { appendEvent } = require('./lib/jsonl-writer');
const { parseSessionMetrics } = require('./lib/session-parser');

const execFileAsync = promisify(execFile);

const SQLITE_WRITER = path.join(__dirname, 'lib', 'sqlite-writer.py');

async function writeSqlite(sessionData) {
  try {
    await execFileAsync('python3', [SQLITE_WRITER], {
      input: JSON.stringify(sessionData),
      timeout: 10000
    });
  } catch (err) {
    process.stderr.write(`[context-monitor/stop] SQLite write error: ${err.message}\n`);
  }
}

/**
 * Read session-start event from today's JSONL to get started_at timestamp.
 */
async function getSessionStart(sessionId) {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const logPath = path.join(os.homedir(), '.claude', 'logs', `context-metrics-${today}.jsonl`);
    const content = await fs.readFile(logPath, 'utf8');
    for (const line of content.trim().split('\n')) {
      try {
        const entry = JSON.parse(line);
        if (entry.event === 'session_start' && entry.session_id === sessionId) {
          return entry;
        }
      } catch {}
    }
  } catch {}
  return null;
}

/**
 * Count memory_write and file_read events for this session from today's JSONL.
 */
async function countSessionEvents(sessionId) {
  const counts = { memory_writes: 0, file_reads: 0, top_file_reads: [] };
  try {
    const today = new Date().toISOString().slice(0, 10);
    const logPath = path.join(os.homedir(), '.claude', 'logs', `context-metrics-${today}.jsonl`);
    const content = await fs.readFile(logPath, 'utf8');
    const fileReadMap = {};
    for (const line of content.trim().split('\n')) {
      try {
        const entry = JSON.parse(line);
        if (entry.session_id !== sessionId) continue;
        if (entry.event === 'memory_write') counts.memory_writes++;
        if (entry.event === 'file_read') {
          counts.file_reads++;
          const fp = entry.file_path;
          if (!fileReadMap[fp]) fileReadMap[fp] = { file_path: fp, count: 0, file_size_bytes: entry.file_size_bytes, estimated_tokens: entry.estimated_tokens };
          fileReadMap[fp].count++;
        }
      } catch {}
    }
    // Top 10 files by read count
    counts.top_file_reads = Object.values(fileReadMap)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  } catch {}
  return counts;
}

async function main() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  let context = {};
  try { context = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch {}

  const sessionId = context.session_id || process.env.CLAUDE_SESSION_ID || 'unknown';
  const cwd = context.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const now = new Date().toISOString();

  // Parse token metrics from session JSONL
  const metrics = await parseSessionMetrics(sessionId, cwd);

  // Get session start info and event counts from our own JSONL
  const [sessionStart, eventCounts] = await Promise.all([
    getSessionStart(sessionId),
    countSessionEvents(sessionId)
  ]);

  // Calculate duration
  let durationSeconds = 0;
  if (sessionStart?.timestamp) {
    durationSeconds = Math.round((Date.now() - new Date(sessionStart.timestamp).getTime()) / 1000);
  }

  const sessionData = {
    event: 'session_end',
    session_id: sessionId,
    timestamp: now,
    started_at: sessionStart?.timestamp || now,
    cwd: sessionStart?.cwd || cwd,
    git_branch: sessionStart?.git_branch || null,
    duration_seconds: durationSeconds,
    turn_count: metrics.turn_count,
    max_context_tokens: metrics.max_context_tokens,
    final_context_tokens: metrics.final_context_tokens,
    peak_context_pct: metrics.peak_context_pct,
    cache_creation_tokens: metrics.cache_creation_tokens,
    cache_read_tokens: metrics.cache_read_tokens,
    output_tokens: metrics.output_tokens,
    compaction_count: metrics.compaction_count,
    compaction_events: metrics.compaction_events,
    memory_writes: eventCounts.memory_writes,
    file_reads: eventCounts.file_reads,
    top_file_reads: eventCounts.top_file_reads
  };

  // Write to JSONL
  await appendEvent(sessionData);

  // Write session summary to SQLite
  await writeSqlite(sessionData);

  process.stderr.write(`[context-monitor/stop] Session ${sessionId.slice(0, 8)}... recorded: ${metrics.turn_count} turns, ${metrics.max_context_tokens} peak tokens (${metrics.peak_context_pct}%), ${metrics.compaction_count} compactions\n`);

  console.log(JSON.stringify({}));
}

main().catch(err => {
  process.stderr.write(`[context-monitor/stop] Fatal: ${err.message}\n`);
  console.log(JSON.stringify({}));
});
