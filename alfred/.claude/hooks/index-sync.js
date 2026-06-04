/**
 * Index Sync Hook
 *
 * Keeps index files (_index.md) synchronized when:
 * - New files are created in indexed directories
 * - Files are renamed or moved
 * - Files are deleted
 *
 * Also appends new files to _search-index.md for reactive search index maintenance.
 *
 * Priority: MEDIUM (Documentation Quality)
 * Created: 2025-12-06
 * Modified: 2026-03-18 — search index append on file creation
 */

const fs = require('fs').promises;
const path = require('path');

// Directories with index files
const INDEXED_DIRECTORIES = [
  { dir: '.claude/context', index: '.claude/context/_index.md' },
  { dir: '.claude/context/systems', index: '.claude/context/systems/_index.md' },
  { dir: '.claude/context/integrations', index: '.claude/context/integrations/_index.md' },
  { dir: 'knowledge/projects', index: 'knowledge/projects/_index.md' },
  { dir: '.claude/context/workflows', index: '.claude/context/workflows/_index.md' },
  { dir: '.claude/context/patterns', index: '.claude/context/patterns/_index.md' },
  { dir: 'knowledge/docs', index: 'knowledge/docs/_index.md' },
  { dir: 'knowledge/reference', index: 'knowledge/reference/_index.md' }
];

const ROOT = path.resolve(__dirname, '..');
const SEARCH_INDEX = path.join(ROOT, '.claude', 'context', '_search-index.md');

// Track pending index updates
const pendingUpdates = new Set();

/**
 * Find which indexed directory contains the file
 */
