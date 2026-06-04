#!/usr/bin/env node
/**
 * Persona Guard Hook
 *
 * PreToolUse hook that enforces per-persona command restrictions.
 * Reads CLAUDE_PERSONA env var and applies block patterns from policies.
 *
 * Three enforcement layers:
 *   1. DEFAULT_POLICY — applies to ALL headless personas (destructive + exfiltration blocks)
 *   2. Per-persona POLICIES — override or extend the default for specific personas
 *   3. MCP tool blocking — blocks dangerous MCP tools for personas without explicit MCP access
 *
 * Policy config documented in: .claude/hooks/lib/persona-policies.yaml
 * (Policies are embedded here as JS objects for runtime performance)
 *
 * Created: 2026-03-12
 * Updated: 2026-04-01 — Added DEFAULT_POLICY and MCP tool coverage (AIProjects-88ff)
 * Task: AIProjects-bzj9, AIProjects-88ff
 */

const { readStdin, block, proceed, runHook, appendJsonl, LOG_DIR } = require('./lib/shared');
const path = require('path');

const GUARD_LOG = path.join(LOG_DIR, 'persona-guard.jsonl');

// ============================================================================
// Audit Logging
// ============================================================================

/**
 * Log a block event to persona-guard.jsonl for pipeline visibility.
 * Non-blocking — failures are swallowed so the hook never breaks.
 */
function logBlock(persona, layer, tool, command, matchedPattern, message) {
  const entry = {
    timestamp: new Date().toISOString(),
    event: 'command_blocked',
    persona,
    layer,          // 'default' | per-persona name
    tool,
    command: (command || '').substring(0, 500),
    matched_pattern: matchedPattern,
    message,
  };
  appendJsonl(GUARD_LOG, entry).catch(() => {});
}

// ============================================================================
// Default Policy — applies to ALL headless personas unless exempt
// ============================================================================
// DESIGN PRINCIPLE: Only block truly catastrophic operations and data
// exfiltration. Normal automation (rm -rf ./temp-dir, git push, docker rm,
// docker volume rm) is legitimate and governed by safety.yaml deny-lists
// and routing-rules.yaml risk gates at the task level.
// ============================================================================

