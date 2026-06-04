/**
 * pulsars.ts — Service for reading and managing Pulsar definitions
 *
 * Reads pulsars.yaml and state files from the workspace filesystem.
 * Pulsars are scheduled task emitters — gates, recurring research, monitors.
 */

import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import yaml from 'js-yaml';
import { config } from '../config.js';

const workspace = process.env.WORKSPACE_DIR || process.cwd();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PulsarSchedule {
  type: 'daily' | 'weekly' | 'interval';
  hour?: number;
  day?: string;
  every_hours?: number;
}

export interface PulsarState {
  last_run: string;
  gate_fired?: string;
  gate_met_at?: string;
  last_task_id?: string;
  last_task_created?: string;
}

export interface KnowledgeEntry {
  date: string;
  task_id: string;
  title: string;
  summary: string;
}

export interface PulsarKnowledge {
  hasKnowledge: boolean;
  knowledgeCarryForward: boolean;
  runCount: number;
  latestFindings: string | null;
  runs: KnowledgeEntry[];
}

export interface ExternalService {
  name: string;
  endpoint: string;
  job: string;
  headless_job?: string;
  recipient?: string;
  sender?: string;
}

export interface PulsarDefinition {
  name: string;
  type: 'gate' | 'recurring' | 'monitor' | 'external';
  description: string;
  schedule: PulsarSchedule;
  scheduleLabel: string;
  enabled: boolean;
  state: PulsarState;
  status: 'watching' | 'fired' | 'active' | 'disabled' | 'external';
  taskTemplate: {
    title: string;
    priority: number;
    labels: string[];
  };
  knowledge: PulsarKnowledge;
  externalService?: ExternalService;
}

export interface PulsarsResponse {
  pulsars: PulsarDefinition[];
  summary: {
    total: number;
    enabled: number;
    watching: number;
    fired: number;
    byType: { gate: number; recurring: number; monitor: number };
  };
}

// ---------------------------------------------------------------------------
// YAML Parser
// ---------------------------------------------------------------------------

interface RawTaskTemplate {
  title: string;
  priority: number;
  labels: string[];
  description?: string;
  description_template?: string;
}

interface RawPulsar {
  type: string;
  description: string;
  schedule: { type: string; hour?: number; day?: string; every_hours?: number };
  enabled: boolean;
  condition?: { type: string; command?: string };
  on_condition_met?: { action?: string; task_template?: RawTaskTemplate };
  on_failure_only?: { task_template?: RawTaskTemplate };
  on_schedule?: { task_template?: RawTaskTemplate };
  knowledge_store?: string;
  knowledge_carry_forward?: boolean;
  external_service?: ExternalService;
}

interface PulsarsYaml {
  pulsars: Record<string, RawPulsar>;
}

