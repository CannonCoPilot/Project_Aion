#!/usr/bin/env node
/**
 * Session Start Hook
 *
 * Automatically loads context when Claude Code starts a new session.
 * Injects session-state.md and current-priorities.md content so Claude
 * immediately knows what was being worked on.
 *
 * Also detects git worktree context for parallel development workflows.
 *
 * Created: 2026-01-03
 * Updated: 2026-01-06 (added cross-project commit summary)
 * Updated: 2026-01-20 (added TELOS goal alignment injection)
 * Updated: 2026-01-21 (added upgrade discovery reminder)
 * Updated: 2026-01-22 (converted to stdin/stdout pattern, added Promise.allSettled)
 * Updated: 2026-03-17 (added session delta — what changed since last session)
 * Source: hooks-mastery research project
 */

const fs = require('fs').promises;
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

// Context files to auto-load on session start
const CONTEXT_FILES = [
  { path: '.claude/context/session-state.md', maxChars: 2000, label: 'Session State' },
  { path: 'knowledge/projects/current-priorities.md', maxChars: 1500, label: 'Current Priorities' }
];

// TELOS goal alignment file
const TELOS_GOALS_FILE = '.claude/context/telos/goals/active-goals.yaml';

// Upgrade skill data file for discovery tracking
const UPGRADE_PENDING_FILE = '.claude/skills/upgrade/data/pending-upgrades.json';

// Issues file for automated health check findings
const ISSUES_FILE = '.claude/context/registries/detected-issues.yaml';

// Session snapshot for delta tracking
const SESSION_SNAPSHOT_FILE = '.claude/data/session-snapshot.json';

// Session state trimming config
const SESSION_STATE_FILE = '.claude/context/session-state.md';
const SESSION_STATE_MAX_BYTES = 8192; // 8KB threshold
const SESSION_ARCHIVE_DIR = 'knowledge/notes';

// Settings.local.json cleanup nudge
const SETTINGS_LOCAL_FILE = '.claude/settings.local.json';
const SETTINGS_LOCAL_MAX_BYTES = 10240; // 10KB threshold

// Project root (where .claude folder lives)
const PROJECT_ROOT = path.join(__dirname, '..', '..');

/**
 * Trim session-state.md if it exceeds the size threshold.
 * Keeps: header, current status, current session summary, 1 previous session, next steps, blockers.
 * Archives: all older session summaries to knowledge/notes/session-archive-YYYY-MM.md.
 */
async function trimSessionState() {
  try {
    const filePath = path.join(PROJECT_ROOT, SESSION_STATE_FILE);
    const stat = await fs.stat(filePath);

    if (stat.size <= SESSION_STATE_MAX_BYTES) {
      return; // File is small enough, skip
    }

    const content = await fs.readFile(filePath, 'utf8');
    const lines = content.split('\n');

    // Find the second occurrence of "**Previous Session Summary**"
    // Everything before it is kept; everything from it onward is archived.
    let previousCount = 0;
    let cutIndex = -1;

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('**Previous Session Summary**')) {
        previousCount++;
        if (previousCount === 2) {
          cutIndex = i;
          break;
        }
      }
    }

    if (cutIndex === -1) {
      // Can't find structure to trim — leave as-is
      console.error('[session-start] trimSessionState: could not find trim boundary, skipping');
      return;
    }

    const keepLines = lines.slice(0, cutIndex);
    const archiveLines = lines.slice(cutIndex);

    // Only archive if there's actually content to archive
    if (archiveLines.join('').trim().length === 0) {
      return;
    }

    // Build archive file path: session-archive-YYYY-MM.md
    const now = new Date();
    const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const archivePath = path.join(PROJECT_ROOT, SESSION_ARCHIVE_DIR, `session-archive-${yearMonth}.md`);

    // Append to archive (create if needed)
    const archiveHeader = `\n\n---\n\n## Archived ${now.toISOString().split('T')[0]}\n\n`;
    await fs.appendFile(archivePath, archiveHeader + archiveLines.join('\n'), 'utf8');

    // Rewrite session-state.md with kept content
    await fs.writeFile(filePath, keepLines.join('\n') + '\n', 'utf8');

    const archivedBytes = Buffer.byteLength(archiveLines.join('\n'), 'utf8');
    console.error(`[session-start] Trimmed session-state.md: archived ${archiveLines.length} lines (${(archivedBytes / 1024).toFixed(1)}KB) to ${path.basename(archivePath)}`);
  } catch (err) {
    // Non-fatal — if trimming fails, session continues normally
    console.error(`[session-start] trimSessionState error: ${err.message}`);
  }
}

