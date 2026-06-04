/**
 * AI Context — shared system glossary + per-page context builders for Ollama prompts.
 *
 * Global glossary: what Nexus is, label semantics, pipeline stages, routing.
 * Page contexts: each page type adds its own domain-specific framing.
 *
 * Usage:
 *   buildAiPrompt({ pageContext: 'task-detail', task, events, instruction })
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { config } from '../config.js';
import { getTaskById, getEventsByTaskId } from './pulse-client.js';

type TaskData = NonNullable<Awaited<ReturnType<typeof getTaskById>>>;
type EventData = Awaited<ReturnType<typeof getEventsByTaskId>>;

// ─── Global System Glossary ──────────────────────────────────────────────────

const SYSTEM_GLOSSARY = `
--- SYSTEM CONTEXT ---
You are an AI assistant embedded in the Pulse Dashboard, a task management and automation platform for a personal home lab infrastructure.

KEY CONCEPTS:
- "Sir" is the human owner/operator. He is the only user. There is no team.
- "Nexus" is the autonomous operations platform — it is SOFTWARE, not a person or team. It includes: a dispatcher (cron scheduler), task executor (headless Claude Code sessions), AI David persona (automated task reviewer), message bus (Telegram notifications), and pipeline automation.
- "Pulse" is the task tracking system. Tasks have IDs like "AIProjects-xxxx".

LABEL SEMANTICS (these appear on tasks):
- waiting:david — Blocked, needs Sir's human input/decision/review before it can proceed
- waiting:session — Too complex for Nexus — waiting for Sir to pick up in a CLI session
- waiting:external — Blocked on external event or third party
- waiting:subtasks — Parent task waiting for child tasks to complete
- parked — Deliberately shelved/on-hold, not actively being worked on
- needs-input — Task is blocked because it requires information that hasn't been provided yet
- manual-action — Requires physical or hands-on action that cannot be automated
- blocked:dependency — Task has unresolved orchestration dependencies
- auto:candidate — Flagged as a candidate for automated execution
- auto:ready — Evaluated and confirmed ready for automated execution
- review:pending — AI David has reviewed this task and it's awaiting Sir's approval
- pipeline:approved — Sir has approved this task to proceed through the automation pipeline
- pipeline:needs-approval — Automation has paused, waiting for Sir to approve the next step

PIPELINE STAGES (stage:xxx labels — tasks flow through these in order):
- stage:intake — Newly created, not yet evaluated
- stage:evaluate — Being assessed for risk, capability, and automation readiness
- stage:route — Being routed to the appropriate handler (investigator decides next step)
- stage:review — Needs human decision — approval, input, or judgment
- stage:queue — Approved and queued, waiting for executor to pick it up
- stage:execute — Actively being executed (by automation or in a session)

ROUTING (how tasks get directed):
- "Unrouted" — No routing labels, sitting uncategorized
- "Waiting on Me" (waiting:david) — Needs Sir's attention
- "Send to Queue" (auto:candidate) — Queue for automation
- "Park" (parked) — Shelved until revisited

PRIORITY LEVELS: 0=CRITICAL, 1=HIGH, 2=MEDIUM, 3=LOW, 4=Backlog

DOMAIN LABELS (domain:xxx): infrastructure, coding, creative, research, ai-research, security, writing, content, personal, feedback, business, nexus, automation
PROJECT LABELS (project:xxx): link tasks to specific code projects (e.g., project:aurora, project:aifred, project:nexus)
SOURCE LABELS (source:xxx): where the task originated (e.g., source:session, source:claude-app, source:headless, source:orchestration, source:claude-code, source:priority, source:ad-hoc)
`.trim();

// ─── Task Data Formatter (shared) ────────────────────────────────────────────

function formatTaskData(task: TaskData, events: EventData): string {
  const lines: string[] = [];

  lines.push('--- TASK DATA ---');
  lines.push(`ID: ${task.id}`);
  lines.push(`Title: ${task.title}`);
  lines.push(`Status: ${task.status}`);
  lines.push(
    `Priority: ${['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'Backlog'][task.priority] ?? task.priority}`,
  );
  if (task.assignee) lines.push(`Assignee: ${task.assignee}`);
  if (task.labels?.length) lines.push(`Labels: ${task.labels.join(', ')}`);
  if (task.description) lines.push(`\nDescription:\n${task.description}`);
  if (task.notes) lines.push(`\nNotes:\n${task.notes}`);
  if (task.close_reason) lines.push(`\nClose Reason: ${task.close_reason}`);

  if (events.length > 0) {
    lines.push('\n--- EVENT TIMELINE ---');
    const recent = events.slice(-30);
    for (const e of recent) {
      const ts = new Date(e.created_at).toLocaleString();
      let detail = `[${ts}] ${e.event_type} by ${e.actor}`;
      if (e.old_value && e.new_value) detail += ` (${e.old_value} → ${e.new_value})`;
      else if (e.new_value) detail += ` → ${e.new_value}`;
      if (e.comment) detail += ` — "${e.comment}"`;
      lines.push(detail);
    }
    if (events.length > 30) {
      lines.push(`(${events.length - 30} earlier events omitted)`);
    }
  }

  return lines.join('\n');
}

// ─── Page Contexts ───────────────────────────────────────────────────────────

interface PageContext {
  /** Framing instruction — what the AI should focus on for this page */
  instruction: string;
}

