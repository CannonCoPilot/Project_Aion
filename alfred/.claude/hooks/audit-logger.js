#!/usr/bin/env node
/**
 * Audit Logger Hook
 *
 * Automatically logs all Claude Code tool executions to JSONL format.
 * Replaces manual audit logging calls - this runs guaranteed on every tool use.
 *
 * Log location: .claude/logs/audit.jsonl
 * Format: Ready for Promtail/Loki ingestion
 *
 * Created: 2025-12-06
 * Fixed: 2026-01-21 - Converted from module export to executable stdin/stdout hook
 */

const path = require('path');
const { readStdin, getSessionName, ensureDir, appendJsonl, LOG_DIR, runHook } = require('./lib/shared');

// Configuration
const LOG_FILE = path.join(LOG_DIR, 'audit.jsonl');

// Verbosity levels: 'minimal', 'standard', 'full'
const VERBOSITY = process.env.CLAUDE_AUDIT_VERBOSITY || 'standard';

/**
 * Estimate complexity based on tool and parameters
 */
function estimateComplexity(toolName, params) {
  // Higher complexity for multi-step or impactful operations
  const highComplexity = ['Write', 'NotebookEdit', 'Task'];
  const mediumComplexity = ['Edit', 'Bash', 'WebFetch', 'WebSearch'];

  let complexity = 1;

  if (highComplexity.includes(toolName)) {
    complexity = 3;
  } else if (mediumComplexity.includes(toolName)) {
    complexity = 2;
  }

  // Increase complexity for longer content
  if (params?.content && params.content.length > 1000) {
    complexity++;
  }
  if (params?.command && params.command.length > 200) {
    complexity++;
  }

  return Math.min(complexity, 5);
}

/**
 * Detect design patterns being applied based on tool usage
 * Maps tool calls to documented patterns in .claude/context/patterns/
 */
function detectPatterns(toolName, params) {
  const patterns = [];

  // Memory Storage Pattern - using Memory MCP to store findings
  if (toolName.includes('mcp__mcp-gateway__create_entities') ||
      toolName.includes('mcp__mcp-gateway__add_observations') ||
      toolName.includes('mcp__mcp-gateway__create_relations')) {
    patterns.push('memory-storage');
  }

  // Agent Selection Pattern - invoking Task tool (subagents)
  if (toolName === 'Task') {
    patterns.push('agent-selection');
    // More specific based on subagent type
    if (params?.subagent_type === 'Explore') {
      patterns.push('codebase-exploration');
    } else if (params?.subagent_type === 'Plan') {
      patterns.push('implementation-planning');
    }
  }

  // Capability Layering Pattern - executing scripts
  if (toolName === 'Bash') {
    const cmd = params?.command || '';
    if (cmd.includes('Scripts/') || cmd.includes('.claude/jobs/')) {
      patterns.push('capability-layering');
    }
    // Worktree Pattern - git worktree operations
    if (cmd.includes('git worktree')) {
      patterns.push('worktree-workflow');
    }
    // Autonomous Execution Pattern - scheduled jobs
    if (cmd.includes('claude-scheduled')) {
      patterns.push('autonomous-execution');
    }
  }

  // Skill Invocation Pattern
  if (toolName === 'Skill') {
    patterns.push('skill-invocation');
    // PARC Design Review
    if (params?.skill === 'design-review') {
      patterns.push('parc-design-review');
    }
    // Orchestration
    if (params?.skill?.startsWith('orchestration:')) {
      patterns.push('task-orchestration');
    }
  }

  // MCP Tool Usage - indicates MCP loading strategy in action
  if (toolName.startsWith('mcp__')) {
    patterns.push('mcp-integration');
    // Specific MCP servers
    if (toolName.includes('mcp__git__')) {
      patterns.push('git-mcp-usage');
    }
    if (toolName.includes('mcp__filesystem__')) {
      patterns.push('filesystem-mcp-usage');
    }
  }

  // Cross-Project Pattern - working outside AIProjects
  if (toolName === 'Read' || toolName === 'Write' || toolName === 'Edit') {
    const filePath = params?.file_path || '';
    if (filePath.includes('/Code/') && !filePath.includes('AIProjects')) {
      patterns.push('cross-project-work');
    }
  }

  // Web Research Pattern
  if (toolName === 'WebFetch' || toolName === 'WebSearch') {
    patterns.push('web-research');
  }

  return patterns;
}

/**
 * Strip <private>...</private> tagged content before logging.
 * Prevents sensitive config/credential content from persisting in audit.jsonl.
 */