/**
 * Read a file safely, returning null if not found
 */
async function readFileSafe(filePath, maxChars) {
  try {
    const fullPath = path.join(PROJECT_ROOT, filePath);
    const content = await fs.readFile(fullPath, 'utf8');

    // Truncate if too long
    if (content.length > maxChars) {
      return content.substring(0, maxChars) + '\n\n...[truncated for context]';
    }
    return content;
  } catch {
    return null;
  }
}

/**
 * Get current git branch
 */
async function getGitBranch() {
  try {
    const { stdout } = await execFileAsync('git', ['branch', '--show-current'], {
      cwd: PROJECT_ROOT,
      timeout: 5000
    });
    return stdout.trim();
  } catch {
    return null;
  }
}

/**
 * Get count of uncommitted changes
 */
async function getGitChanges() {
  try {
    const { stdout } = await execFileAsync('git', ['status', '--porcelain'], {
      cwd: PROJECT_ROOT,
      timeout: 5000
    });
    const lines = stdout.trim().split('\n').filter(l => l.length > 0);
    return lines.length;
  } catch {
    return 0;
  }
}

/**
 * Read detected service issues from health checks
 * Returns formatted issue summary or null if no issues
 */
async function getDetectedIssues() {
  try {
    const fullPath = path.join(PROJECT_ROOT, ISSUES_FILE);
    const content = await fs.readFile(fullPath, 'utf8');

    // Simple YAML parsing for the issues we need
    // Look for "issues:" section and parse entries
    const issuesMatch = content.match(/^issues:\s*\n([\s\S]*?)(?=\nresolved_issues:|$)/m);
    if (!issuesMatch) return null;

    const issuesSection = issuesMatch[1];
    if (!issuesSection.trim() || issuesSection.includes('[]')) return null;

    // Parse individual issues - look for severity and summary
    const issues = [];
    const issueBlocks = issuesSection.split(/\n  - id:/);

    for (const block of issueBlocks) {
      if (!block.trim()) continue;

      const severityMatch = block.match(/severity:\s*(\w+)/);
      const summaryMatch = block.match(/summary:\s*"([^"]+)"/);
      const serviceMatch = block.match(/service_name:\s*"([^"]+)"/);
      const statusMatch = block.match(/status:\s*(\w+)/);
      const priorityMatch = block.match(/claude_priority:\s*"([^"]+)"/);

      if (severityMatch && summaryMatch && statusMatch?.at(1) === 'open') {
        issues.push({
          severity: severityMatch[1],
          summary: summaryMatch[1],
          service: serviceMatch ? serviceMatch[1] : 'Unknown',
          priority: priorityMatch ? priorityMatch[1] : `[${severityMatch[1].toUpperCase()}]`
        });
      }
    }

    if (issues.length === 0) return null;

    // Sort by severity: critical > high > medium > low
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    issues.sort((a, b) => (severityOrder[a.severity] ?? 4) - (severityOrder[b.severity] ?? 4));

    // Format output
    const critical = issues.filter(i => i.severity === 'critical').length;
    const high = issues.filter(i => i.severity === 'high').length;
    const medium = issues.filter(i => i.severity === 'medium').length;

    let summary = `\n🚨 **Service Issues Detected** (${issues.length} open)`;
    if (critical > 0) summary += ` - ${critical} CRITICAL`;
    if (high > 0) summary += ` - ${high} HIGH`;
    if (medium > 0) summary += ` - ${medium} MEDIUM`;

    summary += '\n';
    for (const issue of issues.slice(0, 5)) { // Show top 5
      const emoji = issue.severity === 'critical' ? '🔴' :
                   issue.severity === 'high' ? '🟠' :
                   issue.severity === 'medium' ? '🟡' : '🔵';
      summary += `  ${emoji} ${issue.service}: ${issue.summary}\n`;
    }

    if (issues.length > 5) {
      summary += `  ... and ${issues.length - 5} more\n`;
    }

    summary += '\n  Run `/check-services` or see `.claude/context/registries/detected-issues.yaml`';

    return summary;
  } catch {
    return null;
  }
}

