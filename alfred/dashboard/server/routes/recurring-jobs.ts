import type { FastifyInstance } from 'fastify';
import {
  getAllJobs,
  getJobExecutionHistory,
  triggerNexusJob,
  readWorkflow,
  writeWorkflow,
  listPersonaDirs,
  writeJobToRegistry,
  removeJobFromRegistry,
  updateJobField,
} from '../services/recurring-jobs.js';
import { parseRegistry, listPersonaDirs as getPersonaList } from '../services/registry.js';
import type { NewJobInput } from '../services/recurring-jobs.js';
import { updateJobOverride, deleteJobOverride } from '../services/nexus-settings.js';
import { queryAi } from './ollama.js';
import type { JobOverride } from '../services/nexus-settings.js';
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const workspace = process.env.WORKSPACE_DIR || process.cwd();

const home = process.env.WORKSPACE_DIR || process.cwd();
const AUDIT_PATH =
  process.env.NEXUS_SETTINGS_AUDIT_PATH ||
  resolve(workspace, '.claude/data/nexus-settings-audit.jsonl');

function appendAudit(action: string, details: Record<string, unknown>) {
  try {
    mkdirSync(dirname(AUDIT_PATH), { recursive: true });
    const entry = JSON.stringify({
      timestamp: new Date().toISOString(),
      action,
      actor: 'dashboard',
      ...details,
    });
    appendFileSync(AUDIT_PATH, entry + '\n');
  } catch {
    /* best effort */
  }
}

