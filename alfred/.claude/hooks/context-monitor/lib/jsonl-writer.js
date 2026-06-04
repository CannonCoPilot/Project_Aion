/**
 * JSONL writer for context-monitor events.
 * Appends structured events to ~/.claude/logs/context-metrics-YYYY-MM-DD.jsonl
 */

const fs = require('fs').promises;
const path = require('path');
const os = require('os');

const LOG_DIR = path.join(os.homedir(), '.claude', 'logs');

/**
 * Get today's JSONL log file path.
 */
function getLogPath() {
  const today = new Date().toISOString().slice(0, 10);
  return path.join(LOG_DIR, `context-metrics-${today}.jsonl`);
}

/**
 * Append a JSON event to the daily JSONL log.
 * Silently fails if write fails to avoid disrupting sessions.
 */
async function appendEvent(event) {
  try {
    await fs.mkdir(LOG_DIR, { recursive: true });
    const line = JSON.stringify({ ...event, timestamp: event.timestamp || new Date().toISOString() }) + '\n';
    await fs.appendFile(getLogPath(), line, 'utf8');
  } catch (err) {
    process.stderr.write(`[context-monitor] jsonl-writer error: ${err.message}\n`);
  }
}

module.exports = { appendEvent, getLogPath };
