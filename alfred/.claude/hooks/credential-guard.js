#!/usr/bin/env node
/**
 * Credential Guard Hook (PreToolUse)
 *
 * Enforces scope authorization for credential access. Checks whether
 * the current consumer/persona is authorized to access governed
 * credentials, and escalates based on risk tier.
 *
 * Complements Document Guard (structural file protection) with
 * scope authorization (who can access what, for what purpose).
 *
 * Covers: Edit, Write, mcp__filesystem__edit_file, mcp__filesystem__write_file, Bash
 *
 * Config:    .claude/hooks/credential-guard.config.js
 * Policy:    .claude/registries/credential-governance.yaml
 * Overrides: .claude/logs/.credential-guard-overrides.json
 * Audit:     .claude/logs/credential-guard.jsonl
 *
 * Created: 2026-03-18
 * Version: 1.0.0
 */

const { readStdin, block, proceed, appendJsonl, LOG_DIR, PROJECT_ROOT } = require('./lib/shared');
const fs = require('fs').promises;
const path = require('path');
const { execFileSync } = require('child_process');

// --- Constants ---

const OVERRIDE_FILE = path.join(LOG_DIR, '.credential-guard-overrides.json');
const AUDIT_FILE = path.join(LOG_DIR, 'credential-guard.jsonl');

const EDIT_TOOLS = new Set([
  'Edit', 'Write',
  'mcp__filesystem__edit_file', 'mcp__filesystem__write_file',
]);

const BASH_TOOL = 'Bash';

// --- Config Cache ---

let configCache = null;
let configMtime = 0;

async function loadConfig() {
  const configPath = path.join(__dirname, 'credential-guard.config.js');
  try {
    const stat = await fs.stat(configPath);
    if (stat.mtimeMs > configMtime) {
      delete require.cache[require.resolve(configPath)];
      configCache = require(configPath);
      configMtime = stat.mtimeMs;
    }
    return configCache;
  } catch (err) {
    console.error('[credential-guard] Config load error: ' + err.message);
    return null;
  }
}

// --- Path Helpers ---

function extractFilePath(toolName, toolInput) {
  if (toolName === 'Edit' || toolName === 'Write') return toolInput?.file_path;
  if (toolName === 'mcp__filesystem__edit_file' || toolName === 'mcp__filesystem__write_file') return toolInput?.path;
  return null;
}

function normalizePath(filePath) {
  const HOME = process.env.HOME || 'process.env.HOME';
  if (filePath.startsWith('~/')) return path.normalize(path.join(HOME, filePath.slice(2)));
  if (!path.isAbsolute(filePath)) return path.normalize(path.join(PROJECT_ROOT, filePath));
  return path.normalize(filePath);
}

// --- Detection: File Path Matching ---

function findFileMatchingPolicies(config, absolutePath) {
  const matched = [];
  for (const policy of config.policies) {
    for (const pattern of policy.filePatterns) {
      const normalizedPattern = normalizePath(pattern);
      // Exact match or directory prefix match (for ~/.ssh/)
      if (absolutePath === normalizedPattern ||
          (normalizedPattern.endsWith('/') && absolutePath.startsWith(normalizedPattern)) ||
          absolutePath.startsWith(normalizedPattern.replace(/\/$/, '') + '/')) {
        matched.push(policy);
        break;
      }
    }
  }
  return matched;
}

// --- Detection: Variable Name Matching in Bash ---

