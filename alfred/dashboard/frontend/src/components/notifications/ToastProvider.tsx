import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

interface Toast {
  id: string;
  title: string;
  body: string;
  severity: 'info' | 'warning' | 'critical';
  url?: string;
  timestamp: number;
}

interface ToastContextValue {
  addToast: (toast: Omit<Toast, 'id' | 'timestamp'>) => void;
  dismissToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

const SEVERITY_STYLES: Record<string, string> = {
  info: 'border-accent/30 bg-accent/10',
  warning: 'border-yellow-500/30 bg-yellow-500/10',
  critical: 'border-red-500/30 bg-red-500/10',
};

const SEVERITY_DOTS: Record<string, string> = {
  info: 'bg-accent-light',
  warning: 'bg-yellow-400',
  critical: 'bg-red-500 animate-pulse',
};

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  return (
    <div
      className={`flex items-start gap-3 rounded-lg border p-3 shadow-lg backdrop-blur-sm cursor-pointer transition-all animate-slide-in ${SEVERITY_STYLES[toast.severity] ?? SEVERITY_STYLES.info}`}
      onClick={() => {
        if (toast.url) {
          window.location.href = toast.url;
        }
        onDismiss();
      }}
      role="alert"
    >
      <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${SEVERITY_DOTS[toast.severity] ?? SEVERITY_DOTS.info}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-primary truncate">{toast.title}</p>
        <p className="text-xs text-muted mt-0.5 line-clamp-2">{toast.body}</p>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onDismiss(); }}
        className="text-faint hover:text-tertiary text-sm p-0.5 shrink-0"
        aria-label="Dismiss"
      >
        {'\u2715'}
      </button>
    </div>
  );
}

export default function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((t: Omit<Toast, 'id' | 'timestamp'>) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const toast: Toast = { ...t, id, timestamp: Date.now() };
    setToasts(prev => [...prev.slice(-4), toast]);

    const timeout = t.severity === 'critical' ? 15000 : 8000;
    setTimeout(() => {
      setToasts(prev => prev.filter(x => x.id !== id));
    }, timeout);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(x => x.id !== id));
  }, []);

  return (
    <ToastContext value={{ addToast, dismissToast }}>
      {children}
      {toasts.length > 0 && (
        <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-80 max-w-[calc(100vw-2rem)]">
          {toasts.map(toast => (
            <ToastItem key={toast.id} toast={toast} onDismiss={() => dismissToast(toast.id)} />
          ))}
        </div>
      )}
    </ToastContext>
  );
}
