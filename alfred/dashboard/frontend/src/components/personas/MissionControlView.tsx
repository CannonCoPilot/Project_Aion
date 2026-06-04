// Mission Control — Phase 1.3 add-on surface (v5 design §5.4).
//
// Live ops dashboard: KPI bar + agent cards grid + event ticker + alert stream.
// Subscribes to 5 pulse WebSocket channels (decision_events, audit_log,
// cost_events, observation-tunnel, task-state) and maintains a rolling event
// buffer in React state. KPI counters compute from the live buffer; alerts
// segregate observation-tunnel events with severity coloring.
//
// PoC bar (per v5 §5.4): functional KPI bar, agent grid, event ticker, alerts.
// Deferred-polish (per §5.4): replay scrubber, customizable layouts, sound
// alerts, full-screen mode.

import { useEffect, useRef, useState } from 'react';
import { usePersonas, type PersonaSummary } from '../../api/personas';

const PULSE_WS_URL =
  (import.meta.env.VITE_PULSE_WS_URL as string | undefined) ??
  `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws/pulse`;

const CHANNELS = [
  'decision_events',
  'audit_log',
  'cost_events',
  'observation-tunnel',
  'task-state',
] as const;

type Channel = typeof CHANNELS[number];
const CHANNEL_SET = new Set<string>(CHANNELS);

interface PulseEvent {
  id: number;
  timestamp: string;
  channel: Channel;
  payload: Record<string, unknown>;
}

const MAX_EVENTS = 200;

function useMissionControlEvents() {
  const [events, setEvents] = useState<PulseEvent[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idRef = useRef(0);

  useEffect(() => {
    function connect() {
      const ws = new WebSocket(PULSE_WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({ action: 'subscribe', channels: CHANNELS }));
      };

      ws.onmessage = (e) => {
        try {
          const frame = JSON.parse(e.data) as { channel?: string; payload?: Record<string, unknown> };
          if (!frame.channel || !CHANNEL_SET.has(frame.channel)) return;
          idRef.current += 1;
          const evt: PulseEvent = {
            id: idRef.current,
            timestamp: new Date().toISOString(),
            channel: frame.channel as Channel,
            payload: frame.payload ?? {},
          };
          setEvents((prev) => [evt, ...prev].slice(0, MAX_EVENTS));
        } catch {
          // ignore parse errors
        }
      };

      ws.onclose = () => {
        wsRef.current = null;
        reconnectTimer.current = setTimeout(connect, 3000);
      };

      ws.onerror = () => ws.close();
    }

    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (wsRef.current) wsRef.current.close();
      wsRef.current = null;
    };
  }, []);

  return events;
}

