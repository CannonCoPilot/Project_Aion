import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Task } from '../../api/tasks';

const HUMAN_REVIEW_REASONS = new Set([
  'reason:max-retries',
  'reason:safety-keyword',
  'reason:stuck',
  'needs-input',
  'manual-action',
  'waiting:david',
  'pipeline:needs-approval',
]);

interface BlockedBannerProps {
  tasks: Task[];
}

export function BlockedBanner({ tasks }: BlockedBannerProps) {
  const navigate = useNavigate();
  const { humanCount, autoCount } = useMemo(() => {
    let human = 0;
    let auto = 0;
    for (const t of tasks) {
      const labels = t.labels ?? [];
      if (!labels.includes('blocked:yes')) continue;
      if (labels.includes('reason:dependency')) {
        auto++;
      } else if (labels.some((l) => HUMAN_REVIEW_REASONS.has(l))) {
        human++;
      } else {
        auto++;
      }
    }
    return { humanCount: human, autoCount: auto };
  }, [tasks]);

  if (humanCount === 0) return null;

  return (
    <div className="flex items-center justify-between px-4 py-2 rounded-lg bg-red-500/10 border border-red-500/30">
      <div className="flex items-center gap-2">
        <span className="text-red-400 text-sm font-medium">
          {humanCount} task{humanCount !== 1 ? 's' : ''} blocked — awaiting your review
        </span>
        {autoCount > 0 && (
          <span className="text-tertiary text-xs">
            ({autoCount} more waiting on dependencies)
          </span>
        )}
      </div>
      <button
        onClick={() => navigate('/tasks?board=blocked')}
        className="px-3 py-1 text-xs font-medium text-red-400 bg-red-500/20 rounded border border-red-500/30 hover:bg-red-500/30 transition-colors"
      >
        View Blocked
      </button>
    </div>
  );
}