/**
 * Get last session's cross-project commit summary
 * Returns a summary string or null if no commits found
 */
async function getLastSessionCommits() {
  try {
    const trackingFile = path.join(PROJECT_ROOT, '.claude/logs/cross-project-commits.json');
    const content = await fs.readFile(trackingFile, 'utf8');
    const data = JSON.parse(content);

    if (!data.sessions || Object.keys(data.sessions).length === 0) {
      return null;
    }

    // Get the most recent session
    const sessionKeys = Object.keys(data.sessions).sort().reverse();
    const lastSession = data.sessions[sessionKeys[0]];

    if (!lastSession.projects || Object.keys(lastSession.projects).length === 0) {
      return null;
    }

    // Build summary
    const projects = Object.entries(lastSession.projects);
    const totalCommits = projects.reduce((sum, [_, p]) => sum + (p.commits?.length || 0), 0);

    if (totalCommits === 0) {
      return null;
    }

    // Format: "Last session: 5 commits across 3 projects (AIProjects: 2, grc-platform: 3)"
    const projectSummary = projects
      .map(([name, p]) => `${name}: ${p.commits?.length || 0}`)
      .join(', ');

    const sessionName = lastSession.sessionName || 'Unknown';
    const sessionDate = lastSession.date || sessionKeys[0].split('_')[0];

    return `📊 Last session "${sessionName}" (${sessionDate}): ${totalCommits} commits across ${projects.length} projects (${projectSummary})`;
  } catch {
    return null;
  }
}

/**
 * Get TELOS goal alignment summary
 * Returns formatted summary for session injection or null if not configured
 */
async function getTelosSummary() {
  try {
    const fullPath = path.join(PROJECT_ROOT, TELOS_GOALS_FILE);
    const content = await fs.readFile(fullPath, 'utf8');

    // Simple YAML parsing for injection_summary section
    const missionMatch = content.match(/^\s*mission:\s*"?([^"\n]+)"?/m);
    const focusMatch = content.match(/^\s*focus_theme:\s*"?([^"\n]+)"?/m);

    // Extract top_goals array
    const goalsSection = content.match(/top_goals:\s*\n([\s\S]*?)(?=\n\w|\n$|$)/);
    const goals = [];

    if (goalsSection) {
      const goalLines = goalsSection[1].match(/^\s*-\s*"?([^"\n]+)"?/gm);
      if (goalLines) {
        for (const line of goalLines.slice(0, 3)) { // Max 3 goals
          const goalText = line.replace(/^\s*-\s*"?/, '').replace(/"?\s*$/, '');
          goals.push(goalText);
        }
      }
    }

    if (!missionMatch && goals.length === 0) {
      return null;
    }

    // Build compact TELOS injection
    const parts = ['', '=== TELOS Context ==='];

    if (missionMatch) {
      parts.push(`Mission: ${missionMatch[1]}`);
    }

    if (focusMatch) {
      parts.push(`Focus: ${focusMatch[1]}`);
    }

    if (goals.length > 0) {
      parts.push('Active Goals:');
      for (const goal of goals) {
        parts.push(`  - ${goal}`);
      }
    }

    parts.push('====================');

    return parts.join('\n');
  } catch {
    return null;
  }
}

/**
 * Get upgrade discovery reminder
 * Returns a reminder if last discovery was > 7 days ago (or never)
 */
