-- Phase 1.1 seed — bootstrap pulse.persona_metadata for the 32 registered personas.
--
-- Authored 2026-05-13. Until the pulse container has the personas/ filesystem volume
-- mounted (Phase 1.2 deployment step), this one-shot seed populates persona_metadata
-- so the new Phase 1.1 endpoints (GET /api/v1/personas, /persona-graph, etc.) return
-- real data for smoke-testing.
--
-- Tier classification per design §3 (LOCKED per Sir Q1 2026-05-12):
--   Tier A (4): autofix-executor, task-investigator, team-verdict, pipeline-reviewer
--   Tier B (2): cortex, context-maintainer
--   Tier C (1): librarian
--   Tier D (25): everything else (Engineering / Quality / Research / Creative / Planner)
--
-- Idempotent via ON CONFLICT (name) DO NOTHING — safe to re-run.
--
-- Run with:
--   docker exec -i aifred-dev-postgres psql -U pulse_dev -d pulse_dev \
--     < pulse/migrations/seed-persona-metadata-2026-05-13.sql

INSERT INTO pulse.persona_metadata (name, tier, cluster, status, owner, schema_version) VALUES
  -- Tier A — Pipeline-locked (Group 1)
  ('autofix-executor',     'A', NULL,         'active', 'system', 2),
  ('task-investigator',    'A', NULL,         'active', 'system', 2),
  ('team-verdict',         'A', NULL,         'active', 'system', 2),
  ('pipeline-reviewer',    'A', NULL,         'active', 'system', 2),
  -- Tier B — System-locked (Group 1)
  ('cortex',               'B', NULL,         'active', 'system', 2),
  ('context-maintainer',   'B', NULL,         'active', 'system', 2),
  -- Tier C — Job-specific recurring non-internal (Group 2)
  ('librarian',            'C', 'Research',   'active', 'system', 2),
  -- Tier D — Engineering cluster
  ('content-writer',          'D', 'Engineering', 'active', 'system', 2),
  ('infrastructure-deployer', 'D', 'Engineering', 'active', 'system', 2),
  ('test-writer',             'D', 'Engineering', 'active', 'system', 2),
  ('backend-eng',             'D', 'Engineering', 'active', 'system', 2),
  ('db-eng',                  'D', 'Engineering', 'active', 'system', 2),
  ('ux-eng',                  'D', 'Engineering', 'active', 'system', 2),
  -- Tier D — Quality cluster
  ('test-reviewer',           'D', 'Quality',     'active', 'system', 2),
  ('test-researcher',         'D', 'Quality',     'active', 'system', 2),
  ('security-reviewer',       'D', 'Quality',     'active', 'system', 2),
  ('bug-fixer',               'D', 'Quality',     'active', 'system', 2),
  ('troubleshooter',          'D', 'Quality',     'active', 'system', 2),
  ('ai-reviewer',             'D', 'Quality',     'active', 'system', 2),
  -- Tier D — Research cluster
  ('analyst',                 'D', 'Research',    'active', 'system', 2),
  ('researcher',              'D', 'Research',    'active', 'system', 2),
  ('researcher-readonly',     'D', 'Research',    'active', 'system', 2),
  ('skill-experimenter',      'D', 'Research',    'active', 'system', 2),
  ('investigator',            'D', 'Research',    'active', 'system', 2),
  -- Tier D — Creative cluster
  ('creative-action',         'D', 'Creative',    'active', 'system', 2),
  ('aurora-feedback',         'D', 'Creative',    'active', 'system', 2),
  ('creative-thinker',        'D', 'Creative',    'active', 'system', 2),
  ('creative-builder',        'D', 'Creative',    'active', 'system', 2),
  ('creative-presenter',      'D', 'Creative',    'active', 'system', 2),
  -- Tier D — Planner cluster
  ('orchestrator',            'D', 'Planner',     'active', 'system', 2),
  ('project-manager',         'D', 'Planner',     'active', 'system', 2),
  ('task-evaluator',          'D', 'Planner',     'active', 'system', 2)
ON CONFLICT (name) DO NOTHING;

-- Verify row count
DO $$
DECLARE
    row_count INT;
BEGIN
    SELECT COUNT(*) INTO row_count FROM pulse.persona_metadata WHERE status != 'soft_deleted';
    RAISE NOTICE 'pulse.persona_metadata now has % active personas (expected 32)', row_count;
END $$;
