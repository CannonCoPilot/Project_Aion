/* eslint-disable @typescript-eslint/no-explicit-any */
import type { FastifyInstance } from 'fastify';
import {
  readSettings,
  updateRiskGates,
  updateTiming,
  activateTurbo,
  deactivateTurbo,
  updatePipelineRunner,
  updateTaskTypeOverrides,
  updateTaskReviewerThresholds,
  updateJobOverride,
  deleteJobOverride,
  updateAiProvider,
} from '../services/nexus-settings.js';
import type { JobOverride } from '../services/nexus-settings.js';

export async function nexusSettingsRoutes(app: FastifyInstance) {
  app.get('/api/nexus-settings', async () => {
    return readSettings();
  });

  app.patch('/api/nexus-settings/risk-gates', async (request, reply) => {
    const { executor, gates } = request.body as {
      executor: string;
      gates: { auto_execute: string[]; with_approval: string[]; block: string[] };
    };
    try {
      return updateRiskGates(executor, gates, 'dashboard');
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.patch('/api/nexus-settings/timing', async (request, reply) => {
    const { executor, every_hours } = request.body as { executor: string; every_hours: number };
    try {
      return updateTiming(executor, every_hours, 'dashboard');
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.post('/api/nexus-settings/turbo', async (request, reply) => {
    const { duration_hours, interval_hours } = request.body as {
      duration_hours: number;
      interval_hours?: number;
    };
    try {
      return activateTurbo(duration_hours, 'dashboard', interval_hours);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.delete('/api/nexus-settings/turbo', async (_request, reply) => {
    try {
      return deactivateTurbo('dashboard');
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.patch('/api/nexus-settings/pipeline-runner', async (request, reply) => {
    const updates = request.body as { enabled?: boolean; max_dispatches_per_hour?: number };
    try {
      return updatePipelineRunner(updates, 'dashboard');
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.patch('/api/nexus-settings/task-type-overrides', async (request, reply) => {
    const { overrides } = request.body as {
      overrides: Record<string, { gate: string; max_risk: string }>;
    };
    try {
      return updateTaskTypeOverrides(overrides, 'dashboard');
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.patch('/api/nexus-settings/task-reviewer-thresholds', async (request, reply) => {
    const { thresholds } = request.body as { thresholds: Record<string, unknown> };
    try {
      // Runtime validation in updateTaskReviewerThresholds handles type safety
      return updateTaskReviewerThresholds(thresholds as any, 'dashboard');
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.patch('/api/nexus-settings/job-overrides/:jobName', async (request, reply) => {
    const { jobName } = request.params as { jobName: string };
    const overrides = request.body as JobOverride;
    try {
      return updateJobOverride(jobName, overrides, 'dashboard');
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.delete('/api/nexus-settings/job-overrides/:jobName', async (request, reply) => {
    const { jobName } = request.params as { jobName: string };
    try {
      return deleteJobOverride(jobName, 'dashboard');
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.patch('/api/nexus-settings/ai-provider', async (request, reply) => {
    const updates = request.body as Record<string, unknown>;
    try {
      return updateAiProvider(updates as any, 'dashboard');
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.get('/api/ai-provider/status', async () => {
    const settings = readSettings();
    const ai = settings.ai_provider;
    return {
      provider: ai?.provider ?? 'ollama',
      ollama_model: ai?.ollama_model ?? (process.env.OLLAMA_MODEL || 'qwen2.5:32b'),
      openai_model: ai?.openai_model ?? 'gpt-4o-mini',
      openai_configured: !!process.env.OPENAI_API_KEY,
      temperature: ai?.temperature ?? 0.3,
    };
  });
}