function KpiCard({
  label, value, subtitle, accent,
}: {
  label: string;
  value: number | string;
  subtitle?: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded border p-2 ${
        accent
          ? 'border-rose-500/30 bg-rose-500/10'
          : 'border-default bg-surface-1'
      }`}
    >
      <div className="text-[10px] uppercase tracking-wider text-faint">{label}</div>
      <div className="mt-0.5 text-lg font-semibold text-secondary">{value}</div>
      {subtitle && <div className="text-[10px] text-disabled">{subtitle}</div>}
    </div>
  );
}

function AgentCard({ persona, lastEventByPersona }: { persona: PersonaSummary; lastEventByPersona: Record<string, string> }) {
  const last = lastEventByPersona[persona.name];
  const accent = !!last;
  return (
    <div
      className={`rounded border p-1.5 text-[10px] transition-colors ${
        accent
          ? 'border-emerald-500/30 bg-emerald-500/5'
          : 'border-default bg-surface-1'
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="truncate font-medium text-secondary">{persona.name}</span>
        <span className="text-disabled">{persona.tier}</span>
      </div>
      {last && (
        <div className="mt-0.5 text-faint">
          last: <span className="text-muted">{last}</span>
        </div>
      )}
    </div>
  );
}

function TickerRow({ event }: { event: PulseEvent }) {
  const time = new Date(event.timestamp).toLocaleTimeString();
  const persona = (event.payload.persona as string | undefined) || (event.payload.actor as string | undefined) || '';
  const eventType =
    (event.payload.event as string | undefined) ||
    (event.payload.event_type as string | undefined) ||
    (event.payload.decision_type as string | undefined) ||
    '';
  return (
    <div className="border-b border-default/40 py-1 text-[10px] last:border-b-0">
      <span className="text-faint">{time}</span>{' '}
      <span className="text-disabled">{event.channel}</span>{' '}
      {persona && <span className="text-tertiary">{persona}</span>}{' '}
      {eventType && <span className="text-muted">· {eventType}</span>}
    </div>
  );
}

function AlertRow({ event }: { event: PulseEvent }) {
  const time = new Date(event.timestamp).toLocaleTimeString();
  const severity = (event.payload.severity as string | undefined) || 'info';
  const summary =
    (event.payload.summary as string | undefined) ||
    (event.payload.message as string | undefined) ||
    (event.payload.event_type as string | undefined) ||
    JSON.stringify(event.payload).slice(0, 80);
  const cls =
    severity === 'critical'
      ? 'border-l-rose-500'
      : severity === 'warning'
      ? 'border-l-amber-500'
      : 'border-l-sky-500';
  return (
    <div className={`border-l-2 ${cls} bg-surface-1 px-1.5 py-1`}>
      <div className="flex items-center justify-between text-[10px]">
        <span className="font-medium uppercase text-tertiary">{severity}</span>
        <span className="text-faint">{time}</span>
      </div>
      <div className="text-[11px] text-secondary">{summary}</div>
    </div>
  );
}

export function MissionControlView() {
  const { data: personas } = usePersonas();
  const events = useMissionControlEvents();

  const alerts = events.filter((e) => e.channel === 'observation-tunnel');
  const ticker = events.filter((e) => e.channel !== 'observation-tunnel').slice(0, 40);

  // KPIs computed from the live buffer (session-scoped — resets on page reload).
  const totalPersonas = personas?.length ?? 0;
  const decisionsSeen = events.filter((e) => e.channel === 'decision_events').length;
  const auditsSeen = events.filter((e) => e.channel === 'audit_log').length;
  const costsSeen = events.filter((e) => e.channel === 'cost_events').length;

  // Per-persona last-event lookup for AgentCard accent.
  const lastEventByPersona: Record<string, string> = {};
  for (const e of events) {
    const persona = (e.payload.persona as string | undefined) || (e.payload.actor as string | undefined);
    if (persona && !lastEventByPersona[persona]) {
      lastEventByPersona[persona] = e.channel;
    }
  }

  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_320px]">
      <div className="space-y-3">
        {/* KPI bar */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <KpiCard label="Personas" value={totalPersonas} subtitle="registered" />
          <KpiCard label="Decisions" value={decisionsSeen} subtitle="session" />
          <KpiCard label="Audits" value={auditsSeen} subtitle="session" />
          <KpiCard label="Costs" value={costsSeen} subtitle="session" />
          <KpiCard label="Alerts" value={alerts.length} accent={alerts.length > 0} />
        </div>

        {/* Agent cards grid */}
        <div>
          <h3 className="mb-1 text-[11px] uppercase tracking-wider text-faint">
            Agent grid · {personas?.length ?? 0} personas
          </h3>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {(personas ?? []).map((p) => (
              <AgentCard key={p.name} persona={p} lastEventByPersona={lastEventByPersona} />
            ))}
          </div>
        </div>
      </div>

      {/* Right sidebar */}
      <div className="space-y-2">
        <div className="rounded border border-default bg-surface-1 p-2">
          <h3 className="mb-1 text-[11px] uppercase tracking-wider text-faint">
            Alerts · {alerts.length}
          </h3>
          {alerts.length === 0 ? (
            <div className="text-[11px] text-disabled">No alerts on the wire.</div>
          ) : (
            <div className="space-y-1">
              {alerts.slice(0, 20).map((a) => (
                <AlertRow key={a.id} event={a} />
              ))}
            </div>
          )}
        </div>

        <div className="rounded border border-default bg-surface-1 p-2">
          <h3 className="mb-1 text-[11px] uppercase tracking-wider text-faint">
            Event ticker · {ticker.length}
          </h3>
          {ticker.length === 0 ? (
            <div className="text-[11px] text-disabled">Idle — no events streaming yet.</div>
          ) : (
            <div className="max-h-[60vh] overflow-y-auto">
              {ticker.map((e) => (
                <TickerRow key={e.id} event={e} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
