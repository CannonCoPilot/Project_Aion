// Pulse /api/v1/* passthrough proxy — Phase 1.2 boundary route.
//
// Frontend talks to its own server at /api/v1/personas, /api/v1/tool-catalog,
// /api/v1/observations, etc. This handler forwards every such request to the
// Pulse FastAPI service (configured via PULSE_API_URL env; defaults to the
// docker-compose pulse:8700 internal hostname). Keeps the architectural
// boundary clean — the dashboard backend is the single API entry point for
// the frontend even when most logic lives in pulse.
//
// Phase 1.1 endpoints proxied (all under /api/v1/*):
//   personas CRUD + prompt versions + activity + permissions + methodology
//   tool-catalog + persona-tool-matrix + persona-tool assignment endpoints
//   persona-graph + persona-flow + persona-village + persona-timeline + persona-heatmap
//   observations (POST/GET) + mcp/claim (POST/DELETE)
//   observability/* aggregate endpoints
//
// WebSocket /socket is handled by the websocket service (not this proxy).

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

const PULSE_API_URL =
  process.env.PULSE_API_URL ||
  (process.env.PULSE_URL ? `${process.env.PULSE_URL.replace(/\/$/, '')}/api/v1` : 'http://pulse:8700/api/v1');

// Strip /api/v1 prefix from the incoming dashboard URL since PULSE_API_URL
// already ends in /api/v1. e.g. /api/v1/personas?tier=A → /personas?tier=A
function suffixOf(url: string): string {
  return url.replace(/^\/api\/v1/, '') || '/';
}

// Headers worth forwarding (and ones we should NOT forward).
const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'transfer-encoding',
  'te',
  'trailer',
  'proxy-authorization',
  'proxy-authenticate',
  'upgrade',
  'host',
  'content-length',
  'content-encoding',
]);

async function forward(request: FastifyRequest, reply: FastifyReply) {
  const target = `${PULSE_API_URL}${suffixOf(request.url)}`;

  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(request.headers)) {
    if (typeof v !== 'string') continue;
    if (HOP_BY_HOP.has(k.toLowerCase())) continue;
    headers[k] = v;
  }
  if (!headers['content-type'] && request.method !== 'GET' && request.method !== 'HEAD') {
    headers['content-type'] = 'application/json';
  }

  const init: RequestInit = { method: request.method, headers };
  if (request.method !== 'GET' && request.method !== 'HEAD' && request.body !== undefined) {
    init.body = typeof request.body === 'string' ? request.body : JSON.stringify(request.body);
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, init);
  } catch (err) {
    request.log.error({ err, target }, 'pulse v1 proxy fetch failed');
    return reply.code(502).send({ error: 'upstream pulse unreachable', target });
  }

  upstream.headers.forEach((value, key) => {
    if (HOP_BY_HOP.has(key.toLowerCase())) return;
    reply.header(key, value);
  });
  reply.code(upstream.status);

  const contentType = upstream.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return reply.send(await upstream.json());
  }
  return reply.send(await upstream.text());
}

export async function pulseV1ProxyRoutes(app: FastifyInstance) {
  app.route({
    method: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    url: '/api/v1/*',
    handler: forward,
  });
}