async function getUpgradeReminder() {
  try {
    const fullPath = path.join(PROJECT_ROOT, UPGRADE_PENDING_FILE);
    const content = await fs.readFile(fullPath, 'utf8');
    const data = JSON.parse(content);

    const lastDiscovery = data.last_discovery;

    // If never run, remind
    if (!lastDiscovery) {
      return '🔄 **Upgrade Check**: Never run. Consider `/upgrade discover` to find updates.';
    }

    // Check if more than 7 days ago
    const lastDate = new Date(lastDiscovery);
    const now = new Date();
    const daysSince = Math.floor((now - lastDate) / (1000 * 60 * 60 * 24));

    if (daysSince >= 7) {
      return `🔄 **Upgrade Check**: Last run ${daysSince} days ago. Consider \`/upgrade discover\` for updates.`;
    }

    // Check for pending upgrades
    const pending = data.upgrades?.filter(u => u.status === 'pending_review') || [];
    if (pending.length > 0) {
      return `📦 **Pending Upgrades**: ${pending.length} discovered. Run \`/upgrade status\` to review.`;
    }

    return null;
  } catch {
    // File doesn't exist or parse error - skill not set up yet
    return null;
  }
}

/**
 * Get worktree information
 * Returns null if not in a git repo, or worktree details if applicable
 */
async function getWorktreeInfo() {
  try {
    // Get git common dir (shared .git for worktrees)
    const { stdout: commonDir } = await execFileAsync('git', ['rev-parse', '--git-common-dir'], {
      cwd: PROJECT_ROOT,
      timeout: 5000
    });

    const commonDirPath = commonDir.trim();
    const isWorktree = !commonDirPath.endsWith('.git');

    if (!isWorktree) {
      return null; // Not a worktree, normal repo
    }

    // Get main repo path
    const mainRepo = path.dirname(commonDirPath);

    // List all worktrees
    const { stdout: worktreeList } = await execFileAsync('git', ['worktree', 'list', '--porcelain'], {
      cwd: PROJECT_ROOT,
      timeout: 5000
    });

    const worktrees = [];
    let current = {};

    for (const line of worktreeList.split('\n')) {
      if (line.startsWith('worktree ')) {
        if (current.path) worktrees.push(current);
        current = { path: line.substring(9) };
      } else if (line.startsWith('branch ')) {
        current.branch = line.substring(7).replace('refs/heads/', '');
      }
    }
    if (current.path) worktrees.push(current);

    // Get other worktrees (not current)
    const currentPath = PROJECT_ROOT;
    const otherWorktrees = worktrees
      .filter(wt => !currentPath.startsWith(wt.path) || wt.path.length > currentPath.length)
      .map(wt => wt.branch)
      .filter(Boolean);

    return {
      isWorktree: true,
      mainRepo,
      otherBranches: otherWorktrees,
      totalWorktrees: worktrees.length
    };
  } catch {
    return null;
  }
}

/**
 * Check if settings.local.json has grown too large and create a Beads task if so.
 * This prevents one-off permission grants from accumulating indefinitely.
 */
async function checkSettingsLocalSize() {
  try {
    const filePath = path.join(PROJECT_ROOT, SETTINGS_LOCAL_FILE);
    const stat = await fs.stat(filePath);

    if (stat.size <= SETTINGS_LOCAL_MAX_BYTES) {
      return null; // Under threshold
    }

    const content = await fs.readFile(filePath, 'utf8');
    const data = JSON.parse(content);
    const entryCount = data.permissions?.allow?.length || 0;
    const sizeKB = (stat.size / 1024).toFixed(1);

    // Check if a cleanup task already exists (avoid duplicates)
    try {
      const { stdout } = await execFileAsync('bd', ['list', '--status', 'open', '--label', 'action:settings-cleanup'], {
        cwd: PROJECT_ROOT,
        timeout: 5000
      });
      if (stdout.includes('settings')) {
        return null; // Task already exists
      }
    } catch {
      // bd not available or query failed — continue to create task
    }

    // Create Beads task
    try {
      await execFileAsync('bd', [
        'create',
        `Clean settings.local.json (${sizeKB}KB, ${entryCount} entries)`,
        '-t', 'task', '-p', '3',
        '-l', 'domain:infrastructure,project:aiprojects,source:session,action:settings-cleanup,agent:claude',
        '-d', `settings.local.json has grown to ${sizeKB}KB with ${entryCount} permission entries. Review and remove one-off commands, keeping only reusable wildcard patterns.`
      ], { cwd: PROJECT_ROOT, timeout: 5000 });
      console.error(`[session-start] Created Beads task: settings.local.json cleanup (${sizeKB}KB, ${entryCount} entries)`);
    } catch (err) {
      console.error(`[session-start] Failed to create cleanup task: ${err.message}`);
    }

    return `⚠️ **settings.local.json**: ${sizeKB}KB with ${entryCount} permission entries. Consider cleaning one-off commands.`;
  } catch {
    return null;
  }
}

