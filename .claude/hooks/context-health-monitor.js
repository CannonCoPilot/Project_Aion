#!/usr/bin/env node
/**
 * Context Health Monitor — Phase 2B Full Memory Layer Survey
 *
 * UserPromptSubmit hook that surveys all 6 memory layers and emits:
 * 1. Structured telemetry to .memory-health.json (for HUD/Dashboard)
 * 2. additionalContext warnings when layers are degraded
 * 3. Event log for historical tracking
 *
 * Memory System role:
 *   Layer: L6 (Meta-Memory) → L2 (Working Memory)
 *   Process: Retrieve (health signals into context when actionable)
 *
 * Layers monitored:
 *   L1 Sensory: insights-log size, corrections count, JSONL sessions
 *   L2 Working: scratchpad lines, session-state age
 *   L3 Short-Term: checkpoint freshness, archive count
 *   L4 Declarative: RAG/Graphiti availability (file-based check only)
 *   L5 Procedural: pattern count, reference count
 *   L6 Meta-Memory: jicm-state age, this monitor's own health
 *
 * Latency budget: <200ms (all local file ops, no network calls)
 */

const fs = require("fs");
const path = require("path");

const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const HEALTH_FILE = path.join(PROJECT_DIR, ".claude/context/.memory-health.json");
const TELEMETRY_DIR = path.join(PROJECT_DIR, ".claude/logs/telemetry");
const STATE_HOOK = path.join(PROJECT_DIR, ".claude/context/.jicm-state-hook.json");

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
  try {
    const hookData = JSON.parse(input);
    main(hookData);
  } catch (e) {
    console.log(JSON.stringify({ continue: true }));
  }
});

