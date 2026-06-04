#!/usr/bin/env node
/**
 * Session Stop Hook
 *
 * Runs when Claude Code session ends. Sends desktop notification
 * so you know when long-running tasks complete.
 *
 * Requirements:
 * - Linux: notify-send (libnotify-bin package)
 * - macOS: osascript (built-in)
 * - Windows: PowerShell (built-in)
 *
 * Created: 2026-01-03
 * Fixed: 2026-01-21 - Converted to stdin/stdout executable hook
 * Source: my-claude-code-setup research project
 */

const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);
const os = require('os');
const fs = require('fs').promises;
const path = require('path');

// Paths for session summary
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const LOG_DIR = path.join(PROJECT_ROOT, '.claude', 'logs');
const SESSION_FILE = path.join(LOG_DIR, '.current-session');
const SESSION_STATE_FILE = path.join(PROJECT_ROOT, '.claude', 'context', 'session-state.md');

// Notification settings
const APP_NAME = 'Claude Code';
const NOTIFICATION_TIMEOUT = 5000; // ms

/**
 * Send Linux notification via notify-send
 */
async function notifyLinux(title, message) {
  try {
    await execFileAsync('notify-send', [
      '--app-name=' + APP_NAME,
      '--urgency=low',
      '--icon=dialog-information',
      '--expire-time=10000',
      title,
      message
    ], { timeout: NOTIFICATION_TIMEOUT });
    return true;
  } catch {
    return false;
  }
}

/**
 * Send macOS notification via osascript
 */
async function notifyMacOS(title, message) {
  try {
    const script = `display notification "${message}" with title "${title}" sound name "Glass"`;
    await execFileAsync('osascript', ['-e', script], { timeout: NOTIFICATION_TIMEOUT });
    return true;
  } catch {
    return false;
  }
}

/**
 * Send Windows notification via PowerShell
 */
async function notifyWindows(title, message) {
  try {
    const script = `
      [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
      $template = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)
      $textNodes = $template.GetElementsByTagName("text")
      $textNodes.Item(0).AppendChild($template.CreateTextNode("${title}")) | Out-Null
      $textNodes.Item(1).AppendChild($template.CreateTextNode("${message}")) | Out-Null
      $toast = [Windows.UI.Notifications.ToastNotification]::new($template)
      [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("${APP_NAME}").Show($toast)
    `;
    await execFileAsync('powershell', ['-Command', script], { timeout: NOTIFICATION_TIMEOUT });
    return true;
  } catch {
    return false;
  }
}

/**
 * Send notification based on platform
 */
async function sendNotification(title, message) {
  const platform = os.platform();

  switch (platform) {
    case 'linux':
      return notifyLinux(title, message);
    case 'darwin':
      return notifyMacOS(title, message);
    case 'win32':
      return notifyWindows(title, message);
    default:
      console.error(`[session-stop] Notifications not supported on ${platform}`);
      return false;
  }
}

/**
 * Run Obsidian knowledge sync at session end
 * Syncs Claude-generated knowledge to Obsidian vault via NFS
 */
async function runObsidianSync() {
  const syncScript = 'process.cwd()/Scripts/sync-knowledge-to-obsidian.sh';
  try {
    const { stdout, stderr } = await execFileAsync(syncScript, ['--quiet'], {
      timeout: 30000,
      cwd: 'process.cwd()'
    });
    // Parse summary from output (last line: "Sync complete: N synced, N unchanged, N errors")
    const match = (stderr || stdout || '').match(/(\d+) synced/);
    const synced = match ? parseInt(match[1], 10) : 0;
    console.error(`[session-stop] Obsidian sync: ${synced} files synced`);
    return synced;
  } catch (err) {
    console.error(`[session-stop] Obsidian sync failed: ${err.message}`);
    return -1;
  }
}

/**
 * Read current session name from .current-session file.
 */
async function getCurrentSessionName() {
  try {
    const content = await fs.readFile(SESSION_FILE, 'utf8');
    try {
      const parsed = JSON.parse(content);
      return parsed.name || parsed.slug || 'default-session';
    } catch {
      return content.trim() || 'default-session';
    }
  } catch {
    return 'default-session';
  }
}

/**
 * Read last N lines of audit.jsonl and filter for current session.
 * Returns parsed entries or empty array.
 */
async function readSessionAuditEntries(sessionName, maxLines = 500) {
  const auditFile = path.join(LOG_DIR, 'audit.jsonl');
  try {
    const content = await fs.readFile(auditFile, 'utf8');
    const lines = content.trim().split('\n').slice(-maxLines);
    const entries = [];
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (entry.session === sessionName) entries.push(entry);
      } catch { /* skip malformed lines */ }
    }
    return entries;
  } catch {
    return [];
  }
}

/**
 * Generate a structured session summary from audit entries using heuristics.
 * No LLM required — derives facts from tool call patterns.
 */
