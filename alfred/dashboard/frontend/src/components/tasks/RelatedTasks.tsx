import { Link } from 'react-router-dom';
import { useTask } from '../../api/tasks';
import { PriorityBadge } from './PriorityBadge';
import { StatusBadge } from './StatusBadge';

const RELATION_LABELS = ['parent', 'follow-up', 'blocks', 'blocked-by', 'related'];

function RelatedTaskLink({ id, relation }: { id: string; relation: string }) {
  const { data: task } = useTask(id);

  return (
    <Link
      to={`/tasks/${id}`}
      className="flex items-center gap-2 rounded-lg border border-default bg-surface-1 px-3 py-2 hover:bg-surface-2/50 transition-colors"
    >
      <span className="text-xs text-faint w-16 flex-shrink-0">{relation}</span>
      {task ? (
        <>
          <PriorityBadge level={task.priority} />
          <StatusBadge status={task.status} />
          <span className="text-sm text-secondary truncate">{task.title}</span>
          <span className="text-xs text-disabled ml-auto flex-shrink-0">{id}</span>
        </>
      ) : (
        <span className="text-sm text-faint">{id}</span>
      )}
    </Link>
  );
}

export function RelatedTasks({ labels }: { labels: string[] }) {
  const relations: { relation: string; taskId: string }[] = [];

  for (const label of labels) {
    const colonIdx = label.indexOf(':');
    if (colonIdx === -1) continue;
    const prefix = label.substring(0, colonIdx);
    const value = label.substring(colonIdx + 1);
    if (RELATION_LABELS.includes(prefix) && value.startsWith('${workspace}-')) {
      relations.push({ relation: prefix, taskId: value });
    }
  }

  if (relations.length === 0) return null;

  return (
    <div>
      <h2 className="text-sm font-medium text-muted mb-2">Related Tasks</h2>
      <div className="space-y-1">
        {relations.map(r => (
          <RelatedTaskLink key={`${r.relation}:${r.taskId}`} id={r.taskId} relation={r.relation} />
        ))}
      </div>
    </div>
  );
}
