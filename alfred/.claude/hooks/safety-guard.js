#!/usr/bin/env node
/**
 * Safety Guard Hook — Global catastrophic command prevention
 *
 * PreToolUse hook that fires on ALL sessions (headless AND interactive).
 * Blocks commands that are never legitimate in any context: root filesystem
 * wipes, raw disk writes, pipe-to-shell remote code execution (external only).
 *
 * This is intentionally minimal and separate from persona-guard.js:
 *   - persona-guard: headless only, per-persona policies + DEFAULT_POLICY
 *   - safety-guard: global, absolute last-resort catastrophic prevention
 *
 * If you need to run a blocked command legitimately, use the terminal directly.
 *
 * Created: 2026-04-01
 * Updated: 2026-04-02 — allow curl/wget to internal endpoints, fix heredoc false positives
 * Task: AIProjects-88ff (supersedes AIProjects-s476)
 * Ref: nexus-security-standards.md
 */

const { readStdin, block, proceed, runHook, appendJsonl, LOG_DIR } = require('./lib/shared');
const path = require('path');

const GUARD_LOG = path.join(LOG_DIR, 'safety-guard.jsonl');

/**
 * Check if a hostname is internal (private network, localhost, or local DNS).
 */
function isInternalHost(host) {
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return true;
  // Bare hostnames (no dots) — only resolvable via local DNS
  if (!host.includes('.')) return true;
  // .local, .lan, .internal TLDs
  if (/\.(local|lan|internal)$/.test(host)) return true;
  // RFC 1918: 10.x.x.x
  if (/^10\./.test(host)) return true;
  // RFC 1918: 172.16.0.0 - 172.31.255.255
  const m172 = host.match(/^172\.(\d+)\./);
  if (m172 && +m172[1] >= 16 && +m172[1] <= 31) return true;
  // RFC 1918: 192.168.x.x
  if (/^192\.168\./.test(host)) return true;
  return false;
}

/**
 * Check if a curl/wget command targets only internal endpoints.
 * Returns true only if URLs were found AND all are internal (fail-closed).
 */
function isInternalUrl(command) {
  const beforePipe = command.split(/\|/)[0];
  const urlPattern = /https?:\/\/([^\/:\s]+)/g;
  let match;
  let foundUrl = false;
  while ((match = urlPattern.exec(beforePipe)) !== null) {
    foundUrl = true;
    if (!isInternalHost(match[1].toLowerCase())) return false;
  }
  return foundUrl;
}

/**
 * Strip heredoc body content to prevent false positives from data inside heredocs.
 * E.g., JSON containing "rm -rf ~/" as a string value shouldn't trigger the rm guard.
 */
function stripHeredocBodies(command) {
  return command.replace(/<<-?\s*['"]?(\w+)['"]?[^\n]*\n[\s\S]*?\n\1(?:\s*$|\n)/gm, '<<HEREDOC_STRIPPED\n');
}

// Patterns that are NEVER legitimate through Claude Code in any context
const CATASTROPHIC_PATTERNS = [
  { pattern: /rm\s+-rf\s+\/\s/,              label: 'rm -rf / (root wipe)' },
  { pattern: /rm\s+-rf\s+\/$/,               label: 'rm -rf / (root wipe)' },
  { pattern: /rm\s+-rf\s+~\s/,               label: 'rm -rf ~ (home wipe)' },
  { pattern: /rm\s+-rf\s+~$/,                label: 'rm -rf ~ (home wipe)' },
  { pattern: /rm\s+-rf\s+~\//,               label: 'rm -rf ~/ (home subdir wipe)' },
  { pattern: /rm\s+-rf\s+\.\s*$/,            label: 'rm -rf . (cwd wipe)' },
  { pattern: /rm\s+-rf\s+\*\s*$/,            label: 'rm -rf * (cwd glob wipe)' },
  { pattern: /\bdd\s+.*of=\/dev\/[sh]d/,     label: 'dd to raw disk device' },
  { pattern: /\bmkfs\b/,                     label: 'format filesystem' },
  { pattern: />\s*\/dev\/[sh]d[a-z]/,        label: 'redirect to raw disk' },
  { pattern: /\bchmod\s+-R\s+777\s+\//,      label: 'recursive chmod 777 on root' },
];

// Pipe-to-exec patterns — blocked only for EXTERNAL URLs
const PIPE_EXEC_PATTERNS = [
  { pattern: /curl\s+.*\|\s*(?:ba)?sh/,      label: 'curl | bash (remote code exec)' },
  { pattern: /wget\s+.*\|\s*(?:ba)?sh/,      label: 'wget | sh (remote code exec)' },
  { pattern: /curl\s+.*\|\s*python/,         label: 'curl | python (remote code exec)' },
  { pattern: /wget\s+.*\|\s*python/,         label: 'wget | python (remote code exec)' },
];

async function main() {
  const context = await readStdin();
  if (context.tool_name !== 'Bash') {
    proceed();
    return;
  }

  const command = context.tool_input?.command || '';
  const commandStripped = stripHeredocBodies(command);

  // Check catastrophic patterns (always block, heredoc-stripped)
  for (const { pattern, label } of CATASTROPHIC_PATTERNS) {
    if (pattern.test(commandStripped)) {
      const persona = process.env.CLAUDE_PERSONA || 'interactive';
      const entry = {
        timestamp: new Date().toISOString(),
        event: 'catastrophic_blocked',
        persona,
        label,
        command: command.substring(0, 500),
      };
      appendJsonl(GUARD_LOG, entry).catch(() => {});

      block(`[safety-guard] BLOCKED: ${label}\nThis command is never allowed through Claude Code.\nCommand: ${command.substring(0, 200)}`);
      return;
    }
  }

  // Check pipe-to-exec patterns (block only external URLs)
  for (const { pattern, label } of PIPE_EXEC_PATTERNS) {
    if (pattern.test(commandStripped) && !isInternalUrl(command)) {
      const persona = process.env.CLAUDE_PERSONA || 'interactive';
      const entry = {
        timestamp: new Date().toISOString(),
        event: 'catastrophic_blocked',
        persona,
        label,
        command: command.substring(0, 500),
      };
      appendJsonl(GUARD_LOG, entry).catch(() => {});

      block(`[safety-guard] BLOCKED: ${label}\nThis command is never allowed through Claude Code.\nCommand: ${command.substring(0, 200)}`);
      return;
    }
  }

  proceed();
}

runHook('safety-guard', main);
