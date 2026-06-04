/**
 * Session JSONL parser for context-monitor Stop hook.
 * Reads Claude Code's session JSONL and extracts token metrics.
 *
 * Session JSONL location:
 *   ~/.claude/projects/<project-slug>/<session-id>.jsonl
 *
 * Where project slug = CLAUDE_PROJECT_DIR with '/' replaced by '-', leading '-' stripped.
 */

const fs = require('fs').promises;
const path = require('path');
const os = require('os');

const MAX_CONTEXT_TOKENS = 200000; // Claude's context window

/**
 * Derive project slug from CLAUDE_PROJECT_DIR.
 * e.g. process.cwd() -> -home-user-AIProjects
 */
function projectSlug(projectDir) {
  return projectDir.replace(/\//g, '-').replace(/^-/, '');
}

/**
 * Get session JSONL path for a given session ID and project dir.
 */
function getSessionJsonlPath(sessionId, projectDir) {
  const slug = projectSlug(projectDir || process.env.CLAUDE_PROJECT_DIR || '');
  return path.join(os.homedir(), '.claude', 'projects', slug, `${sessionId}.jsonl`);
}

/**
 * Parse session JSONL and extract aggregated token metrics.
 *
 * Returns:
 * {
 *   turn_count: number,
 *   max_context_tokens: number,
 *   final_context_tokens: number,
 *   peak_context_pct: number,
 *   cache_creation_tokens: number,
 *   cache_read_tokens: number,
 *   output_tokens: number,
 *   compaction_count: number,
 *   compaction_events: Array<{pre_tokens, post_tokens, trigger}>
 * }
 */
async function parseSessionMetrics(sessionId, projectDir) {
  const metrics = {
    turn_count: 0,
    max_context_tokens: 0,
    final_context_tokens: 0,
    peak_context_pct: 0,
    cache_creation_tokens: 0,
    cache_read_tokens: 0,
    output_tokens: 0,
    compaction_count: 0,
    compaction_events: []
  };

  const jsonlPath = getSessionJsonlPath(sessionId, projectDir);

  let content;
  try {
    content = await fs.readFile(jsonlPath, 'utf8');
  } catch {
    // Session file not found — return empty metrics
    return metrics;
  }

  const lines = content.trim().split('\n').filter(l => l.trim());
  let lastUsage = null;

  for (const line of lines) {
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }

    // Count assistant turns
    if (entry.type === 'assistant' && entry.message?.role === 'assistant') {
      metrics.turn_count++;
    }

    // Accumulate usage stats from assistant messages
    const usage = entry.message?.usage || entry.usage;
    if (usage) {
      if (usage.cache_creation_input_tokens) {
        metrics.cache_creation_tokens += usage.cache_creation_input_tokens;
      }
      if (usage.cache_read_input_tokens) {
        metrics.cache_read_tokens += usage.cache_read_input_tokens;
      }
      if (usage.output_tokens) {
        metrics.output_tokens += usage.output_tokens;
      }
      // Estimate context tokens as input + cache_creation + cache_read
      const contextTokens = (usage.input_tokens || 0) +
        (usage.cache_creation_input_tokens || 0) +
        (usage.cache_read_input_tokens || 0);
      if (contextTokens > metrics.max_context_tokens) {
        metrics.max_context_tokens = contextTokens;
      }
      lastUsage = usage;
    }

    // Detect compaction events (compact_boundary type)
    if (entry.type === 'compact_boundary' || entry.type === 'compaction') {
      metrics.compaction_count++;
      metrics.compaction_events.push({
        trigger: entry.trigger || 'auto',
        pre_tokens: entry.preTokens || entry.pre_tokens || 0,
        post_tokens: entry.postTokens || entry.post_tokens || 0
      });
    }
  }

  // Final context state from last usage
  if (lastUsage) {
    metrics.final_context_tokens = (lastUsage.input_tokens || 0) +
      (lastUsage.cache_creation_input_tokens || 0) +
      (lastUsage.cache_read_input_tokens || 0);
  }

  // Calculate peak context %
  if (metrics.max_context_tokens > 0) {
    metrics.peak_context_pct = Math.round((metrics.max_context_tokens / MAX_CONTEXT_TOKENS) * 1000) / 10;
  }

  return metrics;
}

module.exports = { parseSessionMetrics, getSessionJsonlPath };