function main(hookData) {
  const warnings = [];
  const health = {
    timestamp: new Date().toISOString(),
    layers: {}
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // L1: Sensory Register
  // ═══════════════════════════════════════════════════════════════════════════
  const insightsLog = path.join(PROJECT_DIR, ".claude/context/insights/insights-log.md");
  const correctionsFile = path.join(PROJECT_DIR, ".claude/logs/corrections.jsonl");
  const projectsDir = path.join(process.env.HOME, ".claude/projects/-Users-nathanielcannon-Claude-Jarvis");

  const l1 = { status: "ok" };
  try {
    const insightsStats = fs.statSync(insightsLog);
    l1.insights_bytes = insightsStats.size;
    l1.insights_lines = countLines(insightsLog);
    if (l1.insights_lines > 500) {
      l1.status = "warn";
      warnings.push(`L1: insights-log at ${l1.insights_lines} lines (cap: 200)`);
    }
  } catch { l1.insights_bytes = 0; l1.insights_lines = 0; }

  try {
    l1.corrections_lines = countLines(correctionsFile);
  } catch { l1.corrections_lines = 0; }

  try {
    l1.jsonl_sessions = fs.readdirSync(projectsDir).filter(f => f.endsWith(".jsonl")).length;
  } catch { l1.jsonl_sessions = 0; }

  health.layers.L1_sensory = l1;

  // ═══════════════════════════════════════════════════════════════════════════
  // L2: Working Memory
  // ═══════════════════════════════════════════════════════════════════════════
  const scratchpad = path.join(PROJECT_DIR, ".claude/context/.scratchpad.md");
  const sessionState = path.join(PROJECT_DIR, ".claude/context/session-state.md");

  const l2 = { status: "ok" };
  try {
    l2.scratchpad_lines = countLines(scratchpad);
    if (l2.scratchpad_lines > 120) {
      l2.status = "warn";
      warnings.push(`L2: scratchpad at ${l2.scratchpad_lines} lines (limit: 120)`);
    }
  } catch { l2.scratchpad_lines = 0; }

  try {
    const ssStats = fs.statSync(sessionState);
    l2.session_state_age_min = Math.round((Date.now() - ssStats.mtimeMs) / 60000);
    if (l2.session_state_age_min > 360) {
      l2.status = l2.status === "warn" ? "critical" : "warn";
    }
  } catch { l2.session_state_age_min = -1; }

  health.layers.L2_working = l2;

  // ═══════════════════════════════════════════════════════════════════════════
  // L3: Short-Term Memory
  // ═══════════════════════════════════════════════════════════════════════════
  const checkpoint = path.join(PROJECT_DIR, ".claude/context/.compressed-context-ready.md");
  const archiveDir = path.join(PROJECT_DIR, ".claude/logs/jicm/archive");

  const l3 = { status: "ok" };
  try {
    const cpStats = fs.statSync(checkpoint);
    l3.checkpoint_age_min = Math.round((Date.now() - cpStats.mtimeMs) / 60000);
    l3.checkpoint_bytes = cpStats.size;
  } catch { l3.checkpoint_age_min = -1; l3.checkpoint_bytes = 0; }

  try {
    l3.archive_count = fs.readdirSync(archiveDir).filter(f => f.startsWith("compressed-")).length;
  } catch { l3.archive_count = 0; }

  health.layers.L3_shortterm = l3;

  // ═══════════════════════════════════════════════════════════════════════════
  // L4: Long-Term Declarative (file-based availability check)
  // ═══════════════════════════════════════════════════════════════════════════
  const lastIngest = path.join(PROJECT_DIR, ".claude/context/.jicm-last-ingest.json");

  const l4 = { status: "ok" };
  try {
    const ingestData = JSON.parse(fs.readFileSync(lastIngest, "utf8"));
    l4.last_ingest_at = ingestData.timestamp;
    l4.last_ingest_chunks = ingestData.chunks_ingested;
    l4.dedup_threshold = ingestData.dedup_threshold;
    l4.collection = ingestData.collection;
  } catch {
    l4.last_ingest_at = null;
    l4.status = "unknown";
  }

  health.layers.L4_declarative = l4;

  // ═══════════════════════════════════════════════════════════════════════════
  // L5: Long-Term Procedural
  // ═══════════════════════════════════════════════════════════════════════════
  const patternsDir = path.join(PROJECT_DIR, ".claude/context/patterns");
  const referenceDir = path.join(PROJECT_DIR, ".claude/context/reference");

  const l5 = { status: "ok" };
  try {
    l5.pattern_count = fs.readdirSync(patternsDir).filter(f => f.endsWith(".md")).length;
  } catch { l5.pattern_count = 0; }
  try {
    l5.reference_count = fs.readdirSync(referenceDir).filter(f => f.endsWith(".md")).length;
  } catch { l5.reference_count = 0; }

  health.layers.L5_procedural = l5;

  // ═══════════════════════════════════════════════════════════════════════════
  // L6: Meta-Memory (JICM state + context pressure)
  // ═══════════════════════════════════════════════════════════════════════════
  const l6 = { status: "ok" };
  try {
    const stateData = JSON.parse(fs.readFileSync(STATE_HOOK, "utf8"));
    l6.tokens = stateData.tokens || 0;
    l6.used_pct = stateData.used_percentage || 0;
    l6.action = stateData.action || "UNKNOWN";
    l6.cache_hit_rate = stateData.cache_hit_rate || 0;
    l6.hard_threshold = stateData.hard_threshold_tokens || 300000;

    const stateAge = Math.round((Date.now() - new Date(stateData.ts).getTime()) / 60000);
    l6.state_age_min = stateAge;

    // Context pressure warnings
    const warnAt = Math.round(l6.hard_threshold * 0.8);
    const criticalAt = Math.round(l6.hard_threshold * 0.95);
    if (l6.tokens >= criticalAt) {
      l6.status = "critical";
      warnings.push(`L6: Context at ${Math.round(l6.tokens/1000)}k — CRITICAL (threshold: ${Math.round(l6.hard_threshold/1000)}k)`);
    } else if (l6.tokens >= warnAt) {
      l6.status = "warn";
      warnings.push(`L6: Context at ${Math.round(l6.tokens/1000)}k — approaching threshold`);
    }
  } catch {
    l6.tokens = 0; l6.used_pct = 0; l6.action = "UNKNOWN";
  }

  health.layers.L6_meta = l6;

  // ═══════════════════════════════════════════════════════════════════════════
  // Overall status
  // ═══════════════════════════════════════════════════════════════════════════
  const statuses = Object.values(health.layers).map(l => l.status);
  health.overall = statuses.includes("critical") ? "critical" :
                   statuses.includes("warn") ? "warn" : "ok";
  health.warnings = warnings;

  // Write structured telemetry for HUD/Dashboard
  try {
    fs.writeFileSync(HEALTH_FILE, JSON.stringify(health, null, 2));
  } catch (e) { /* non-critical */ }

  // Append to daily event log
  try {
    fs.mkdirSync(TELEMETRY_DIR, { recursive: true });
    const eventFile = path.join(TELEMETRY_DIR, `memory-health-${new Date().toISOString().slice(0, 10)}.jsonl`);
    fs.appendFileSync(eventFile, JSON.stringify({
      ts: health.timestamp,
      overall: health.overall,
      l1_insights: l1.insights_lines,
      l2_scratchpad: l2.scratchpad_lines,
      l3_checkpoint_age: l3.checkpoint_age_min,
      l6_tokens: l6.tokens,
      warnings: warnings.length
    }) + "\n");
  } catch (e) { /* non-critical */ }

  // Inject warnings into context only if actionable
  if (warnings.length > 0) {
    console.log(JSON.stringify({
      continue: true,
      additionalContext: `[Memory Health: ${health.overall.toUpperCase()}] ${warnings.join("; ")}`
    }));
  } else {
    console.log(JSON.stringify({ continue: true }));
  }
}

function countLines(filePath) {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    return content.split("\n").length;
  } catch {
    return 0;
  }
}
