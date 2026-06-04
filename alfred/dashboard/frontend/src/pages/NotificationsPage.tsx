import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../components/layout/Header';
import {
  useNotificationHistory,
  useMarkRead,
  useMarkAllRead,
  useUnreadCount,
  type NotificationHistoryItem,
} from '../api/notification-history';

const SEVERITY_BADGE: Record<string, string> = {
  critical: 'bg-red-500/20 text-red-400',
  warning: 'bg-yellow-500/20 text-yellow-400',
  info: 'bg-accent/20 text-accent-text',
};

const CATEGORY_LABELS: Record<string, string> = {
  escalation: 'Escalation',
  completion: 'Completion',
  health_critical: 'Health',
  pipeline: 'Pipeline',
};

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr + 'Z').getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function NotificationRow({
  item,
  onNavigate,
}: {
  item: NotificationHistoryItem;
  onNavigate: (url: string) => void;
}) {
  const markRead = useMarkRead();

  const handleMarkRead = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!item.read) markRead.mutate(item.id);
  };

  const handleNavigate = () => {
    if (!item.read) markRead.mutate(item.id);
    if (!item.url) return;

    // Enrich bare /nexus-ops URLs with context from the notification
    let url = item.url;
    if (url === '/nexus-ops' || url === '/nexus-ops/') {
      const params = new URLSearchParams();
      if (item.task_id) params.set('task_id', item.task_id);
      if (item.source) {
        // Extract job name from source like "headless:task-executor-infra"
        const job = item.source.replace(/^headless:/, '');
        if (job) params.set('job', job);
      }
      const qs = params.toString();
      if (qs) url = `/nexus-ops?${qs}`;
    }
    onNavigate(url);
  };

  return (
    <div
      className={`flex items-start gap-3 px-4 py-3 border-b border-default transition-colors hover:bg-surface-2/50 ${
        !item.read ? 'bg-surface-1/50' : ''
      }`}
    >
      {/* Unread dot — click to mark read without navigating */}
      <div className="pt-2 w-2 shrink-0">
        {!item.read ? (
          <button
            onClick={handleMarkRead}
            className="block w-2 h-2 rounded-full bg-accent hover:bg-accent-light cursor-pointer"
            title="Mark as read"
            aria-label="Mark as read"
          />
        ) : (
          <span className="block w-2 h-2" />
        )}
      </div>

      {/* Content — click navigates to task */}
      <div className="flex-1 min-w-0 cursor-pointer" onClick={handleNavigate}>
        <div className="flex items-center gap-2 mb-0.5">
          <span
            className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${
              SEVERITY_BADGE[item.severity] ?? SEVERITY_BADGE.info
            }`}
          >
            {item.severity}
          </span>
          <span className="text-[10px] text-faint">
            {CATEGORY_LABELS[item.category] ?? item.category}
          </span>
          {item.task_id && (
            <span className="text-[10px] text-disabled font-mono">{item.task_id}</span>
          )}
        </div>
        <p
          className={`text-sm truncate ${
            item.read ? 'text-muted' : 'text-secondary font-medium'
          }`}
        >
          {item.title}
        </p>
        <p className="text-xs text-faint mt-0.5 line-clamp-1">{item.body}</p>
      </div>

      <span className="text-[10px] text-disabled whitespace-nowrap pt-1 shrink-0">
        {timeAgo(item.created_at)}
      </span>
    </div>
  );
}

export default function NotificationsPage() {
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const { data: notifications = [], isLoading } = useNotificationHistory(100, showUnreadOnly);
  const { data: unreadCount = 0 } = useUnreadCount();
  const markAllRead = useMarkAllRead();
  const navigate = useNavigate();

  return (
    <>
      <Header title="Notifications">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowUnreadOnly(!showUnreadOnly)}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              showUnreadOnly
                ? 'bg-accent/20 text-accent-text'
                : 'bg-surface-2 text-muted hover:text-secondary'
            }`}
          >
            {showUnreadOnly ? 'Showing unread' : 'Show all'}
          </button>
          {unreadCount > 0 && (
            <button
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending}
              className="px-3 py-1.5 rounded text-xs font-medium bg-surface-2 text-muted hover:text-secondary transition-colors disabled:opacity-50"
            >
              Mark all read
            </button>
          )}
        </div>
      </Header>

      {unreadCount > 0 && (
        <div className="mb-3 text-sm text-faint">
          {unreadCount} unread notification{unreadCount !== 1 ? 's' : ''}
        </div>
      )}

      <div className="rounded-lg border border-default overflow-hidden">
        {isLoading ? (
          <div className="px-4 py-8 text-center text-faint text-sm">
            Loading notifications...
          </div>
        ) : notifications.length === 0 ? (
          <div className="px-4 py-8 text-center text-faint text-sm">
            {showUnreadOnly ? 'No unread notifications' : 'No notifications yet'}
          </div>
        ) : (
          notifications.map(item => (
            <NotificationRow key={item.id} item={item} onNavigate={navigate} />
          ))
        )}
      </div>
    </>
  );
}
