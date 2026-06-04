// NewPersonaWizard — Phase 1.2 Task #4 (v5 design §4.5).
//
// 8-step wizard for creating new Tier-D personas. Per design: never lets the user
// elevate to Tier C — that requires admin + job-binding on the filesystem side.
// POST /api/v1/personas accepts the assembled config; pulse writes filesystem
// files (config.yaml + permissions.yaml + prompt.md + methodology.yaml) and
// inserts metadata row.

import { useState } from 'react';
import { useCreatePersona, usePersonas, useToolCatalog } from '../../api/personas';
import { CLUSTERS, type ClusterId } from '../../lib/persona-clusters';

type StepId = 'identity' | 'template' | 'engine' | 'tools' | 'permissions' | 'prompt' | 'methodology' | 'review';

const STEPS: { id: StepId; label: string }[] = [
  { id: 'identity', label: '1. Identity' },
  { id: 'template', label: '2. Base template' },
  { id: 'engine', label: '3. Engine + model' },
  { id: 'tools', label: '4. Tool assignments' },
  { id: 'permissions', label: '5. Permissions tier' },
  { id: 'prompt', label: '6. Prompt' },
  { id: 'methodology', label: '7. Methodology' },
  { id: 'review', label: '8. Review & create' },
];

interface WizardState {
  name: string;
  description: string;
  cluster: ClusterId | '';
  base_template: string;
  engine_default: string;
  engine_model: string;
  engine_fallback: string;
  permissions_tier: 'research' | 'builder' | 'executor' | 'creative' | 'analyst';
  allowed_tools: string[];
  prompt_content: string;
  methodology_identity: string;
  methodology_voice: string;
}

const INITIAL: WizardState = {
  name: '',
  description: '',
  cluster: '',
  base_template: '_template',
  engine_default: 'claude-code',
  engine_model: 'sonnet',
  engine_fallback: '',
  permissions_tier: 'research',
  allowed_tools: [],
  prompt_content: '',
  methodology_identity: '',
  methodology_voice: '',
};

function StepRail({ active, onStep, completed }: { active: StepId; onStep: (s: StepId) => void; completed: Set<StepId> }) {
  return (
    <ol className="space-y-1">
      {STEPS.map((s) => (
        <li key={s.id}>
          <button
            onClick={() => onStep(s.id)}
            className={`w-full rounded px-3 py-1.5 text-left text-xs transition-colors ${
              active === s.id
                ? 'bg-accent/15 text-accent-text'
                : completed.has(s.id)
                  ? 'text-emerald-300/80 hover:bg-surface-2'
                  : 'text-tertiary hover:bg-surface-2'
            }`}
          >
            <span aria-hidden>{completed.has(s.id) ? '✓ ' : '  '}</span>
            {s.label}
          </button>
        </li>
      ))}
    </ol>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="block text-xs font-medium text-tertiary">{label}</span>
      {hint && <span className="block text-[11px] text-disabled">{hint}</span>}
      {children}
    </label>
  );
}

const INPUT_BASE =
  'w-full rounded border border-subtle bg-surface-2 px-2 py-1.5 text-xs text-secondary focus:border-accent-border focus:outline-none';

