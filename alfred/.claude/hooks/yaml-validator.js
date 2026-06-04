#!/usr/bin/env node
/**
 * YAML Validator Hook (PostToolUse)
 *
 * Validates YAML files after Edit/Write operations.
 * Checks: yamllint, duplicate keys, tab characters, parse validity.
 *
 * Covers: Edit, Write, mcp__filesystem__edit_file, mcp__filesystem__write_file
 *
 * Config: .yamllint.yaml (project root)
 * Audit:  .claude/logs/yaml-validator.jsonl
 *
 * Created: 2026-03-12
 * Version: 1.0.0
 */

const fs = require('fs').promises;
const path = require('path');
const { execFile } = require('child_process');

// Schema validation (lazy-loaded to avoid slowing non-registry YAML edits)
let schemaValidator = null;
function getSchemaValidator() {
  if (!schemaValidator) {
    try {
      schemaValidator = require(path.join(PROJECT_DIR, 'Scripts', 'lib', 'schema-validator'));
    } catch {
      schemaValidator = { validateFile: function() { return { valid: true, skipped: true }; } };
    }
  }
  return schemaValidator;
}

// --- Constants ---

const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || path.resolve(__dirname, '..', '..');
const LOG_DIR = path.join(PROJECT_DIR, '.claude', 'logs');
const AUDIT_FILE = path.join(LOG_DIR, 'yaml-validator.jsonl');
const YAMLLINT_CONFIG = path.join(PROJECT_DIR, '.yamllint.yaml');

const EDIT_TOOLS = new Set([
  'Edit', 'Write',
  'mcp__filesystem__edit_file', 'mcp__filesystem__write_file',
]);

const YAML_EXTENSIONS = new Set(['.yaml', '.yml']);

// --- Helpers ---

function extractFilePath(toolName, toolInput) {
  if (toolName === 'Edit' || toolName === 'Write') return toolInput?.file_path;
  if (toolName === 'mcp__filesystem__edit_file' || toolName === 'mcp__filesystem__write_file') return toolInput?.path;
  return null;
}

function isYamlFile(filePath) {
  return YAML_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function runYamllint(filePath) {
  return new Promise((resolve) => {
    const yamllintPath = 'process.env.HOME/.local/bin/yamllint';
    const args = ['-c', YAMLLINT_CONFIG, '-f', 'parsable', filePath];

    execFile(yamllintPath, args, { timeout: 5000 }, (err, stdout, stderr) => {
      if (!err) {
        resolve({ ok: true, issues: [] });
        return;
      }

      // Parse yamllint output: file:line:col: [level] message
      const output = (stdout || '') + (stderr || '');
      const issues = [];
      const lines = output.split('\n').filter(Boolean);

      for (const line of lines) {
        const match = line.match(/:(\d+):(\d+):\s*\[(error|warning)\]\s*(.+)/);
        if (match) {
          issues.push({
            line: parseInt(match[1]),
            col: parseInt(match[2]),
            level: match[3],
            message: match[4],
          });
        }
      }

      resolve({ ok: false, issues });
    });
  });
}

function checkTabCharacters(content) {
  const issues = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('\t')) {
      issues.push({
        line: i + 1,
        level: 'error',
        message: 'Tab character found (YAML requires spaces for indentation)',
      });
    }
  }
  return issues;
}

function checkDuplicateKeys(content) {
  // Regex-based duplicate key detection at each indentation level
  const issues = [];
  const lines = content.split('\n');
  const keysByIndent = new Map(); // indent -> Map<key, firstLine>

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip comments and empty lines
    if (/^\s*#/.test(line) || /^\s*$/.test(line)) continue;

    // Match key: at any indent level
    const keyMatch = line.match(/^(\s*)([\w][\w./-]*)\s*:/);
    if (!keyMatch) continue;

    const indent = keyMatch[1].length;
    const key = keyMatch[2];

    // Reset deeper indentation tracking when we go back to a shallower level
    for (const [trackedIndent] of keysByIndent) {
      if (trackedIndent > indent) {
        keysByIndent.delete(trackedIndent);
      }
    }

    if (!keysByIndent.has(indent)) {
      keysByIndent.set(indent, new Map());
    }

    const keysAtLevel = keysByIndent.get(indent);
    if (keysAtLevel.has(key)) {
      issues.push({
        line: i + 1,
        level: 'error',
        message: `Duplicate key "${key}" (first seen at line ${keysAtLevel.get(key)})`,
      });
    } else {
      keysAtLevel.set(key, i + 1);
    }
  }

  return issues;
}

