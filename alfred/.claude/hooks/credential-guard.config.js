/**
 * Credential Guard Configuration (Runtime)
 *
 * JS runtime export of credential governance policies.
 * Canonical source: .claude/registries/credential-governance.yaml
 * Keep this file in sync with the YAML — this exists for runtime
 * performance (no YAML parsing dependency).
 *
 * Document Guard: critical tier — no_write_allowed
 * (Edits must go through the YAML first, then sync here)
 *
 * Created: 2026-03-18
 * Version: 1.0.0
 */

const path = require('path');
const HOME = process.env.HOME || 'process.env.HOME';

// Expand ~ in paths to absolute
function expandHome(p) {
  if (p.startsWith('~/')) return path.join(HOME, p.slice(2));
  return p;
}

module.exports = {

  // --- Settings ---
  settings: {
    enabled: true,
    failMode: 'closed',         // errors → block. Changed from 'open' 2026-04-07 per incident response.
    overrideTTL: 120,           // seconds
    auditLog: true,
  },

  // --- Defaults ---
  defaults: {
    risk_tier: 'standard',
    escalation: {
      interactive: 'warn-confirm',
      headless: 'pulse-task',
    },
  },

  // --- Policies ---
  // Each policy: { id, riskTier, filePatterns[], variableNames[], allowedConsumers[], allowedPersonas[], escalation? }
  policies: [

    // ═══ CRITICAL ═══

    {
      id: 'cloudflare-api-token',
      riskTier: 'critical',
      filePatterns: [
        expandHome('~/Docker/mydocker/cloudflare-exporter/.env'),
        expandHome('~/Docker/mydocker/threat-blocklist/.env'),
      ],
      variableNames: ['CF_API_TOKEN', 'CF_TOKEN'],
      allowedConsumers: [],
      allowedPersonas: [],
      escalation: { interactive: 'hard-block', headless: 'telegram' },
    },
    {
      id: 'cloudflare-tunnel-token',
      riskTier: 'critical',
      filePatterns: [
        expandHome('~/Docker/mydocker/teleport/.env'),
      ],
      variableNames: ['TUNNEL_TOKEN'],
      allowedConsumers: [],
      allowedPersonas: [],
      escalation: { interactive: 'hard-block', headless: 'telegram' },
    },
    {
      id: 'anthropic-api-key',
      riskTier: 'critical',
      filePatterns: [
        expandHome('~/.credentials/anthropic-api-key.env'),
        expandHome('~/Code/context-structure-research/.env'),
        expandHome('~/Code/klyx-terminal/.env'),
      ],
      variableNames: ['ANTHROPIC_API_KEY'],
      allowedConsumers: [],
      allowedPersonas: [],
      escalation: { interactive: 'hard-block', headless: 'telegram' },
    },
    {
      id: 'stripe-key',
      riskTier: 'critical',
      filePatterns: [
        expandHome('~/Code/aifred-document-guard/.env'),
      ],
      variableNames: ['STRIPE_KEY'],
      allowedConsumers: [],
      allowedPersonas: [],
      escalation: { interactive: 'hard-block', headless: 'telegram' },
    },
    {
      id: 'authentik-secret-key',
      riskTier: 'critical',
      filePatterns: [
        expandHome('~/Docker/mydocker/authentik/.env'),
      ],
      variableNames: ['AUTHENTIK_SECRET_KEY'],
      allowedConsumers: [],
      allowedPersonas: [],
      escalation: { interactive: 'hard-block', headless: 'telegram' },
    },
    {
      id: 'n8n-encryption-key',
      riskTier: 'critical',
      filePatterns: [
        expandHome('~/Docker/mydocker/n8n/docker-compose.yml'),
      ],
      variableNames: ['N8N_ENCRYPTION_KEY'],
      allowedConsumers: [],
      allowedPersonas: [],
      escalation: { interactive: 'hard-block', headless: 'telegram' },
    },
    {
      id: 'unifi-admin',
      riskTier: 'critical',
      filePatterns: [
        expandHome('~/Docker/mydocker/homepage/config/.env'),
        expandHome('~/Docker/mydocker/threat-blocklist/.env'),
      ],
      variableNames: ['UDM_USERNAME', 'UDM_PASSWORD', 'HOMEPAGE_VAR_UNIFI_USERNAME', 'HOMEPAGE_VAR_UNIFI_PASSWORD'],
      allowedConsumers: [],
      allowedPersonas: [],
      escalation: { interactive: 'hard-block', headless: 'telegram' },
    },
    {
      id: 'ssh-keys',
      riskTier: 'critical',
      filePatterns: [
        expandHome('~/.ssh'),
      ],
      variableNames: [],
      allowedConsumers: [],
      allowedPersonas: [],
      escalation: { interactive: 'hard-block', headless: 'telegram' },
    },

    // ═══ HIGH-RISK ═══

    {
      id: 'openai-api-key',
      riskTier: 'high-risk',
      filePatterns: [
        expandHome('~/.credentials/openai-api-key.env'),
        expandHome('~/Code/aifred-document-guard/.env'),
      ],
      variableNames: ['OPENAI_KEY'],
      allowedConsumers: [],
      allowedPersonas: [],
    },
    {
      id: 'github-pat',
      riskTier: 'high-risk',
      filePatterns: [],
      variableNames: ['GITHUB_TOKEN', 'GH_TOKEN'],
      allowedConsumers: [],
      allowedPersonas: [],
    },
    {
      id: 'telegram-bot-token',
      riskTier: 'high-risk',
      filePatterns: [],
      variableNames: ['TELEGRAM_BOT_TOKEN'],
      allowedConsumers: [
        { pattern: '.claude/jobs/lib/send-telegram.sh', actions: ['read'] },
      ],
      allowedPersonas: [
        { persona: 'ai-david', actions: ['read'] },
        { persona: 'dispatcher', actions: ['read'] },
        { persona: 'executor', actions: ['read'] },
      ],
    },
    {
      id: 'bluehost-ftp',
      riskTier: 'high-risk',
      filePatterns: [
        expandHome('~/.credentials/bluehost-ftp.env'),
        expandHome('~/AIProjects/.credentials/bluehost-ftp.env'),
      ],
      variableNames: ['FTP_USER', 'FTP_PASSWORD'],
      allowedConsumers: [],
      allowedPersonas: [],
    },
    {
      id: 'm365-cisoexpert',
      riskTier: 'high-risk',
      filePatterns: [
        expandHome('~/.secrets/m365-cisoexpert.env'),
      ],
      variableNames: [],
      allowedConsumers: [],
      allowedPersonas: [],
    },
    {
      id: 'authentik-bootstrap-password',
      riskTier: 'high-risk',
      filePatterns: [
        expandHome('~/Docker/mydocker/authentik/.env'),
      ],
      variableNames: ['AUTHENTIK_BOOTSTRAP_PASSWORD'],
      allowedConsumers: [],
      allowedPersonas: [],
    },
    {
      id: 'authentik-automation-token',
      riskTier: 'high-risk',
      filePatterns: [
        expandHome('~/Docker/mydocker/caddy/.env'),
        expandHome('~/Docker/mydocker/homepage/config/.env'),
      ],
      variableNames: ['AUTHENTIK_AUTOMATION_TOKEN', 'HOMEPAGE_VAR_AUTHENTIK_TOKEN', 'HOMEPAGE_VAR_SERVICE_CONTROL_TOKEN'],
      allowedConsumers: [],
      allowedPersonas: [],
    },
    {
      id: 'mcp-bearer-token',
      riskTier: 'high-risk',
      filePatterns: [
        expandHome('~/Docker/mydocker/caddy/.env'),
      ],
      variableNames: ['MCP_BEARER_TOKEN'],
      allowedConsumers: [],
      allowedPersonas: [],
    },
    {
      id: 'teleport-join-token',
      riskTier: 'high-risk',
      filePatterns: [
        expandHome('~/Docker/mydocker/teleport/.env'),
      ],
      variableNames: ['TELEPORT_JOIN_TOKEN'],
      allowedConsumers: [],
      allowedPersonas: [],
    },
    {
      id: 'authentik-postgres-password',
      riskTier: 'high-risk',
      filePatterns: [
        expandHome('~/Docker/mydocker/authentik/.env'),
      ],
      variableNames: ['PG_PASS'],
      allowedConsumers: [],
      allowedPersonas: [],
    },
    {
      id: 'n8n-postgres-password',
      riskTier: 'high-risk',
      filePatterns: [
        expandHome('~/Docker/mydocker/n8n/docker-compose.yml'),
      ],
      variableNames: ['DB_POSTGRESDB_PASSWORD'],
      allowedConsumers: [],
      allowedPersonas: [],
    },
    {
      id: 'supabase-grc-passwords',
      riskTier: 'high-risk',
      filePatterns: [
        expandHome('~/Docker/mydocker/grc-platform/.env'),
        expandHome('~/Code/grc-platform/frontend/.env.local'),
        expandHome('~/Code/grc-platform/scripts/neo4j-sync/.env'),
      ],
      variableNames: ['NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'],
      allowedConsumers: [],
      allowedPersonas: [],
    },
    {
      id: 'adguard-admin',
      riskTier: 'high-risk',
      filePatterns: [
        expandHome('~/Docker/mydocker/homepage/config/.env'),
      ],
      variableNames: ['HOMEPAGE_VAR_ADGUARD_USERNAME', 'HOMEPAGE_VAR_ADGUARD_PASSWORD'],
      allowedConsumers: [],
      allowedPersonas: [],
    },
    {
      id: 'home-assistant-token',
      riskTier: 'high-risk',
      filePatterns: [
        expandHome('~/Docker/mydocker/homepage/config/.env'),
      ],
      variableNames: ['HOMEPAGE_VAR_HASS_TOKEN'],
      allowedConsumers: [],
      allowedPersonas: [],
    },
    {
      id: 'docker-control-api-token',
      riskTier: 'high-risk',
      filePatterns: [
        expandHome('~/Docker/mydocker/docker-control-api/docker-compose.yml'),
      ],
      variableNames: ['AUTH_TOKEN'],
      allowedConsumers: [],
      allowedPersonas: [],
    },
    {
      id: 'n8n-basic-auth',
      riskTier: 'high-risk',
      filePatterns: [
        expandHome('~/Docker/mydocker/n8n/docker-compose.yml'),
      ],
      variableNames: ['N8N_BASIC_AUTH_USER', 'N8N_BASIC_AUTH_PASSWORD'],
      allowedConsumers: [],
      allowedPersonas: [],
    },
    {
      id: 'sumo-logic-credentials',
      riskTier: 'high-risk',
      filePatterns: [
        expandHome('~/Code/security-researcher/.env'),
      ],
      variableNames: ['SUMO_ACCESS_ID', 'SUMO_ACCESS_KEY'],
      allowedConsumers: [],
      allowedPersonas: [],
    },

    // ═══ Google Token Vault (added 2026-04-07 post-incident) ═══
    // Sync source: .claude/registries/credential-governance.yaml (vault-* policies)

    {
      id: 'vault-google-client-secret',
      riskTier: 'critical',
      filePatterns: [
        expandHome('~/Code/google-token-vault/.env'),
      ],
      variableNames: ['VAULT_GOOGLE_CLIENT_SECRET'],
      allowedConsumers: [],
      allowedPersonas: [],
      escalation: { interactive: 'hard-block', headless: 'telegram' },
    },
    {
      id: 'vault-encryption-key',
      riskTier: 'critical',
      filePatterns: [
        expandHome('~/Code/google-token-vault/.env'),
      ],
      variableNames: ['VAULT_ENCRYPTION_KEY'],
      allowedConsumers: [],
      allowedPersonas: [],
      escalation: { interactive: 'hard-block', headless: 'telegram' },
    },
    {
      id: 'vault-nexus-token',
      riskTier: 'high-risk',
      filePatterns: [
        expandHome('~/Code/google-token-vault/.env'),
      ],
      variableNames: ['VAULT_NEXUS_TOKEN'],
      allowedConsumers: [
        { pattern: '.claude/jobs/lib/google-api.sh', actions: ['read'] },
      ],
      allowedPersonas: [],
    },
    {
      id: 'vault-mcp-token',
      riskTier: 'high-risk',
      filePatterns: [
        expandHome('~/Code/google-token-vault/.env'),
        expandHome('~/.config/systemd/user/homelab-mcp.service'),
      ],
      variableNames: ['VAULT_MCP_TOKEN'],
      allowedConsumers: [],
      allowedPersonas: [],
    },
    {
      id: 'vault-n8n-token',
      riskTier: 'high-risk',
      filePatterns: [
        expandHome('~/Code/google-token-vault/.env'),
      ],
      variableNames: ['VAULT_N8N_TOKEN'],
      allowedConsumers: [],
      allowedPersonas: [],
    },
  ],
};