/**
 * Get count of tasks with needs-input label (blocked waiting for human response)
 */
async function getNeedsInputCount() {
  try {
    const { stdout } = await execFileAsync('bd', ['list', '--status', 'open', '--label', 'needs-input', '--json'], {
      cwd: PROJECT_ROOT,
      timeout: 5000
    });
    const tasks = JSON.parse(stdout.trim() || '[]');
    if (tasks.length === 0) return null;
    return `\u2753 **Needs Input**: ${tasks.length} task${tasks.length > 1 ? 's' : ''} blocked waiting for your response`;
  } catch {
    return null;
  }
}

/**
 * Security hook health check (T3.5 / AIProjects-8dnh).
 *
 * Smoke-tests each security enforcement hook with a known-good benign input
 * to verify the hook is still working. Surfaces any regression in the
 * SessionStart banner so a broken security hook is visible immediately
 * instead of silently fail-opening on every tool call.
 *
 * Hooks tested:
 *   1. credential-guard.js — benign Write to a non-credential file should proceed
 *   2. document-guard.js   — benign Edit to a non-protected file should proceed
 *   3. secret-scrub.py     — benign text should pass through unchanged (0 redactions)
 *
 * Returns:
 *   null  — all hooks healthy (no banner emitted)
 *   string — banner describing failures (one line per failed hook)
 */
async function getSecurityHealthCheck() {
  // Use execFileSync because execFile (async) doesn't support `input` option.
  // Session-start runs once, three 5s-max sequential calls = 15s worst case.
  const { execFileSync } = require('child_process');
  const failures = [];

  // --- Test 1: credential-guard.js with benign Write ---
  try {
    const benignInput = JSON.stringify({
      tool_name: 'Write',
      tool_input: { file_path: '/tmp/session-start-healthcheck-benign.txt', content: 'hello world' }
    });
    const stdout = execFileSync(
      'node',
      [path.join(PROJECT_ROOT, '.claude/hooks/credential-guard.js')],
      { input: benignInput, timeout: 5000, encoding: 'utf8' }
    );
    const response = JSON.parse(stdout.trim() || '{}');
    if (response.proceed !== true) {
      failures.push(`credential-guard rejected benign input (got: ${JSON.stringify(response).slice(0, 80)})`);
    }
  } catch (err) {
    failures.push(`credential-guard threw: ${(err.message || String(err)).slice(0, 100)}`);
  }

  // --- Test 2: document-guard.js with benign Edit to a non-protected path ---
  try {
    const benignInput = JSON.stringify({
      tool_name: 'Edit',
      tool_input: {
        file_path: '/tmp/session-start-healthcheck-benign.txt',
        old_string: 'foo',
        new_string: 'bar'
      }
    });
    const stdout = execFileSync(
      'node',
      [path.join(PROJECT_ROOT, '.claude/hooks/document-guard.js')],
      {
        input: benignInput,
        timeout: 5000,
        encoding: 'utf8',
        env: { ...process.env, CLAUDE_PROJECT_DIR: PROJECT_ROOT }
      }
    );
    const response = JSON.parse(stdout.trim() || '{}');
    if (response.proceed !== true) {
      failures.push(`document-guard rejected benign input (got: ${JSON.stringify(response).slice(0, 80)})`);
    }
  } catch (err) {
    failures.push(`document-guard threw: ${(err.message || String(err)).slice(0, 100)}`);
  }

  // --- Test 3: secret-scrub.py — benign text should pass through unchanged ---
  try {
    const benignText = 'This is a benign session-start health check, no secrets here.';
    const stdout = execFileSync(
      'python3',
      [path.join(PROJECT_ROOT, '.claude/jobs/lib/secret-scrub.py'), '--source', 'session-start-healthcheck', '--quiet'],
      { input: benignText, timeout: 5000, encoding: 'utf8' }
    );
    if (stdout !== benignText) {
      failures.push(`secret-scrub modified benign text (output length: ${stdout.length}, expected: ${benignText.length})`);
    }
  } catch (err) {
    failures.push(`secret-scrub threw: ${(err.message || String(err)).slice(0, 100)}`);
  }

  if (failures.length === 0) {
    return null;
  }

  const lines = failures.map(f => `  - ${f}`).join('\n');
  return `🚨 **SECURITY HOOK HEALTH CHECK FAILED** (${failures.length} issue${failures.length > 1 ? 's' : ''}):\n${lines}\nA broken security hook fails OPEN — every subsequent tool call will skip the check it represents. Investigate before continuing.`;
}

