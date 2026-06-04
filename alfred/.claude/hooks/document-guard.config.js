/**
 * Document Guard Configuration
 *
 * Defines protection rules for files in AIProjects.
 * Rules are matched by glob pattern, most specific wins.
 *
 * Tiers:
 *   critical - Block all violations, override requires user approval
 *   high     - Block all violations, override requires user approval
 *   medium   - Warn but allow (injected into context)
 *   low      - Log only
 *
 * Created: 2026-02-08
 * Version: 2.0.0
 */

module.exports = {

  // --- Settings ---
  settings: {
    enabled: true,              // Master kill switch (also: DOCUMENT_GUARD_ENABLED env var)
    v1: {
      enabled: true,            // All V1 structural checks
      credentialScan: true,     // Credential pattern detection
      structuralChecks: true,   // section/heading/key/frontmatter/shebang
    },
    v2: {
      enabled: true,            // Semantic checks (enabled)
      ollamaUrl: 'http://localhost:11434',
      model: 'qwen2.5:7b-instruct',
      timeout: 5000,            // Hard timeout in ms
      minContentLength: 50,     // Skip semantic check for tiny edits
    },
    failMode: 'closed',         // 'open' = allow on hook error, 'closed' = block on error. Changed from 'open' 2026-04-07 per incident response — silent fail-open is a landmine. Emergency kill switch: DOCUMENT_GUARD_ENABLED=false env var.
    overrideTTL: 120,            // seconds before override expires
    maxViolationsShown: 5,       // limit violations in block message
  },

  // --- General Rules (checked for ALL edited files) ---
  general: [
    {
      name: 'credential_scan',
      check: 'credential_scan',
      action: 'block',
    },
  ],

  // --- Path Rules (matched by glob pattern) ---
  // Order doesn't matter - most specific pattern wins.
  // If multiple patterns match equally, all their checks run.
  rules: [

    // ===== CRITICAL TIER =====

    {
      name: 'Credential files - total block',
      pattern: '.credentials/**',
      tier: 'critical',
      checks: ['no_write_allowed'],
      message: 'Credential files cannot be modified by Claude. Edit these manually.',
    },
    {
      name: 'Root .env - total block',
      pattern: '.env',
      tier: 'critical',
      checks: ['no_write_allowed'],
      message: 'Root .env file cannot be modified by Claude. Edit manually.',
    },
    {
      name: 'External .env files - total block',
      pattern: '**/.env',
      tier: 'critical',
      checks: ['no_write_allowed'],
      message: '.env files cannot be modified by Claude.',
    },
    {
      name: 'Paths registry - protect structure',
      pattern: 'paths-registry.yaml',
      tier: 'critical',
      checks: ['key_deletion_protection', 'semantic_relevance'],
      purpose: 'Central registry mapping logical names to filesystem paths',
    },
    {
      name: 'Main settings - protect permissions',
      pattern: '.claude/settings.json',
      tier: 'critical',
      checks: ['key_deletion_protection'],
    },
    {
      name: 'Beads config - protect conventions',
      pattern: '.beads/config.yaml',
      tier: 'critical',
      checks: ['key_deletion_protection'],
    },
    {
      name: 'Feature registry - protect structure',
      pattern: '.claude/config/feature-registry.yaml',
      tier: 'critical',
      checks: ['key_deletion_protection'],
    },
    {
      name: 'CLAUDE.md - protect structure',
      pattern: '.claude/CLAUDE.md',
      tier: 'critical',
      checks: ['section_preservation', 'heading_structure', 'semantic_relevance'],
      purpose: 'Central project instructions and operating procedures for Claude Code',
    },
    {
      name: 'Nexus registry - protect job definitions',
      pattern: '.claude/jobs/registry.yaml',
      tier: 'critical',
      checks: ['key_deletion_protection', 'semantic_relevance'],
      purpose: 'Master job registry — defines all Nexus scheduled jobs, budgets, and gates',
    },
    {
      name: 'AI David permissions - protect security boundary',
      pattern: '.claude/jobs/personas/ai-david/permissions.yaml',
      tier: 'critical',
      checks: ['key_deletion_protection'],
      message: 'AI David permissions control autonomous agent capabilities. Edits require careful review.',
    },
    {
      name: 'AI David config - protect budget and engine',
      pattern: '.claude/jobs/personas/ai-david/config.yaml',
      tier: 'critical',
      checks: ['key_deletion_protection'],
      message: 'AI David config controls budget, engine, and timeouts. Wrong values = runaway costs.',
    },
    {
      name: 'Safety rules - protect approval gates',
      pattern: '.claude/jobs/rules/safety.yaml',
      tier: 'critical',
      checks: ['key_deletion_protection', 'section_preservation'],
      purpose: 'Safety gates and approval requirements for autonomous task execution',
    },
    {
      name: 'Credential governance - protect policies',
      pattern: '.claude/registries/credential-governance.yaml',
      tier: 'critical',
      checks: ['key_deletion_protection', 'section_preservation'],
      purpose: 'Credential scope authorization policies — weakening these removes security boundaries',
    },
    {
      name: 'Credential inventory - protect catalog',
      pattern: '.claude/context/systems/credential-inventory.yaml',
      tier: 'critical',
      checks: ['key_deletion_protection', 'section_preservation'],
      purpose: 'Catalog of every credential in the homelab — silent edits could hide tampering',
      message: 'credential-inventory.yaml is the source of truth for what credentials exist and where. Edits require explicit review.',
    },
    {
      name: 'Credential guard config - no direct writes',
      pattern: '.claude/hooks/credential-guard.config.js',
      tier: 'critical',
      checks: ['no_write_allowed'],
      message: 'Credential guard config is synced from credential-governance.yaml. Edit the YAML first.',
    },

    // ===== HIGH TIER =====

    {
      name: 'Index files - protect navigation',
      pattern: '**/_index.md',
      tier: 'high',
      checks: ['section_preservation', 'heading_structure'],
    },
    {
      name: 'Session state - protect sections',
      pattern: '.claude/context/session-state.md',
      tier: 'high',
      checks: ['section_preservation'],
      protectedSections: ['Current Work Status', 'Task Management'],
    },
    {
      name: 'Compaction essentials - protect structure',
      pattern: '.claude/context/compaction-essentials.md',
      tier: 'high',
      checks: ['section_preservation', 'heading_structure'],
    },
    {
      name: 'Hooks - protect shebang and structure',
      pattern: '.claude/hooks/*.js',
      tier: 'high',
      checks: ['shebang_preservation'],
    },
    {
      name: 'Skills - protect frontmatter identity',
      pattern: '.claude/skills/*/SKILL.md',
      tier: 'high',
      checks: ['frontmatter_preservation'],
      lockedFields: ['name', 'created', 'category'],
    },
    {
      name: 'Commands - protect frontmatter routing',
      pattern: '.claude/commands/*.md',
      tier: 'high',
      checks: ['frontmatter_preservation'],
      lockedFields: ['skill'],
    },
    {
      name: 'Orchestration files - protect structure',
      pattern: '.claude/orchestration/*.yaml',
      tier: 'high',
      checks: ['key_deletion_protection'],
    },
    {
      name: 'Standards - protect definitions',
      pattern: '.claude/context/standards/*.md',
      tier: 'high',
      checks: ['section_preservation', 'semantic_relevance'],
      purpose: 'Canonical definitions for severity, status, and terminology standards',
    },
    {
      name: 'Patterns - protect structure',
      pattern: '.claude/context/patterns/*.md',
      tier: 'high',
      checks: ['section_preservation', 'semantic_relevance'],
      purpose: 'Reusable architectural patterns and decision frameworks',
    },
    {
      name: 'AI David prompt - protect decision logic',
      pattern: '.claude/jobs/personas/ai-david/prompt.md',
      tier: 'high',
      checks: ['section_preservation', 'semantic_relevance'],
      purpose: 'Autonomous decision logic — subtle edits change all AI David behavior',
    },
    {
      name: 'AI David learned patterns - protect feedback loop',
      pattern: '.claude/jobs/personas/ai-david/learned-patterns.yaml',
      tier: 'high',
      checks: ['key_deletion_protection'],
      message: 'Learned patterns are built from user feedback. Accidental wipe = lost learning.',
    },
    {
      name: 'Routing rules - protect dispatch criteria',
      pattern: '.claude/jobs/lib/routing-rules.yaml',
      tier: 'high',
      checks: ['key_deletion_protection'],
      purpose: 'Centralized routing eligibility criteria for task dispatch',
    },
    {
      name: 'Pipeline rules - protect automation gates',
      pattern: '.claude/jobs/rules/*.yaml',
      tier: 'high',
      checks: ['key_deletion_protection'],
      purpose: 'Schema, routing, and quality rules for the task automation pipeline',
    },
    {
      name: 'Nexus dispatcher - protect core scheduler',
      pattern: '.claude/jobs/dispatcher.sh',
      tier: 'high',
      checks: ['shebang_preservation', 'related_files'],
      relatedFiles: ['.claude/context/compaction-essentials.md'],
    },
    {
      name: 'Nexus executor - protect core runner',
      pattern: '.claude/jobs/executor.sh',
      tier: 'high',
      checks: ['shebang_preservation', 'related_files'],
      relatedFiles: ['.claude/context/compaction-essentials.md'],
    },
    {
      name: 'Nexus event watcher - protect pipeline watcher',
      pattern: '.claude/jobs/event-watcher.sh',
      tier: 'high',
      checks: ['shebang_preservation', 'related_files'],
      relatedFiles: ['.claude/context/compaction-essentials.md'],
    },
    {
      name: 'Nexus libraries - protect shared code',
      pattern: '.claude/jobs/lib/*.sh',
      tier: 'high',
      checks: ['shebang_preservation', 'related_files'],
      relatedFiles: ['.claude/context/compaction-essentials.md'],
    },
    {
      name: 'Persona configs - cross-ref compaction essentials',
      pattern: '.claude/jobs/personas/*/config.yaml',
      tier: 'medium',
      checks: ['related_files'],
      relatedFiles: ['.claude/context/compaction-essentials.md'],
    },

    {
      name: 'Nexus sources of truth - protect file registry',
      pattern: '.claude/context/systems/nexus-sources-of-truth.md',
      tier: 'high',
      checks: ['section_preservation', 'heading_structure', 'semantic_relevance'],
      purpose: 'Canonical registry of all authoritative Nexus files — updates require approval to prevent drift',
      message: 'This is the Nexus sources-of-truth registry. Updates must be reviewed — incorrect entries cascade to all validation.',
    },

    {
      name: 'Project context files - protect structure and Evaluator Briefs',
      pattern: 'knowledge/projects/*.md',
      tier: 'medium',  // Medium allows headless context-maintainer edits. Append-only enforced by persona update-rules.yaml + prompt.
      checks: ['section_preservation', 'heading_structure'],
      purpose: 'Project-specific constraints, decisions, and Evaluator Brief data used by task-evaluator for routing. Context-maintainer persona edits Brief sections only (append-only).',
    },

    // ===== MEDIUM TIER =====

    {
      name: 'Scripts - protect shebang',
      pattern: 'Scripts/*.sh',
      tier: 'medium',
      checks: ['shebang_preservation'],
    },
    {
      name: 'Gitignore - protect security patterns',
      pattern: '.gitignore',
      tier: 'medium',
      checks: ['section_preservation'],
    },
    {
      name: 'Nexus state DB - no direct writes',
      pattern: '.claude/jobs/state/nexus.db',
      tier: 'medium',
      checks: ['no_write_allowed'],
      message: 'Nexus SQLite DB is managed by scripts only. Do not edit directly.',
    },
    {
      name: 'Nexus plumbing map - protect architecture reference',
      pattern: '.claude/context/systems/nexus-plumbing-map.md',
      tier: 'medium',
      checks: ['section_preservation', 'semantic_relevance'],
      purpose: 'Script-level architecture reference — must stay accurate to actual system',
    },
  ],

  // --- Credential Patterns (used by credential_scan check) ---
  credentialPatterns: [
    { name: 'AWS Access Key',     regex: /AKIA[0-9A-Z]{16}/ },
    { name: 'GitHub Token',       regex: /ghp_[a-zA-Z0-9]{36}/ },
    { name: 'GitHub OAuth',       regex: /gho_[a-zA-Z0-9]{36}/ },
    { name: 'Anthropic Key',      regex: /sk-ant-[a-zA-Z0-9\-_]{20,}/ },
    { name: 'OpenAI Key',         regex: /sk-[a-zA-Z0-9]{32,}/ },
    { name: 'Slack Token',        regex: /xox[bpors]-[a-zA-Z0-9-]+/ },
    { name: 'Stripe Key',        regex: /sk_(?:live|test)_[a-zA-Z0-9]{20,}/ },
    { name: 'Private Key Block',  regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/ },
    { name: 'JWT Token',          regex: /eyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]+/ },
    { name: 'Generic Password',   regex: /(?:password|passwd|pwd)\s*[:=]\s*["'][^"'\s${\n]{8,}["']/i },
    { name: 'Generic API Key',    regex: /(?:api[_-]?key|apikey)\s*[:=]\s*["'][a-zA-Z0-9]{20,}["']/i },
    { name: 'Generic Secret',     regex: /(?:secret|token)\s*[:=]\s*["'][a-zA-Z0-9]{20,}["']/i },
    { name: 'Database URL',       regex: /(?:postgres|mysql|mongodb):\/\/[^:]+:[^@\s]+@/ },
  ],

  // --- Placeholder Patterns (false positive exclusions) ---
  placeholderPatterns: [
    /example/i, /placeholder/i, /your[_-]/i, /test[_-]/i,
    /dummy/i, /fake/i, /mock/i, /sample/i, /todo/i,
    /\$\{/, /\{\{/, /<[A-Z_]+>/, /xxx/i,
  ],

};
