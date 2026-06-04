import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'node:http';
import { statSync } from 'node:fs';
import { readdirSync } from 'node:fs';
import {
  getHealthStatus,
  getLastEventId,
  getRecentEvents,
  getPendingApprovals,
} from './nexus-db.js';
import { sendNotification } from './push.js';
import { getUnreadCount } from './dashboard-db.js';
import { config } from '../config.js';

let wss: WebSocketServer | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let nexusOpsPollTimer: ReturnType<typeof setInterval> | null = null;
let lastKnownEventId = 0;
let lastApprovalCount = 0;
let lastUnreadCount = 0;
let lastDispatcherStatus = '';

// --- Health tracking ---
let totalConnections = 0;
let lastBroadcastTime: string | null = null;
let broadcastCount = 0;

interface WsMessage {
  type: 'activity' | 'approval' | 'health' | 'nexus-ops:update' | 'notification';
  data: unknown;
}

// --- Nexus-Ops mtime tracking ---

interface NexusOpsMtimes {
  nexusDb: number;
  taskReviewerDir: number;
  executionDir: number;
  structuredLogs: number;
  relayMessages: number;
}

let lastNexusOpsMtimes: NexusOpsMtimes | null = null;

function getMtimeSafe(path: string): number {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return 0;
  }
}

function getDirMtimeSafe(path: string): number {
  try {
    const stat = statSync(path);
    if (!stat.isDirectory()) return stat.mtimeMs;
    // Check dir mtime plus most recent file mtime
    let latest = stat.mtimeMs;
    const files = readdirSync(path);
    for (const f of files.slice(-10)) {
      try {
        const fstat = statSync(`${path}/${f}`);
        if (fstat.mtimeMs > latest) latest = fstat.mtimeMs;
      } catch {
        /* ignore */
      }
    }
    return latest;
  } catch {
    return 0;
  }
}

function getCurrentNexusOpsMtimes(): NexusOpsMtimes {
  return {
    nexusDb: getMtimeSafe(config.nexusDbPath),
    taskReviewerDir: getDirMtimeSafe(config.taskReviewerResultsDir),
    executionDir: getDirMtimeSafe(config.executionLogsDir),
    structuredLogs: getMtimeSafe(config.structuredLogsPath),
    relayMessages: getMtimeSafe(config.relayMessagesPath),
  };
}

type NexusOpsChannel = 'timeline' | 'alerts' | 'graph' | 'analytics';

function detectNexusOpsChanges(prev: NexusOpsMtimes, curr: NexusOpsMtimes): NexusOpsChannel[] {
  const changed: Set<NexusOpsChannel> = new Set();

  // Any data source change affects timeline and graph
  const dataChanged =
    curr.nexusDb !== prev.nexusDb ||
    curr.taskReviewerDir !== prev.taskReviewerDir ||
    curr.executionDir !== prev.executionDir ||
    curr.structuredLogs !== prev.structuredLogs ||
    curr.relayMessages !== prev.relayMessages;

  if (dataChanged) {
    changed.add('timeline');
    changed.add('graph');
    changed.add('analytics');
    changed.add('alerts');
  }

  return [...changed];
}

function pollNexusOps(): void {
  try {
    const current = getCurrentNexusOpsMtimes();
    if (!lastNexusOpsMtimes) {
      lastNexusOpsMtimes = current;
      return;
    }

    const channels = detectNexusOpsChanges(lastNexusOpsMtimes, current);
    if (channels.length > 0) {
      const timestamp = new Date().toISOString();
      for (const channel of channels) {
        broadcast({
          type: 'nexus-ops:update',
          data: { type: channel, timestamp },
        });
      }
    }

    lastNexusOpsMtimes = current;
  } catch {
    // Silently ignore — files may be temporarily unavailable
  }
}

function broadcast(message: WsMessage): void {
  if (!wss) return;
  const payload = JSON.stringify(message);
  let sent = 0;
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
      sent++;
    }
  }
  if (sent > 0) {
    lastBroadcastTime = new Date().toISOString();
    broadcastCount++;
  }
}