/**
 * Collect "what changed since last session" delta
 * Reads session-snapshot.json (written at session end) and compares against current state
 * Returns formatted delta string or null
 */
async function collectSessionDelta() {
  try {
    const snapshotPath = path.join(PROJECT_ROOT, SESSION_SNAPSHOT_FILE);
    const content = await fs.readFile(snapshotPath, 'utf8');
    const snapshot = JSON.parse(content);

    // No prior snapshot — first run
    if (!snapshot.timestamp || !snapshot.session_id) {
      return null;
    }

    const snapshotTime = new Date(snapshot.timestamp);
    const now = new Date();
    const hoursAgo = Math.round((now - snapshotTime) / (1000 * 60 * 60));
    const timeLabel = hoursAgo < 1 ? 'just now' :
                      hoursAgo < 24 ? `${hoursAgo}h ago` :
                      `${Math.round(hoursAgo / 24)}d ago`;

    const parts = [];
    parts.push(`Since session ${snapshot.session_id} (${timeLabel}):`);

    // 1. Git commits since last session
    if (snapshot.last_commit_sha) {
      try {
        const { stdout } = await execFileAsync('git', [
          'log', '--oneline', `${snapshot.last_commit_sha}..HEAD`
        ], { cwd: PROJECT_ROOT, timeout: 5000 });

        const commits = stdout.trim().split('\n').filter(l => l.length > 0);
        if (commits.length > 0) {
          parts.push(`  Commits: ${commits.length} new in AIProjects`);
        } else {
          parts.push(`  Commits: none`);
        }
      } catch {
        // SHA might not exist (force push, etc.) — fall back to timestamp
        try {
          const sinceISO = snapshotTime.toISOString();
          const { stdout } = await execFileAsync('git', [
            'log', '--oneline', `--since=${sinceISO}`
          ], { cwd: PROJECT_ROOT, timeout: 5000 });

          const commits = stdout.trim().split('\n').filter(l => l.length > 0);
          parts.push(`  Commits: ${commits.length} new in AIProjects`);
        } catch {
          parts.push(`  Commits: unknown (git error)`);
        }
      }

      // Cross-project commits from tracking file
      try {
        const trackingFile = path.join(PROJECT_ROOT, '.claude/logs/cross-project-commits.json');
        const trackingContent = await fs.readFile(trackingFile, 'utf8');
        const trackingData = JSON.parse(trackingContent);

        if (trackingData.sessions) {
          // Count commits in sessions after snapshot timestamp
          let crossProjectCount = 0;
          const projectSet = new Set();

          for (const [, session] of Object.entries(trackingData.sessions)) {
            const sessionStart = new Date(session.startedAt);
            if (sessionStart > snapshotTime && session.projects) {
              for (const [projName, proj] of Object.entries(session.projects)) {
                const count = proj.commits?.length || 0;
                if (count > 0) {
                  crossProjectCount += count;
                  projectSet.add(projName);
                }
              }
            }
          }

          if (crossProjectCount > 0 && projectSet.size > 1) {
            parts[parts.length - 1] = `  Commits: ${crossProjectCount} across ${projectSet.size} projects (${[...projectSet].join(', ')})`;
          }
        }
      } catch {
        // Cross-project tracking unavailable — keep single-project count
      }
    }

    // 2. Task status changes
    if (snapshot.task_counts && Object.keys(snapshot.task_counts).length > 0) {
      try {
        const { stdout: openJson } = await execFileAsync('bd', [
          'list', '--status', 'open', '--json'
        ], { cwd: PROJECT_ROOT, timeout: 5000 });
        const openTasks = JSON.parse(openJson.trim() || '[]');

        const { stdout: ipJson } = await execFileAsync('bd', [
          'list', '--status', 'in_progress', '--json'
        ], { cwd: PROJECT_ROOT, timeout: 5000 });
        const ipTasks = JSON.parse(ipJson.trim() || '[]');

        const currentOpen = openTasks.length;
        const currentIP = ipTasks.length;
        const prevOpen = snapshot.task_counts.open || 0;
        const prevIP = snapshot.task_counts.in_progress || 0;

        const openDelta = currentOpen - prevOpen;
        const taskParts = [];

        if (openDelta < 0) taskParts.push(`${Math.abs(openDelta)} closed`);
        if (openDelta > 0) taskParts.push(`${openDelta} new`);
        if (currentIP !== prevIP) taskParts.push(`${currentIP} in-progress (was ${prevIP})`);

        if (taskParts.length > 0) {
          parts.push(`  Tasks: ${taskParts.join(', ')}`);
        } else {
          parts.push(`  Tasks: no changes`);
        }
      } catch {
        parts.push(`  Tasks: unknown (bd error)`);
      }
    }

    // 3. Infrastructure issue changes
    if (snapshot.issues) {
      try {
        const issuesPath = path.join(PROJECT_ROOT, ISSUES_FILE);
        const issuesContent = await fs.readFile(issuesPath, 'utf8');

        // Extract current open issue IDs
        const currentIssues = [];

        // Simple extraction — pair IDs with their status
        const idArray = [...issuesContent.matchAll(/id:\s*"?([^"\s\n]+)"?/g)].map(m => m[1]);
        const statusArray = [...issuesContent.matchAll(/status:\s*(\w+)/g)].map(m => m[1]);

        for (let i = 0; i < idArray.length && i < statusArray.length; i++) {
          if (statusArray[i] === 'open') {
            currentIssues.push(idArray[i]);
          }
        }

        const prevIssues = new Set(snapshot.issues || []);
        const currIssues = new Set(currentIssues);

        const resolved = [...prevIssues].filter(i => !currIssues.has(i));
        const newIssues = [...currIssues].filter(i => !prevIssues.has(i));

        if (resolved.length > 0 || newIssues.length > 0) {
          const issueParts = [];
          if (resolved.length > 0) issueParts.push(`${resolved.length} resolved`);
          if (newIssues.length > 0) issueParts.push(`${newIssues.length} new`);
          parts.push(`  Infra: ${issueParts.join(', ')}`);
        }
      } catch {
        // Issues file unavailable — skip
      }
    }

    if (parts.length <= 1) {
      return null; // Only header, no actual delta data
    }

    return '\n--- What Changed ---\n' + parts.join('\n');
  } catch {
    // No snapshot or parse error — skip delta
    return null;
  }
}

