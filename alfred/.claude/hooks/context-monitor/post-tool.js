#!/usr/bin/env node
/**
 * Context Monitor — PostToolUse Hook
 *
 * Captures file_read and memory_write events per the design doc.
 * Records: file path, size, estimated tokens.
 *
 * Part of: AIProjects-ho0u (context monitoring system)
 * Design doc: .claude/context/projects/context-monitor-design.md
 */

const fs = require('fs').promises;
const { appendEvent } = require('./lib/jsonl-writer');

/**
 * Detect if a file path is a MEMORY.md file.
 */
function isMemoryFile(filePath) {
  if (!filePath) return false;
  return filePath.endsWith('/MEMORY.md') ||
    filePath.endsWith('\\MEMORY.md') ||
    filePath === 'MEMORY.md' ||
    /\/memory\/[^/]+\.md$/.test(filePath);
}

async function getFileSize(filePath) {
  try {
    const stat = await fs.stat(filePath);
    return stat.size;
  } catch {
    return 0;
  }
}

async function main() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  let context = {};
  try { context = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch {}

  const { tool_name, tool_input, tool_result } = context;
  const sessionId = context.session_id || process.env.CLAUDE_SESSION_ID || 'unknown';

  // Only track Read and Write tool calls
  if (tool_name !== 'Read' && tool_name !== 'Write') {
    console.log(JSON.stringify({ proceed: true }));
    return;
  }

  // Skip errored tool calls
  if (tool_result?.error || tool_result?.is_error) {
    console.log(JSON.stringify({ proceed: true }));
    return;
  }

  const filePath = tool_input?.file_path;
  if (!filePath) {
    console.log(JSON.stringify({ proceed: true }));
    return;
  }

  try {
    if (tool_name === 'Read') {
      // File read event
      const fileSizeBytes = await getFileSize(filePath);
      const estimatedTokens = Math.floor(fileSizeBytes / 4);
      await appendEvent({
        event: 'file_read',
        session_id: sessionId,
        file_path: filePath,
        file_size_bytes: fileSizeBytes,
        estimated_tokens: estimatedTokens
      });
    } else if (tool_name === 'Write') {
      // Write event — only track MEMORY.md writes
      if (isMemoryFile(filePath)) {
        const content = tool_input?.content || '';
        const writeSizeBytes = Buffer.byteLength(content, 'utf8');
        await appendEvent({
          event: 'memory_write',
          session_id: sessionId,
          file_path: filePath,
          write_size_bytes: writeSizeBytes,
          is_memory_file: true
        });
      }
    }
  } catch (err) {
    process.stderr.write(`[context-monitor/post-tool] Error: ${err.message}\n`);
  }

  console.log(JSON.stringify({ proceed: true }));
}

main().catch(err => {
  process.stderr.write(`[context-monitor/post-tool] Fatal: ${err.message}\n`);
  console.log(JSON.stringify({ proceed: true }));
});