export function NewPersonaWizard() {
  const { data: personas } = usePersonas();
  const { data: catalog } = useToolCatalog();
  const createPersona = useCreatePersona();

  const [state, setState] = useState<WizardState>(INITIAL);
  const [activeStep, setActiveStep] = useState<StepId>('identity');
  const [completed, setCompleted] = useState<Set<StepId>>(new Set());
  const [createResult, setCreateResult] = useState<{ ok: boolean; message: string; name?: string } | null>(null);

  const set = <K extends keyof WizardState>(k: K, v: WizardState[K]) =>
    setState((s) => ({ ...s, [k]: v }));

  const nameTaken = !!personas?.find((p) => p.name === state.name);
  const nameValid = /^[a-z0-9-]+$/.test(state.name) && state.name.length >= 3 && !nameTaken;

  const markCompleteAndAdvance = (next: StepId) => {
    setCompleted((c) => new Set([...c, activeStep]));
    setActiveStep(next);
  };

  const handleCreate = async () => {
    if (!nameValid || !state.prompt_content) return;
    try {
      const result: { persona?: string } = await createPersona.mutateAsync({
        name: state.name,
        tier: 'D' as const,
        cluster: state.cluster || undefined,
        description: state.description,
        base_template: state.base_template,
        engine: { default: state.engine_default, model: state.engine_model, fallback: state.engine_fallback || null },
        prompt_content: state.prompt_content,
        methodology: {
          identity: state.methodology_identity,
          voice: state.methodology_voice,
        },
        allowed_tools: state.allowed_tools,
        created_by: 'ui-wizard',
      });
      setCreateResult({ ok: true, message: `Created persona '${result.persona ?? state.name}'.`, name: result.persona ?? state.name });
    } catch (err) {
      setCreateResult({ ok: false, message: (err as Error).message });
    }
  };

  return (
    <div className="space-y-3">
      <div className="rounded border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
        New personas always land at <strong>Tier D</strong> (general-purpose, free-for-use, fully UI-editable).
        Promotion to Tier C requires admin action + filesystem job-binding.
      </div>

      <div className="flex gap-4">
        {/* Step rail */}
        <aside className="w-56 shrink-0 space-y-1 rounded-lg border border-default bg-surface-1 p-2">
          <StepRail active={activeStep} onStep={setActiveStep} completed={completed} />
        </aside>

        {/* Step body */}
        <main className="min-w-0 flex-1 space-y-3 rounded-lg border border-default bg-surface-1 p-4">
          {activeStep === 'identity' && (
            <div className="space-y-3">
              <Field label="Name (kebab-case, lowercase, ≥3 chars)" hint="Used in filesystem path, deep-links, and Pulse refs">
                <input
                  type="text"
                  value={state.name}
                  onChange={(e) => set('name', e.target.value.toLowerCase())}
                  className={INPUT_BASE}
                  placeholder="e.g. data-pipeline-builder"
                />
                {state.name && !nameValid && (
                  <span className="text-[11px] text-rose-300">
                    {nameTaken ? 'Name already in use' : 'Must be kebab-case, lowercase, ≥3 chars'}
                  </span>
                )}
              </Field>
              <Field label="Short description" hint="One sentence; will populate methodology.identity">
                <input
                  type="text"
                  value={state.description}
                  onChange={(e) => set('description', e.target.value)}
                  className={INPUT_BASE}
                />
              </Field>
              <Field label="Cluster" hint="Thematic axis (Tier D only)">
                <select value={state.cluster} onChange={(e) => set('cluster', e.target.value as ClusterId | '')} className={INPUT_BASE}>
                  <option value="">— select —</option>
                  {(Object.keys(CLUSTERS) as ClusterId[]).map((c) => (
                    <option key={c} value={c}>
                      {CLUSTERS[c].label}
                    </option>
                  ))}
                </select>
              </Field>
              <button
                onClick={() => markCompleteAndAdvance('template')}
                disabled={!nameValid || !state.cluster}
                className="rounded bg-accent/20 px-3 py-1.5 text-xs text-accent-text disabled:opacity-40"
              >
                Next →
              </button>
            </div>
          )}

          {activeStep === 'template' && (
            <div className="space-y-3">
              <Field label="Base template" hint="Clone an existing persona or start from _template/">
                <select value={state.base_template} onChange={(e) => set('base_template', e.target.value)} className={INPUT_BASE}>
                  <option value="_template">_template (blank scaffold)</option>
                  {personas?.filter((p) => p.tier === 'D').map((p) => (
                    <option key={p.name} value={p.name}>{p.name}</option>
                  ))}
                </select>
              </Field>
              <div className="flex gap-2">
                <button onClick={() => setActiveStep('identity')} className="rounded px-3 py-1.5 text-xs text-tertiary hover:bg-surface-2">← Back</button>
                <button onClick={() => markCompleteAndAdvance('engine')} className="rounded bg-accent/20 px-3 py-1.5 text-xs text-accent-text">Next →</button>
              </div>
            </div>
          )}

          {activeStep === 'engine' && (
            <div className="space-y-3">
              <Field label="Engine">
                <select value={state.engine_default} onChange={(e) => set('engine_default', e.target.value)} className={INPUT_BASE}>
                  <option value="claude-code">claude-code</option>
                  <option value="claude-api">claude-api</option>
                  <option value="ollama">ollama</option>
                </select>
              </Field>
              <Field label="Model">
                <select value={state.engine_model} onChange={(e) => set('engine_model', e.target.value)} className={INPUT_BASE}>
                  <option value="sonnet">sonnet (default)</option>
                  <option value="opus">opus</option>
                  <option value="haiku">haiku</option>
                  <option value="qwen3:32b">qwen3:32b (ollama)</option>
                </select>
              </Field>
              <Field label="Fallback (optional)">
                <input type="text" value={state.engine_fallback} onChange={(e) => set('engine_fallback', e.target.value)} className={INPUT_BASE} placeholder="e.g. haiku" />
              </Field>
              <div className="flex gap-2">
                <button onClick={() => setActiveStep('template')} className="rounded px-3 py-1.5 text-xs text-tertiary hover:bg-surface-2">← Back</button>
                <button onClick={() => markCompleteAndAdvance('tools')} className="rounded bg-accent/20 px-3 py-1.5 text-xs text-accent-text">Next →</button>
              </div>
            </div>
          )}

          {activeStep === 'tools' && (
            <div className="space-y-3">
              <Field label="Allowed tools" hint="Multi-select from the 131-tool catalog. Drag-from-catalog assignment ships in Phase 1.4 polish.">
                <select
                  multiple
                  value={state.allowed_tools}
                  onChange={(e) => set('allowed_tools', Array.from(e.target.selectedOptions).map((o) => o.value))}
                  className={`${INPUT_BASE} h-48`}
                >
                  {catalog?.tools.map((t) => (
                    <option key={t.tool_id} value={t.tool_id}>
                      [{t.family}] {t.name}
                    </option>
                  ))}
                </select>
                <span className="text-[11px] text-disabled">{state.allowed_tools.length} selected</span>
              </Field>
              <div className="flex gap-2">
                <button onClick={() => setActiveStep('engine')} className="rounded px-3 py-1.5 text-xs text-tertiary hover:bg-surface-2">← Back</button>
                <button onClick={() => markCompleteAndAdvance('permissions')} className="rounded bg-accent/20 px-3 py-1.5 text-xs text-accent-text">Next →</button>
              </div>
            </div>
          )}

          {activeStep === 'permissions' && (
            <div className="space-y-3">
              <Field label="Permissions tier (legacy enum from permissions.yaml)" hint="UI does NOT expose admin — must be set via filesystem">
                <select
                  value={state.permissions_tier}
                  onChange={(e) => set('permissions_tier', e.target.value as WizardState['permissions_tier'])}
                  className={INPUT_BASE}
                >
                  <option value="research">research</option>
                  <option value="builder">builder</option>
                  <option value="executor">executor</option>
                  <option value="creative">creative</option>
                  <option value="analyst">analyst</option>
                </select>
              </Field>
              <div className="flex gap-2">
                <button onClick={() => setActiveStep('tools')} className="rounded px-3 py-1.5 text-xs text-tertiary hover:bg-surface-2">← Back</button>
                <button onClick={() => markCompleteAndAdvance('prompt')} className="rounded bg-accent/20 px-3 py-1.5 text-xs text-accent-text">Next →</button>
              </div>
            </div>
          )}

          {activeStep === 'prompt' && (
            <div className="space-y-3">
              <Field label="Prompt content" hint={`${state.prompt_content.length.toLocaleString()} chars — live token count wires up Phase 1.4`}>
                <textarea
                  rows={16}
                  value={state.prompt_content}
                  onChange={(e) => set('prompt_content', e.target.value)}
                  className={`${INPUT_BASE} font-mono`}
                  placeholder={'You are a … . Your role is to …'}
                />
              </Field>
              <div className="flex gap-2">
                <button onClick={() => setActiveStep('permissions')} className="rounded px-3 py-1.5 text-xs text-tertiary hover:bg-surface-2">← Back</button>
                <button onClick={() => markCompleteAndAdvance('methodology')} className="rounded bg-accent/20 px-3 py-1.5 text-xs text-accent-text">Next →</button>
              </div>
            </div>
          )}

          {activeStep === 'methodology' && (
            <div className="space-y-3">
              <Field label="Identity (one sentence)">
                <input type="text" value={state.methodology_identity} onChange={(e) => set('methodology_identity', e.target.value)} className={INPUT_BASE} />
              </Field>
              <Field label="Voice (tone + style)">
                <input type="text" value={state.methodology_voice} onChange={(e) => set('methodology_voice', e.target.value)} className={INPUT_BASE} placeholder="e.g. terse, precise, no preamble" />
              </Field>
              <div className="flex gap-2">
                <button onClick={() => setActiveStep('prompt')} className="rounded px-3 py-1.5 text-xs text-tertiary hover:bg-surface-2">← Back</button>
                <button onClick={() => markCompleteAndAdvance('review')} className="rounded bg-accent/20 px-3 py-1.5 text-xs text-accent-text">Next →</button>
              </div>
            </div>
          )}

          {activeStep === 'review' && (
            <div className="space-y-3">
              <div className="rounded border border-default bg-surface-2 p-3 text-xs">
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-faint">Final review</h4>
                <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1">
                  <dt className="text-faint">Name</dt><dd className="text-secondary"><code>{state.name}</code></dd>
                  <dt className="text-faint">Tier</dt><dd>D</dd>
                  <dt className="text-faint">Cluster</dt><dd>{state.cluster || '—'}</dd>
                  <dt className="text-faint">Description</dt><dd>{state.description || '—'}</dd>
                  <dt className="text-faint">Engine/model</dt><dd>{state.engine_default}/{state.engine_model}</dd>
                  <dt className="text-faint">Tools</dt><dd>{state.allowed_tools.length} assigned</dd>
                  <dt className="text-faint">Prompt</dt><dd>{state.prompt_content.length.toLocaleString()} chars</dd>
                  <dt className="text-faint">Methodology</dt><dd>identity {state.methodology_identity.length}c, voice {state.methodology_voice.length}c</dd>
                </dl>
              </div>
              {createResult && (
                <div className={`rounded p-3 text-xs ${createResult.ok ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300'}`}>
                  {createResult.message}
                  {createResult.ok && createResult.name && (
                    <a href={`/personas/${createResult.name}`} className="ml-2 underline">Open {createResult.name} →</a>
                  )}
                </div>
              )}
              <div className="flex gap-2">
                <button onClick={() => setActiveStep('methodology')} className="rounded px-3 py-1.5 text-xs text-tertiary hover:bg-surface-2">← Back</button>
                <button
                  onClick={handleCreate}
                  disabled={createPersona.isPending || !nameValid || !state.prompt_content || createResult?.ok}
                  className="rounded bg-emerald-500/20 px-3 py-1.5 text-xs text-emerald-300 disabled:opacity-40"
                >
                  {createPersona.isPending ? 'Creating…' : createResult?.ok ? '✓ Created' : 'Create persona'}
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
