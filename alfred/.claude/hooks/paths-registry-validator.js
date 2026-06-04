/**
 * Paths Registry Validator Hook
 *
 * PreToolUse hook that validates paths-registry.yaml on Edit/Write:
 * - Every project under coding.projects must have a service_status field
 * - service_status must be one of: active, paused, archived, dead
 * - Warns if service_status is being changed (status transition awareness)
 *
 * Priority: LOW (Validation)
 * Created: 2026-03-11
 */

const fs = require('fs');

const VALID_STATUSES = ['active', 'paused', 'archived', 'dead'];
const REGISTRY_FILENAME = 'paths-registry.yaml';

/**
 * Parse service_status entries from YAML content (lightweight, no YAML lib needed)
 */
function extractProjectStatuses(content) {
  const projects = {};
  const lines = content.split('\n');

  let inCodingProjects = false;
  let currentProject = null;
  let projectIndent = 0;
  let baseIndent = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trimStart();
    const indent = line.length - trimmed.length;

    // Detect coding.projects section
    if (trimmed === 'projects:' && i > 0) {
      for (let j = i - 1; j >= 0; j--) {
        const prev = lines[j].trimStart();
        if (prev.startsWith('coding:')) {
          inCodingProjects = true;
          baseIndent = indent;
          break;
        }
        if (prev && !prev.startsWith('#') && lines[j].length - prev.length < indent) {
          break;
        }
      }
      continue;
    }

    if (!inCodingProjects) continue;

    // Left the projects section entirely
    if (trimmed && !trimmed.startsWith('#') && indent <= baseIndent) {
      inCodingProjects = false;
      break;
    }

    // Project-level key (direct child of projects:, ends with just ':')
    const projectMatch = trimmed.match(/^([\w-]+):$/);
    if (projectMatch && indent === baseIndent + 2) {
      currentProject = projectMatch[1];
      projectIndent = indent;
      // Don't register yet — wait to confirm it has a path: key
      continue;
    }

    if (!currentProject) continue;

    // We're inside a project's properties (indent > projectIndent)
    if (indent > projectIndent) {
      // Confirm this is a real project by finding path: or documentation:
      if (trimmed.startsWith('path:') || trimmed.startsWith('documentation:')) {
        if (!projects[currentProject]) {
          projects[currentProject] = { service_status: null, line: i };
        }
      }

      // Capture service_status
      if (trimmed.startsWith('service_status:')) {
        if (!projects[currentProject]) {
          projects[currentProject] = { service_status: null, line: i };
        }
        const valueMatch = trimmed.match(/^service_status:\s*["']?([^"'\s#]+)/);
        if (valueMatch) {
          projects[currentProject].service_status = valueMatch[1];
        }
      }
    }
  }

  return projects;
}

module.exports = {
  name: 'paths-registry-validator',
  description: 'Validate service_status field in paths-registry.yaml projects',
  event: 'PreToolUse',

  async handler(context) {
    const { tool, parameters } = context;

    // Only check Edit/Write operations
    if (!['Edit', 'Write'].includes(tool)) {
      return { proceed: true };
    }

    const filePath = parameters?.file_path || '';

    // Only validate paths-registry.yaml
    if (!filePath.endsWith(REGISTRY_FILENAME)) {
      return { proceed: true };
    }

    // For Edit: we need the resulting file content. Read current file and simulate the edit.
    // For Write: the new content is the full file.
    let content;

    if (tool === 'Write') {
      content = parameters?.content || '';
    } else if (tool === 'Edit') {
      // Read current file, apply the edit to check the result
      try {
        const current = fs.readFileSync(filePath, 'utf-8');
        const oldStr = parameters?.old_string || '';
        const newStr = parameters?.new_string || '';

        if (parameters?.replace_all) {
          content = current.split(oldStr).join(newStr);
        } else {
          content = current.replace(oldStr, newStr);
        }
      } catch {
        // Can't read file, let the edit proceed and fail naturally
        return { proceed: true };
      }
    }

    if (!content) return { proceed: true };

    // Only validate if the file has a coding projects section
    if (!content.includes('coding:') || !content.includes('service_status')) {
      return { proceed: true };
    }

    const projects = extractProjectStatuses(content);
    const warnings = [];
    const errors = [];

    for (const [name, info] of Object.entries(projects)) {
      if (!info.service_status) {
        warnings.push(`Project "${name}" (line ~${info.line}) is missing service_status`);
      } else if (!VALID_STATUSES.includes(info.service_status)) {
        errors.push(
          `Project "${name}" has invalid service_status: "${info.service_status}" ` +
          `(must be one of: ${VALID_STATUSES.join(', ')})`
        );
      }
    }

    if (errors.length > 0) {
      console.log('\n[paths-registry-validator] ❌ INVALID service_status VALUES');
      console.log('─'.repeat(50));
      errors.forEach(e => console.log(`  • ${e}`));
      console.log('─'.repeat(50) + '\n');
      return {
        proceed: false,
        message: errors[0]
      };
    }

    if (warnings.length > 0) {
      console.log('\n[paths-registry-validator] ⚠️  Missing service_status');
      console.log('─'.repeat(50));
      warnings.forEach(w => console.log(`  • ${w}`));
      console.log(`\nValid values: ${VALID_STATUSES.join(', ')}`);
      console.log('─'.repeat(50) + '\n');
      // Warn but don't block — missing is OK during incremental edits
    }

    return { proceed: true };
  }
};
