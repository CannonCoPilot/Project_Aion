#!/usr/bin/env node
/**
 * Terminal Title Hook
 *
 * Dynamically updates the terminal window/tab title based on Claude Code activity.
 * Uses ANSI OSC escape sequence: \033]0;TITLE\007
 *
 * Title format: Claude | Project:Subproject | activity
 *
 * Created: 2026-03-10
 */

const fs = require('fs');

// ============================================================================
// CONFIGURATION
// ============================================================================

const CODE_DIR = 'process.env.HOME/Code';
const CREATIVE_DIR = 'process.env.HOME/CreativeProjects';
const AIPROJECTS_DIR = 'process.cwd()';

// State file to persist last-known project context across tool calls
const STATE_FILE = '/tmp/claude-terminal-title-state.json';

// ============================================================================
// PROJECT NAME MAPPING (mirrors statusline)
// ============================================================================

// Friendly overrides — only for names that benefit from shortening.
// Everything else auto-derives: "grc-platform" → "Grc-Platform", etc.
const PROJECT_OVERRIDES = {
  'aifred-document-guard': 'DocGuard',
  'grc-platform': 'GRC',
  'cisoexpert-site': 'CISO-Expert',
  'cisoexpert-site-v1-backup': 'CISO-Backup',
  'time-scheduler': 'Bishop',
  'klyx-terminal': 'KLYX',
  'pai-observability': 'PAI',
  'voice-character-system': 'VoiceChar',
  'context-structure-research': 'CtxResearch',
  'outlook-intel': 'OutlookIntel',
  'claude-code-research': 'CC-Research',
  'beads-dashboard': 'BeadsDash',
  'homelab-mcp': 'HomelabMCP',
  'CreativeProjects': 'Creative',
  'AIfred-jarvis-compare': 'AIfred-vs-Jarvis',
  'llama-throughput-lab': 'LlamaThroughput',
  'ollama-throughput-lab': 'OllamaThroughput',
  'n8n-nodes-onetrust': 'n8n-OneTrust',
  'threat-intel-email': 'ThreatIntel',
  'earth2-colonization': 'Earth2',
  'feedback-service': 'Feedback',
  'feedback-widget': 'FeedbackWidget',
  'security-researcher': 'SecResearch',
  'daily-journal': 'Journal',
  'fabric-review': 'FabricReview',
  'checkov-review': 'Checkov',
  'claude-mem': 'ClaudeMem',
  'design-os': 'DesignOS',
};

// ============================================================================
// TOOL → ACTIVITY MAPPING
// ============================================================================

const TOOL_ACTIVITIES = {
  'Read': 'reading',
  'Edit': 'editing',
  'Write': 'writing',
  'Bash': 'running command',
  'Grep': 'searching',
  'Glob': 'finding files',
  'WebSearch': 'web search',
  'WebFetch': 'fetching web',
  'Agent': 'delegating',
  'Skill': 'running skill',
  'Task': 'managing tasks',
  'NotebookEdit': 'editing notebook',
};

// MCP tool patterns
const MCP_ACTIVITIES = {
  'mcp__filesystem__': 'filesystem op',
  'mcp__git__': 'git op',
  'mcp__n8n': 'n8n',
  'mcp__claude_ai': 'MCP query',
  'mcp__mcp-gateway': 'gateway',
};

// ============================================================================
// HELPERS
// ============================================================================

function mapProjectName(dirName) {
  // Check explicit overrides first
  if (PROJECT_OVERRIDES[dirName]) return PROJECT_OVERRIDES[dirName];

  // Auto-derive: capitalize each segment, keep short names as-is
  // "kali-scanner" → "KaliScanner", "codecloud" → "Codecloud", "AIfred" → "AIfred"
  if (dirName.includes('-')) {
    return dirName.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('');
  }

  // Single word — capitalize first letter, preserve rest (handles "AIfred", "loom", etc.)
  return dirName.charAt(0).toUpperCase() + dirName.slice(1);
}

/**
 * Extract project context from a file path
 */
