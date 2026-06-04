import { useQuery } from '@tanstack/react-query';
import { get } from '../../api/client';
import type { Task } from '../../api/tasks';
import { classifyTaskPipeline } from '../../lib/board';

const STAGE_COLORS: Record<string, string> = {
  staging: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  evaluated: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  queued: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  active: 'bg-green-500/20 text-green-400 border-green-500/30',
  completed: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  blocked: 'bg-red-500/20 text-red-400 border-red-500/30',
};

function StageBadge({ stage }: { stage: string }) {
  const color = STAGE_COLORS[stage] ?? 'bg-surface-muted/20 text-faint border-default';
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium border ${color}`}>
      {stage}
    </span>
  );
}

interface DependencyChainProps {
  task: Task;
}

export function DependencyChain({ task }: DependencyChainProps) {
  const meta = (task.metadata ?? {}) as Record<string, unknown>;
  const chainId = meta.chain_id as string | undefined;
  const childIds = meta.child_ids as string[] | undefined;
  const parentId = meta.parent_id as string | undefined;
  const dependsOn = meta.depends_on as string[] | undefined;

  const hasChainOrDeps = Boolean(
    (chainId && (meta.chain_size as number) > 1) || childIds?.length || parentId || dependsOn?.length
  );

  const { data: allTasks } = useQuery({
    queryKey: ['tasks-for-deps', chainId],
    queryFn: () => get<{ tasks: Task[] }>('/tasks?limit=200'),
    enabled: hasChainOrDeps,
  });

  if (!hasChainOrDeps) return null;

  const tasks = allTasks?.tasks ?? [];

  const chainMembers = chainId
    ? tasks
        .filter((t) => (t.metadata as Record<string, unknown>)?.chain_id === chainId)
        .sort((a, b) => {
          const aOrder = (a.metadata as Record<string, unknown>)?.chain_order as number ?? 0;
          const bOrder = (b.metadata as Record<string, unknown>)?.chain_order as number ?? 0;
          return aOrder - bOrder;
        })
    : [];

  const parentTask = parentId ? tasks.find((t) => t.id === parentId) : undefined;
  const childTasks = childIds ? tasks.filter((t) => childIds.includes(t.id)) : [];
  const depTasks = dependsOn ? tasks.filter((t) => dependsOn.includes(t.id)) : [];

  return (
    <div>
      <h2 className="text-sm font-medium text-muted mb-2">Dependencies & Chain</h2>
      <div className="space-y-3 rounded-lg border border-default bg-surface-1 p-3">

        {/* Chain members */}
        {chainMembers.length > 1 && (
          <div>
            <div className="text-xs text-faint mb-1.5">
              Chain: {(chainId ?? '').slice(0, 8)} ({chainMembers.length} tasks)
            </div>
            <div className="space-y-1">
              {chainMembers.map((t) => {
                const order = (t.metadata as Record<string, unknown>)?.chain_order as number ?? 0;
                const isCurrent = t.id === task.id;
                const stage = classifyTaskPipeline(t);
                return (
                  <div
                    key={t.id}
                    className={`flex items-center gap-2 text-xs rounded px-2 py-1 ${
                      isCurrent ? 'bg-accent/10 border border-accent/30' : 'bg-surface-muted/30'
                    }`}
                  >
                    <span className="text-faint font-mono w-4">{order + 1}.</span>
                    <StageBadge stage={stage} />
                    <a
                      href={`/tasks/${t.id}`}
                      className="text-secondary hover:text-primary truncate flex-1"
                      onClick={(e) => { e.stopPropagation(); }}
                    >
                      {t.title.slice(0, 50)}
                    </a>
                    {isCurrent && (
                      <span className="text-accent text-[10px] font-medium">← current</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Parent task */}
        {parentTask && (
          <div>
            <div className="text-xs text-faint mb-1">Parent task:</div>
            <a
              href={`/tasks/${parentTask.id}`}
              className="text-xs text-secondary hover:text-primary"
            >
              {parentTask.title.slice(0, 60)}
            </a>
            <StageBadge stage={classifyTaskPipeline(parentTask)} />
          </div>
        )}

        {/* Child tasks */}
        {childTasks.length > 0 && (
          <div>
            <div className="text-xs text-faint mb-1">Child tasks ({childTasks.length}):</div>
            <div className="space-y-1">
              {childTasks.map((t) => (
                <div key={t.id} className="flex items-center gap-2 text-xs">
                  <StageBadge stage={classifyTaskPipeline(t)} />
                  <a
                    href={`/tasks/${t.id}`}
                    className="text-secondary hover:text-primary truncate"
                  >
                    {t.title.slice(0, 50)}
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Explicit dependencies */}
        {depTasks.length > 0 && (
          <div>
            <div className="text-xs text-faint mb-1">Depends on ({depTasks.length}):</div>
            <div className="space-y-1">
              {depTasks.map((t) => (
                <div key={t.id} className="flex items-center gap-2 text-xs">
                  <StageBadge stage={classifyTaskPipeline(t)} />
                  <a
                    href={`/tasks/${t.id}`}
                    className="text-secondary hover:text-primary truncate"
                  >
                    {t.title.slice(0, 50)}
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
