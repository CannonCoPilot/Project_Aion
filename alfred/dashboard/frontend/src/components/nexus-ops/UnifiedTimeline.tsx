import { useRef, useEffect, useCallback } from 'react';
import type { NexusOpsEvent } from '../../api/nexus-ops';
import { EventCard } from './EventCard';

interface UnifiedTimelineProps {
  events: NexusOpsEvent[];
  total: number;
  isLoading: boolean;
  onTaskClick?: (taskId: string) => void;
  onJobClick?: (job: string) => void;
  onLoadMore?: () => void;
  hasMore: boolean;
}

export function UnifiedTimeline({
  events,
  total,
  isLoading,
  onTaskClick,
  onJobClick,
  onLoadMore,
  hasMore,
}: UnifiedTimelineProps) {
  // Sentinel element for auto-loading on scroll
  const sentinelRef = useRef<HTMLDivElement>(null);

  const handleIntersect = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      if (entries[0]?.isIntersecting && hasMore && !isLoading && onLoadMore) {
        onLoadMore();
      }
    },
    [hasMore, isLoading, onLoadMore],
  );

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(handleIntersect, { rootMargin: '200px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, [handleIntersect]);

  if (isLoading && events.length === 0) {
    return (
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            className="rounded-lg border border-default bg-surface-1 h-16 animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="rounded-lg border border-default bg-surface-1 px-6 py-12 text-center">
        <div className="text-faint text-sm">
          No events found for the selected time range and filters.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="text-xs text-faint mb-2">
        Showing {events.length} of {total} events
      </div>
      {events.map((event) => (
        // content-visibility:auto skips rendering off-screen rows, reducing paint cost for large lists
        <div key={event.id} style={{ contentVisibility: 'auto', containIntrinsicSize: '0 72px' }}>
          <EventCard event={event} onTaskClick={onTaskClick} onJobClick={onJobClick} />
        </div>
      ))}
      {/* Intersection sentinel — triggers onLoadMore when scrolled into view */}
      <div ref={sentinelRef} aria-hidden="true" />
      {isLoading && (
        <div className="w-full py-3 text-center text-xs text-faint animate-pulse">
          Loading more events…
        </div>
      )}
    </div>
  );
}
