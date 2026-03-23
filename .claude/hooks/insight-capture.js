#!/usr/bin/env node
/**
 * Insight Capture Hook — AC-05 Integration
 *
 * Stop hook that scans the session JSONL transcript for ★ Insight blocks
 * and appends new ones to a persistent insights log. The /reflect command
 * can then read this log and feed insights to Graphiti for deep memory.
 *
 * Fires on: Stop (every session end / turn end)
 * Output: .claude/context/insights/insights-log.md
 *
 * Created: 2026-02-18 (Session 28b overnight)
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || (process.env.HOME + '/Claude/Jarvis');
const PROJECTS_DIR = path.join(process.env.HOME || process.env.HOME, ".claude/projects/-Users-nathanielcannon-Claude-Jarvis");
const INSIGHTS_LOG = path.join(PROJECT_DIR, ".claude/context/insights/insights-log.md");
const HASH_FILE = path.join(PROJECT_DIR, ".claude/context/insights/.captured-hashes.json");

// Read from stdin (Stop hook receives JSON context)
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", async () => {
  try {
    await captureInsights();
  } catch (e) {
    // Silent failure — don't break session exit
  }
  // Stop hooks must output JSON
  console.log(JSON.stringify({ proceed: true }));
});

async function captureInsights() {
  // Find the most recent JSONL transcript
  const jsonlFiles = fs.readdirSync(PROJECTS_DIR)
    .filter(f => f.endsWith(".jsonl"))
    .map(f => ({
      name: f,
      path: path.join(PROJECTS_DIR, f),
      mtime: fs.statSync(path.join(PROJECTS_DIR, f)).mtimeMs
    }))
    .sort((a, b) => b.mtime - a.mtime);

  if (jsonlFiles.length === 0) return;

  const jsonlPath = jsonlFiles[0].path;

  // Read last 200KB of the transcript (recent context)
  const stats = fs.statSync(jsonlPath);
  const readSize = Math.min(stats.size, 200 * 1024);
  const fd = fs.openSync(jsonlPath, "r");
  const buffer = Buffer.alloc(readSize);
  fs.readSync(fd, buffer, 0, readSize, Math.max(0, stats.size - readSize));
  fs.closeSync(fd);

  const content = buffer.toString("utf8");
  const lines = content.split("\n").filter(Boolean);

  // Load previously captured hashes to avoid duplicates
  let capturedHashes = new Set();
  try {
    const hashData = JSON.parse(fs.readFileSync(HASH_FILE, "utf8"));
    capturedHashes = new Set(hashData.hashes || []);
  } catch {
    // First run — no hashes yet
  }

  // Extract insight blocks from assistant messages
  const insights = [];
  // Match insight blocks with either Unicode box-drawing ─ or ASCII - separators
  // Also handle backtick-wrapped markers from Explanatory output style
  const insightRegex = /`?★ Insight[─\-\s]*`?\n([\s\S]*?)`?[─\-]{10,}`?/g;

  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      if (entry.type !== "assistant") continue;

      // Extract text from assistant message content
      const msgContent = entry.message?.content;
      if (!msgContent) continue;

      let text = "";
      if (typeof msgContent === "string") {
        text = msgContent;
      } else if (Array.isArray(msgContent)) {
        text = msgContent
          .filter(block => block.type === "text")
          .map(block => block.text)
          .join("\n");
      }

      if (!text.includes("★ Insight")) continue;

      // Extract all insight blocks from this message
      let match;
      while ((match = insightRegex.exec(text)) !== null) {
        const insightText = match[1].trim();
        if (!insightText || insightText.length < 10) continue;

        // Hash for dedup
        const hash = crypto.createHash("sha256").update(insightText).digest("hex").slice(0, 12);

        if (!capturedHashes.has(hash)) {
          insights.push({ text: insightText, hash });
          capturedHashes.add(hash);
        }
      }
      // Reset regex state
      insightRegex.lastIndex = 0;
    } catch {
      // Skip malformed lines
    }
  }

  if (insights.length === 0) return;

  // Ensure directory exists
  const insightsDir = path.dirname(INSIGHTS_LOG);
  if (!fs.existsSync(insightsDir)) {
    fs.mkdirSync(insightsDir, { recursive: true });
  }

  // Append new insights to the log
  const timestamp = new Date().toISOString().split("T")[0];
  let appendText = "";

  for (const insight of insights) {
    appendText += `\n### ${timestamp} [${insight.hash}]\n\n${insight.text}\n`;
  }

  // Create file with header if it doesn't exist
  if (!fs.existsSync(INSIGHTS_LOG)) {
    fs.writeFileSync(INSIGHTS_LOG, `# Jarvis Insights Log\n\nCaptured automatically by insight-capture.js hook.\nProcessed by /reflect Phase 5 for Graphiti ingestion.\n\n---\n`);
  }

  fs.appendFileSync(INSIGHTS_LOG, appendText);

  // Save updated hashes
  fs.writeFileSync(HASH_FILE, JSON.stringify({
    hashes: Array.from(capturedHashes),
    lastUpdate: new Date().toISOString(),
    totalCaptured: capturedHashes.size
  }, null, 2));
}
