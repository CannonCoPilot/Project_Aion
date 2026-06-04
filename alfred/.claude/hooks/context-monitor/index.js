#!/usr/bin/env node
/**
 * Context Monitor — SessionStart Hook
 *
 * Records session start event to JSONL log.
 * Captures: session_id, cwd, git branch, timestamp.
 *
 * Part of: AIProjects-ho0u (context monitoring system)
 * Design doc: .claude/context/projects/context-monitor-design.md
 */

const { execFile } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const { appendEvent } = require('./lib/jsonl-writer');

const execFileAsync = promisify(execFile);

async function getGitBranch(cwd) {
  try {
    const { stdout } = await execFileAsync('git', ['branch', '--show-current'], { cwd, timeout: 3000 });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

async function main() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  let context = {};
  try { context = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch {}

  const sessionId = context.session_id || process.env.CLAUDE_SESSION_ID || 'unknown';
  const cwd = context.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const version = context.version || process.env.CLAUDE_VERSION || 'unknown';
  const gitBranch = await getGitBranch(cwd);

  await appendEvent({
    event: 'session_start',
    session_id: sessionId,
    cwd,
    git_branch: gitBranch,
    version
  });

  // Don't inject additional context — just observe
  console.log(JSON.stringify({}));
}

main().catch(err => {
  process.stderr.write(`[context-monitor/index] Error: ${err.message}\n`);
  console.log(JSON.stringify({}));
});
