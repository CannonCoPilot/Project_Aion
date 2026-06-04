export interface PriorityDef {
  level: number;
  name: string;
  symbol: string;
  color: string;
  bgClass: string;
  textClass: string;
}

export const PRIORITIES: Record<number, PriorityDef> = {
  0: { level: 0, name: 'CRITICAL', symbol: '!!!', color: 'red', bgClass: 'bg-priority-critical-bg/20', textClass: 'text-priority-critical' },
  1: { level: 1, name: 'HIGH', symbol: '!!', color: 'orange', bgClass: 'bg-priority-high-bg/20', textClass: 'text-priority-high' },
  2: { level: 2, name: 'MEDIUM', symbol: '!', color: 'yellow', bgClass: 'bg-priority-medium-bg/20', textClass: 'text-priority-medium' },
  3: { level: 3, name: 'LOW', symbol: '-', color: 'blue', bgClass: 'bg-accent-light/20', textClass: 'text-accent-text' },
  4: { level: 4, name: 'Backlog', symbol: '...', color: 'gray', bgClass: 'bg-surface-muted/20', textClass: 'text-muted' },
};

export function getPriority(level: number): PriorityDef {
  return PRIORITIES[level] ?? PRIORITIES[4];
}