function buildSessionSummary(sessionName, entries, stopReason) {
  const filesModified = new Set();
  const tasksActedOn = new Set();
  const urlsResearched = new Set();
  const toolCounts = {};

  for (const entry of entries) {
    const tool = entry.tool || '';
    toolCounts[tool] = (toolCounts[tool] || 0) + 1;

    const params = entry.parameters || {};

    // Track file modifications
    if (['Write', 'Edit', 'NotebookEdit'].includes(tool)) {
      const fp = params.file_path || params.path;
      if (fp) filesModified.add(fp.replace(/.*\/AIProjects\//, '').replace(/.*\/Code\//, ''));
    }

    // Track task operations from bash commands (Pulse CLI)
    if (tool === 'Bash' && params.command) {
      const cmd = params.command;
      const pulseClose = cmd.match(/\bpulse\s+close\s+(\S+)/);
      if (pulseClose) tasksActedOn.add(`closed:${pulseClose[1]}`);
      const pulseUpdate = cmd.match(/\bpulse\s+update\s+(\S+)\s+--status\s+in_progress/);
      if (pulseUpdate) tasksActedOn.add(`worked:${pulseUpdate[1]}`);
      const pulseCreate = cmd.match(/\bpulse\s+create\b/);
      if (pulseCreate) tasksActedOn.add('created:task');
      // Detect git commits as work signals
      const gitCommit = cmd.match(/\bgit\s+commit\b/);
      if (gitCommit) filesModified.add('[git commit]');
      const gitPush = cmd.match(/\bgit\s+push\b/);
      if (gitPush) filesModified.add('[git push]');
    }

    // Track task operations from MCP tools
    if (tool && tool.includes('task_create')) tasksActedOn.add('created:mcp-task');
    if (tool && tool.includes('task_close')) tasksActedOn.add('closed:mcp-task');
    if (tool && tool.includes('task_update')) tasksActedOn.add('updated:mcp-task');

    // Track task IDs from entry metadata
    if (entry.task_id) tasksActedOn.add(`ref:${entry.task_id}`);

    // Track web research
    if (tool === 'WebFetch' && params.url) urlsResearched.add(params.url.substring(0, 80));
    if (tool === 'WebSearch' && params.query) urlsResearched.add(`search:${params.query.substring(0, 60)}`);
  }

  const now = new Date();
  const dateStr = now.toISOString().substring(0, 10);
  const timeStr = now.toISOString().substring(11, 16) + 'Z';

  const completedItems = [];
  if (filesModified.size > 0) {
    completedItems.push(`Modified ${filesModified.size} file(s): ${[...filesModified].slice(0, 5).join(', ')}`);
  }
  const closedTasks = [...tasksActedOn].filter(t => t.startsWith('closed:'));
  if (closedTasks.length > 0) {
    completedItems.push(`Closed tasks: ${closedTasks.map(t => t.replace('closed:', '')).join(', ')}`);
  }

  const investigatedItems = [];
  if (urlsResearched.size > 0) {
    investigatedItems.push(`Web: ${[...urlsResearched].slice(0, 3).join('; ')}`);
  }
  const readCount = toolCounts['Read'] || 0;
  if (readCount > 0) investigatedItems.push(`Read ${readCount} file(s)`);

  const toolSummary = Object.entries(toolCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([t, n]) => `${t}×${n}`)
    .join(', ');

  const block = [
    '',
    `## Auto-Summary: ${dateStr} ${timeStr} (${sessionName})`,
    '',
    `**Stop reason**: ${stopReason || 'completed'}`,
    `**Tool usage**: ${toolSummary || 'none'} (${entries.length} total logged)`,
    '',
    `**Completed**: ${completedItems.length > 0 ? completedItems.join('; ') : 'no file changes detected'}`,
    `**Investigated**: ${investigatedItems.length > 0 ? investigatedItems.join('; ') : 'n/a'}`,
    '',
    '---',
    ''
  ].join('\n');

  return block;
}

/**
 * Append auto-generated session summary to session-state.md.
 */
async function appendSessionSummary(sessionName, stopReason) {
  try {
    const entries = await readSessionAuditEntries(sessionName);
    if (entries.length === 0) {
      console.error('[session-stop] No audit entries found for session — skipping summary');
      return;
    }

    const summary = buildSessionSummary(sessionName, entries, stopReason);

    // Read existing session-state.md to find insertion point (after the title block)
    let existing = '';
    try {
      existing = await fs.readFile(SESSION_STATE_FILE, 'utf8');
    } catch {
      existing = '# Session State\n\n';
    }

    // Append summary at the end
    await fs.writeFile(SESSION_STATE_FILE, existing.trimEnd() + '\n' + summary);
    console.error(`[session-stop] Session summary appended (${entries.length} audit entries)`);
  } catch (err) {
    console.error(`[session-stop] Summary generation failed: ${err.message}`);
  }
}

/**
 * Main handler logic
 */
async function handleHook(context) {
  try {
    // Run Obsidian knowledge sync first
    const syncCount = await runObsidianSync();

    // Get session info if available
    const stopReason = context?.reason || 'completed';

    // Generate and append session summary from audit log (template-based, no LLM cost)
    const sessionName = await getCurrentSessionName();
    await appendSessionSummary(sessionName, stopReason);

    let title = 'Claude Code Complete';
    let message = 'Session finished successfully';

    if (syncCount > 0) {
      message += ` (${syncCount} files synced to Obsidian)`;
    }

    // Customize message based on stop reason
    if (stopReason === 'error') {
      title = 'Claude Code Stopped';
      message = 'Session ended with an error';
    } else if (stopReason === 'user_cancelled') {
      title = 'Claude Code Cancelled';
      message = 'Session cancelled by user';
    }

    const sent = await sendNotification(title, message);

    if (sent) {
      console.error(`[session-stop] Notification sent: ${title}`);
    }

  } catch (err) {
    // Don't fail on notification errors
    console.error(`[session-stop] Notification error: ${err.message}`);
  }

  return {};
}

/**
 * Main function - reads from stdin, processes, outputs to stdout
 */
async function main() {
  // Read JSON from stdin
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  const input = Buffer.concat(chunks).toString('utf8');

  let context;
  try {
    context = JSON.parse(input);
  } catch (err) {
    // If we can't parse input, just return empty
    console.log(JSON.stringify({}));
    return;
  }

  const result = await handleHook(context);
  console.log(JSON.stringify(result));
}

main().catch(err => {
  console.error(`[session-stop] Fatal error: ${err.message}`);
  console.log(JSON.stringify({}));
});