const PAGE_CONTEXTS: Record<string, PageContext> = {
  'task-detail': {
    instruction: [
      'You are viewing a single task detail page. The user can see the full task: title, description, labels, notes, status, routing buttons, event timeline, and related Obsidian notes.',
      'CRITICAL: Focus on the SUBSTANCE of the task — what problem it solves, what it actually does, what decision is being asked of the user. Do NOT just describe pipeline mechanics or label states back to the user — he can already see those on screen.',
      'When asked about a task, explain the real-world "what" and "why" first: What will change? What is the problem being addressed? What are the trade-offs or risks? Only then mention process/status details if directly relevant.',
      'Be concise and direct. If the user asks "what should I do", recommend a specific action with reasoning grounded in the task substance, not just its labels.',
      '',
      'IMPORTANT: You are a read-only assistant. You CANNOT take actions, approve tasks, or change task state. You can only answer questions. Never say "reply yes to approve" or imply that chatting with you will change the task. The user must use the dashboard buttons.',
      '',
      'UI BUTTONS available on this page (refer to these by name when the user asks what to do):',
      '- "Approve → Queue" (green) — Approves the task and sends it to the automated executor. Use this to move a pipeline:needs-approval task forward.',
      '- "Claim & Start" (blue) — Claims the task for a live CLI session. Use this when the user wants to work on it manually.',
      '- "Release" — Returns the task to the open queue for re-evaluation by the task-evaluator.',
      '- "Send Back" (amber) — Returns to evaluation stage with feedback. Opens a text box for the user to explain why. Use this when the task needs rework or the approach is wrong.',
      '- "Defer" — Parks the task until the user is ready to revisit it.',
      '- "Close" — Marks the task as complete or won\'t-do.',
    ].join('\n'),
  },
};

// ─── Project Context Loader ──────────────────────────────────────────────────

function getProjectLabel(labels: string[]): string | null {
  const match = labels.find((l) => l.startsWith('project:'));
  return match ? match.replace('project:', '') : null;
}

async function loadProjectContext(projectSlug: string): Promise<string | null> {
  const filePath = resolve(config.projectContextDir, `${projectSlug}.md`);
  try {
    const content = await readFile(filePath, 'utf-8');
    // Extract Evaluator Brief section if present — it's the most structured/useful part
    const briefMatch = content.match(/## Evaluator Brief[\s\S]*$/);
    const brief = briefMatch ? briefMatch[0].trim() : null;
    // Also grab key sections: Overview, Decisions, Open Questions
    const sections: string[] = [];
    const overviewMatch = content.match(/## Overview\n([\s\S]*?)(?=\n## )/);
    if (overviewMatch) sections.push(`Overview: ${overviewMatch[1].trim()}`);
    const decisionsMatch = content.match(/### Decisions Made\n([\s\S]*?)(?=\n### |\n## |$)/);
    if (decisionsMatch) sections.push(`Decisions:\n${decisionsMatch[1].trim()}`);
    const openQMatch = content.match(/### Open Questions\n([\s\S]*?)(?=\n### |\n## |$)/);
    if (openQMatch) sections.push(`Open Questions:\n${openQMatch[1].trim()}`);
    if (brief) sections.push(brief);
    if (sections.length === 0) {
      // Fallback: include the full file (truncated)
      const truncated = content.slice(0, 3000);
      return `--- PROJECT CONTEXT (${projectSlug}) ---\n${truncated}${content.length > 3000 ? '\n(truncated)' : ''}`;
    }
    return `--- PROJECT CONTEXT (${projectSlug}) ---\n${sections.join('\n\n')}`;
  } catch {
    return null;
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

export interface AiPromptOptions {
  /** Which page the user is on — determines framing */
  pageContext: keyof typeof PAGE_CONTEXTS | (string & {});
  /** The task data */
  task: TaskData;
  /** Event history for the task */
  events: EventData;
  /** The specific instruction or question */
  instruction: string;
}

/**
 * Build a complete prompt with system glossary + page context + project context + task data + instruction.
 */
export async function buildAiPrompt(opts: AiPromptOptions): Promise<string> {
  const page = PAGE_CONTEXTS[opts.pageContext];

  // Load project context if the task has a project: label
  const projectSlug = getProjectLabel(opts.task.labels ?? []);
  const projectContext = projectSlug ? await loadProjectContext(projectSlug) : null;

  const sections = [
    SYSTEM_GLOSSARY,
    '',
    page ? `--- PAGE CONTEXT ---\n${page.instruction}` : '',
    '',
    projectContext ?? '',
    '',
    formatTaskData(opts.task, opts.events),
    '',
    `--- ${opts.instruction.includes('?') ? 'USER QUESTION' : 'INSTRUCTION'} ---`,
    opts.instruction,
  ];

  return sections.filter(Boolean).join('\n');
}

/**
 * Get just the system glossary (for endpoints that need it separately).
 */
export function getSystemGlossary(): string {
  return SYSTEM_GLOSSARY;
}

/**
 * Register a custom page context at runtime (for plugins/extensions).
 */
export function registerPageContext(name: string, context: PageContext): void {
  PAGE_CONTEXTS[name] = context;
}
