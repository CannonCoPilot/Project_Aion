import { useState, useRef, useEffect, useCallback } from 'react';

interface TaskPayload {
  title: string;
  description: string;
  richDescription?: string;
  priority: string;
  model?: string;
  persona?: string;
  labels?: string[];
}

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  task?: TaskPayload;
  launched?: { id: string; title: string };
  timestamp: string;
}

interface StreamState {
  active: boolean;
  stage: string;
  tokens: string;
  tokenCount: number;
  model: string;
}

const STORAGE_KEY = 'project-creator-state';

const MODELS = [
  { value: 'qwen3:32b', label: 'Qwen3 32B (Local)', desc: 'Text generation — no API cost' },
  { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', desc: 'Full tool use — API cost applies' },
];

const PERSONAS = [
  'librarian', 'creative-builder', 'full-stack', 'ux-eng', 'devops',
  'data-eng', 'qa-eng', 'docs-writer', 'security-eng', 'sre',
];

function loadPersistedState(): { messages: Message[]; currentTask: TaskPayload | null } {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return {
    messages: [{
      role: 'system',
      content: 'Describe your project idea and I\'ll convert it into a structured task ticket for the pipeline. You can refine it before launching.',
      timestamp: new Date().toISOString(),
    }],
    currentTask: null,
  };
}

function persistState(messages: Message[], currentTask: TaskPayload | null) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ messages: messages.slice(-50), currentTask }));
  } catch { /* ignore */ }
}

