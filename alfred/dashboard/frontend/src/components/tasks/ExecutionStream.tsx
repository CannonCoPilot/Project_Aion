import { useState, useRef, useEffect, useCallback } from 'react';

interface StreamState {
  connected: boolean;
  stage: string;
  tokens: string;
  tokenCount: number;
  model: string;
  error: string | null;
  telemetry: { duration_ms?: number; prompt_tokens?: number; completion_tokens?: number } | null;
}

export function ExecutionStream({ taskId, isActive }: { taskId: string; isActive: boolean }) {
  const [stream, setStream] = useState<StreamState>({
    connected: false, stage: '', tokens: '', tokenCount: 0, model: '', error: null, telemetry: null,
  });
  const [expanded, setExpanded] = useState(true);
  const streamRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  const connect = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setStream(s => ({ ...s, connected: true, stage: 'connecting', error: null }));

    try {
      const res = await fetch(`/api/tasks/${taskId}/execution-stream`, { signal: controller.signal });
      if (!res.ok || !res.body) {
        setStream(s => ({ ...s, connected: false, error: `Server error: ${res.status}` }));
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let currentEvent = '';
      let fullTokens = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7);
          } else if (line.startsWith('data: ') && currentEvent) {
            try {
              const data = JSON.parse(line.slice(6));
              const eventType = currentEvent;
              currentEvent = '';

              if (!mountedRef.current) return;

              if (eventType === 'status') {
                setStream(s => ({ ...s, stage: data.stage, model: data.model || s.model }));
              } else if (eventType === 'token') {
                fullTokens += data.text;
                setStream(s => ({ ...s, tokens: fullTokens, tokenCount: data.n, stage: 'generating' }));
              } else if (eventType === 'telemetry') {
                setStream(s => ({ ...s, telemetry: data }));
              } else if (eventType === 'done') {
                setStream(s => ({ ...s, stage: 'completed', connected: false }));
              } else if (eventType === 'error') {
                setStream(s => ({ ...s, error: data.message, connected: false }));
              } else if (eventType === 'start') {
                setStream(s => ({ ...s, stage: 'started', model: data.model || s.model }));
              }
            } catch { /* skip parse errors */ }
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError' && mountedRef.current) {
        setStream(s => ({ ...s, connected: false, error: (err as Error).message }));
      }
    }
  }, [taskId]);

  useEffect(() => {
    mountedRef.current = true;
    if (isActive) connect();
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, [isActive, connect]);

  useEffect(() => {
    if (stream.stage === 'generating' && streamRef.current) {
      streamRef.current.scrollTop = streamRef.current.scrollHeight;
    }
  }, [stream.tokens, stream.stage]);

  if (!isActive && !stream.tokens && !stream.telemetry) return null;

  const hasContent = stream.tokens || stream.telemetry || stream.stage === 'waiting';

  return (
    <div>
      <div
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <h2 className="text-sm font-medium text-muted">
          Execution Output
          {stream.connected && <span className="ml-2 w-2 h-2 rounded-full bg-green-500 animate-pulse inline-block" />}
        </h2>
        {hasContent && (
          <span className="text-xs text-faint">{expanded ? '▲' : '▼'}</span>
        )}
      </div>

      {expanded && hasContent && (
        <div className="mt-2 rounded-lg border border-default overflow-hidden">
          {/* Stream header */}
          <div className="flex items-center justify-between px-3 py-1.5 bg-surface-2 border-b border-default">
            <div className="flex items-center gap-2">
              {stream.connected && (
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              )}
              <span className="text-xs text-muted">{stream.stage || 'idle'}</span>
              {stream.model && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-400">
                  {stream.model}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {stream.tokenCount > 0 && (
                <span className="text-[10px] text-faint">{stream.tokenCount} tokens</span>
              )}
              {stream.telemetry?.duration_ms && (
                <span className="text-[10px] text-faint">
                  {(stream.telemetry.duration_ms / 1000).toFixed(1)}s
                </span>
              )}
              {!stream.connected && isActive && (
                <button
                  onClick={(e) => { e.stopPropagation(); connect(); }}
                  className="text-[10px] text-accent-text hover:text-accent transition-colors"
                >
                  Reconnect
                </button>
              )}
            </div>
          </div>

          {/* Stream content */}
          <div
            ref={streamRef}
            className="bg-surface-base px-3 py-2 max-h-64 overflow-y-auto font-mono text-xs text-secondary leading-relaxed whitespace-pre-wrap"
          >
            {stream.error && (
              <div className="text-red-400 mb-2">Error: {stream.error}</div>
            )}
            {stream.tokens || (
              <span className="text-faint">
                {stream.stage === 'waiting'
                  ? 'Waiting for executor to start...'
                  : stream.stage === 'completed'
                    ? 'Execution completed.'
                    : 'Connecting...'}
              </span>
            )}
            {stream.connected && stream.stage === 'generating' && (
              <span className="animate-pulse text-accent">▊</span>
            )}
          </div>

          {/* Telemetry footer */}
          {stream.telemetry && (
            <div className="flex items-center gap-4 px-3 py-1.5 bg-surface-2 border-t border-default text-[10px] text-faint">
              {stream.telemetry.prompt_tokens != null && (
                <span>Prompt: {stream.telemetry.prompt_tokens}</span>
              )}
              {stream.telemetry.completion_tokens != null && (
                <span>Completion: {stream.telemetry.completion_tokens}</span>
              )}
              {stream.telemetry.duration_ms != null && (
                <span>Duration: {(stream.telemetry.duration_ms / 1000).toFixed(1)}s</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
