import { readFileSync, writeFileSync, renameSync, appendFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const workspace = process.env.WORKSPACE_DIR || process.cwd();

const home = process.env.WORKSPACE_DIR || process.cwd();
const SETTINGS_PATH =
  process.env.NEXUS_SETTINGS_PATH ||
  resolve(workspace, '.claude/jobs/state/nexus-settings.json');
const AUDIT_PATH =
  process.env.NEXUS_SETTINGS_AUDIT_PATH ||
  resolve(dirname(SETTINGS_PATH), '../../data/nexus-settings-audit.jsonl');

const VALID_RISK_LEVELS = ['risk:safe', 'risk:moderate', 'risk:destructive'] as const;
const VALID_EXECUTORS = ['task-executor', 'task-executor-infra', 'task-research'] as const;

type RiskLevel = (typeof VALID_RISK_LEVELS)[number];
type Executor = (typeof VALID_EXECUTORS)[number];

interface RiskGates {
  auto_execute: RiskLevel[];
  with_approval: RiskLevel[];
  block: RiskLevel[];
}

interface TimingEntry {
  every_hours: number;
}

interface TurboState {
  active: boolean;
  expires_at: string | null;
  mode: 'turbo' | 'turbo+' | null;
  default_timing: Record<Executor, TimingEntry>;
}

interface PipelineRunnerSettings {
  enabled: boolean;
  max_dispatches_per_hour: number;
}

interface TaskReviewerThresholdTier {
  min_confidence: string;
  max_risk: string;
}

interface TaskReviewerThresholds {
  auto_execute: TaskReviewerThresholdTier;
  execute_medium: TaskReviewerThresholdTier;
  propose: TaskReviewerThresholdTier;
  escalate_below: string;
}

export interface JobOverride {
  enabled?: boolean;
  every_hours?: number;
  hour?: number;
  day?: string;
  max_turns?: number;
  max_budget_usd?: number;
  max_daily_budget_usd?: number;
  timeout_minutes?: number;
}

const VALID_AI_PROVIDERS = ['ollama', 'openai'] as const;
type AiProvider = (typeof VALID_AI_PROVIDERS)[number];

export interface AiProviderSettings {
  provider: AiProvider;
  ollama_model: string;
  openai_model: string;
  temperature: number;
}

export interface NexusSettings {
  version: number;
  risk_gates: Record<Executor, RiskGates>;
  timing: Record<Executor, TimingEntry>;
  turbo: TurboState;
  pipeline_runner?: PipelineRunnerSettings;
  task_type_overrides?: Record<string, { gate: string; max_risk: string }>;
  task_reviewer_thresholds?: TaskReviewerThresholds;
  job_overrides?: Record<string, JobOverride>;
  ai_provider?: AiProviderSettings;
  updated_at: string;
  updated_by: string;
}

function defaultSettings(): NexusSettings {
  return {
    version: 1,
    risk_gates: {
      'task-executor': {
        auto_execute: ['risk:safe'],
        with_approval: ['risk:moderate'],
        block: ['risk:destructive'],
      },
      'task-executor-infra': {
        auto_execute: ['risk:safe', 'risk:moderate'],
        with_approval: [],
        block: ['risk:destructive'],
      },
      'task-research': {
        auto_execute: ['risk:safe', 'risk:moderate'],
        with_approval: [],
        block: ['risk:destructive'],
      },
    },
    timing: {
      'task-executor': { every_hours: 2 },
      'task-executor-infra': { every_hours: 1 },
      'task-research': { every_hours: 1 },
    },
    turbo: {
      active: false,
      expires_at: null,
      mode: null,
      default_timing: {
        'task-executor': { every_hours: 8 },
        'task-executor-infra': { every_hours: 24 },
        'task-research': { every_hours: 24 },
      },
    },
    updated_at: '',
    updated_by: '',
  };
}

function validateExecutor(executor: string): asserts executor is Executor {
  if (!VALID_EXECUTORS.includes(executor as Executor)) {
    throw new Error(`Invalid executor: ${executor}. Valid: ${VALID_EXECUTORS.join(', ')}`);
  }
}

function validateRiskLevels(levels: string[]): asserts levels is RiskLevel[] {
  for (const level of levels) {
    if (!VALID_RISK_LEVELS.includes(level as RiskLevel)) {
      throw new Error(`Invalid risk level: ${level}. Valid: ${VALID_RISK_LEVELS.join(', ')}`);
    }
  }
}

function validateTiming(hours: number) {
  if (typeof hours !== 'number' || hours < 0.083 || hours > 168) {
    throw new Error(`Timing must be a number between 0.083 and 168, got: ${hours}`);
  }
}

function enforceDestructiveSafety(gates: RiskGates) {
  if (gates.auto_execute.includes('risk:destructive')) {
    throw new Error('risk:destructive can NEVER be in auto_execute — hardcoded safety floor');
  }
}

function appendAudit(action: string, actor: string, details: Record<string, unknown>) {
  const entry = {
    timestamp: new Date().toISOString(),
    action,
    actor,
    ...details,
  };
  mkdirSync(dirname(AUDIT_PATH), { recursive: true });
  appendFileSync(AUDIT_PATH, JSON.stringify(entry) + '\n');
}

function writeAtomic(settings: NexusSettings) {
  const dir = dirname(SETTINGS_PATH);
  mkdirSync(dir, { recursive: true });
  const tmp = SETTINGS_PATH + '.tmp';
  writeFileSync(tmp, JSON.stringify(settings, null, 2) + '\n');
  renameSync(tmp, SETTINGS_PATH);
}

export function readSettings(): NexusSettings {
  try {
    const raw = readFileSync(SETTINGS_PATH, 'utf-8');
    return JSON.parse(raw) as NexusSettings;
  } catch {
    return defaultSettings();
  }
}

export function writeSettings(settings: NexusSettings, actor: string): NexusSettings {
  // Validate all risk gates
  for (const executor of VALID_EXECUTORS) {
    if (settings.risk_gates[executor]) {
      const gates = settings.risk_gates[executor];
      validateRiskLevels(gates.auto_execute);
      validateRiskLevels(gates.with_approval);
      validateRiskLevels(gates.block);
      enforceDestructiveSafety(gates);
    }
  }

  // Validate all timing
  for (const executor of VALID_EXECUTORS) {
    if (settings.timing[executor]) {
      validateTiming(settings.timing[executor].every_hours);
    }
  }

  settings.updated_at = new Date().toISOString();
  settings.updated_by = actor;

  writeAtomic(settings);
  appendAudit('write_settings', actor, { settings });
  return settings;
}

export function updateRiskGates(
  executor: string,
  gates: { auto_execute: string[]; with_approval: string[]; block: string[] },
  actor: string,
): NexusSettings {
  validateExecutor(executor);
  validateRiskLevels(gates.auto_execute);
  validateRiskLevels(gates.with_approval);
  validateRiskLevels(gates.block);
  enforceDestructiveSafety(gates as RiskGates);

  const settings = readSettings();
  settings.risk_gates[executor as Executor] = gates as RiskGates;
  settings.updated_at = new Date().toISOString();
  settings.updated_by = actor;

  writeAtomic(settings);
  appendAudit('update_risk_gates', actor, { executor, gates });
  return settings;
}

export function updateTiming(executor: string, everyHours: number, actor: string): NexusSettings {
  validateExecutor(executor);
  validateTiming(everyHours);

  const settings = readSettings();
  settings.timing[executor as Executor] = { every_hours: everyHours };
  settings.updated_at = new Date().toISOString();
  settings.updated_by = actor;

  writeAtomic(settings);
  appendAudit('update_timing', actor, { executor, every_hours: everyHours });
  return settings;
}

export function activateTurbo(
  durationHours: number,
  actor: string,
  intervalHours: number = 0.5,
): NexusSettings {
  if (typeof durationHours !== 'number' || durationHours < 0.5 || durationHours > 48) {
    throw new Error(`Turbo duration must be between 0.5 and 48 hours, got: ${durationHours}`);
  }
  if (typeof intervalHours !== 'number' || intervalHours < 0.25 || intervalHours > 8) {
    throw new Error(`Turbo interval must be between 0.25 and 8 hours, got: ${intervalHours}`);
  }

  const settings = readSettings();

  // Capture current timing as default before overriding
  if (!settings.turbo.active) {
    settings.turbo.default_timing = { ...settings.timing } as Record<Executor, TimingEntry>;
  }

  const mode = intervalHours <= 0.25 ? ('turbo+' as const) : ('turbo' as const);

  settings.turbo.active = true;
  settings.turbo.expires_at = new Date(Date.now() + durationHours * 60 * 60 * 1000).toISOString();
  settings.turbo.mode = mode;

  // Set fast intervals
  for (const executor of VALID_EXECUTORS) {
    settings.timing[executor] = { every_hours: intervalHours };
  }

  settings.updated_at = new Date().toISOString();
  settings.updated_by = actor;

  writeAtomic(settings);
  appendAudit('activate_turbo', actor, {
    mode,
    interval_hours: intervalHours,
    duration_hours: durationHours,
    expires_at: settings.turbo.expires_at,
  });
  return settings;
}

export function updatePipelineRunner(
  updates: { enabled?: boolean; max_dispatches_per_hour?: number },
  actor: string,
): NexusSettings {
  const settings = readSettings();

  if (!settings.pipeline_runner) {
    settings.pipeline_runner = { enabled: true, max_dispatches_per_hour: 20 };
  }

  if (updates.enabled !== undefined) {
    settings.pipeline_runner.enabled = updates.enabled;
  }
  if (updates.max_dispatches_per_hour !== undefined) {
    if (
      typeof updates.max_dispatches_per_hour !== 'number' ||
      updates.max_dispatches_per_hour < 1 ||
      updates.max_dispatches_per_hour > 100
    ) {
      throw new Error(
        `max_dispatches_per_hour must be between 1 and 100, got: ${updates.max_dispatches_per_hour}`,
      );
    }
    settings.pipeline_runner.max_dispatches_per_hour = updates.max_dispatches_per_hour;
  }

  settings.updated_at = new Date().toISOString();
  settings.updated_by = actor;

  writeAtomic(settings);
  appendAudit('update_pipeline_runner', actor, updates);
  return settings;
}

export function deactivateTurbo(actor: string): NexusSettings {
  const settings = readSettings();

  if (settings.turbo.default_timing) {
    // Restore saved timing
    for (const executor of VALID_EXECUTORS) {
      if (settings.turbo.default_timing[executor]) {
        settings.timing[executor] = { ...settings.turbo.default_timing[executor] };
      }
    }
  }

  settings.turbo.active = false;
  settings.turbo.expires_at = null;
  settings.turbo.mode = null;
  settings.updated_at = new Date().toISOString();
  settings.updated_by = actor;

  writeAtomic(settings);
  appendAudit('deactivate_turbo', actor, {});
  return settings;
}

// =============================================================================
// Task-Type Gate Overrides
// =============================================================================

const VALID_TASK_TYPES = ['research', 'bug', 'maintenance', 'design', 'feature', 'parent'] as const;
const VALID_GATES = ['auto_execute', 'with_approval', 'block'] as const;

type TaskType = (typeof VALID_TASK_TYPES)[number];
type GateAction = (typeof VALID_GATES)[number];

export function updateTaskTypeOverrides(
  overrides: Record<string, { gate: string; max_risk: string }>,
  actor: string,
): NexusSettings {
  // Validate each override
  for (const [taskType, override] of Object.entries(overrides)) {
    if (!VALID_TASK_TYPES.includes(taskType as TaskType)) {
      throw new Error(`Invalid task type: ${taskType}. Valid: ${VALID_TASK_TYPES.join(', ')}`);
    }
    if (!VALID_GATES.includes(override.gate as GateAction)) {
      throw new Error(
        `Invalid gate for ${taskType}: ${override.gate}. Valid: ${VALID_GATES.join(', ')}`,
      );
    }
    if (!VALID_RISK_LEVELS.includes(override.max_risk as RiskLevel)) {
      throw new Error(
        `Invalid max_risk for ${taskType}: ${override.max_risk}. Valid: ${VALID_RISK_LEVELS.join(', ')}`,
      );
    }
    // Safety floor: destructive can never be auto_execute
    if (override.gate === 'auto_execute' && override.max_risk === 'risk:destructive') {
      throw new Error(
        `Cannot set auto_execute with max_risk risk:destructive for ${taskType} — safety floor`,
      );
    }
  }

  const settings = readSettings();
  settings.task_type_overrides = overrides;
  settings.updated_at = new Date().toISOString();
  settings.updated_by = actor;

  writeAtomic(settings);
  appendAudit('update_task_type_overrides', actor, { overrides });
  return settings;
}

// =============================================================================
// AI David Confidence Thresholds
// =============================================================================

const VALID_CONFIDENCE = ['high', 'medium', 'low'] as const;
type ConfidenceLevel = (typeof VALID_CONFIDENCE)[number];

function validateConfidence(level: string): asserts level is ConfidenceLevel {
  if (!VALID_CONFIDENCE.includes(level as ConfidenceLevel)) {
    throw new Error(`Invalid confidence level: ${level}. Valid: ${VALID_CONFIDENCE.join(', ')}`);
  }
}

export function updateTaskReviewerThresholds(
  thresholds: TaskReviewerThresholds,
  actor: string,
): NexusSettings {
  // Validate all confidence levels
  validateConfidence(thresholds.auto_execute.min_confidence);
  validateConfidence(thresholds.execute_medium.min_confidence);
  validateConfidence(thresholds.propose.min_confidence);
  validateConfidence(thresholds.escalate_below);

  // Validate risk levels (allow "any" as a special value)
  for (const tier of [thresholds.auto_execute, thresholds.execute_medium, thresholds.propose]) {
    if (tier.max_risk !== 'any' && !VALID_RISK_LEVELS.includes(tier.max_risk as RiskLevel)) {
      throw new Error(
        `Invalid max_risk: ${tier.max_risk}. Valid: ${VALID_RISK_LEVELS.join(', ')}, any`,
      );
    }
  }

  const settings = readSettings();
  settings.task_reviewer_thresholds = thresholds;
  settings.updated_at = new Date().toISOString();
  settings.updated_by = actor;

  writeAtomic(settings);
  appendAudit('update_task_reviewer_thresholds', actor, { thresholds });
  return settings;
}

// =============================================================================
// Job Overrides
// =============================================================================

function validateJobOverride(overrides: JobOverride) {
  if (overrides.every_hours !== undefined) {
    validateTiming(overrides.every_hours);
  }
  if (overrides.hour !== undefined) {
    if (typeof overrides.hour !== 'number' || overrides.hour < 0 || overrides.hour > 23) {
      throw new Error(`Hour must be 0-23, got: ${overrides.hour}`);
    }
  }
  if (overrides.day !== undefined) {
    const validDays = [
      'sunday',
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'saturday',
    ];
    if (!validDays.includes(overrides.day)) {
      throw new Error(`Invalid day: ${overrides.day}. Valid: ${validDays.join(', ')}`);
    }
  }
  if (overrides.max_turns !== undefined) {
    if (
      !Number.isInteger(overrides.max_turns) ||
      overrides.max_turns < 1 ||
      overrides.max_turns > 200
    ) {
      throw new Error(`max_turns must be an integer 1-200, got: ${overrides.max_turns}`);
    }
  }
  if (overrides.max_budget_usd !== undefined) {
    if (
      typeof overrides.max_budget_usd !== 'number' ||
      overrides.max_budget_usd < 0.1 ||
      overrides.max_budget_usd > 50
    ) {
      throw new Error(`max_budget_usd must be 0.10-50.00, got: ${overrides.max_budget_usd}`);
    }
  }
  if (overrides.max_daily_budget_usd !== undefined) {
    if (
      typeof overrides.max_daily_budget_usd !== 'number' ||
      overrides.max_daily_budget_usd < 0.1 ||
      overrides.max_daily_budget_usd > 100
    ) {
      throw new Error(
        `max_daily_budget_usd must be 0.10-100.00, got: ${overrides.max_daily_budget_usd}`,
      );
    }
  }
  if (overrides.timeout_minutes !== undefined) {
    if (
      !Number.isInteger(overrides.timeout_minutes) ||
      overrides.timeout_minutes < 1 ||
      overrides.timeout_minutes > 60
    ) {
      throw new Error(`timeout_minutes must be an integer 1-60, got: ${overrides.timeout_minutes}`);
    }
  }
}

export function getJobOverrides(): Record<string, JobOverride> {
  const settings = readSettings();
  return settings.job_overrides ?? {};
}

export function updateJobOverride(
  jobName: string,
  overrides: JobOverride,
  actor: string,
): NexusSettings {
  if (!jobName || typeof jobName !== 'string' || !/^[\w-]+$/.test(jobName)) {
    throw new Error(`Invalid job name: ${jobName}`);
  }
  validateJobOverride(overrides);

  const settings = readSettings();
  if (!settings.job_overrides) {
    settings.job_overrides = {};
  }

  settings.job_overrides[jobName] = {
    ...settings.job_overrides[jobName],
    ...overrides,
  };

  settings.updated_at = new Date().toISOString();
  settings.updated_by = actor;

  writeAtomic(settings);
  appendAudit('update_job_override', actor, { jobName, overrides });
  return settings;
}

export function deleteJobOverride(jobName: string, actor: string): NexusSettings {
  const settings = readSettings();
  if (settings.job_overrides?.[jobName]) {
    delete settings.job_overrides[jobName];
  }

  settings.updated_at = new Date().toISOString();
  settings.updated_by = actor;

  writeAtomic(settings);
  appendAudit('delete_job_override', actor, { jobName });
  return settings;
}

// =============================================================================
// AI Provider Settings
// =============================================================================

export function updateAiProvider(
  updates: Partial<AiProviderSettings>,
  actor: string,
): NexusSettings {
  const settings = readSettings();

  if (!settings.ai_provider) {
    settings.ai_provider = {
      provider: 'ollama',
      ollama_model: process.env.OLLAMA_MODEL || 'qwen2.5:32b',
      openai_model: 'gpt-4o-mini',
      temperature: 0.3,
    };
  }

  if (updates.provider !== undefined) {
    if (!VALID_AI_PROVIDERS.includes(updates.provider as AiProvider)) {
      throw new Error(
        `Invalid provider: ${updates.provider}. Valid: ${VALID_AI_PROVIDERS.join(', ')}`,
      );
    }
    settings.ai_provider.provider = updates.provider as AiProvider;
  }
  if (updates.ollama_model !== undefined) {
    if (!updates.ollama_model.trim()) throw new Error('Model name cannot be empty');
    settings.ai_provider.ollama_model = updates.ollama_model.trim();
  }
  if (updates.openai_model !== undefined) {
    if (!updates.openai_model.trim()) throw new Error('Model name cannot be empty');
    settings.ai_provider.openai_model = updates.openai_model.trim();
  }
  if (updates.temperature !== undefined) {
    if (
      typeof updates.temperature !== 'number' ||
      updates.temperature < 0 ||
      updates.temperature > 1
    ) {
      throw new Error(`Temperature must be between 0 and 1, got: ${updates.temperature}`);
    }
    settings.ai_provider.temperature = updates.temperature;
  }

  settings.updated_at = new Date().toISOString();
  settings.updated_by = actor;

  writeAtomic(settings);
  appendAudit('update_ai_provider', actor, updates);
  return settings;
}
