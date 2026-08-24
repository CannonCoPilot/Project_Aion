#!/usr/bin/env node
/**
 * Virgil Tracker — F.2 Virgil MVP
 *
 * PostToolUse + SubagentStop hook that maintains signal files for
 * the Virgil dashboard (virgil.sh v0.2).
 *
 * PostToolUse triggers:
 *   - TaskCreate → adds task to .virgil-tasks.json
 *   - TaskUpdate → updates task status in .virgil-tasks.json
 *   - Task       → adds agent to .virgil-agents.json
 *
 * SubagentStop trigger:
 *   - Marks agent as completed in .virgil-agents.json
 *
 * Signal files (dot-prefixed, gitignored):
 *   .claude/context/.virgil-tasks.json
 *   .claude/context/.virgil-agents.json
 *
 * Design: Stateless, atomic writes (tmp→rename), 15-min stale cleanup.
 */

const fs = require("fs");
const path = require("path");

const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const TASKS_FILE = path.join(PROJECT_DIR, ".claude/context/.virgil-tasks.json");
const AGENTS_FILE = path.join(PROJECT_DIR, ".claude/context/.virgil-agents.json");
const STALE_MS = 15 * 60 * 1000; // 15 minutes — TASKS only (see reapAgents for agents)

// An agent record is reaped on TWO different clocks, and conflating them was a bug.
//
// A "running" record is only garbage once we can be confident SubagentStop will never
// arrive for it. A subagent can legitimately work for a long time, so the 15-minute
// task bound is far too aggressive here: applying it would delete LIVE agents from the
// dashboard mid-flight. That never showed up because the agent prune was unreachable
// (see reapAgentsFile), so the bound has never once been applied to a live agent.
const AGENT_ORPHAN_MS = Number(process.env.VIRGIL_AGENT_ORPHAN_MS) || 2 * 60 * 60 * 1000; // 2h
// A "completed" record is kept just long enough to be seen on the dashboard.
const COMPLETED_RETAIN_MS = 2 * 60 * 1000; // 2 minutes

// --- File I/O helpers ---