function findIndexedDirectory(filePath) {
  const normalized = filePath.replace(/^\/home\/[^/]+\/AIProjects\//, '');

  for (const { dir, index } of INDEXED_DIRECTORIES) {
    if (normalized.startsWith(dir + '/') || normalized.startsWith(dir)) {
      return { dir, index };
    }
  }

  return null;
}

/**
 * Check if file should be indexed
 */
function shouldBeIndexed(filePath) {
  const basename = path.basename(filePath);

  // Skip index files themselves
  if (basename === '_index.md') return false;
  if (basename === '_search-index.md') return false;

  // Only markdown files
  if (!filePath.endsWith('.md')) return false;

  // Skip hidden files
  if (basename.startsWith('.')) return false;

  return true;
}

/**
 * Check if file is mentioned in index
 */
async function isInIndex(indexPath, filename) {
  try {
    const content = await fs.readFile(indexPath, 'utf-8');
    return content.includes(filename);
  } catch {
    return false;
  }
}

/**
 * Append a new entry to _search-index.md without full regeneration.
 * Finds the correct group table and appends the row.
 */
async function appendToSearchIndex(filePath) {
  try {
    // Lazy-load to avoid slowing down hook registration
    const { extractMetadata } = require(path.join(ROOT, 'Scripts', 'lib', 'metadata-extractor'));

    const content = await fs.readFile(filePath, 'utf8');
    const meta = extractMetadata(content, filePath);
    const rel = path.relative(ROOT, filePath);

    // Build the table row
    var desc = meta.description || meta.title || '\u2014';
    var tags = meta.tags.length > 0 ? meta.tags.map(function(t) { return '`' + t + '`'; }).join(' ') : '\u2014';
    if (meta.status === 'deprecated') {
      var superseded = meta.superseded_by ? ' \u2192 ' + meta.superseded_by : '';
      desc = '~~' + desc + '~~' + superseded;
    }
    var newRow = '| `' + rel + '` | ' + desc + ' | ' + tags + ' |';

    // Read current search index
    var searchContent = '';
    try {
      searchContent = await fs.readFile(SEARCH_INDEX, 'utf8');
    } catch {
      // Search index doesn't exist yet — skip, will be created on next full regen
      return;
    }

    // Check if already present — use backtick-wrapped path for exact match
    if (searchContent.includes('`' + rel + '`')) return;

    // Find the right group heading based on subdirectory
    var contextDir = path.join(ROOT, '.claude', 'context');
    var relToContext = path.relative(contextDir, filePath);
    var parts = relToContext.split(path.sep);
    var groupName = parts.length > 1 ? parts[0] : '(root)';
    var heading = groupName === '(root)' ? '## Root' : '## ' + groupName.charAt(0).toUpperCase() + groupName.slice(1);

    // Find the last table row in the matching group
    var lines = searchContent.split('\n');
    var inGroup = false;
    var lastRowIdx = -1;
    for (var i = 0; i < lines.length; i++) {
      if (lines[i] === heading || lines[i].startsWith(heading + '\n') || lines[i] === heading) {
        inGroup = true;
        continue;
      }
      if (inGroup && lines[i].startsWith('## ')) {
        // Hit next group — stop
        break;
      }
      if (inGroup && lines[i].startsWith('| `')) {
        lastRowIdx = i;
      }
    }

    if (lastRowIdx >= 0) {
      // Insert after the last table row in this group
      lines.splice(lastRowIdx + 1, 0, newRow);
      await fs.writeFile(SEARCH_INDEX, lines.join('\n'));
      console.log('[index-sync] Appended to search index: ' + rel);
    } else if (inGroup) {
      // Group exists but has no rows — this shouldn't happen (groups have headers)
      // Skip gracefully; next full regen will fix it
      console.log('[index-sync] Group "' + groupName + '" found but no table rows — skipping append');
    } else {
      // Group doesn't exist in search index — skip, next full regen will add it
      console.log('[index-sync] Group "' + groupName + '" not in search index — skipping (run full regen)');
    }
  } catch (err) {
    // Non-fatal — search index append is best-effort
    console.log('[index-sync] Search index append skipped: ' + err.message);
  }
}

module.exports = {
  name: 'index-sync',
  description: 'Keep index files and search index synchronized with directory contents',
  event: 'PostToolUse',

  async handler(context) {
    const { tool, parameters } = context;

    // Only check Write operations
    if (!['Write', 'mcp__filesystem__write_file'].includes(tool)) {
      return { proceed: true };
    }

    const filePath = parameters?.file_path || parameters?.path;
    if (!filePath) return { proceed: true };

    // Check if file is in an indexed directory
    const indexed = findIndexedDirectory(filePath);
    if (!indexed) return { proceed: true };

    // Check if file should be indexed
    if (!shouldBeIndexed(filePath)) return { proceed: true };

    // Check if file is already in _index.md
    const filename = path.basename(filePath);
    const isTracked = await isInIndex(indexed.index, filename);

    if (!isTracked) {
      pendingUpdates.add(indexed.index);

      console.log('\n[index-sync] NEW FILE IN INDEXED DIRECTORY');
      console.log('\u2500'.repeat(50));
      console.log('File: ' + filename);
      console.log('Directory: ' + indexed.dir);
      console.log('Index: ' + indexed.index);
      console.log('\nAction needed:');
      console.log('  Add reference to ' + filename + ' in ' + indexed.index);
      console.log('\u2500'.repeat(50) + '\n');
    }

    // Also check/append to search index (for .claude/context/ files)
    const isInSearchScope = filePath.includes('.claude/context/') || filePath.replace(/^\/home\/[^/]+\/AIProjects\//, '').startsWith('.claude/context/');
    if (isInSearchScope) {
      const inSearchIndex = await isInIndex(SEARCH_INDEX, path.basename(filePath));
      if (!inSearchIndex) {
        await appendToSearchIndex(filePath);
      }
    }

    return { proceed: true };
  }
};

// Export pending updates for external use
module.exports.getPendingUpdates = function() { return Array.from(pendingUpdates); };
module.exports.clearPendingUpdates = function() { pendingUpdates.clear(); };