export async function recurringJobsRoutes(app: FastifyInstance) {
  // List all recurring jobs from all sources
  app.get('/api/recurring-jobs', async (request) => {
    const query = request.query as { days?: string };
    const days = parseInt(query.days || '7', 10);
    return getAllJobs(days);
  });

  // Get execution history for a specific job
  app.get('/api/recurring-jobs/:source/:jobId/logs', async (request) => {
    const { jobId } = request.params as { source: string; jobId: string };
    const query = request.query as { limit?: string; days?: string };
    const limit = parseInt(query.limit || '20', 10);
    const days = parseInt(query.days || '30', 10);
    return getJobExecutionHistory(jobId, limit, days);
  });

  // Toggle enable/disable or update schedule for a job
  app.patch('/api/recurring-jobs/:source/:jobId', async (request, reply) => {
    const { source, jobId } = request.params as { source: string; jobId: string };
    const body = request.body as JobOverride & { persona?: string };

    if (source !== 'nexus') {
      return reply
        .status(501)
        .send({ error: `Schedule editing for ${source} jobs not yet supported` });
    }

    try {
      // Validate job exists in registry
      const { jobs } = parseRegistry();
      if (!jobs.find((j) => j.name === jobId)) {
        return reply.status(404).send({ error: `Job '${jobId}' not found in registry` });
      }

      // Handle persona change (registry-level edit, not a runtime override)
      if (body.persona) {
        const validPersonas = getPersonaList();
        if (!validPersonas.includes(body.persona)) {
          return reply.status(400).send({
            error: `Unknown persona '${body.persona}'. Valid: ${validPersonas.join(', ')}`,
          });
        }
        updateJobField(jobId, 'persona', body.persona);
        appendAudit('update_job_persona', { jobId, persona: body.persona });
      }

      // Handle schedule/enable/config overrides (runtime overlay)
      const override: JobOverride = {};
      if (body.enabled !== undefined) override.enabled = body.enabled;
      if (body.every_hours !== undefined) override.every_hours = body.every_hours;
      if (body.hour !== undefined) override.hour = body.hour;
      if (body.day !== undefined) override.day = body.day;
      if (body.max_turns !== undefined) override.max_turns = body.max_turns;
      if (body.max_budget_usd !== undefined) override.max_budget_usd = body.max_budget_usd;
      if (body.max_daily_budget_usd !== undefined)
        override.max_daily_budget_usd = body.max_daily_budget_usd;
      if (body.timeout_minutes !== undefined) override.timeout_minutes = body.timeout_minutes;

      if (Object.keys(override).length > 0) {
        updateJobOverride(jobId, override, 'dashboard');
      }

      return { ok: true, jobId, overrides: override };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return reply.status(400).send({ error: message });
    }
  });

  // Remove override (reset to registry defaults)
  app.delete('/api/recurring-jobs/:source/:jobId/override', async (request, reply) => {
    const { source, jobId } = request.params as { source: string; jobId: string };
    if (source !== 'nexus') {
      return reply.status(501).send({ error: 'Only nexus jobs support overrides' });
    }
    try {
      deleteJobOverride(jobId, 'dashboard');
      return { ok: true, jobId };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return reply.status(400).send({ error: message });
    }
  });

  // Manual trigger
  app.post('/api/recurring-jobs/:source/:jobId/run', async (request, reply) => {
    const { source, jobId } = request.params as { source: string; jobId: string };
    if (source !== 'nexus') {
      return reply.status(501).send({ error: `Manual run for ${source} jobs not yet supported` });
    }
    return triggerNexusJob(jobId);
  });

  // Create a new nexus job
  app.post('/api/recurring-jobs', async (request, reply) => {
    const body = request.body as NewJobInput;
    try {
      if (!body.name || !body.description || !body.persona || !body.schedule) {
        return reply
          .status(400)
          .send({ error: 'name, description, persona, and schedule are required' });
      }
      if (!/^[\w-]+$/.test(body.name)) {
        return reply.status(400).send({ error: 'Job name must be alphanumeric with hyphens only' });
      }
      writeJobToRegistry(body);
      appendAudit('create_job', {
        jobId: body.name,
        persona: body.persona,
        schedule: body.schedule,
      });
      return { ok: true, jobId: body.name };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return reply.status(400).send({ error: message });
    }
  });

  // Delete a nexus job
  app.delete('/api/recurring-jobs/nexus/:jobId', async (request, reply) => {
    const { jobId } = request.params as { jobId: string };
    try {
      removeJobFromRegistry(jobId);
      appendAudit('delete_job', { jobId });
      return { ok: true, jobId };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return reply.status(400).send({ error: message });
    }
  });

  // Read workflow file
  app.get('/api/recurring-jobs/nexus/:jobId/workflow', async (request, reply) => {
    const { jobId } = request.params as { jobId: string };
    const content = readWorkflow(jobId);
    if (content === null) {
      return reply.status(404).send({ error: `Workflow file not found for ${jobId}` });
    }
    return { jobId, content };
  });

  // Update workflow file
  app.put('/api/recurring-jobs/nexus/:jobId/workflow', async (request, reply) => {
    const { jobId } = request.params as { jobId: string };
    const { content } = request.body as { content: string };
    if (typeof content !== 'string') {
      return reply.status(400).send({ error: 'content must be a string' });
    }
    try {
      writeWorkflow(jobId, content);
      appendAudit('write_workflow', { jobId, lineCount: content.split('\n').length });
      return { ok: true, jobId };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return reply.status(400).send({ error: message });
    }
  });

  // AI-assisted workflow editing
  app.post('/api/recurring-jobs/nexus/:jobId/workflow/assist', async (request, reply) => {
    const { jobId } = request.params as { jobId: string };
    const { instruction } = request.body as { instruction: string };

    if (!instruction?.trim()) {
      return reply.status(400).send({ error: 'instruction is required' });
    }

    // Get current workflow + job context
    const content = readWorkflow(jobId);
    const { jobs } = parseRegistry();
    const job = jobs.find((j) => j.name === jobId);

    const prompt = `You are editing a workflow instruction file for a Nexus automated job. Your output should be the COMPLETE updated workflow file content in markdown — not a diff, not an explanation, just the full updated file ready to save.

## Job Context
- **Name**: ${jobId}
- **Description**: ${job?.description || 'Unknown'}
- **Persona**: ${job?.persona || 'Unknown'}
- **Schedule**: ${job ? `${job.schedule.type}` : 'Unknown'}
- **Engine**: ${job?.engine || 'claude-code'}

## Current Workflow Content
\`\`\`markdown
${content || '(empty — new workflow)'}
\`\`\`

## User Instruction
${instruction.trim()}

## Rules
- Output ONLY the complete updated markdown file content
- Preserve existing structure and steps that aren't being changed
- Add clear step numbers and headers
- Be specific about commands, paths, and expected outputs
- If adding error handling, include specific checks the persona should run
- Do NOT wrap the output in code fences — output raw markdown only`;

    try {
      const result = await queryAi(prompt, 4096);
      return { content: result };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return reply.status(502).send({ error: `AI query failed: ${message}` });
    }
  });

  // List available personas
  app.get('/api/recurring-jobs/personas', async () => {
    return { personas: listPersonaDirs() };
  });

  // Health summary (aggregate)
  app.get('/api/recurring-jobs/health-summary', async () => {
    const { jobs, summary } = getAllJobs();
    const warnings = jobs
      .filter((j) => j.health.status === 'warning')
      .map((j) => ({ name: j.name, source: j.source, issue: j.health.lastError || 'SLA warning' }));
    const failing = jobs
      .filter((j) => j.health.status === 'failing')
      .map((j) => ({
        name: j.name,
        source: j.source,
        issue: j.health.lastError || 'Multiple failures',
        consecutiveFailures: j.health.consecutiveFailures,
      }));
    return { summary, warnings, failing };
  });
}