function stripPrivateContent(text) {
  if (typeof text !== 'string') return text;
  return text.replace(/<private>[\s\S]*?<\/private>/gi, '[private content redacted]');
}

/**
 * Format parameters based on verbosity level
 */
function formatParameters(params, verbosity) {
  if (!params) return undefined;

  switch (verbosity) {
    case 'minimal':
      return undefined;
    case 'standard': {
      // Include parameter names but truncate long values
      const truncated = {};
      for (const [key, value] of Object.entries(params)) {
        let val = stripPrivateContent(value);
        if (typeof val === 'string' && val.length > 200) {
          truncated[key] = val.substring(0, 200) + '...[truncated]';
        } else {
          truncated[key] = val;
        }
      }
      return truncated;
    }
    case 'full': {
      const sanitized = {};
      for (const [key, value] of Object.entries(params)) {
        sanitized[key] = stripPrivateContent(value);
      }
      return sanitized;
    }
    default:
      return params;
  }
}

/**
 * Extract task and orchestration context from tool usage
 */
function extractTaskContext(toolName, params) {
  const context = {};

  if (!params) return context;

  // Bash commands containing bd (beads CLI)
  if (toolName === 'Bash') {
    const cmd = params.command || '';
    // Match: bd update AIProjects-xxx, bd close AIProjects-xxx, bd show AIProjects-xxx
    const bdMatch = cmd.match(/\bbd\s+(?:update|close|show|comment)\s+(\w+-\w+)/);
    if (bdMatch) context.task_id = bdMatch[1];
  }

  // Skill invocations
  if (toolName === 'Skill') {
    const skill = params.skill || '';
    if (skill.startsWith('orchestration:')) {
      context.orchestration_action = skill.replace('orchestration:', '');
    }
    if ((skill === 'pulse-ops' || skill === 'beads-ops') && params.args) {
      const idMatch = params.args.match(/(\w+-\w+)/);
      if (idMatch) context.task_id = idMatch[1];
    }
  }

  // MCP task tools
  if (toolName.startsWith('mcp__') && toolName.includes('task_')) {
    if (params.id) context.task_id = params.id;
    if (params.issue_id) context.task_id = params.issue_id;
  }

  // File paths referencing orchestration yamls
  const filePath = params.file_path || params.path || '';
  if (filePath.includes('.claude/orchestration/')) {
    const orchMatch = filePath.match(/orchestration\/([^/]+)\.yaml/);
    if (orchMatch) context.orchestration_id = orchMatch[1];
  }

  // Agent tool with task-related prompts
  if (toolName === 'Agent' || toolName === 'Task') {
    const prompt = params.prompt || '';
    const taskMatch = prompt.match(/\b(\w+-\w{3,4})\b/);
    if (taskMatch && taskMatch[1].includes('-')) context.task_id = taskMatch[1];
  }

  return context;
}

/**
 * Generate a structured observation from a tool execution using lightweight heuristics.
 * Output stored in observations-YYYY-MM-DD.jsonl for grepping and AI David context injection.
 * Schema: { type, title, facts, narrative, concepts, files_modified }
 */