async function pollForChanges(): Promise<void> {
  try {
    const currentMaxId = getLastEventId();
    if (currentMaxId > lastKnownEventId) {
      // New events since last poll
      const newEvents = getRecentEvents(currentMaxId - lastKnownEventId);
      broadcast({ type: 'activity', data: { events: newEvents } });

      lastKnownEventId = currentMaxId;
    }

    // Check waiting:david approvals and broadcast on every poll
    const pendingApprovals = await getPendingApprovals();
    broadcast({ type: 'approval', data: { approvals: pendingApprovals } });

    // Push notification for new approvals
    if (pendingApprovals.length > lastApprovalCount) {
      const newCount = pendingApprovals.length - lastApprovalCount;
      sendNotification({
        title: `${newCount} new approval${newCount > 1 ? 's' : ''} pending`,
        body: pendingApprovals[0]?.question ?? 'Agent needs your input',
        category: 'escalation',
        url: '/queue?tab=approvals',
        tag: 'escalation',
      }).catch(() => {});
    }
    lastApprovalCount = pendingApprovals.length;

    // Always broadcast health on each poll
    const health = await getHealthStatus();
    broadcast({ type: 'health', data: health });

    // Broadcast unread notification count when it changes
    try {
      const currentUnread = getUnreadCount();
      if (currentUnread !== lastUnreadCount) {
        broadcast({ type: 'notification', data: { unreadCount: currentUnread } });
        lastUnreadCount = currentUnread;
      }
    } catch {
      // Ignore — dashboard DB may be temporarily locked
    }

    // Push notification if dispatcher goes down
    if (
      lastDispatcherStatus &&
      lastDispatcherStatus !== 'down' &&
      health.dispatcher.status === 'down'
    ) {
      sendNotification({
        title: 'Dispatcher is DOWN',
        body: `Last heartbeat: ${health.dispatcher.lastHeartbeat ?? 'unknown'}`,
        category: 'health_critical',
        url: '/health',
        tag: 'health',
      }).catch(() => {});
    }
    lastDispatcherStatus = health.dispatcher.status;
  } catch {
    // Silently ignore poll errors — db might be temporarily locked
  }
}

export function startWebSocket(server: Server): WebSocketServer {
  wss = new WebSocketServer({ server, path: '/ws' });

  // Initialize last known event ID
  try {
    lastKnownEventId = getLastEventId();
  } catch {
    lastKnownEventId = 0;
  }

  wss.on('connection', (ws) => {
    totalConnections++;
    // Send current health status on connect
    try {
      getHealthStatus()
        .then((health) => {
          ws.send(JSON.stringify({ type: 'health', data: health }));
        })
        .catch(() => {});

      getPendingApprovals()
        .then((approvals) => {
          ws.send(JSON.stringify({ type: 'approval', data: { approvals } }));
        })
        .catch(() => {});

      const unreadCount = getUnreadCount();
      ws.send(JSON.stringify({ type: 'notification', data: { unreadCount } }));
    } catch {
      // Ignore errors on initial send
    }
  });

  // Start polling
  pollTimer = setInterval(pollForChanges, config.wsPollInterval);

  // Start nexus-ops mtime polling (every 5s)
  lastNexusOpsMtimes = getCurrentNexusOpsMtimes();
  nexusOpsPollTimer = setInterval(pollNexusOps, 5000);

  return wss;
}

export function getWebSocketHealth() {
  return {
    activeConnections: wss
      ? [...wss.clients].filter((c) => c.readyState === WebSocket.OPEN).length
      : 0,
    totalConnections,
    lastBroadcast: lastBroadcastTime,
    broadcastCount,
  };
}

export function stopWebSocket(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  if (nexusOpsPollTimer) {
    clearInterval(nexusOpsPollTimer);
    nexusOpsPollTimer = null;
  }
  if (wss) {
    wss.close();
    wss = null;
  }
}