async function auditLog(filePath, result, issues) {
  try {
    await fs.mkdir(LOG_DIR, { recursive: true });
    const entry = {
      timestamp: new Date().toISOString(),
      hook: 'yaml-validator',
      file: filePath,
      result,
      issueCount: issues.length,
      errors: issues.filter(i => i.level === 'error').length,
      warnings: issues.filter(i => i.level === 'warning').length,
      issues: issues.slice(0, 10), // Cap logged issues
    };
    await fs.appendFile(AUDIT_FILE, JSON.stringify(entry) + '\n');
  } catch (err) {
    // Non-fatal
  }
}

// --- Schema Validation ---

function runSchemaValidation(filePath) {
  return new Promise((resolve) => {
    // Parse YAML to JSON using Python (available since yamllint depends on PyYAML)
    const pyCmd = "import yaml, json, sys; json.dump(yaml.safe_load(sys.stdin), sys.stdout)";
    const proc = execFile('python3', ['-c', pyCmd], { timeout: 5000 }, (err, stdout) => {
      if (err || !stdout) {
        resolve([]); // Parse failed — yamllint will catch syntax errors
        return;
      }

      let parsed;
      try {
        parsed = JSON.parse(stdout);
      } catch {
        resolve([]);
        return;
      }

      // Run schema validation
      const validator = getSchemaValidator();
      const result = validator.validateFile(filePath, parsed);

      if (result.skipped || result.valid) {
        resolve([]);
        return;
      }

      // Convert schema errors to issues format
      const issues = result.errors.map(function(errMsg) {
        return {
          line: 1, // Schema errors are structural, not line-specific
          level: 'error',
          message: '[schema] ' + errMsg,
        };
      });

      resolve(issues);
    });

    // Pipe YAML content to Python's stdin
    const fsSync = require('fs');
    try {
      const content = fsSync.readFileSync(filePath, 'utf8');
      proc.stdin.write(content);
      proc.stdin.end();
    } catch {
      resolve([]);
    }
  });
}

// --- Main ---

async function main() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  const input = Buffer.concat(chunks).toString('utf8');

  let context;
  try {
    context = JSON.parse(input);
  } catch (e) {
    return;
  }

  const toolName = context.tool_name;
  const toolInput = context.tool_input;

  // Fast path: not an edit tool
  if (!EDIT_TOOLS.has(toolName)) return;

  // Extract file path
  const filePath = extractFilePath(toolName, toolInput);
  if (!filePath || !isYamlFile(filePath)) return;

  // Check if the file exists (might be a new file from Write)
  let content;
  try {
    content = await fs.readFile(filePath, 'utf8');
  } catch (e) {
    // File doesn't exist yet or can't be read — skip
    return;
  }

  // Run all checks
  const allIssues = [];

  // 1. Tab check (fast, no external tool)
  const tabIssues = checkTabCharacters(content);
  allIssues.push(...tabIssues);

  // 2. Duplicate key check
  const dupIssues = checkDuplicateKeys(content);
  allIssues.push(...dupIssues);

  // 3. yamllint (comprehensive)
  const yamllintResult = await runYamllint(filePath);
  allIssues.push(...yamllintResult.issues);

  // 4. Schema validation (if registry has a schema in manifest)
  const schemaIssues = await runSchemaValidation(filePath);
  allIssues.push(...schemaIssues);

  // Deduplicate by line+message
  const seen = new Set();
  const dedupedIssues = allIssues.filter(issue => {
    const key = `${issue.line}:${issue.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const errors = dedupedIssues.filter(i => i.level === 'error');
  const warnings = dedupedIssues.filter(i => i.level === 'warning');

  // Audit log
  const relativePath = filePath.startsWith(PROJECT_DIR)
    ? filePath.slice(PROJECT_DIR.length + 1)
    : filePath;
  await auditLog(relativePath, errors.length > 0 ? 'errors' : warnings.length > 0 ? 'warnings' : 'clean', dedupedIssues);

  // Output results
  if (errors.length > 0 || warnings.length > 0) {
    const parts = [];
    if (errors.length > 0) {
      parts.push(`${errors.length} error(s)`);
    }
    if (warnings.length > 0) {
      parts.push(`${warnings.length} warning(s)`);
    }

    let msg = `YAML VALIDATOR: ${path.basename(filePath)} has ${parts.join(' and ')}:\n`;

    // Show up to 8 issues
    const toShow = dedupedIssues.slice(0, 8);
    for (const issue of toShow) {
      const prefix = issue.level === 'error' ? 'ERROR' : 'WARN';
      msg += `  L${issue.line}: [${prefix}] ${issue.message}\n`;
    }
    if (dedupedIssues.length > 8) {
      msg += `  ... and ${dedupedIssues.length - 8} more\n`;
    }

    if (errors.length > 0) {
      msg += '\nPlease fix these YAML errors before proceeding.';
    }

    console.log(msg);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('[yaml-validator] Fatal: ' + err.message);
  process.exit(0);
});
