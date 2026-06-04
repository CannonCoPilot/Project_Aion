/**
 * Usage proxy routes — token-based, Anthropic session-aware.
 *
 * Proxies /api/usage/* to the Pulse API at /api/v1/usage/*.
 * All data comes exclusively from proxy-captured Anthropic API headers.
 * No fallback, no backfill, no estimation.
 *
 * "Session" = Anthropic's 5h rolling window, NOT a Claude Code session.
 */

import type { FastifyInstance } from 'fastify';

const PULSE_URL = process.env.PULSE_API_URL || 'http://pulse:8700/api/v1';
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://host.docker.internal:11434';
const MLX_EMBED_URL = process.env.MLX_EMBED_URL || 'http://host.docker.internal:8000';

async function proxyGet(path: string) {
  const res = await fetch(`${PULSE_URL}${path}`);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Pulse GET ${path}: ${res.status} ${body}`);
  }
  return res.json();
}

interface LoadedModel {
  name: string;
  family: 'ollama' | 'mlx-embed';
  alive: boolean;
  size_vram?: number;
  expires_at?: string;
  embedding_dim?: number;
  uptime_seconds?: number;
}

// Discover models that are CURRENTLY LOADED (not just deployed) — Ollama via /api/ps,
// MLX-Embed via /health. Both probes are best-effort and tolerate unreachability.
async function discoverLoadedModels(): Promise<LoadedModel[]> {
  const out: LoadedModel[] = [];

  try {
    const r = await fetch(`${OLLAMA_URL}/api/ps`, { signal: AbortSignal.timeout(3000) });
    if (r.ok) {
      const d = (await r.json()) as { models?: Array<{ name: string; size_vram?: number; expires_at?: string }> };
      for (const m of d.models ?? []) {
        out.push({
          name: m.name,
          family: 'ollama',
          alive: true,
          size_vram: m.size_vram,
          expires_at: m.expires_at,
        });
      }
    }
  } catch {
    // Ollama unreachable — return without ollama entries (won't show as alive)
  }

  try {
    const r = await fetch(`${MLX_EMBED_URL}/health`, { signal: AbortSignal.timeout(3000) });
    if (r.ok) {
      const d = (await r.json()) as {
        status?: string;
        model_status?: string;
        model_name?: string;
        embedding_dim?: number;
        uptime_seconds?: number;
      };
      const alive = d.status === 'healthy' && d.model_status === 'ready';
      if (alive && d.model_name) {
        out.push({
          name: d.model_name,
          family: 'mlx-embed',
          alive: true,
          embedding_dim: d.embedding_dim,
          uptime_seconds: d.uptime_seconds,
        });
      }
    }
  } catch {
    // MLX-Embed unreachable — skip
  }

  return out;
}

export async function usageRoutes(app: FastifyInstance) {
  app.get('/api/usage/session-window', async () => proxyGet('/usage/session-window'));
  app.get('/api/usage/session-tokens', async () => proxyGet('/usage/session-tokens'));
  app.get('/api/usage/session-spend-dollars', async () => proxyGet('/usage/session-spend-dollars'));
  app.get('/api/usage/model-tokens', async () => proxyGet('/usage/model-tokens'));
  app.get('/api/usage/message-sizes', async () => proxyGet('/usage/message-sizes'));
  app.get('/api/usage/message-sizes-historical', async () => proxyGet('/usage/message-sizes-historical?days=30'));
  app.get('/api/usage/session-budget-history', async () => proxyGet('/usage/session-budget-history'));
  app.get('/api/usage/window-transitions', async () => proxyGet('/usage/window-transitions'));
  app.get('/api/usage/burn-rate-curve', async () => proxyGet('/usage/burn-rate-curve'));
  app.get('/api/usage/cache-effectiveness', async () => proxyGet('/usage/cache-effectiveness'));
  app.get('/api/usage/rejection-events', async () => proxyGet('/usage/rejection-events'));
  app.get('/api/usage/loaded-models', async () => ({ models: await discoverLoadedModels() }));
}
