import { useState, useRef, useEffect } from 'react';
import { useAskAboutTask, useSaveAskToComments } from '../../api/mutations';

interface TaskAskPanelProps {
  taskId: string;
  onClose: () => void;
}

export function TaskAskPanel({ taskId, onClose }: TaskAskPanelProps) {
  const [question, setQuestion] = useState('');
  const [history, setHistory] = useState<{ q: string; a: string; saved?: boolean }[]>([]);
  const ask = useAskAboutTask(taskId);
  const saveComment = useSaveAskToComments(taskId);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [history, ask.isPending]);

  const handleSubmit = () => {
    const q = question.trim();
    if (!q || ask.isPending) return;
    setQuestion('');
    ask.mutate({ question: q }, {
      onSuccess: (data) => {
        setHistory(prev => [...prev, { q, a: data.answer }]);
      },
      onError: (err) => {
        setHistory(prev => [...prev, { q, a: `Error: ${err.message}` }]);
      },
    });
  };

  const handleSave = (index: number) => {
    const entry = history[index];
    if (!entry || entry.saved) return;
    saveComment.mutate({ question: entry.q, answer: entry.a }, {
      onSuccess: () => {
        setHistory(prev => prev.map((h, i) => i === index ? { ...h, saved: true } : h));
      },
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div className="rounded-lg border border-indigo-500/30 bg-surface-1 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 bg-indigo-500/10 border-b border-indigo-500/20">
        <div className="flex items-center gap-2">
          <span className="text-indigo-400 text-sm font-medium">Ask about this task</span>
          <kbd className="text-[10px] bg-surface-2 border border-subtle rounded px-1.5 py-0.5 text-faint font-mono">a</kbd>
        </div>
        <button
          onClick={onClose}
          className="text-faint hover:text-tertiary text-sm"
        >
          &times;
        </button>
      </div>

      {/* Conversation history */}
      {(history.length > 0 || ask.isPending) && (
        <div ref={scrollRef} className="max-h-80 overflow-y-auto px-4 py-3 space-y-3">
          {history.map((entry, i) => (
            <div key={i} className="space-y-2">
              <div className="flex gap-2">
                <span className="text-[10px] uppercase tracking-wider text-indigo-400/60 font-medium mt-0.5 flex-shrink-0">Q</span>
                <p className="text-sm text-tertiary">{entry.q}</p>
              </div>
              <div className="flex gap-2">
                <span className="text-[10px] uppercase tracking-wider text-emerald-400/60 font-medium mt-0.5 flex-shrink-0">A</span>
                <pre className="whitespace-pre-wrap text-sm text-secondary font-sans flex-1">{entry.a}</pre>
                <button
                  onClick={() => handleSave(i)}
                  disabled={entry.saved || saveComment.isPending}
                  title={entry.saved ? 'Saved to comments' : 'Save to task comments'}
                  className="flex-shrink-0 mt-0.5 text-faint hover:text-indigo-400 disabled:opacity-40 disabled:cursor-default transition-colors"
                >
                  {entry.saved ? (
                    <svg className="w-3.5 h-3.5 text-emerald-400" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                  ) : (
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>
                  )}
                </button>
              </div>
            </div>
          ))}
          {ask.isPending && (
            <div className="flex gap-2 items-center">
              <span className="text-[10px] uppercase tracking-wider text-emerald-400/60 font-medium">A</span>
              <span className="text-sm text-faint animate-pulse">Thinking...</span>
            </div>
          )}
        </div>
      )}

      {/* Input */}
      <div className="px-4 py-3 border-t border-default">
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={question}
            onChange={e => setQuestion(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question about this task..."
            rows={1}
            className="flex-1 rounded bg-surface-2 border border-subtle px-3 py-2 text-sm text-primary focus:border-indigo-500 focus:outline-none resize-none font-sans"
          />
          <button
            onClick={handleSubmit}
            disabled={!question.trim() || ask.isPending}
            className="rounded bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50 flex-shrink-0"
          >
            Ask
          </button>
        </div>
        <p className="text-[11px] text-disabled mt-1.5">
          Enter to send · Shift+Enter for newline · Esc to close
        </p>
      </div>
    </div>
  );
}
