import type { FastifyInstance } from 'fastify';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { config } from '../config.js';

const require = createRequire(import.meta.url);

interface RawRule {
  name: string;
  pattern: string;
  tier: string;
  checks: string[];
  message?: string;
  purpose?: string;
  protectedSections?: string[];
  protectedKeys?: string[];
  lockedFields?: string[];
}

interface RawCredentialPattern {
  name: string;
  regex: RegExp;
}

interface RawConfig {
  settings: Record<string, unknown>;
  general: { name: string; check: string; action: string }[];
  rules: RawRule[];
  credentialPatterns: RawCredentialPattern[];
  placeholderPatterns: RegExp[];
}

const PROJECT_RULES: [string, string][] = [
  ['.claude/jobs/', 'Nexus'],
  ['.claude/context/systems/nexus', 'Nexus'],
  ['.beads/', 'Pulse'],
  ['.credentials/', 'Security'],
  ['.env', 'Security'],
  ['credential-governance', 'Security'],
  ['credential-guard', 'Security'],
  ['knowledge/projects/loom', 'Loom'],
  ['.claude/', 'Core'],
];

function deriveProject(filePath: string): string {
  const normalized = filePath.replace(/^\.\//, '');
  for (const [prefix, project] of PROJECT_RULES) {
    if (normalized.startsWith(prefix) || normalized.includes(prefix)) {
      return project;
    }
  }
  return 'Other';
}

function loadConfig(): RawConfig | null {
  const configPath = config.documentGuardConfigPath;
  if (!existsSync(configPath)) return null;
  try {
    // Cache-bust to pick up changes
    delete require.cache[require.resolve(configPath)];
    return require(configPath) as RawConfig;
  } catch {
    return null;
  }
}

function readAuditLog(
  limit: number,
  actionFilter?: string,
  projectFilter?: string,
): { entries: unknown[]; total: number } {
  const logPath = config.documentGuardLogPath;
  if (!existsSync(logPath)) return { entries: [], total: 0 };

  try {
    const content = readFileSync(logPath, 'utf-8');
    const lines = content.split('\n').filter(Boolean);
    let entries = lines
      .map((line) => {
        try {
          const parsed = JSON.parse(line);
          parsed.project = deriveProject(parsed.file || '');
          return parsed;
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    const total = entries.length;

    if (actionFilter) {
      entries = entries.filter((e: { action?: string }) => e.action === actionFilter);
    }
    if (projectFilter) {
      entries = entries.filter((e: { project?: string }) => e.project === projectFilter);
    }

    // Return most recent first
    entries = entries.reverse().slice(0, limit);

    return { entries, total };
  } catch {
    return { entries: [], total: 0 };
  }
}

export async function documentGuardRoutes(app: FastifyInstance) {
  // GET /api/document-guard/rules
  app.get('/api/document-guard/rules', async (_request, reply) => {
    const cfg = loadConfig();
    if (!cfg) {
      return reply.status(404).send({ error: 'Document Guard config not found' });
    }

    const rules = cfg.rules.map((r) => ({
      name: r.name,
      pattern: r.pattern,
      tier: r.tier,
      checks: r.checks,
      message: r.message,
      purpose: r.purpose,
      protectedSections: r.protectedSections,
      protectedKeys: r.protectedKeys,
      lockedFields: r.lockedFields,
      project: deriveProject(r.pattern),
    }));

    const credentialPatterns = cfg.credentialPatterns.map((p) => ({
      name: p.name,
      pattern: p.regex.source,
    }));

    return {
      settings: cfg.settings,
      general: cfg.general,
      rules,
      credentialPatterns,
    };
  });

  // GET /api/document-guard/log?limit=50&action=blocked
  app.get('/api/document-guard/log', async (request) => {
    const { limit, action, project } = request.query as {
      limit?: string;
      action?: string;
      project?: string;
    };
    const maxEntries = Math.min(parseInt(limit || '50', 10), 500);
    return readAuditLog(maxEntries, action || undefined, project || undefined);
  });

  // GET /api/document-guard/stats
  app.get('/api/document-guard/stats', async () => {
    const cfg = loadConfig();
    const rulesByTier: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0 };

    if (cfg) {
      for (const rule of cfg.rules) {
        rulesByTier[rule.tier] = (rulesByTier[rule.tier] || 0) + 1;
      }
    }

    // Aggregate log stats from last 30 days
    const logPath = config.documentGuardLogPath;
    let blocks = 0;
    let warnings = 0;
    let overrides = 0;
    let lastEvent: string | null = null;

    if (existsSync(logPath)) {
      try {
        const content = readFileSync(logPath, 'utf-8');
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 30);
        const cutoffStr = cutoff.toISOString();

        for (const line of content.split('\n').filter(Boolean)) {
          try {
            const entry = JSON.parse(line);
            if (entry.timestamp && entry.timestamp >= cutoffStr) {
              if (entry.action === 'blocked') blocks++;
              else if (entry.action === 'warned') warnings++;
              else if (entry.action === 'override_used') overrides++;
            }
            if (!lastEvent || (entry.timestamp && entry.timestamp > lastEvent)) {
              lastEvent = entry.timestamp;
            }
          } catch {
            // skip malformed
          }
        }
      } catch {
        // log unreadable
      }
    }

    return {
      enabled: cfg?.settings?.enabled ?? false,
      failMode: (cfg?.settings as Record<string, unknown>)?.failMode ?? 'unknown',
      rulesByTier,
      totalRules: cfg?.rules?.length ?? 0,
      logStats: { blocks, warnings, overrides, total: blocks + warnings + overrides, lastEvent },
    };
  });
}