function parsePulsarsYaml(): Record<string, RawPulsar> {
  if (!existsSync(config.pulsarsFilePath)) return {};

  try {
    const content = readFileSync(config.pulsarsFilePath, 'utf-8');
    const parsed = yaml.load(content) as PulsarsYaml;
    return parsed?.pulsars || {};
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// State Reading
// ---------------------------------------------------------------------------

function readPulsarState(name: string): PulsarState {
  const stateFile = resolve(config.pulsarStatePath, `${name}.json`);
  if (!existsSync(stateFile)) {
    return { last_run: '0' };
  }
  try {
    return JSON.parse(readFileSync(stateFile, 'utf-8'));
  } catch {
    return { last_run: '0' };
  }
}

function computeStatus(raw: RawPulsar, state: PulsarState): PulsarDefinition['status'] {
  if (!raw.enabled) return 'disabled';
  if (raw.type === 'external') return 'external';
  if (raw.type === 'gate') {
    return state.gate_fired === 'true' ? 'fired' : 'watching';
  }
  return raw.type === 'monitor' ? 'watching' : 'active';
}

function getTaskTemplate(raw: RawPulsar): PulsarDefinition['taskTemplate'] {
  const tpl =
    raw.on_condition_met?.task_template ||
    raw.on_failure_only?.task_template ||
    raw.on_schedule?.task_template;

  return {
    title: tpl?.title || '(no template)',
    priority: tpl?.priority ?? 2,
    labels: tpl?.labels || [],
  };
}

function formatSchedule(sched: RawPulsar['schedule']): string {
  if (!sched) return 'unknown';
  switch (sched.type) {
    case 'daily':
      return `Daily @ ${sched.hour ?? 0}:00`;
    case 'weekly': {
      const day = sched.day || 'sunday';
      return `${day.charAt(0).toUpperCase()}${day.slice(1)} @ ${sched.hour ?? 0}:00`;
    }
    case 'interval':
      return `Every ${sched.every_hours}h`;
    default:
      return sched.type;
  }
}

// ---------------------------------------------------------------------------
// Knowledge Reading
// ---------------------------------------------------------------------------

function getKnowledgeStore(raw: RawPulsar, name: string): string {
  return raw.knowledge_store || name;
}

function readKnowledge(raw: RawPulsar, name: string): PulsarKnowledge {
  const store = getKnowledgeStore(raw, name);
  const kdir = resolve(config.pulsarKnowledgePath, store);
  const runsFile = resolve(kdir, 'runs.jsonl');
  const findingsFile = resolve(kdir, 'latest-findings.md');
  const hasCarryForward = raw.knowledge_carry_forward === true;

  if (!existsSync(kdir)) {
    return {
      hasKnowledge: false,
      knowledgeCarryForward: hasCarryForward,
      runCount: 0,
      latestFindings: null,
      runs: [],
    };
  }

  let runs: KnowledgeEntry[] = [];
  if (existsSync(runsFile)) {
    try {
      const lines = readFileSync(runsFile, 'utf-8').trim().split('\n').filter(Boolean);
      runs = lines
        .map((line) => {
          try {
            return JSON.parse(line);
          } catch {
            return null;
          }
        })
        .filter(Boolean) as KnowledgeEntry[];
    } catch {
      /* empty */
    }
  }

  let latestFindings: string | null = null;
  if (existsSync(findingsFile)) {
    try {
      latestFindings = readFileSync(findingsFile, 'utf-8');
    } catch {
      /* empty */
    }
  }

  return {
    hasKnowledge: runs.length > 0,
    knowledgeCarryForward: hasCarryForward,
    runCount: runs.length,
    latestFindings,
    runs: runs.slice(-10), // Last 10 entries for the dashboard
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function getAllPulsars(): PulsarsResponse {
  const raw = parsePulsarsYaml();
  const pulsars: PulsarDefinition[] = [];

  for (const [name, def] of Object.entries(raw)) {
    const state = readPulsarState(name);
    const status = computeStatus(def, state);

    pulsars.push({
      name,
      type: def.type as PulsarDefinition['type'],
      description: def.description || '',
      schedule: {
        type: def.schedule?.type as PulsarSchedule['type'],
        hour: def.schedule?.hour,
        day: def.schedule?.day,
        every_hours: def.schedule?.every_hours,
      },
      scheduleLabel: formatSchedule(def.schedule),
      enabled: def.enabled !== false,
      state: {
        last_run: state.last_run || '0',
        gate_fired: state.gate_fired,
        gate_met_at: state.gate_met_at,
        last_task_id: state.last_task_id,
        last_task_created: state.last_task_created,
      },
      status,
      taskTemplate: getTaskTemplate(def),
      knowledge: readKnowledge(def, name),
      externalService: def.external_service,
    });
  }

  const summary = {
    total: pulsars.length,
    enabled: pulsars.filter((p) => p.enabled).length,
    watching: pulsars.filter((p) => p.status === 'watching').length,
    fired: pulsars.filter((p) => p.status === 'fired').length,
    byType: {
      gate: pulsars.filter((p) => p.type === 'gate').length,
      recurring: pulsars.filter((p) => p.type === 'recurring').length,
      monitor: pulsars.filter((p) => p.type === 'monitor').length,
    },
  };

  return { pulsars, summary };
}

export function togglePulsar(name: string, enabled: boolean): boolean {
  if (!existsSync(config.pulsarsFilePath)) return false;

  // Use targeted text replacement to preserve comments and formatting
  const content = readFileSync(config.pulsarsFilePath, 'utf-8');
  const lines = content.split('\n');
  let inBlock = false;
  let found = false;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trimStart();
    // Detect the start of this pulsar's block (indented under "pulsars:")
    if (/^\s{2}\S/.test(lines[i]) && trimmed.startsWith(`${name}:`)) {
      inBlock = true;
      continue;
    }
    // Stop at the next pulsar definition (same indent level)
    if (inBlock && /^\s{2}\S/.test(lines[i]) && !trimmed.startsWith('#')) {
      break;
    }
    // Replace the enabled line within this block
    if (inBlock && /^\s+enabled:\s+(true|false)/.test(lines[i])) {
      lines[i] = lines[i].replace(/enabled:\s+(true|false)/, `enabled: ${enabled}`);
      found = true;
      break;
    }
  }

  if (found) {
    writeFileSync(config.pulsarsFilePath, lines.join('\n'));
  }
  return found;
}

export function resetPulsarGate(name: string): void {
  const stateFile = resolve(config.pulsarStatePath, `${name}.json`);
  if (!existsSync(stateFile)) return;
  try {
    const state = JSON.parse(readFileSync(stateFile, 'utf-8'));
    state.gate_fired = 'false';
    delete state.gate_met_at;
    writeFileSync(stateFile, JSON.stringify(state, null, 2));
  } catch (err) {
    throw new Error(`Failed to reset gate state for '${name}': ${err}`);
  }
}