export default function ProjectCreatorPage() {
  const saved = useRef(loadPersistedState());
  const [messages, setMessages] = useState<Message[]>(saved.current.messages);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [currentTask, setCurrentTask] = useState<TaskPayload | null>(saved.current.currentTask);
  const [originalPrompt, setOriginalPrompt] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [stream, setStream] = useState<StreamState>({ active: false, stage: '', tokens: '', tokenCount: 0, model: '' });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (stream.active && streamRef.current) {
      streamRef.current.scrollTop = streamRef.current.scrollHeight;
    }
  }, [stream.tokens, stream.active]);

  useEffect(() => {
    persistState(messages, currentTask);
  }, [messages, currentTask]);

  const addMessage = useCallback((msg: Omit<Message, 'timestamp'>) => {
    setMessages((prev) => [...prev, { ...msg, timestamp: new Date().toISOString() }]);
  }, []);

  const handleSendStreaming = async (text: string) => {
    setOriginalPrompt(text);
    setStream({ active: true, stage: 'connecting', tokens: '', tokenCount: 0, model: '' });
    setLoading(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch('/api/project-creator/generate-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: text }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error(`Server error: ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullTokens = '';

      let currentEvent = '';

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

              if (eventType === 'status') {
                setStream((s) => ({ ...s, stage: data.stage, model: data.model || s.model }));
              } else if (eventType === 'token') {
                fullTokens += data.text;
                setStream((s) => ({ ...s, tokens: fullTokens, tokenCount: data.count, stage: 'generating' }));
              } else if (eventType === 'telemetry') {
                setStream((s) => ({ ...s, stage: `done — ${data.completion_tokens} tokens in ${(data.total_duration_ms / 1000).toFixed(1)}s` }));
              } else if (eventType === 'task') {
                setCurrentTask(data.task);
                addMessage({
                  role: 'assistant',
                  content: 'Task ticket generated. Review it, refine, or launch to the board:',
                  task: data.task,
                });
              } else if (eventType === 'error') {
                addMessage({ role: 'assistant', content: `Error: ${data.message}` });
              }
            } catch { /* skip parse errors */ }
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        addMessage({ role: 'assistant', content: `Stream error: ${(err as Error).message}` });
      }
    } finally {
      setStream((s) => ({ ...s, active: false }));
      setLoading(false);
      abortRef.current = null;
    }
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    addMessage({ role: 'user', content: text });

    if (currentTask) {
      const lower = text.toLowerCase();
      const isLaunchIntent = /^(launch|submit|send|ship|post)\b/.test(lower) || lower.includes('launch to board') || lower.includes('send to board');
      if (isLaunchIntent) {
        handleLaunch();
        return;
      }
      setLoading(true);
      try {
        const res = await fetch('/api/project-creator/refine', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ task: currentTask, instruction: text }),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        setCurrentTask(data.task);
        addMessage({ role: 'assistant', content: 'Task updated:', task: data.task });
      } catch (err) {
        addMessage({ role: 'assistant', content: `Error: ${(err as Error).message}` });
      } finally {
        setLoading(false);
      }
    } else {
      handleSendStreaming(text);
    }
  };

  const handleLaunch = async () => {
    if (!currentTask || loading) return;
    setLoading(true);
    try {
      const res = await fetch('/api/project-creator/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task: currentTask, originalPrompt }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      addMessage({ role: 'system', content: 'Task launched to board!', launched: data.launched });
      setCurrentTask(null);
    } catch (err) {
      addMessage({ role: 'assistant', content: `Launch failed: ${(err as Error).message}` });
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    abortRef.current?.abort();
    setStream({ active: false, stage: 'cancelled', tokens: '', tokenCount: 0, model: '' });
    setLoading(false);
  };

  const handleNewProject = () => {
    abortRef.current?.abort();
    setCurrentTask(null);
    setEditMode(false);
    setStream({ active: false, stage: '', tokens: '', tokenCount: 0, model: '' });
    addMessage({ role: 'system', content: 'Ready for a new project idea.' });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const updateTaskField = (field: keyof TaskPayload, value: string | string[]) => {
    if (!currentTask) return;
    setCurrentTask({ ...currentTask, [field]: value });
  };

  return (
    <div className="flex flex-col h-full max-h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-default px-4 py-3 bg-surface-1">
        <div>
          <h1 className="text-lg font-bold text-accent-text">Project Creator</h1>
          <p className="text-xs text-muted">Describe a project → Generate ticket → Launch to pipeline</p>
        </div>
        <div className="flex gap-2">
          {stream.active && (
            <button onClick={handleCancel} className="px-3 py-1.5 text-xs rounded bg-red-600/20 border border-red-500/30 text-red-400 hover:bg-red-600/30 transition-colors">
              Cancel
            </button>
          )}
          {currentTask && (
            <>
              <button onClick={() => setEditMode(!editMode)} className="px-3 py-1.5 text-xs rounded bg-surface-2 border border-default text-muted hover:text-primary transition-colors">
                {editMode ? 'Chat' : 'Edit'}
              </button>
              <button onClick={handleLaunch} disabled={loading} className="px-4 py-1.5 text-xs font-medium rounded bg-green-600 text-white hover:bg-green-500 disabled:opacity-50 transition-colors">
                {loading ? 'Launching...' : 'Launch to Board'}
              </button>
            </>
          )}
          <button onClick={handleNewProject} className="px-3 py-1.5 text-xs rounded bg-surface-2 border border-default text-muted hover:text-primary transition-colors">
            New
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Chat Panel */}
        <div className={`flex flex-col ${editMode && currentTask ? 'w-1/2' : 'w-full'} overflow-hidden`}>
          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-lg px-4 py-2.5 ${
                  msg.role === 'user'
                    ? 'bg-blue-600/20 border border-blue-500/30 text-primary'
                    : msg.role === 'system'
                      ? 'bg-surface-2 border border-default text-muted text-sm'
                      : 'bg-surface-1 border border-default text-primary'
                }`}>
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  {msg.task && <TaskPreview task={msg.task} />}
                  {msg.launched && (
                    <a href={`/tasks/${msg.launched.id}`} className="inline-block mt-2 text-xs text-blue-400 hover:text-blue-300 underline">
                      View {msg.launched.id} on board →
                    </a>
                  )}
                </div>
              </div>
            ))}

            {/* Streaming output panel */}
            {stream.active && (
              <div className="flex justify-start">
                <div className="max-w-[90%] w-full rounded-lg overflow-hidden border border-default">
                  {/* Stream header */}
                  <div className="flex items-center justify-between px-3 py-1.5 bg-surface-2 border-b border-default">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                      <span className="text-xs text-muted">{stream.stage}</span>
                      {stream.model && <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-400">{stream.model}</span>}
                    </div>
                    <span className="text-[10px] text-faint">{stream.tokenCount} tokens</span>
                  </div>
                  {/* Stream content — terminal-like */}
                  <div ref={streamRef} className="bg-surface-base px-3 py-2 max-h-64 overflow-y-auto font-mono text-xs text-secondary leading-relaxed whitespace-pre-wrap">
                    {stream.tokens || <span className="text-faint animate-pulse">Waiting for first token...</span>}
                    <span className="animate-pulse text-accent">▊</span>
                  </div>
                </div>
              </div>
            )}

            {loading && !stream.active && (
              <div className="flex justify-start">
                <div className="bg-surface-1 border border-default rounded-lg px-4 py-2.5">
                  <span className="text-sm text-muted animate-pulse">Processing...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t border-default p-3 bg-surface-1">
            <div className="flex gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={currentTask ? 'Refine the task... (e.g., "add a validation step", "use claude instead")' : 'Describe your project idea...'}
                className="flex-1 bg-surface-2 border border-default rounded-lg px-3 py-2 text-sm text-primary placeholder-faint resize-none focus:outline-none focus:ring-1 focus:ring-accent/50"
                rows={2}
                disabled={loading}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || loading}
                className="self-end px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40 transition-colors"
              >
                Send
              </button>
            </div>
          </div>
        </div>

        {/* Edit Panel */}
        {editMode && currentTask && (
          <div className="w-1/2 border-l border-default overflow-y-auto p-4 bg-surface-base space-y-4">
            <h2 className="text-sm font-semibold text-accent-text">Edit Task</h2>

            <label className="block">
              <span className="text-xs text-muted">Title</span>
              <input
                type="text"
                value={currentTask.title}
                onChange={(e) => updateTaskField('title', e.target.value)}
                className="mt-1 w-full bg-surface-2 border border-default rounded px-3 py-1.5 text-sm text-primary focus:outline-none focus:ring-1 focus:ring-accent/50"
              />
            </label>

            <label className="block">
              <span className="text-xs text-muted">Rich Description (source of truth for the ticket)</span>
              <textarea
                value={currentTask.richDescription || currentTask.description}
                onChange={(e) => updateTaskField('richDescription', e.target.value)}
                rows={14}
                className="mt-1 w-full bg-surface-2 border border-default rounded px-3 py-1.5 text-sm text-primary font-mono resize-y focus:outline-none focus:ring-1 focus:ring-accent/50"
              />
            </label>

            <label className="block">
              <span className="text-xs text-muted">Summary (metadata — condensed reference)</span>
              <textarea
                value={currentTask.description}
                onChange={(e) => updateTaskField('description', e.target.value)}
                rows={3}
                className="mt-1 w-full bg-surface-2 border border-default rounded px-3 py-1.5 text-sm text-primary font-mono resize-y focus:outline-none focus:ring-1 focus:ring-accent/50"
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs text-muted">Model</span>
                <select
                  value={currentTask.model || 'qwen3:32b'}
                  onChange={(e) => updateTaskField('model', e.target.value)}
                  className="mt-1 w-full bg-surface-2 border border-default rounded px-3 py-1.5 text-sm text-primary"
                >
                  {MODELS.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-xs text-muted">Persona</span>
                <select
                  value={currentTask.persona || 'librarian'}
                  onChange={(e) => updateTaskField('persona', e.target.value)}
                  className="mt-1 w-full bg-surface-2 border border-default rounded px-3 py-1.5 text-sm text-primary"
                >
                  {PERSONAS.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-xs text-muted">Priority</span>
                <select
                  value={currentTask.priority || 'medium'}
                  onChange={(e) => updateTaskField('priority', e.target.value)}
                  className="mt-1 w-full bg-surface-2 border border-default rounded px-3 py-1.5 text-sm text-primary"
                >
                  <option value="critical">Critical</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                  <option value="backlog">Backlog</option>
                </select>
              </label>

              <label className="block">
                <span className="text-xs text-muted">Project Label</span>
                <input
                  type="text"
                  value={(currentTask.labels || []).find((l) => l.startsWith('project:'))?.replace('project:', '') || ''}
                  onChange={(e) => {
                    const others = (currentTask.labels || []).filter((l) => !l.startsWith('project:'));
                    updateTaskField('labels', e.target.value ? [...others, `project:${e.target.value}`] : others);
                  }}
                  className="mt-1 w-full bg-surface-2 border border-default rounded px-3 py-1.5 text-sm text-primary"
                  placeholder="e.g., gospel-synopsis"
                />
              </label>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TaskPreview({ task }: { task: TaskPayload }) {
  const [expanded, setExpanded] = useState(false);
  const displayDesc = task.richDescription || task.description;

  return (
    <div className="mt-3 bg-surface-base border border-default rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-surface-2 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <span className="text-xs font-medium text-accent-text">{task.title}</span>
        <div className="flex items-center gap-2">
          {task.model && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded ${
              task.model.includes('qwen') ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-400'
            }`}>{task.model}</span>
          )}
          {task.persona && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400">{task.persona}</span>
          )}
          <span className="text-xs text-muted">{expanded ? '▲' : '▼'}</span>
        </div>
      </div>
      {expanded && (
        <div className="px-3 py-2 text-xs text-muted space-y-2">
          <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed max-h-80 overflow-y-auto">{displayDesc}</pre>
          {task.richDescription && (
            <div className="border-t border-default pt-2">
              <span className="text-[10px] text-faint">Summary: </span>
              <span className="text-[10px] text-secondary">{task.description}</span>
            </div>
          )}
          {task.labels && task.labels.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {task.labels.map((l, i) => (
                <span key={i} className="px-1.5 py-0.5 rounded bg-surface-2 text-[10px]">{l}</span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