function generateObservation(toolName, params, entry) {
  if (!params) return null;

  const filePath = params.file_path || params.path || '';
  const command = params.command || '';

  // Only produce observations for high-signal tool calls
  const writeOps = ['Write', 'Edit', 'NotebookEdit'];
  const webOps = ['WebFetch', 'WebSearch'];
  const agentOps = ['Task', 'Agent'];
  const bashOp = toolName === 'Bash';

  let type, title, facts, narrative, concepts, files_modified;

  if (writeOps.includes(toolName)) {
    type = 'code_change';
    const shortPath = filePath.replace(/.*\/AIProjects\//, '').replace(/.*\/Code\//, '');
    title = `${toolName} ${shortPath || 'file'}`;
    facts = [`Tool: ${toolName}`, `File: ${filePath}`];
    if (params.old_string) facts.push(`Changed: "${params.old_string.substring(0, 60).replace(/\n/g, '↵')}..."`);
    narrative = `${toolName} applied to ${shortPath || filePath}.`;
    concepts = ['file-modification'];
    files_modified = filePath ? [filePath] : [];
    if (entry.patterns) concepts.push(...entry.patterns);
  } else if (bashOp && command) {
    // Classify bash commands
    if (/\bbd\s+(update|close|create|show)/.test(command)) {
      type = 'decision';
      title = `Beads task operation: ${command.substring(0, 60)}`;
      facts = [`Command: ${command.substring(0, 120)}`];
      narrative = `Beads task management: ${command.substring(0, 80)}.`;
      concepts = ['task-management', 'beads'];
    } else if (/\bgit\b/.test(command)) {
      type = 'decision';
      title = `Git operation: ${command.substring(0, 60)}`;
      facts = [`Command: ${command.substring(0, 120)}`];
      narrative = `Git operation executed: ${command.substring(0, 80)}.`;
      concepts = ['git'];
    } else if (/\bdocker\b/.test(command)) {
      type = 'decision';
      title = `Docker operation: ${command.substring(0, 60)}`;
      facts = [`Command: ${command.substring(0, 120)}`];
      narrative = `Docker command executed: ${command.substring(0, 80)}.`;
      concepts = ['docker', 'infrastructure'];
    } else {
      type = 'investigation';
      title = `Bash: ${command.substring(0, 60)}`;
      facts = [`Command: ${command.substring(0, 120)}`];
      narrative = `Shell command executed: ${command.substring(0, 80)}.`;
      concepts = ['bash'];
    }
    files_modified = [];
  } else if (webOps.includes(toolName)) {
    type = 'investigation';
    const url = params.url || params.query || '';
    title = `${toolName}: ${url.substring(0, 80)}`;
    facts = [`Tool: ${toolName}`, `Target: ${url.substring(0, 120)}`];
    narrative = `Web ${toolName === 'WebSearch' ? 'search' : 'fetch'} for: ${url.substring(0, 80)}.`;
    concepts = ['web-research'];
    files_modified = [];
  } else if (agentOps.includes(toolName)) {
    type = 'decision';
    const subtype = params.subagent_type || params.name || 'agent';
    title = `Launched agent: ${subtype}`;
    facts = [`Agent type: ${subtype}`];
    if (params.description) facts.push(`Description: ${params.description.substring(0, 100)}`);
    narrative = `Spawned ${subtype} agent${params.description ? ': ' + params.description.substring(0, 60) : ''}.`;
    concepts = ['agent-selection'];
    files_modified = [];
  } else {
    return null; // No observation for low-signal tools
  }

  return {
    timestamp: entry.timestamp,
    session: entry.session,
    type,
    title,
    facts,
    narrative,
    concepts: [...new Set(concepts)],
    files_modified,
    tool: toolName,
    task_id: entry.task_id || undefined
  };
}

/**
 * Main hook handler - reads from stdin, logs, outputs to stdout
 */
async function main() {
  const context = await readStdin();
  if (!context.tool_name) {
    console.log(JSON.stringify({ proceed: true }));
    return;
  }

  const { tool_name, tool_input } = context;

  try {
    await ensureDir(LOG_DIR);
    const sessionName = await getSessionName();

    // Detect patterns being applied
    const detectedPatterns = detectPatterns(tool_name, tool_input);

    // Extract task/orchestration context
    const taskContext = extractTaskContext(tool_name, tool_input);

    const entry = {
      timestamp: new Date().toISOString(),
      session: sessionName,
      who: 'claude',
      type: 'tool_execution',
      tool: tool_name,
      parameters: formatParameters(tool_input, VERBOSITY),
      verbosity: VERBOSITY,
      // PAI-compatible fields
      hook_event_type: 'PreToolUse',
      source_app: 'AIProjects',
      agent_type: 'main',
      persona: process.env.CLAUDE_PERSONA || undefined,
      complexity: estimateComplexity(tool_name, tool_input),
      // Pattern detection
      patterns: detectedPatterns.length > 0 ? detectedPatterns : undefined,
      // Task/orchestration context
      task_id: taskContext.task_id || undefined,
      orchestration_id: taskContext.orchestration_id || undefined,
      orchestration_action: taskContext.orchestration_action || undefined
    };

    await appendJsonl(LOG_FILE, entry);

    // Write structured observation alongside raw audit log
    const observation = generateObservation(tool_name, tool_input, entry);
    if (observation) {
      const today = new Date().toISOString().substring(0, 10);
      const obsFile = path.join(LOG_DIR, `observations-${today}.jsonl`);
      await appendJsonl(obsFile, observation);
    }

  } catch (err) {
    // Don't block tool execution on logging failures
    // Log to stderr so it doesn't interfere with stdout protocol
    console.error(`[audit-logger] Failed to log: ${err.message}`);
  }

  // Always allow the tool to proceed - output JSON to stdout
  console.log(JSON.stringify({ proceed: true }));
}

runHook('audit-logger', main);