/**
 * Main handler logic - uses Promise.allSettled for error isolation
 */
async function handleHook(context) {
  // Trim session-state.md before loading (keeps file small across sessions)
  await trimSessionState();

  const contextParts = [];

  // Load all data sources in parallel with error isolation
  // Each source failing won't affect others
  const results = await Promise.allSettled([
    getGitBranch(),
    getGitChanges(),
    getWorktreeInfo(),
    getLastSessionCommits(),
    getDetectedIssues(),
    getTelosSummary(),
    getUpgradeReminder(),
    checkSettingsLocalSize(),
    getNeedsInputCount(),
    collectSessionDelta(),
    getSecurityHealthCheck()
  ]);

  // Extract values (null for rejected promises)
  const [
    branchResult,
    changesResult,
    worktreeResult,
    lastCommitsResult,
    detectedIssuesResult,
    telosSummaryResult,
    upgradeReminderResult,
    settingsCleanupResult,
    needsInputResult,
    sessionDeltaResult,
    securityHealthResult
  ] = results;

  const branch = branchResult.status === 'fulfilled' ? branchResult.value : null;
  const changes = changesResult.status === 'fulfilled' ? changesResult.value : 0;
  const worktreeInfo = worktreeResult.status === 'fulfilled' ? worktreeResult.value : null;
  const lastCommits = lastCommitsResult.status === 'fulfilled' ? lastCommitsResult.value : null;
  const detectedIssues = detectedIssuesResult.status === 'fulfilled' ? detectedIssuesResult.value : null;
  const telosSummary = telosSummaryResult.status === 'fulfilled' ? telosSummaryResult.value : null;
  const upgradeReminder = upgradeReminderResult.status === 'fulfilled' ? upgradeReminderResult.value : null;
  const settingsCleanup = settingsCleanupResult.status === 'fulfilled' ? settingsCleanupResult.value : null;
  const needsInput = needsInputResult.status === 'fulfilled' ? needsInputResult.value : null;
  const sessionDelta = sessionDeltaResult.status === 'fulfilled' ? sessionDeltaResult.value : null;
  const securityHealth = securityHealthResult.status === 'fulfilled' ? securityHealthResult.value : null;

  // Log any failures for debugging (to stderr, not visible to user)
  const failures = results.filter(r => r.status === 'rejected');
  if (failures.length > 0) {
    console.error(`[session-start] ${failures.length} data sources failed (continuing with available data)`);
  }

  // Build branch/worktree status line
  if (branch) {
    const changeText = changes > 0 ? `, ${changes} uncommitted changes` : '';

    if (worktreeInfo && worktreeInfo.isWorktree) {
      // In a worktree - show enhanced context
      const otherBranches = worktreeInfo.otherBranches.length > 0
        ? ` (other worktrees: ${worktreeInfo.otherBranches.join(', ')})`
        : '';
      contextParts.push(`🌲 Worktree: ${branch}${changeText}${otherBranches}`);
    } else {
      // Normal repo
      contextParts.push(`📍 Branch: ${branch}${changeText}`);
    }
  }

  // Add last session commit summary if available
  if (lastCommits) {
    contextParts.push(lastCommits);
  }

  // Add session delta (what changed since last session)
  if (sessionDelta) {
    contextParts.push(sessionDelta);
  }

  // Add detected service issues if any (from health checks)
  if (detectedIssues) {
    contextParts.push(detectedIssues);
  }

  // Add security hook health check at top — broken security hooks are
  // fail-open landmines and should be visible immediately at session start
  if (securityHealth) {
    contextParts.push(securityHealth);
  }

  // Add TELOS goal alignment context
  if (telosSummary) {
    contextParts.push(telosSummary);
  }

  // Add upgrade discovery reminder if needed
  if (upgradeReminder) {
    contextParts.push(upgradeReminder);
  }

  // Add needs-input task count if any
  if (needsInput) {
    contextParts.push(needsInput);
  }

  // Add settings.local.json cleanup nudge if needed
  if (settingsCleanup) {
    contextParts.push(settingsCleanup);
  }

  // Load context files (these are critical, so handle individually)
  for (const file of CONTEXT_FILES) {
    try {
      const content = await readFileSafe(file.path, file.maxChars);
      if (content) {
        contextParts.push(`\n--- ${file.label} ---\n${content}`);
      }
    } catch (err) {
      console.error(`[session-start] Failed to load ${file.label}: ${err.message}`);
    }
  }

  // Add session start marker
  contextParts.push('\n--- Session Started ---');
  contextParts.push(`Time: ${new Date().toLocaleString()}`);

  // Return context to inject into session
  if (contextParts.length > 0) {
    return {
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: contextParts.join('\n')
      }
    };
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

  let context = {};
  try {
    if (input.trim()) {
      context = JSON.parse(input);
    }
  } catch (err) {
    // If we can't parse input, continue with empty context
    console.error(`[session-start] Warning: Could not parse input JSON`);
  }

  const result = await handleHook(context);
  console.log(JSON.stringify(result));
}

main().catch(err => {
  console.error(`[session-start] Fatal error: ${err.message}`);
  console.log(JSON.stringify({}));
});
