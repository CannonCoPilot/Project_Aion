export const STAGE_ORDER = ['intake', 'evaluate', 'route', 'review', 'queue', 'execute'] as const
export type StageName = typeof STAGE_ORDER[number]

export function extractStage(labels: string[]): string | null {
  const found = labels.find(l => l.startsWith('stage:'))
  return found ? found.replace('stage:', '') : null
}

export function stageBadgeColor(stage: string): string {
  switch (stage) {
    case 'intake': return 'bg-blue-500/10 text-blue-400 border-blue-500/20'
    case 'evaluate': return 'bg-violet-500/10 text-violet-400 border-violet-500/20'
    case 'route': return 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20'
    case 'review': return 'bg-amber-500/10 text-amber-400 border-amber-500/20'
    case 'queue': return 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
    case 'execute': return 'bg-green-500/10 text-green-400 border-green-500/20'
    default: return 'bg-surface-muted/10 text-muted border-b-muted/20'
  }
}
