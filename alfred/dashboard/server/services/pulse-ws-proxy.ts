import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'node:http';
import { config } from '../config.js';

let wss: WebSocketServer | null = null;

export function startPulseWsProxy(server: Server): void {
  wss = new WebSocketServer({ server, path: '/ws/pulse' });

  wss.on('connection', (client) => {
    const upstream = new WebSocket(config.pulseWsUrl);
    let upstreamOpen = false;
    const pending: string[] = [];

    upstream.on('open', () => {
      upstreamOpen = true;
      for (const msg of pending) upstream.send(msg);
      pending.length = 0;
    });

    upstream.on('message', (data) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data.toString());
      }
    });

    upstream.on('close', () => {
      upstreamOpen = false;
      if (client.readyState === WebSocket.OPEN) client.close();
    });

    upstream.on('error', () => {
      upstream.close();
    });

    client.on('message', (data) => {
      const msg = data.toString();
      if (upstreamOpen) {
        upstream.send(msg);
      } else {
        pending.push(msg);
      }
    });

    client.on('close', () => {
      if (upstream.readyState === WebSocket.OPEN) upstream.close();
    });

    client.on('error', () => {
      client.close();
    });
  });
}

export function stopPulseWsProxy(): void {
  if (wss) {
    wss.close();
    wss = null;
  }
}
