import type { FastifyInstance } from 'fastify';
import { createReadStream, existsSync, statSync, watchFile, unwatchFile } from 'fs';
import { createInterface } from 'readline';

const LOGS_DIR = process.env.EXECUTION_LOGS_DIR || '/logs/executions';
const PULSE_API = process.env.PULSE_API_URL || 'http://localhost:8700/api/v1';

export async function executionStreamRoutes(app: FastifyInstance) {
  app.get('/api/tasks/:id/execution-stream', async (request, reply) => {
    const { id } = request.params as { id: string };

    const liveFile = `${LOGS_DIR}/live-${id}.jsonl`;

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const send = (event: string, data: unknown) => {
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    if (!existsSync(liveFile)) {
      // Check if the task has a completed execution log instead
      try {
        const res = await fetch(`${PULSE_API}/tasks/${id}`);
        if (res.ok) {
          const task = (await res.json()) as { metadata?: { executor_engine?: string; telemetry?: Record<string, unknown>; live_file?: string } };
          const meta = task.metadata || {};
          if (meta.telemetry) {
            send('status', { stage: 'completed', engine: meta.executor_engine || 'unknown' });
            send('telemetry', meta.telemetry);
            send('done', {});
            reply.raw.end();
            return;
          }
        }
      } catch { /* ignore */ }

      send('status', { stage: 'waiting', message: 'No active execution — waiting for executor to start...' });

      // Poll for the file to appear (executor hasn't started yet)
      let attempts = 0;
      const maxAttempts = 60; // 60 seconds max wait
      const checkInterval = setInterval(() => {
        attempts++;
        if (existsSync(liveFile)) {
          clearInterval(checkInterval);
          streamFile(liveFile, send, reply);
        } else if (attempts >= maxAttempts) {
          clearInterval(checkInterval);
          send('error', { message: 'Execution did not start within timeout' });
          send('done', {});
          reply.raw.end();
        }
      }, 1000);

      request.raw.on('close', () => {
        clearInterval(checkInterval);
      });
      return;
    }

    streamFile(liveFile, send, reply);
  });
}

function streamFile(
  filePath: string,
  send: (event: string, data: unknown) => void,
  reply: { raw: { end: () => void; destroyed: boolean; on?: (event: string, cb: () => void) => void } },
) {
  send('status', { stage: 'streaming' });

  let bytesRead = 0;
  let done = false;

  const readNewLines = () => {
    if (done || reply.raw.destroyed) return;

    try {
      const stat = statSync(filePath);
      if (stat.size <= bytesRead) return;

      const stream = createReadStream(filePath, { start: bytesRead });
      const rl = createInterface({ input: stream });
      let newBytes = 0;

      rl.on('line', (line) => {
        newBytes += Buffer.byteLength(line, 'utf8') + 1;
        try {
          const data = JSON.parse(line) as { event: string; [key: string]: unknown };
          send(data.event, data);
          if (data.event === 'done' || data.event === 'error') {
            done = true;
          }
        } catch { /* skip malformed lines */ }
      });

      rl.on('close', () => {
        bytesRead += newBytes;
        if (done) {
          send('done', {});
          unwatchFile(filePath);
          reply.raw.end();
        }
      });
    } catch { /* file may disappear */ }
  };

  // Initial read
  readNewLines();

  if (!done) {
    // Watch for changes
    watchFile(filePath, { interval: 300 }, () => {
      readNewLines();
    });

    // Cleanup on client disconnect
    const cleanup = () => {
      done = true;
      unwatchFile(filePath);
    };

    // Access the underlying request from reply
    reply.raw.on?.('close', cleanup);

    // Safety timeout: stop after 5 minutes
    setTimeout(() => {
      if (!done) {
        send('error', { message: 'Stream timeout after 5 minutes' });
        cleanup();
        reply.raw.end();
      }
    }, 300_000);
  }
}
