import { useQuery } from '@tanstack/react-query';
import { get } from '../../api/client';

interface PipelineEvent {
  id: number;
  task_id: string;
  event_type: string;
  actor: string;
  data: Record<string, unknown>;
  created_at: string;
}

const SERVICE_ICONS: Record<string, string> = {
  stage: '📋',
  evaluate: '🔍',
  orchestrate: '🔗',
  execute: '⚡',
  review: '✅',
  diagnose: '🔧',
};

const SERVICE_COLORS: Record<string, string> = {
  stage: 'border-blue-500/30',
  evaluate: 'border-yellow-500/30',
  orchestrate: 'border-purple-500/30',
  execute: 'border-green-500/30',
  review: 'border-emerald-500/30',
  diagnose: 'border-orange-500/30',
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function isPipelineEvent(e: PipelineEvent): boolean {
  return e.event_type.startsWith('pipeline:');
}

function getServiceName(e: PipelineEvent): string {
  if (e.event_type.startsWith('pipeline:')) {
    return e.event_type.replace('pipeline:', '');
  }
  return e.event_type;
}

export function ActivityTimeline({ taskId }: { taskId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['events', taskId],
    queryFn: () => get<{ events: PipelineEvent[] }>(`/events?task_id=${taskId}&limit=50`),
    refetchInterval: 10000,
  });

  const events = (data?.events ?? []).filter(isPipelineEvent).reverse();

  if (isLoading) {
    return (
      <div className="text-xs text-faint animate-pulse">Loading activity...</div>
    );
  }

  if (events.length === 0) {
    return null;
  }

  return (
    <div>
      <h2 className="text-sm font-medium text-muted mb-2">Pipeline Activity</h2>
      <div className="space-y-1.5 max-h-64 overflow-y-auto">
        {events.map((e) => {
          const service = getServiceName(e);
          const icon = SERVICE_ICONS[service] ?? '📌';
          const borderColor = SERVICE_COLORS[service] ?? 'border-default';
          const summary = (e.data as Record<string, unknown>)?.summary as string ?? e.event_type;
          const details = e.data as Record<string, unknown>;

          return (
            <div
              key={e.id}
              className={`flex items-start gap-2 text-xs rounded border-l-2 ${borderColor} pl-2 py-1 bg-surface-1/50`}
            >
              <span className="shrink-0 mt-px">{icon}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-faint font-mono">{formatTime(e.created_at)}</span>
                  <span className="text-secondary">{summary}</span>
                </div>
                {typeof details?.model === 'string' && (
                  <span className="text-faint text-[10px]">model: {details.model}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