function projectFromPath(filePath) {
  if (!filePath) return null;

  // ~/Code/<project>/...
  if (filePath.startsWith(CODE_DIR + '/')) {
    const rel = filePath.slice(CODE_DIR.length + 1);
    const subproject = rel.split('/')[0];
    return `AIProjects:${mapProjectName(subproject)}`;
  }

  // ~/CreativeProjects/...
  if (filePath.startsWith(CREATIVE_DIR + '/') || filePath.startsWith(CREATIVE_DIR)) {
    return 'Creative';
  }

  // ~/AIProjects/...
  if (filePath.startsWith(AIPROJECTS_DIR + '/') || filePath.startsWith(AIPROJECTS_DIR)) {
    // Check if it's a subpath that hints at a specific project
    const rel = filePath.slice(AIPROJECTS_DIR.length + 1);
    if (rel.startsWith('knowledge/projects/')) {
      const projectFile = rel.split('/').pop().replace('.md', '');
      return `AIProjects:${mapProjectName(projectFile)}`;
    }
    return 'AIProjects';
  }

  return null;
}

/**
 * Try to extract a file path from tool input
 */
function extractFilePath(toolName, toolInput) {
  if (!toolInput) return null;

  let input = toolInput;
  if (typeof input === 'string') {
    try { input = JSON.parse(input); } catch { return null; }
  }

  // Direct file_path parameter (Read, Edit, Write)
  if (input.file_path) return input.file_path;

  // Glob/Grep path parameter
  if (input.path) return input.path;

  // Bash command — try to extract paths
  if (toolName === 'Bash' && input.command) {
    const cmd = input.command;
    // Look for paths in common patterns
    const pathMatch = cmd.match(/(?:\/home\/[^/]+\/\S+)/);
    if (pathMatch) return pathMatch[0];

    // cd into a directory
    const cdMatch = cmd.match(/cd\s+["']?([^\s"']+)/);
    if (cdMatch) return cdMatch[1];
  }

  return null;
}

/**
 * Get activity description from tool name
 */
function getActivity(toolName) {
  // Direct match
  if (TOOL_ACTIVITIES[toolName]) return TOOL_ACTIVITIES[toolName];

  // MCP tool patterns
  for (const [prefix, activity] of Object.entries(MCP_ACTIVITIES)) {
    if (toolName.startsWith(prefix)) return activity;
  }

  return 'working';
}

/**
 * Load persisted state
 */
function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return { project: 'AIProjects', lastUpdate: 0 };
  }
}

/**
 * Save state
 */
function saveState(state) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state));
  } catch { /* ignore */ }
}

/**
 * Set terminal title via OSC escape sequence
 */
function setTitle(title) {
  // Write directly to /dev/tty to bypass any pipe/redirect
  try {
    const fd = fs.openSync('/dev/tty', 'w');
    fs.writeSync(fd, `\x1b]0;${title}\x07`);
    fs.closeSync(fd);
  } catch {
    // Fallback: stderr (some terminals pick this up)
    process.stderr.write(`\x1b]0;${title}\x07`);
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  // Read hook input from stdin
  let rawInput = '';
  try {
    rawInput = fs.readFileSync(0, 'utf8');
  } catch { /* no input */ }

  let hookData = {};
  try {
    hookData = JSON.parse(rawInput);
  } catch { /* ignore */ }

  const toolName = hookData.tool_name || process.env.CLAUDE_TOOL_NAME || '';
  const toolInput = hookData.tool_input || {};
  const mode = process.env.CLAUDE_TITLE_MODE || 'activity'; // 'activity' or 'reset'

  const state = loadState();

  if (mode === 'reset') {
    // Reset title on session end
    setTitle('Claude Code - ssh aiserver');
    saveState({ project: 'AIProjects', lastUpdate: Date.now() });
    process.stdout.write(JSON.stringify({ proceed: true }));
    return;
  }

  if (mode === 'init') {
    // Session start — set initial title
    setTitle('Claude | AIProjects | ready');
    saveState({ project: 'AIProjects', lastUpdate: Date.now() });
    process.stdout.write(JSON.stringify({ proceed: true }));
    return;
  }

  // Normal PreToolUse — update with activity
  const activity = getActivity(toolName);
  const filePath = extractFilePath(toolName, toolInput);
  const detectedProject = projectFromPath(filePath);

  // Update project in state if we detected one
  if (detectedProject) {
    state.project = detectedProject;
  }
  state.lastUpdate = Date.now();
  saveState(state);

  const project = state.project || 'AIProjects';
  const title = `Claude | ${project} | ${activity}`;
  setTitle(title);

  // Always allow tool to proceed
  process.stdout.write(JSON.stringify({ proceed: true }));
}

main().catch(() => {
  process.stdout.write(JSON.stringify({ proceed: true }));
});
