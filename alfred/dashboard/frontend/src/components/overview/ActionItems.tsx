import { Link } from 'react-router-dom';
import { useTaskList } from '../../api/tasks';
import { useCompany } from '../../hooks/useCompany';
import { useApprovals } from '../../api/nexus';
import { classifyTasks } from '../../lib/classify';
import { PriorityBadge } from '../tasks/PriorityBadge';
import { formatTimeAgo } from '../../lib/time';

const MAX_PER_SECTION = 5;
const MAX_APPROVAL_PREVIEW = 3;

export function ActionItems() {
  const { company, isFiltered } = useCompany();
  const { data: tasks } = useTaskList({
    status: 'open,in_progress',
    company: isFiltered ? company : undefined,
  });
  const { data: approvals } = useApprovals();

  const taskList = tasks ?? [];
  const { quick, session } = classifyTasks(taskList);
  const approvalList = approvals ?? [];

  const hasApprovals = approvalList.length > 0;
  const hasQuick = quick.length > 0;
  const hasSession = session.length > 0;
  const hasAnything = hasApprovals || hasQuick || hasSession;

  return (
    <div className="rounded-lg border border-default bg-surface-1 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-secondary">Action Items</h3>
        <Link
          to="/tasks?board=blocked"
          className="text-xs text-faint hover:text-accent-text transition-colors"
        >
          View all
        </Link>
      </div>

      {!hasAnything && (
        <div className="py-6 text-center">
          <p className="text-faint text-sm">Nothing needs your attention</p>
          <p className="text-disabled text-xs mt-1">All clear</p>
        </div>
      )}

      {/* Pending approvals — compact preview linking to task detail */}
      {hasApprovals && (
        <div className="mb-4">
          <Link
            to="/tasks?board=blocked"
            className="flex items-center gap-2 text-xs text-red-400 font-medium mb-2 hover:text-red-300 transition-colors"
          >
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            Pending Approvals ({approvalList.length})
          </Link>
          <div className="space-y-1.5">
            {approvalList.slice(0, MAX_APPROVAL_PREVIEW).map((a) => (
              <Link
                key={a.id}
                to={`/tasks/${a.id}`}
                className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-surface-2/50 transition-colors group"
              >
                <span className="text-xs text-faint font-medium shrink-0">{a.job}</span>
                <span className="text-sm text-secondary group-hover:text-white truncate flex-1">
                  {a.question}
                </span>
                <span className="text-[10px] text-disabled shrink-0">
                  {formatTimeAgo(a.timestamp)}
                </span>
              </Link>
            ))}
            {approvalList.length > MAX_APPROVAL_PREVIEW && (
              <Link
                to="/tasks?board=blocked"
                className="text-xs text-faint hover:text-red-400 pl-2 transition-colors"
              >
                +{approvalList.length - MAX_APPROVAL_PREVIEW} more
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Quick actions — needs-input, manual-action, etc */}
      {hasQuick && (
        <div className="mb-4">
          <p className="text-xs text-orange-400 font-medium mb-2">Quick Actions ({quick.length})</p>
          <div className="space-y-1.5">
            {quick.slice(0, MAX_PER_SECTION).map((t) => (
              <Link
                key={t.id}
                to={`/tasks/${t.id}`}
                className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-surface-2/50 transition-colors group"
              >
                <PriorityBadge level={t.priority} />
                <span className="text-sm text-secondary group-hover:text-white truncate flex-1">
                  {t.title}
                </span>
                <span className="text-[10px] text-disabled font-mono">{t.id.split('-')[1]}</span>
              </Link>
            ))}
            {quick.length > MAX_PER_SECTION && (
              <p className="text-xs text-faint pl-2">+{quick.length - MAX_PER_SECTION} more</p>
            )}
          </div>
        </div>
      )}

      {/* Session work — waiting:david, blocked:* */}
      {hasSession && (
        <div>
          <p className="text-xs text-amber-400 font-medium mb-2">Session Work ({session.length})</p>
          <div className="space-y-1.5">
            {session.slice(0, MAX_PER_SECTION).map((t) => (
              <Link
                key={t.id}
                to={`/tasks/${t.id}`}
                className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-surface-2/50 transition-colors group"
              >
                <PriorityBadge level={t.priority} />
                <span className="text-sm text-secondary group-hover:text-white truncate flex-1">
                  {t.title}
                </span>
                <span className="text-[10px] text-disabled font-mono">{t.id.split('-')[1]}</span>
              </Link>
            ))}
            {session.length > MAX_PER_SECTION && (
              <p className="text-xs text-faint pl-2">+{session.length - MAX_PER_SECTION} more</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
