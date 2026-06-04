import { useState, useEffect } from 'react';
import { useSession } from '../../api/account';

function formatRemaining(seconds: number): string {
  if (seconds <= 0) return 'expired';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function SessionCountdown({ collapsed }: { collapsed: boolean }) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const { data } = useSession();

  useEffect(() => {
    const timer = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 60_000);
    return () => clearInterval(timer);
  }, []);

  if (!data?.expiresAt) return null;

  const remaining = data.expiresAt - now;
  const isLow = remaining < 3600;
  const isWarning = remaining < 21600;

  if (collapsed) {
    return (
      <div
        title={`Session: ${formatRemaining(remaining)} remaining`}
        className={`mx-auto h-2 w-2 rounded-full ${
          isLow ? 'bg-red-500 animate-pulse' : isWarning ? 'bg-yellow-500' : 'bg-green-500/50'
        }`}
      />
    );
  }

  return (
    <a href="/account" className={`flex items-center gap-2 px-3 py-1.5 text-[10px] hover:text-secondary transition-colors ${
      isLow ? 'text-red-400' : isWarning ? 'text-yellow-500/70' : 'text-muted/50'
    }`}>
      <div className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${
        isLow ? 'bg-red-500 animate-pulse' : isWarning ? 'bg-yellow-500' : 'bg-green-500/40'
      }`} />
      <span className="truncate">
        {data.username && <span className="opacity-60">{data.username} · </span>}
        {formatRemaining(remaining)}
      </span>
    </a>
  );
}