function readJSON(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function writeJSON(filePath, data) {
  data.updated = new Date().toISOString();
  const tmp = filePath + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n");
  fs.renameSync(tmp, filePath);
}

// --- Stale entry cleanup ---

function pruneStale(entries, timestampKey) {
  const cutoff = Date.now() - STALE_MS;
  return entries.filter((e) => {
    const ts = e[timestampKey];
    if (!ts) return false;
    return new Date(ts).getTime() > cutoff;
  });
}

// --- Agent reaping ---

// Agents get their own reaper because they have two states on two clocks.
function reapAgents(agents) {
  const now = Date.now();
  return (agents || []).filter((a) => {
    const started = new Date(a.started || 0).getTime();
    // An undatable record can never be aged out, so it would be immortal. Drop it.
    if (!started || Number.isNaN(started)) return false;
    if (a.status === "completed") {
      const finished = new Date(a.finished || a.started).getTime();
      return finished > now - COMPLETED_RETAIN_MS;
    }
    // Still "running": keep it until the orphan bound. Past that, SubagentStop was
    // never delivered and this is a fossil, not a long job.
    return started > now - AGENT_ORPHAN_MS;
  });
}

// 🔴 THE REAPER USED TO BE UNREACHABLE. pruneStale(agents) ran ONLY inside
// handleAgentLaunch and handleAgentStop — i.e. only when a Task launched or a subagent
// stopped. Those are exactly the events whose ABSENCE creates the fossil, so a collector
// gated behind them can never collect the last record. Measured 2026-08-24: a single
// code-tester record from 2026-03-04 had survived 173 days and Virgil rendered it as
// "possibly stalled (>10 min)" the entire time.
// This hook's PostToolUse matcher is ^(Task|TaskCreate|TaskUpdate)$ — it does NOT run on
// every tool call. That is still enough, and the reason is the point: TaskCreate/TaskUpdate
// are frequent AND independent of the agent lifecycle, so the collector no longer depends
// on the events whose absence is what leaves the garbage behind. If the matcher is ever
// narrowed to agent events only, this defect comes straight back.
// Writes only when something actually changed — writeJSON stamps `updated`, and churning
// that on every tool call would make the file's own mtime meaningless.
function reapAgentsFile() {
  const data = readJSON(AGENTS_FILE);
  if (!data || !Array.isArray(data.agents)) return;
  const before = data.agents.length;
  const kept = reapAgents(data.agents);
  if (kept.length === before) return;
  data.agents = kept;
  writeJSON(AGENTS_FILE, data);
}

// --- Task tracking ---

function handleTaskCreate(toolInput, toolOutput) {
  const data = readJSON(TASKS_FILE) || { tasks: [] };

  // Extract task ID from output (TaskCreate returns the created task)
  let taskId = "unknown";
  try {
    const out =
      typeof toolOutput === "string" ? JSON.parse(toolOutput) : toolOutput;
    taskId = String(out.id || out.taskId || "unknown");
  } catch {
    // Use subject hash as fallback ID
    taskId = String(Date.now());
  }

  data.tasks = pruneStale(data.tasks || [], "timestamp");

  data.tasks.push({
    id: taskId,
    subject: toolInput.subject || "(untitled)",
    status: "pending",
    activeForm: toolInput.activeForm || "",
    timestamp: new Date().toISOString(),
  });

  writeJSON(TASKS_FILE, data);
}

function handleTaskUpdate(toolInput) {
  const data = readJSON(TASKS_FILE);
  if (!data || !data.tasks) return;

  data.tasks = pruneStale(data.tasks, "timestamp");

  const taskId = String(toolInput.taskId || "");
  const task = data.tasks.find((t) => t.id === taskId);
  if (task) {
    if (toolInput.status) task.status = toolInput.status;
    if (toolInput.subject) task.subject = toolInput.subject;
    if (toolInput.activeForm) task.activeForm = toolInput.activeForm;
    task.timestamp = new Date().toISOString();
  }

  writeJSON(TASKS_FILE, data);
}

// --- Agent tracking ---

function handleAgentLaunch(toolInput) {
  const data = readJSON(AGENTS_FILE) || { agents: [] };
  data.agents = reapAgents(data.agents);

  const agentId =
    (toolInput.description || "agent").replace(/\s+/g, "-").slice(0, 30) +
    "-" +
    Date.now().toString(36);

  data.agents.push({
    id: agentId,
    type: toolInput.subagent_type || "unknown",
    description: (toolInput.description || "").slice(0, 60),
    started: new Date().toISOString(),
    status: "running",
  });

  writeJSON(AGENTS_FILE, data);
}

function handleAgentStop(context) {
  const data = readJSON(AGENTS_FILE);
  if (!data || !data.agents) return;

  data.agents = reapAgents(data.agents);

  // Mark the most recent running agent of matching type as completed
  const agentName = context.agent_name || "";
  for (let i = data.agents.length - 1; i >= 0; i--) {
    if (data.agents[i].status === "running") {
      // Match by type if available, otherwise mark most recent
      if (
        !agentName ||
        data.agents[i].type.toLowerCase() === agentName.toLowerCase()
      ) {
        data.agents[i].status = "completed";
        data.agents[i].finished = new Date().toISOString();
        break;
      }
    }
  }

  // Completed-record retention is handled by reapAgents (COMPLETED_RETAIN_MS); the one
  // just marked here is seconds old, so it survives and shows briefly on the dashboard.
  writeJSON(AGENTS_FILE, data);
}

// --- Main ---

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
  try {
    const hookData = JSON.parse(input);
    const toolName = hookData.tool_name || "";
    const toolInput = hookData.tool_input || {};
    const toolOutput = hookData.tool_output || "";

    // Reap FIRST and unconditionally. This is what makes the collector reachable: it must
    // not depend on the agent events whose absence is what leaves the garbage behind.
    reapAgentsFile();

    if (toolName === "TaskCreate") {
      handleTaskCreate(toolInput, toolOutput);
    } else if (toolName === "TaskUpdate") {
      handleTaskUpdate(toolInput);
    } else if (toolName === "Task") {
      handleAgentLaunch(toolInput);
    } else if (hookData.agent_name !== undefined) {
      // SubagentStop event (has agent_name field)
      handleAgentStop(hookData);
    }
  } catch {
    // Non-critical — dashboard will show stale or empty data
  }

  console.log(JSON.stringify({ continue: true }));
});
