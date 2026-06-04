import type { Task } from '../api/tasks';
import type { OrchestrationTaskMapEntry } from '../api/orchestrations';

function extractLabel(labels: string[] | undefined, prefix: string): string | undefined {
  const match = labels?.find((l) => l.startsWith(`${prefix}:`));
  return match ? match.slice(prefix.length + 1) : undefined;
}

function extractYamlTaskId(description?: string): string | undefined {
  const match = description?.match(/\*{0,2}yaml_task_id\*{0,2}:\s*(\S+)/);
  return match?.[1];
}

/** Pretty-print an orchestration slug: "aifred-pro-nexus-pulse" → "Aifred Pro Nexus Pulse" */
function formatOrchName(slug: string): string {
  return slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Pretty-print a phase slug: "Phase-1:-Gauntlet-Design" → "Phase 1: Gauntlet Design" */
function formatPhase(slug: string): string {
  return slug.replace(/-/g, ' ').replace(/\s+/g, ' ');
}

/**
 * Build an orchestration task map from task labels.
 * Extracts orchestration:, phase:, and yaml_task_id from each task.
 */
export function buildOrchestrationMap(tasks: Task[]): Record<string, OrchestrationTaskMapEntry> {
  const map: Record<string, OrchestrationTaskMapEntry> = {};

  for (const task of tasks) {
    const orchSlug = extractLabel(task.labels, 'orchestration');
    if (!orchSlug) continue;

    const phaseSlug = extractLabel(task.labels, 'phase');
    const yamlTaskId = extractYamlTaskId(task.description);

    map[task.id] = {
      name: formatOrchName(orchSlug),
      file: orchSlug,
      status: task.status,
      yamlTaskId,
      phase: phaseSlug ? formatPhase(phaseSlug) : undefined,
    };
  }

  return map;
}
