import type { FastifyInstance } from 'fastify';
import { getTasks, addLabel, removeLabel } from '../services/pulse-client.js';

// Label function categories — from label-taxonomy.yaml label_functions
type LabelFunction = 'position' | 'authorization' | 'gate' | 'attribute' | 'metadata';

const PREFIX_FUNCTION: Record<string, LabelFunction> = {
  stage: 'position',
  auto: 'gate',
  risk: 'attribute',
  waiting: 'gate',
  pipeline: 'gate', // pipeline:needs-approval is gate; pipeline:approved is authorization (mixed)
  review: 'gate',
  aurora: 'gate',
  blocked: 'gate',
  action: 'attribute',
  capability: 'attribute',
  domain: 'metadata',
  project: 'metadata',
  source: 'metadata',
  type: 'metadata',
  severity: 'metadata',
  agent: 'metadata',
  parent: 'metadata',
  'follow-up': 'metadata',
  orchestration: 'metadata',
  phase: 'metadata',
};

// Human-readable names and descriptions for known prefixes
const PREFIX_META: Record<string, { name: string; description: string; function?: LabelFunction }> =
  {
    stage: {
      name: 'Pipeline Stage',
      description:
        'Where a task sits in the Nexus pipeline lifecycle (intake → evaluate → route → review → queue → execute).',
      function: 'position',
    },
    auto: {
      name: 'Automation Readiness',
      description: 'Gate labels controlling automation pipeline routing.',
      function: 'gate',
    },
    risk: {
      name: 'Risk / Reversibility',
      description:
        'Attribute stamped during evaluation — gates auto-execution based on reversibility.',
      function: 'attribute',
    },
    pipeline: {
      name: 'Pipeline / Authorization',
      description: 'Approval gates and authorization tokens for the execution pipeline.',
    },
    domain: {
      name: 'Domain',
      description: 'Categorizes what area of work a task belongs to.',
      function: 'metadata',
    },
    project: {
      name: 'Project',
      description: 'Which project a task belongs to.',
      function: 'metadata',
    },
    source: { name: 'Source', description: 'How the task was created.', function: 'metadata' },
    capability: {
      name: 'Capability Required',
      description:
        'Attribute — what kind of tooling or access the task needs. Determines executor routing.',
      function: 'attribute',
    },
    aurora: {
      name: 'Aurora',
      description: 'Aurora creative surprise system labels.',
      function: 'gate',
    },
    waiting: {
      name: 'Waiting On',
      description: 'Gate label — who is responsible for the next action.',
      function: 'gate',
    },
    severity: { name: 'Severity', description: 'Impact level of the issue.', function: 'metadata' },
    action: {
      name: 'Action Type',
      description: 'Attribute — required operation type.',
      function: 'attribute',
    },
    agent: { name: 'Agent', description: 'Who created the task.', function: 'metadata' },
    type: { name: 'Task Type', description: 'What kind of work this is.', function: 'metadata' },
    parent: {
      name: 'Relationships',
      description: 'Parent/child task links.',
      function: 'metadata',
    },
    'follow-up': {
      name: 'Follow-up',
      description: 'Follow-up work from completed tasks.',
      function: 'metadata',
    },
    review: {
      name: 'Review',
      description: 'Gate labels for AI David review cycle.',
      function: 'gate',
    },
    blocked: {
      name: 'Dependency Blockers',
      description: 'Gate labels for orchestration and task dependency blocking.',
      function: 'gate',
    },
    orchestration: {
      name: 'Project',
      description: 'Links task to its Pulse project.',
      function: 'metadata',
    },
    phase: {
      name: 'Phase',
      description: 'Which phase within an orchestration plan this task belongs to.',
      function: 'metadata',
    },
  };

// Standalone labels (no prefix) grouped under a virtual category
const STANDALONE_GROUP = 'status';
const STANDALONE_META = {
  name: 'Status & Blockers',
  description: 'Standalone labels that track workflow blockers and states.',
};

