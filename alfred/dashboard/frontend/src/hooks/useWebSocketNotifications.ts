import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '../components/notifications/ToastProvider';

export function useWebSocketNotifications() {
  const { addToast } = useToast();
  const qc = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function connect() {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);

          if (msg.type === 'notification') {
            qc.setQueryData(['notification-unread-count'], msg.data.unreadCount);
            qc.invalidateQueries({ queryKey: ['notification-history'] });
          }

          if (msg.type === 'activity' && msg.data?.events) {
            for (const ev of msg.data.events) {
              const severity = ev.severity ?? 'info';
              if (severity === 'warning' || severity === 'critical') {
                const data = typeof ev.data === 'string' ? JSON.parse(ev.data) : (ev.data ?? {});
                addToast({
                  title: data.title ?? ev.event_type,
                  body: data.summary ?? data.question ?? 'New event',
                  severity: severity as 'warning' | 'critical',
                  url: data.task_id ? `/tasks/${data.task_id}` : undefined,
                });
              }
            }
          }

          if (msg.type === 'approval') {
            qc.invalidateQueries({ queryKey: ['approvals'] });
          }
        } catch {
          // Ignore parse errors
        }
      };

      ws.onclose = () => {
        wsRef.current = null;
        reconnectTimer.current = setTimeout(connect, 5000);
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    connect();

    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (wsRef.current) wsRef.current.close();
      wsRef.current = null;
    };
  }, [addToast, qc]);
}
