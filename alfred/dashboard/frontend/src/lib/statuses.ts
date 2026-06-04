export interface StatusDef {
  key: string;
  label: string;
  color: string;
  bgClass: string;
  textClass: string;
  dotClass: string;
}

export const STATUSES: Record<string, StatusDef> = {
  open: { key: 'open', label: 'Open', color: 'emerald', bgClass: 'bg-status-open-bg/20', textClass: 'text-status-open', dotClass: 'bg-status-open-bg' },
  in_progress: { key: 'in_progress', label: 'In Progress', color: 'blue', bgClass: 'bg-accent/20', textClass: 'text-accent-text', dotClass: 'bg-accent' },
  deferred: { key: 'deferred', label: 'Deferred', color: 'gray', bgClass: 'bg-surface-muted/20', textClass: 'text-muted', dotClass: 'bg-dot-muted' },
  closed: { key: 'closed', label: 'Closed', color: 'gray', bgClass: 'bg-surface-muted/20', textClass: 'text-muted', dotClass: 'bg-surface-muted' },
};

export function getStatus(key: string): StatusDef {
  return STATUSES[key] ?? STATUSES['open'];
}