const DEFAULT_POLICY = {
  description: 'Global defaults — blocks catastrophic commands and data exfiltration',
  tools: {
    Bash: {
      blockPatterns: [
        // ── Catastrophic system destruction ──
        // These have no legitimate automation use case
        { pattern: /rm\s+-rf\s+\/\s/,              label: 'rm -rf / (root wipe)' },
        { pattern: /rm\s+-rf\s+\/$/,               label: 'rm -rf / (root wipe, trailing)' },
        { pattern: /rm\s+-rf\s+~\s/,               label: 'rm -rf ~ (home wipe)' },
        { pattern: /rm\s+-rf\s+~$/,                label: 'rm -rf ~ (home wipe, trailing)' },
        { pattern: /rm\s+-rf\s+~\//,               label: 'rm -rf ~/ (home subdir wipe)' },
        { pattern: /rm\s+-rf\s+\.\s*$/,            label: 'rm -rf . (cwd wipe)' },
        { pattern: /rm\s+-rf\s+\*\s*$/,            label: 'rm -rf * (cwd contents wipe)' },
        { pattern: /\bdd\s+.*of=\/dev\/[sh]d/,     label: 'dd to raw disk device' },
        { pattern: /\bmkfs\b/,                     label: 'format filesystem' },
        { pattern: />\s*\/dev\/[sh]d[a-z]/,        label: 'redirect to raw disk' },
        { pattern: /\bchmod\s+-R\s+777\s+\//,      label: 'recursive chmod 777 on root' },

        // ── Remote code execution (pipe-to-shell) ──
        // Fetching remote code and piping to interpreter is never legitimate
        { pattern: /curl\s+.*\|\s*(?:ba)?sh/,      label: 'curl | bash (remote code exec)' },
        { pattern: /wget\s+.*\|\s*(?:ba)?sh/,      label: 'wget | sh (remote code exec)' },
        { pattern: /curl\s+.*\|\s*python/,         label: 'curl | python (remote code exec)' },
        { pattern: /wget\s+.*\|\s*python/,         label: 'wget | python (remote code exec)' },

        // ── Data exfiltration ──
        // Piping secrets to external destinations
        { pattern: /cat\s+.*\.env.*\|\s*curl/,     label: 'cat .env | curl (secret exfil)' },
        { pattern: /cat\s+.*\.env.*\|\s*nc\b/,     label: 'cat .env | nc (secret exfil)' },
        { pattern: /cat\s+.*\.env.*\|\s*wget/,     label: 'cat .env | wget (secret exfil)' },
        { pattern: /cat\s+.*credential.*\|\s*curl/, label: 'cat credentials | curl (secret exfil)' },
        { pattern: /cat\s+.*\.secret.*\|\s*curl/,  label: 'cat .secret | curl (secret exfil)' },
        { pattern: /curl\s+.*-d\s+.*\$.*TOKEN/i,   label: 'curl POST with $TOKEN (secret exfil)' },
        { pattern: /curl\s+.*-d\s+.*\$.*API.KEY/i, label: 'curl POST with $API_KEY (secret exfil)' },
        { pattern: /curl\s+.*-d\s+.*\$.*SECRET/i,  label: 'curl POST with $SECRET (secret exfil)' },
        { pattern: /base64\s+.*\.env/,             label: 'base64 encode .env (secret staging)' },
        { pattern: /base64\s+.*credential/,        label: 'base64 encode credentials (secret staging)' },
      ],
    },
  },
  // MCP tools that require explicit per-persona allowance
  blockedMcpTools: [
    { pattern: /^mcp__.*docker.*/,                 label: 'Docker MCP operation' },
  ],
};

// Personas exempt from DEFAULT_POLICY (have their own comprehensive controls)
// ai-david: carefully scoped allowed_bash in permissions.yaml
const DEFAULT_POLICY_EXEMPT = new Set([
  'ai-david',
]);

// Per-persona policies — keep in sync with lib/persona-policies.yaml
const POLICIES = {
  'aurora-builder': {
    description: 'Aurora creative builder — blocks destructive system commands',
    tools: {
      Bash: {
        blockPatterns: [
          /rm\s+-rf/,
          /\bdd\s+if=/,
          /\bmkfs\b/,
          /curl\s+.*\|\s*bash/,
          /wget\s+.*\|\s*sh/,
          /\bchmod\s+777\b/,
          /\bsudo\s+rm\b/,
        ],
        blockMessage: 'aurora-builder: destructive system command blocked by persona-guard',
      },
    },
  },

  'infra-deployer': {
    description: 'Infrastructure deployer — restricts Bash to allowed commands only',
    tools: {
      Bash: {
        // Bash commands must match at least one of these patterns to be allowed
        allowPatterns: [
          /^docker(-compose|\s+compose)\b/,
          /^kubectl\b/,
          /^systemctl\b/,
          /^bd\b/,
          /^cat\b/,
          /^echo\b/,
          /^ls\b/,
          /^grep\b/,
          /^helm\b/,
        ],
        blockIfNoAllowMatch: true,
        blockMessage: 'infra-deployer: Bash command does not match allowed patterns (docker-compose, kubectl, systemctl, bd, ...)',
      },
    },
  },

  'aurora-thinker': {
    description: 'Aurora thinker — read-only, blocks write/destructive operations',
    tools: {
      Bash: {
        blockPatterns: [
          /rm\s+/,
          /\bdd\s+if=/,
          /\bmkfs\b/,
          /curl\s+.*\|\s*bash/,
          /wget\s+.*\|\s*sh/,
        ],
        blockMessage: 'aurora-thinker: write/destructive operation blocked (thinker is read-only)',
      },
    },
  },
};

/**
 * Check if a Bash command should be blocked for a given policy tool config.
 *
 * blockPatterns can be:
 *   - Array of RegExp (legacy per-persona format)
 *   - Array of {pattern: RegExp, label: string} (new labeled format for audit trail)
 *
 * Returns {message, label} if blocked, null if allowed.
 */
function checkBashCommand(command, toolPolicy) {
  if (!command || !toolPolicy) return null;

  // Block-pattern mode: reject if any pattern matches
  if (toolPolicy.blockPatterns) {
    for (const entry of toolPolicy.blockPatterns) {
      // Support both {pattern, label} objects and bare RegExp
      const regex = entry.pattern || entry;
      const label = entry.label || regex.toString();
      if (regex.test(command)) {
        const message = toolPolicy.blockMessage || 'Command blocked by persona-guard';
        return { message, label };
      }
    }
  }

  // Allow-only mode: reject if no allowed pattern matches
  if (toolPolicy.blockIfNoAllowMatch && toolPolicy.allowPatterns) {
    const allowed = toolPolicy.allowPatterns.some(p => p.test(command));
    if (!allowed) {
      const message = toolPolicy.blockMessage || 'Command not in allowed list for this persona';
      return { message, label: 'no-allow-match' };
    }
  }

  return null;
}

async function main() {
  const context = await readStdin();
  if (!context.tool_name) {
    proceed();
    return;
  }

  const persona = process.env.CLAUDE_PERSONA;

  // No persona set — allow everything (non-headless session)
  if (!persona) {
    proceed();
    return;
  }

  const { tool_name, tool_input } = context;

  // ── Layer 1: DEFAULT_POLICY (all headless personas unless exempt) ──
  if (!DEFAULT_POLICY_EXEMPT.has(persona)) {
    // Check Bash against default block patterns
    if (tool_name === 'Bash' && DEFAULT_POLICY.tools.Bash) {
      const command = tool_input?.command || '';
      const result = checkBashCommand(command, DEFAULT_POLICY.tools.Bash);
      if (result) {
        const blockText = `[persona-guard:DEFAULT:${persona}] ${result.message}\nMatched: ${result.label}\nCommand: ${command.substring(0, 200)}`;
        logBlock(persona, 'default', tool_name, command, result.label, result.message);
        block(blockText);
        return;
      }
    }

    // Check MCP tool names against blocked list
    if (tool_name.startsWith('mcp__') && DEFAULT_POLICY.blockedMcpTools) {
      for (const entry of DEFAULT_POLICY.blockedMcpTools) {
        const regex = entry.pattern || entry;
        const label = entry.label || regex.toString();
        if (regex.test(tool_name)) {
          const blockText = `[persona-guard:DEFAULT:${persona}] MCP tool ${tool_name} blocked — requires explicit per-persona allowance`;
          logBlock(persona, 'default', tool_name, tool_name, label, blockText);
          block(blockText);
          return;
        }
      }
    }
  }

  // ── Layer 2: Per-persona policy (overrides/extends default) ──
  const policy = POLICIES[persona];
  if (!policy) {
    // No per-persona policy — default policy already checked above
    proceed();
    return;
  }

  const toolPolicy = policy.tools[tool_name];

  // No policy for this specific tool in the per-persona config — allow
  if (!toolPolicy) {
    proceed();
    return;
  }

  // Bash command checking against per-persona rules
  if (tool_name === 'Bash') {
    const command = tool_input?.command || '';
    const result = checkBashCommand(command, toolPolicy);
    if (result) {
      const blockText = `[persona-guard:${persona}] ${result.message}\nMatched: ${result.label}\nCommand: ${command.substring(0, 200)}`;
      logBlock(persona, persona, tool_name, command, result.label, result.message);
      block(blockText);
      return;
    }
  }

  proceed();
}

runHook('persona-guard', main);
