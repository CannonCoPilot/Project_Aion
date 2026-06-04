import { useState, type FormEvent } from 'react';
import { useCreateTask } from '../../api/mutations';
import { PRIORITIES } from '../../lib/priorities';

interface TaskFormProps {
  onClose: () => void;
}

export function TaskForm({ onClose }: TaskFormProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState(2);
  const [labels, setLabels] = useState('');
  const [assignee, setAssignee] = useState('');
  const [routing, setRouting] = useState<'nexus' | 'execute' | 'david' | 'parked'>('nexus');
  const [trust, setTrust] = useState<'default' | 'auto-approve' | 'high'>('default');
  const create = useCreateTask();

  const ROUTING_OPTIONS = [
    { key: 'nexus' as const, label: 'Auto-Progress', desc: 'AI evaluates, classifies, and executes automatically', extraLabels: ['stage:intake'] },
    { key: 'execute' as const, label: 'Execute Now', desc: 'Skip evaluator — run on next executor cycle', extraLabels: ['auto:ready', 'risk:safe', 'stage:queue', 'pipeline:approved'] },
    { key: 'david' as const, label: "I'll Handle", desc: 'Needs your input or session work', extraLabels: ['waiting:owner'] },
    { key: 'parked' as const, label: 'Park It', desc: 'On hold — not now', extraLabels: ['parked'] },
  ];

  const TRUST_OPTIONS = [
    { key: 'default' as const, label: 'Default', desc: 'Normal trust cascade — evaluator decides approval', extraLabels: [] },
    { key: 'auto-approve' as const, label: 'Auto-Approve', desc: 'Skip all approval gates — only deny-list can block', extraLabels: ['trust:auto-approve'] },
    { key: 'high' as const, label: 'High Trust', desc: 'Treated as source:claude-code — auto-approve risk:safe', extraLabels: ['trust:high'] },
  ];

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    const userLabels = labels.trim() ? labels.split(',').map(l => l.trim()).filter(Boolean) : [];
    const routingLabels = ROUTING_OPTIONS.find(r => r.key === routing)?.extraLabels ?? [];
    const trustLabels = TRUST_OPTIONS.find(t => t.key === trust)?.extraLabels ?? [];
    const allLabels = ['source:dashboard', ...userLabels, ...routingLabels, ...trustLabels];
    create.mutate(
      {
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
        labels: allLabels.length > 0 ? allLabels : undefined,
        assignee: assignee.trim() || undefined,
      },
      { onSuccess: () => onClose() }
    );
  };

  // Only show trust selector when routing through the evaluator
  const showTrust = routing === 'nexus';

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-tertiary mb-1">Title</label>
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          className="w-full rounded bg-surface-1 border border-subtle px-3 py-2 text-sm text-primary focus:border-accent-border focus:outline-none"
          placeholder="Task title"
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-tertiary mb-1">Description</label>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          className="w-full rounded bg-surface-1 border border-subtle px-3 py-2 text-sm text-primary focus:border-accent-border focus:outline-none"
          rows={4}
          placeholder="Task description"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-tertiary mb-1">Priority</label>
          <select
            value={priority}
            onChange={e => setPriority(Number(e.target.value))}
            className="w-full rounded bg-surface-1 border border-subtle px-3 py-2 text-sm text-primary focus:border-accent-border focus:outline-none"
          >
            {Object.values(PRIORITIES).map(p => (
              <option key={p.level} value={p.level}>
                {p.symbol} {p.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-tertiary mb-1">Assignee</label>
          <input
            value={assignee}
            onChange={e => setAssignee(e.target.value)}
            className="w-full rounded bg-surface-1 border border-subtle px-3 py-2 text-sm text-primary focus:border-accent-border focus:outline-none"
            placeholder="Assignee name"
          />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-tertiary mb-1">Labels (comma-separated)</label>
        <input
          value={labels}
          onChange={e => setLabels(e.target.value)}
          className="w-full rounded bg-surface-1 border border-subtle px-3 py-2 text-sm text-primary focus:border-accent-border focus:outline-none"
          placeholder="domain:infrastructure, project:aiprojects"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-tertiary mb-2">Route To</label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {ROUTING_OPTIONS.map(opt => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setRouting(opt.key)}
              title={opt.desc}
              className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                routing === opt.key
                  ? opt.key === 'nexus' ? 'border-accent/50 bg-accent/10 text-accent-text'
                    : opt.key === 'execute' ? 'border-green-500/50 bg-green-500/10 text-green-400'
                    : opt.key === 'david' ? 'border-orange-500/50 bg-orange-500/10 text-orange-400'
                    : 'border-b-muted/50 bg-surface-muted/10 text-tertiary'
                  : 'border-subtle bg-surface-1 text-muted hover:border-b-muted hover:text-tertiary'
              }`}
            >
              <span className="text-sm font-medium block">{opt.label}</span>
              <span className="text-[10px] opacity-60 block mt-0.5">{opt.desc}</span>
            </button>
          ))}
        </div>
      </div>
      {showTrust && (
        <div>
          <label className="block text-sm font-medium text-tertiary mb-2">Approval</label>
          <div className="grid grid-cols-3 gap-2">
            {TRUST_OPTIONS.map(opt => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setTrust(opt.key)}
                title={opt.desc}
                className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                  trust === opt.key
                    ? opt.key === 'auto-approve' ? 'border-green-500/50 bg-green-500/10 text-green-400'
                      : opt.key === 'high' ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-400'
                      : 'border-b-muted bg-surface-2 text-secondary'
                    : 'border-subtle bg-surface-1 text-muted hover:border-b-muted hover:text-tertiary'
                }`}
              >
                <span className="text-sm font-medium block">{opt.label}</span>
                <span className="text-[10px] opacity-60 block mt-0.5">{opt.desc}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onClose}
          className="rounded px-3 py-1.5 text-sm text-muted hover:text-secondary"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!title.trim() || create.isPending}
          className="rounded bg-accent-hover px-4 py-1.5 text-sm font-medium text-white hover:bg-accent disabled:opacity-50"
        >
          {create.isPending ? 'Creating...' : 'Create Task'}
        </button>
      </div>
    </form>
  );
}
