import type { FastifyInstance } from 'fastify';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function authRoutes(app: FastifyInstance) {
  // Expose session info from Authentik forward-auth headers
  app.get('/api/auth/session', async (request) => {
    const jwt = request.headers['x-authentik-jwt'] as string | undefined;
    const username = request.headers['x-authentik-username'] as string | undefined;
    const email = request.headers['x-authentik-email'] as string | undefined;
    const uid = request.headers['x-authentik-uid'] as string | undefined;
    const groups = request.headers['x-authentik-groups'] as string | undefined;

    let expiresAt: number | null = null;
    let issuedAt: number | null = null;

    if (jwt) {
      try {
        const payload = JSON.parse(
          Buffer.from(jwt.split('.')[1], 'base64url').toString()
        );
        if (payload.exp) expiresAt = payload.exp;
        if (payload.iat) issuedAt = payload.iat;
      } catch {
        // JWT decode failed
      }
    }

    return {
      authenticated: !!username,
      username: username || null,
      email: email || null,
      uid: uid || null,
      groups: groups ? groups.split('|') : [],
      issuedAt,
      expiresAt,
      authProvider: 'authentik',
      logoutUrl: '/outpost.goauthentik.io/sign_out',
    };
  });

  // Read Claude CLI auth status from file written by host-side watchdog
  // The dashboard runs in Docker and cannot access the host's Claude CLI or Keychain.
  // Instead, the dispatcher-watchdog (running on the host via launchd) checks auth
  // every 15 minutes and writes status to .claude/data/claude-auth-status.json,
  // which is volume-mounted into the container.
  app.get('/api/auth/claude-status', async () => {
    const statusPath = join(
      process.env.WORKSPACE_DIR || '/workspace',
      '.claude/data/claude-auth-status.json'
    );

    try {
      const raw = await readFile(statusPath, 'utf-8');
      const data = JSON.parse(raw);
      return {
        ...data,
        source: 'host-watchdog',
        staleMinutes: data.checkedAt
          ? Math.round((Date.now() / 1000 - data.checkedAt) / 60)
          : null,
      };
    } catch {
      return {
        status: 'unknown',
        version: null,
        error: 'Status file not found — watchdog may not have run yet',
        source: 'host-watchdog',
        staleMinutes: null,
      };
    }
  });
}