function findVariableMatchingPolicies(config, command) {
  const matched = [];
  for (const policy of config.policies) {
    for (const varName of policy.variableNames) {
      // Match: $VAR, ${VAR}, export VAR=, VAR=value
      const patterns = [
        new RegExp('\\$\\{?' + escapeRegex(varName) + '\\}?'),
        new RegExp('\\bexport\\s+' + escapeRegex(varName) + '\\s*='),
        new RegExp('\\b' + escapeRegex(varName) + '\\s*='),
      ];
      for (const pat of patterns) {
        if (pat.test(command)) {
          matched.push(policy);
          break;
        }
      }
      // Break outer loop if already matched
      if (matched.length > 0 && matched[matched.length - 1] === policy) break;
    }
  }
  return matched;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// --- Detection: Bash file-path references to governed credentials ---
// Closes the "Bash cat" bypass: Read(**/.env) in settings.json only applies to
// Read/filesystem tools, not Bash. Any `cat ~/.../.env` command previously
// evaded governance. This function parses the bash command for file paths
// that match any policy's filePatterns.

function findBashFilePathMatchingPolicies(config, command) {
  const matched = [];
  for (const policy of config.policies) {
    if (matched.indexOf(policy) !== -1) continue;
    for (const pattern of policy.filePatterns) {
      const absolutePattern = normalizePath(pattern);
      // Try both the expanded absolute path and the original ~-form, since
      // commands might reference either.
      const candidates = [absolutePattern, pattern];
      let hit = false;
      for (const cand of candidates) {
        if (!cand) continue;
        const escaped = escapeRegex(cand);
        // Boundary chars: start, whitespace, quotes, parens, brackets, pipes, semicolons, redirects
        const re = new RegExp('(?:^|[\\s=(\'"`\\[\\]|;<>&])' + escaped + '(?:[\\s)\'"`\\[\\]|;<>&]|$)');
        if (re.test(command)) { hit = true; break; }
      }
      if (hit) { matched.push(policy); break; }
    }
  }
  return matched;
}

// --- Detection: Generic .env file access in bash commands ---
// Catches ANY file ending in .env or .env.* even if no policy exists for it.
// Returns the matched path substring for use in block messages.

function detectGenericEnvAccess(command) {
  // Match tokens ending in .env or .env.something, at token boundaries
  const envFileRegex = /(?:^|[\s=('"`\[\]|;<>&])([~/\w.-]*\.env(?:\.[\w-]+)?)(?=[\s)'"`\[\]|;<>&]|$)/;
  const match = command.match(envFileRegex);
  return match ? match[1] : null;
}

// Check if the bash command is attempting to READ an env file (not legitimate writes/edits).
// Specifically looks for common read commands followed by a .env reference.
function isBashEnvReadAttempt(command) {
  // Common read/inspection commands that would exfiltrate .env contents
  const readCommands = /\b(cat|head|tail|less|more|grep|awk|sed|xxd|od|strings|hexdump|zcat|bat|tac|nl|printf|echo)\b/;
  if (!readCommands.test(command)) return false;
  return detectGenericEnvAccess(command) !== null;
}

// --- Authorization Check ---

function isAuthorized(policy, trigger) {
  const persona = process.env.CLAUDE_PERSONA || '';

  // Check persona authorization (headless)
  if (persona && policy.allowedPersonas) {
    for (const ap of policy.allowedPersonas) {
      if (ap.persona === persona) return true;
    }
  }

  // Check consumer authorization (file/script pattern match)
  if (trigger && policy.allowedConsumers) {
    for (const ac of policy.allowedConsumers) {
      if (ac.actions.length > 0 && trigger.includes(ac.pattern)) return true;
    }
  }

  // No authorization found
  return false;
}

// --- Risk Tier ---

function getRiskTier(policy) {
  return policy.riskTier || 'standard';
}

// --- Override Mechanism ---

async function checkOverride(credentialId) {
  try {
    const data = await fs.readFile(OVERRIDE_FILE, 'utf8');
    const parsed = JSON.parse(data);
    const now = Date.now();
    const overrides = parsed.overrides || [];
    for (const o of overrides) {
      if (o.credential === credentialId && (!o.expires || o.expires > now)) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

async function consumeOverride(credentialId) {
  try {
    const data = await fs.readFile(OVERRIDE_FILE, 'utf8');
    const parsed = JSON.parse(data);
    parsed.overrides = (parsed.overrides || []).filter(function(o) {
      return o.credential !== credentialId;
    });
    if (parsed.overrides.length === 0) {
      await fs.unlink(OVERRIDE_FILE).catch(function() {});
    } else {
      await fs.writeFile(OVERRIDE_FILE, JSON.stringify(parsed, null, 2));
    }
  } catch { /* fine */ }
}

// --- Headless Escalation ---

function createPulseTask(policy, context) {
  try {
    const title = 'Credential access blocked: ' + policy.id;
    const desc = 'credential-guard blocked access to ' + policy.id +
      ' (risk: ' + getRiskTier(policy) + ')' +
      (context ? '. Context: ' + context : '');
    // Using execFileSync with explicit args to avoid shell injection
    execFileSync('pulse', [
      'create', title,
      '--description', desc,
      '--label', 'waiting:david',
      '--label', 'domain:security',
      '--label', 'source:credential-guard',
      '--priority', '1',
    ], { timeout: 5000, stdio: 'pipe' });
  } catch (err) {
    console.error('[credential-guard] Failed to create Pulse task: ' + err.message);
  }
}

function sendTelegram(policy) {
  try {
    const msg = 'CREDENTIAL GUARD [CRITICAL]: Blocked access to ' + policy.id +
      ' by persona ' + (process.env.CLAUDE_PERSONA || 'unknown');
    // Using execFileSync with explicit args to avoid shell injection
    execFileSync('bash', [
      path.join(PROJECT_ROOT, '.claude/jobs/lib/send-telegram.sh'),
      '--message', msg,
    ], { timeout: 5000, stdio: 'pipe' });
  } catch (err) {
    console.error('[credential-guard] Failed to send Telegram: ' + err.message);
  }
}

// --- Audit Logging ---

async function auditLog(action, policies, trigger, details) {
  try {
    await fs.mkdir(LOG_DIR, { recursive: true });
    const entry = {
      timestamp: new Date().toISOString(),
      hook: 'credential-guard',
      action: action,
      trigger: trigger,
      policies: policies.map(function(p) { return { id: p.id, riskTier: getRiskTier(p) }; }),
      persona: process.env.CLAUDE_PERSONA || null,
      details: details || null,
    };
    await appendJsonl(AUDIT_FILE, entry);
  } catch (err) {
    console.error('[credential-guard] Audit log error: ' + err.message);
  }
}

// --- Block Message Formatting ---

function formatBlockMessage(policies, trigger, config) {
  const highestRisk = policies.reduce(function(max, p) {
    const tierOrder = { critical: 3, 'high-risk': 2, standard: 1 };
    return (tierOrder[getRiskTier(p)] || 0) > (tierOrder[max] || 0) ? getRiskTier(p) : max;
  }, 'standard');

  const ttl = config.settings.overrideTTL || 120;
  const policyList = policies.map(function(p) { return p.id + ' (' + getRiskTier(p) + ')'; }).join(', ');

  var msg = 'CREDENTIAL GUARD [' + highestRisk.toUpperCase() + ']: Access blocked\n\n';
  msg += 'Governed credentials: ' + policyList + '\n';
  msg += 'Trigger: ' + trigger + '\n';

  if (!process.env.CLAUDE_PERSONA) {
    // Interactive: provide override instructions for ALL blocked policies
    var overrideEntries = policies.map(function(p) {
      return '{"credential":"' + p.id + '","reason":"User approved","expires":' + (Date.now() + ttl * 1000) + '}';
    });
    msg += '\nTo override: Ask the user for explicit approval, then write this file:\n';
    msg += '  Path: ' + OVERRIDE_FILE + '\n';
    msg += '  Content: {"overrides":[' + overrideEntries.join(',') + ']}\n';
    msg += 'Then retry. The override expires in ' + ttl + ' seconds and is single-use.';
  } else {
    msg += '\nHeadless mode: A Pulse task has been created for human review.';
  }

  return msg;
}

function formatWarnMessage(policies, trigger) {
  const policyList = policies.map(function(p) { return p.id; }).join(', ');
  return 'Credential Guard: accessing governed credential(s) [' + policyList + ']. ' +
    'Trigger: ' + trigger + '. Proceed with caution.';
}

// --- Main ---

// Emergency kill switch check — lets us recover if the hook is broken.
// Usage: export CREDENTIAL_GUARD_ENABLED=false
function isKillSwitchActive() {
  const envVal = process.env.CREDENTIAL_GUARD_ENABLED;
  return envVal !== undefined && (envVal === 'false' || envVal === '0' || envVal === '');
}

// Custom strict runner: fails CLOSED on fatal errors instead of proceeding.
// Replaces the shared runHook() wrapper (which fails open) because this hook
// guards credentials — silent proceed on failure is a landmine.
(async function() {
  try {
    if (isKillSwitchActive()) return proceed();

    const input = await readStdin();
    const toolName = input.tool_name;
    const toolInput = input.tool_input;

    if (!toolName) return proceed();

    // Load config — fail CLOSED if it fails to load (was fail-open before).
    const config = await loadConfig();
    if (!config) {
      return block(
        'CREDENTIAL GUARD [FAIL-CLOSED]: config load failed — cannot verify credential policies. Tool blocked.\n\n' +
        'Remediation:\n' +
        '  1. Fix the config at .claude/hooks/credential-guard.config.js\n' +
        '  2. Validate: node --check .claude/hooks/credential-guard.config.js\n' +
        '  3. Or emergency disable: export CREDENTIAL_GUARD_ENABLED=false (then re-enable after fix)'
      );
    }

    // Explicit disable in config is respected (not a fail-open — this is the legitimate off state).
    if (!config.settings.enabled) return proceed();

    let matchedPolicies = [];
    let trigger = '';

    // --- File edit detection ---
    if (EDIT_TOOLS.has(toolName)) {
      const filePath = extractFilePath(toolName, toolInput);
      if (!filePath) return proceed();

      const absolutePath = normalizePath(filePath);
      matchedPolicies = findFileMatchingPolicies(config, absolutePath);
      trigger = 'file:' + filePath;
    }

    // --- Bash command detection ---
    else if (toolName === BASH_TOOL) {
      const command = toolInput?.command || '';
      if (!command) return proceed();

      // 1. Env var name detection (existing: $VAULT_MCP_TOKEN, export FOO=, etc.)
      const varMatches = findVariableMatchingPolicies(config, command);

      // 2. NEW: File path detection. Catches `cat ~/Code/vault/.env` where the
      //    command references a governed file path by name instead of env var.
      const filePathMatches = findBashFilePathMatchingPolicies(config, command);

      // Union of both, deduped.
      matchedPolicies = varMatches.slice();
      for (const p of filePathMatches) {
        if (matchedPolicies.indexOf(p) === -1) matchedPolicies.push(p);
      }

      // 3. NEW: Generic .env read detection. Catches ANY attempt to cat/head/grep
      //    a .env file even if no specific policy matches. This closes the
      //    Bash(cat:*) bypass of settings.json Read(**/.env) deny.
      if (matchedPolicies.length === 0 && isBashEnvReadAttempt(command)) {
        const matchedPath = detectGenericEnvAccess(command) || '(unknown path)';
        await auditLog('blocked_generic_env', [], 'bash:' + command.substring(0, 200), {
          matchedPath: matchedPath,
          reason: 'generic .env file read via bash read command',
        });
        return block(
          'CREDENTIAL GUARD [CRITICAL]: Blocked bash read of .env file\n\n' +
          'Command tried to read: ' + matchedPath + '\n' +
          'Rule: .env files may contain secrets — reads via cat/head/grep/etc. are blocked at the Bash layer.\n\n' +
          'If you actually need to read the file content:\n' +
          '  - Ask the user to paste it manually, or\n' +
          '  - Use the settings.json override mechanism for this specific file'
        );
      }

      trigger = 'bash:' + command.substring(0, 200);
    }

    // --- Not a governed tool ---
    else {
      return proceed();
    }

    // No policies matched — allow
    if (matchedPolicies.length === 0) return proceed();

    // Check authorization for each matched policy
    const unauthorizedPolicies = matchedPolicies.filter(function(p) {
      return !isAuthorized(p, trigger);
    });

    // All authorized — allow
    if (unauthorizedPolicies.length === 0) {
      await auditLog('authorized', matchedPolicies, trigger);
      return proceed();
    }

    // Determine highest risk tier among unauthorized
    const tierOrder = { critical: 3, 'high-risk': 2, standard: 1 };
    const highestRisk = unauthorizedPolicies.reduce(function(max, p) {
      return (tierOrder[getRiskTier(p)] || 0) > (tierOrder[max] || 0) ? getRiskTier(p) : max;
    }, 'standard');

    const isHeadless = !!process.env.CLAUDE_PERSONA;

    // --- Standard tier: warn-confirm (interactive) or pulse-task (headless) ---
    if (highestRisk === 'standard') {
      if (isHeadless) {
        createPulseTask(unauthorizedPolicies[0], trigger);
        await auditLog('blocked_headless', unauthorizedPolicies, trigger);
        return block(formatBlockMessage(unauthorizedPolicies, trigger, config));
      }
      // Interactive: warn + context
      await auditLog('warned', unauthorizedPolicies, trigger);
      return proceed({
        hookSpecificOutput: {
          additionalContext: formatWarnMessage(unauthorizedPolicies, trigger),
        },
      });
    }

    // --- High-risk / Critical: check overrides for ALL unauthorized policies, then block ---
    if (highestRisk === 'high-risk' || highestRisk === 'critical') {
      // Check for overrides (interactive only) — all policies must be overridden
      if (!isHeadless) {
        var allOverridden = true;
        for (var oi = 0; oi < unauthorizedPolicies.length; oi++) {
          var hasOvr = await checkOverride(unauthorizedPolicies[oi].id);
          if (!hasOvr) { allOverridden = false; break; }
        }
        if (allOverridden) {
          for (var ci = 0; ci < unauthorizedPolicies.length; ci++) {
            await consumeOverride(unauthorizedPolicies[ci].id);
          }
          await auditLog('override_used', unauthorizedPolicies, trigger);
          var overriddenIds = unauthorizedPolicies.map(function(p) { return p.id; }).join(', ');
          return proceed({
            hookSpecificOutput: {
              additionalContext: 'CREDENTIAL GUARD OVERRIDE USED for ' + overriddenIds +
                '. This override was approved by the user.',
            },
          });
        }
      }

      // Headless escalation — create task per unique policy
      if (isHeadless) {
        for (var hi = 0; hi < unauthorizedPolicies.length; hi++) {
          createPulseTask(unauthorizedPolicies[hi], trigger);
          if (highestRisk === 'critical') {
            sendTelegram(unauthorizedPolicies[hi]);
          }
        }
        await auditLog('blocked_headless', unauthorizedPolicies, trigger, {
          escalation: highestRisk === 'critical' ? 'telegram+pulse' : 'pulse',
        });
      } else {
        await auditLog('blocked', unauthorizedPolicies, trigger);
      }

      return block(formatBlockMessage(unauthorizedPolicies, trigger, config));
    }

    // Fallback: allow
    return proceed();

  } catch (err) {
    // Fail closed on fatal errors. Emergency recovery: CREDENTIAL_GUARD_ENABLED=false
    if (isKillSwitchActive()) return proceed();
    console.error('[credential-guard] Fatal error: ' + err.message);
    return block(
      'CREDENTIAL GUARD [FAIL-CLOSED]: fatal error in hook — ' + err.message + '\n\n' +
      'Remediation:\n' +
      '  1. Check recent edits to .claude/hooks/credential-guard.js\n' +
      '  2. Validate: node --check .claude/hooks/credential-guard.js\n' +
      '  3. Or emergency disable: export CREDENTIAL_GUARD_ENABLED=false (then re-enable after fix)'
    );
  }
})();