export async function labelRoutes(app: FastifyInstance) {
  // Dynamic label inventory — scans actual tasks
  app.get('/api/labels/live', async () => {
    const tasks = await getTasks();
    const labelCounts: Record<string, { total: number; open: number; closed: number }> = {};

    for (const t of tasks) {
      for (const l of t.labels ?? []) {
        if (!labelCounts[l]) labelCounts[l] = { total: 0, open: 0, closed: 0 };
        labelCounts[l].total++;
        if (t.status === 'closed') labelCounts[l].closed++;
        else labelCounts[l].open++;
      }
    }

    // Group by prefix
    const groups: Record<string, { label: string; total: number; open: number; closed: number }[]> =
      {};

    for (const [label, counts] of Object.entries(labelCounts)) {
      const colonIdx = label.indexOf(':');
      const prefix = colonIdx > 0 ? label.slice(0, colonIdx) : STANDALONE_GROUP;
      if (!groups[prefix]) groups[prefix] = [];
      groups[prefix].push({ label, ...counts });
    }

    // Sort labels within each group by open count desc
    for (const g of Object.values(groups)) {
      g.sort((a, b) => b.open - a.open || b.total - a.total);
    }

    // Build ordered categories grouped by function
    const GROUPS: { key: string; name: string; description: string; prefixes: string[] }[] = [
      {
        key: 'execution',
        name: 'Execution & Pipeline',
        description:
          'Labels that control what Nexus does with a task — whether it gets auto-executed, investigated, blocked, or routed.',
        prefixes: [
          'stage',
          'auto',
          'risk',
          'waiting',
          STANDALONE_GROUP,
          'blocked',
          'aurora',
          'pipeline',
          'action',
          'review',
        ],
      },
      {
        key: 'context',
        name: 'Context & Metadata',
        description: 'Categorization labels — no direct effect on execution.',
        prefixes: [
          'domain',
          'project',
          'source',
          'type',
          'capability',
          'severity',
          'agent',
          'parent',
          'follow-up',
          'orchestration',
          'phase',
        ],
      },
    ];

    const seen = new Set<string>();
    const categories = [];

    for (const group of GROUPS) {
      for (const prefix of group.prefixes) {
        if (!groups[prefix]) continue;
        seen.add(prefix);
        const meta =
          prefix === STANDALONE_GROUP
            ? STANDALONE_META
            : (PREFIX_META[prefix] ?? { name: prefix, description: '' });
        const fn = PREFIX_FUNCTION[prefix] ?? (group.key === 'execution' ? 'gate' : 'metadata');
        categories.push({
          prefix,
          ...meta,
          function: fn,
          group: group.key,
          labels: groups[prefix],
        });
      }
    }

    // Any prefix not in the explicit order goes to context
    for (const [prefix, labels] of Object.entries(groups)) {
      if (seen.has(prefix)) continue;
      const meta = PREFIX_META[prefix] ?? { name: prefix, description: '' };
      const fn = PREFIX_FUNCTION[prefix] ?? 'metadata';
      categories.push({ prefix, ...meta, function: fn, group: 'context', labels });
    }

    // Find the most recent updated_at across all tasks
    let lastUpdated = '';
    for (const t of tasks) {
      if (t.updated_at && t.updated_at > lastUpdated) lastUpdated = t.updated_at;
    }

    const groupMeta = GROUPS.map((g) => ({ key: g.key, name: g.name, description: g.description }));
    return { categories, groups: groupMeta, totalTasks: tasks.length, lastUpdated };
  });

  // Computed blocked reasons — derived from existing labels, never stored
  app.get('/api/labels/blocked-reasons', async () => {
    const tasks = await getTasks();
    const openTasks = tasks.filter((t) => t.status !== 'closed');

    // Derivation rules: label → blocked reason
    const REASON_MAP: Record<string, string> = {
      'waiting:david': 'decision',
      'needs-input': 'input',
      'waiting:subtasks': 'dependency',
      'blocked:dependency': 'dependency',
      'waiting:session': 'session',
      'waiting:external': 'external',
      'manual-action': 'manual',
      'pipeline:needs-approval': 'approval',
      parked: 'parked',
    };
    const PREFIX_REASONS: { prefix: string; reason: string }[] = [
      { prefix: 'depends:', reason: 'dependency' },
      { prefix: 'blocked:', reason: 'dependency' },
    ];

    const REASON_META: Record<
      string,
      { label: string; description: string; derivedFrom: string[] }
    > = {
      decision: {
        label: 'Decision needed',
        description: 'Waiting for Sir to make a call',
        derivedFrom: ['waiting:david'],
      },
      input: {
        label: 'Input needed',
        description: 'Task description incomplete, needs clarification',
        derivedFrom: ['needs-input'],
      },
      dependency: {
        label: 'Task dependency',
        description: 'Blocked on another task or orchestration phase',
        derivedFrom: ['waiting:subtasks', 'depends:*', 'blocked:*'],
      },
      session: {
        label: 'Needs CLI session',
        description: 'Too complex for Nexus — waiting for Sir to pick up in CLI',
        derivedFrom: ['waiting:session'],
      },
      external: {
        label: 'External blocker',
        description: 'Waiting on third-party, vendor, or release',
        derivedFrom: ['waiting:external'],
      },
      manual: {
        label: 'Manual action',
        description: 'Requires physical or hands-on action',
        derivedFrom: ['manual-action'],
      },
      approval: {
        label: 'Approval gate',
        description: 'Queued in the approval pipeline',
        derivedFrom: ['pipeline:needs-approval'],
      },
      parked: {
        label: 'Parked',
        description: 'Deliberately shelved, no timeline',
        derivedFrom: ['parked'],
      },
    };

    const counts: Record<string, number> = {};
    const tasksByReason: Record<string, string[]> = {};

    for (const t of openTasks) {
      const labels = t.labels ?? [];
      const reasons = new Set<string>();

      for (const l of labels) {
        const exact = REASON_MAP[l];
        if (exact) {
          reasons.add(exact);
          continue;
        }
        for (const p of PREFIX_REASONS) {
          if (l.startsWith(p.prefix)) {
            reasons.add(p.reason);
            break;
          }
        }
      }

      for (const r of reasons) {
        counts[r] = (counts[r] ?? 0) + 1;
        if (!tasksByReason[r]) tasksByReason[r] = [];
        tasksByReason[r].push(t.id);
      }
    }

    // Build response sorted by count descending
    const reasons = Object.entries(REASON_META)
      .map(([key, meta]) => ({
        reason: key,
        ...meta,
        count: counts[key] ?? 0,
        taskIds: tasksByReason[key] ?? [],
      }))
      .filter((r) => r.count > 0)
      .sort((a, b) => b.count - a.count);

    const totalBlocked = new Set(Object.values(tasksByReason).flat()).size;

    return { reasons, totalBlocked, totalOpen: openTasks.length };
  });

  // Add label to task
  app.post('/api/tasks/:id/labels', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { label: string };
    if (!body.label) return reply.status(400).send({ error: 'Label is required' });
    try {
      const result = await addLabel(id, body.label);
      return { message: result };
    } catch (err) {
      return reply.status(500).send({ error: (err as Error).message });
    }
  });

  // Remove label from task
  app.delete('/api/tasks/:id/labels/:label', async (request, reply) => {
    const { id, label } = request.params as { id: string; label: string };
    try {
      const result = await removeLabel(id, label);
      return { message: result };
    } catch (err) {
      return reply.status(500).send({ error: (err as Error).message });
    }
  });
}
