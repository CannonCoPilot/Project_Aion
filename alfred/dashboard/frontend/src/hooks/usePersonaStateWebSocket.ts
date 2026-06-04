import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';

const PULSE_WS_URL =
  (import.meta.env.VITE_PULSE_WS_URL as string | undefined) ??
  `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws/pulse`;

// Pulse emits two frame shapes on /api/v1/socket:
//   Protocol:  { event: 'connected'|'subscribed'|'unsubscribed'|'pong'|'error', ... }
//   Broadcast: { channel: 'persona-state'|..., payload: { persona, event, version_id, ... } }
// See pulse/app.py:_broadcast_socket (line 2967) for the broadcast envelope.

interface BroadcastFrame {
  channel: string;
  payload: { persona?: string; event: string; version_id?: number };
}

interface ProtocolFrame {
  event: string;
  available_channels?: string[];
  channels?: string[];
  detail?: string;
}

type WsFrame = BroadcastFrame | ProtocolFrame;

function isBroadcast(frame: WsFrame): frame is BroadcastFrame {
  return typeof (frame as BroadcastFrame).channel === 'string';
}

export function usePersonaStateWebSocket() {
  const qc = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function connect() {
      const ws = new WebSocket(PULSE_WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({ action: 'subscribe', channels: ['persona-state'] }));
      };

      ws.onmessage = (event) => {
        try {
          const frame = JSON.parse(event.data) as WsFrame;
          if (!isBroadcast(frame)) return; // protocol frames — no-op
          if (frame.channel !== 'persona-state') return;

          const { persona, event: kind } = frame.payload;
          // prompt-updated, permissions-updated → invalidate detail + summary
          // created, soft-deleted                → invalidate summary
          if (kind === 'prompt-updated' || kind === 'permissions-updated') {
            if (persona) {
              qc.invalidateQueries({ queryKey: ['persona', 'v1', persona] });
            }
            qc.invalidateQueries({ queryKey: ['personas', 'v1'] });
          } else if (kind === 'created' || kind === 'soft-deleted') {
            qc.invalidateQueries({ queryKey: ['personas', 'v1'] });
          }
        } catch {
          // Ignore parse errors
        }
      };

      ws.onclose = () => {
        wsRef.current = null;
        reconnectTimer.current = setTimeout(connect, 3000);
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
  }, [qc]);
}
