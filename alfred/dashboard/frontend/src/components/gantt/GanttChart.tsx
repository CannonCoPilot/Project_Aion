import { useState, useRef, useEffect, useCallback } from 'react';
import type {
  OrchestrationPlan,
  OrchestrationPhase,
  OrchestrationTask,
  DependencyGraph,
} from '../../api/orchestrations';

// --- Constants ---

const ROW_HEIGHT = 32;
const PHASE_HEADER_HEIGHT = 36;
const LABEL_WIDTH = 280;
const BAR_PADDING = 4;
const MIN_BAR_WIDTH = 24;

const STATUS_BAR_COLORS: Record<string, string> = {
  completed: '#22c55e',
  in_progress: '#3b82f6',
  running: '#3b82f6',
  pending: '#4b5563',
  blocked: '#f59e0b',
  failed: '#ef4444',
  cancelled: '#7f1d1d',
  deferred: '#374151',
  skipped: '#374151',
  paused: '#f59e0b',
};

const STATUS_BG_COLORS: Record<string, string> = {
  completed: 'bg-green-500/10',
  in_progress: 'bg-accent/10',
  running: 'bg-accent/10',
  pending: 'bg-surface-muted/5',
  blocked: 'bg-amber-500/10',
  failed: 'bg-red-500/10',
  cancelled: 'bg-red-500/5',
  deferred: 'bg-surface-muted/5',
  skipped: 'bg-surface-muted/5',
  paused: 'bg-amber-500/10',
};

const STATUS_TEXT_COLORS: Record<string, string> = {
  completed: 'text-green-400',
  in_progress: 'text-accent-text',
  running: 'text-accent-text',
  pending: 'text-faint',
  blocked: 'text-amber-400',
  failed: 'text-red-400',
  cancelled: 'text-red-400/50',
  deferred: 'text-disabled',
  skipped: 'text-disabled',
  paused: 'text-amber-400',
};

// --- Types ---

interface BarLayout {
  phaseId: string;
  taskId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  status: string;
  title: string;
  task: OrchestrationTask;
  phase: OrchestrationPhase;
}

interface Arrow {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
}

// --- Layout computation ---

function computeLayout(
  plan: OrchestrationPlan,
  deps: DependencyGraph,
  chartWidth: number,
): { bars: BarLayout[]; arrows: Arrow[]; totalHeight: number } {
  const bars: BarLayout[] = [];
  const arrows: Arrow[] = [];
  const barMap = new Map<string, BarLayout>();

  // Assign each task a column slot based on phase order and task order within phase
  // All tasks in a phase share the same column range
  const phaseCount = plan.phases.length;
  if (phaseCount === 0) return { bars, arrows, totalHeight: 0 };

  const barAreaWidth = chartWidth - LABEL_WIDTH;
  const phaseSlotWidth = barAreaWidth / phaseCount;

  let currentY = 0;

  for (let pi = 0; pi < plan.phases.length; pi++) {
    const phase = plan.phases[pi];

    // Phase header row
    currentY += PHASE_HEADER_HEIGHT;

    const phaseX = LABEL_WIDTH + pi * phaseSlotWidth;
    const taskCount = phase.tasks.length;

    for (let ti = 0; ti < taskCount; ti++) {
      const task = phase.tasks[ti];
      const barWidth = Math.max(MIN_BAR_WIDTH, phaseSlotWidth - BAR_PADDING * 2);

      const bar: BarLayout = {
        phaseId: phase.id,
        taskId: task.id,
        x: phaseX + BAR_PADDING,
        y: currentY + BAR_PADDING,
        width: barWidth,
        height: ROW_HEIGHT - BAR_PADDING * 2,
        status: task.status,
        title: task.title,
        task,
        phase,
      };

      bars.push(bar);
      barMap.set(task.id, bar);
      currentY += ROW_HEIGHT;
    }

    if (taskCount === 0) {
      currentY += ROW_HEIGHT; // empty phase placeholder
    }
  }

  // Compute dependency arrows
  for (const bar of bars) {
    const taskDeps = deps.taskDeps[bar.taskId] || [];
    for (const depId of taskDeps) {
      const fromBar = barMap.get(depId);
      if (fromBar) {
        arrows.push({
          fromX: fromBar.x + fromBar.width,
          fromY: fromBar.y + fromBar.height / 2,
          toX: bar.x,
          toY: bar.y + bar.height / 2,
        });
      }
    }
  }

  // Phase-level dependency arrows (connect last task of dep phase to first task of dependent phase)
  for (const phase of plan.phases) {
    const phaseDeps = deps.phaseDeps[phase.id] || [];
    for (const depPhaseId of phaseDeps) {
      const depPhase = plan.phases.find(p => p.id === depPhaseId);
      if (!depPhase) continue;
      const lastDepTask = depPhase.tasks[depPhase.tasks.length - 1];
      const firstTask = phase.tasks[0];
      if (!lastDepTask || !firstTask) continue;
      const fromBar = barMap.get(lastDepTask.id);
      const toBar = barMap.get(firstTask.id);
      if (fromBar && toBar) {
        arrows.push({
          fromX: fromBar.x + fromBar.width,
          fromY: fromBar.y + fromBar.height / 2,
          toX: toBar.x,
          toY: toBar.y + toBar.height / 2,
        });
      }
    }
  }

  return { bars, arrows, totalHeight: currentY + 8 };
}

// --- Components ---

function DependencyArrows({ arrows }: { arrows: Arrow[] }) {
  if (arrows.length === 0) return null;

  return (
    <svg className="absolute inset-0 pointer-events-none" style={{ zIndex: 5 }}>
      <defs>
        <marker id="arrowhead" markerWidth="6" markerHeight="4" refX="5" refY="2" orient="auto">
          <polygon points="0 0, 6 2, 0 4" fill="#6b7280" />
        </marker>
      </defs>
      {arrows.map((a, i) => {
        const midX = (a.fromX + a.toX) / 2;
        return (
          <path
            key={i}
            d={`M ${a.fromX} ${a.fromY} C ${midX} ${a.fromY}, ${midX} ${a.toY}, ${a.toX} ${a.toY}`}
            fill="none"
            stroke="#4b5563"
            strokeWidth={1.5}
            strokeDasharray={a.toY === a.fromY ? undefined : '4 2'}
            markerEnd="url(#arrowhead)"
            opacity={0.6}
          />
        );
      })}
    </svg>
  );
}

function TaskTooltip({ task, phase }: { task: OrchestrationTask; phase: OrchestrationPhase }) {
  return (
    <div className="absolute z-50 w-72 rounded-lg border border-subtle bg-surface-1 p-3 shadow-xl text-xs" style={{ top: '100%', left: 0, marginTop: 4 }}>
      <div className="font-semibold text-secondary mb-1">{task.title}</div>
      <div className="text-faint mb-2">Phase: {phase.title}</div>
      {task.description && <p className="text-muted mb-2 whitespace-pre-line">{task.description}</p>}
      <div className="grid grid-cols-2 gap-1 text-faint">
        <span>Status: <span className={STATUS_TEXT_COLORS[task.status] || ''}>{task.status}</span></span>
        {task.type && <span>Type: {task.type}</span>}
        {task.file && <span className="col-span-2 font-mono text-disabled truncate">File: {task.file}</span>}
        {task.estimated_hours && <span>Est: {task.estimated_hours}h</span>}
        {task.depends_on && task.depends_on.length > 0 && (
          <span className="col-span-2">Deps: {task.depends_on.join(', ')}</span>
        )}
      </div>
      {task.done_criteria && (
        <div className="mt-2 pt-2 border-t border-default">
          <span className="text-disabled">Done: </span>
          <span className="text-muted">{task.done_criteria}</span>
        </div>
      )}
    </div>
  );
}

// --- Main Component ---

interface GanttChartProps {
  plan: OrchestrationPlan;
  dependencies: DependencyGraph;
}

export default function GanttChart({ plan, dependencies }: GanttChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState(1200);
  const [hoveredTask, setHoveredTask] = useState<string | null>(null);

  const updateWidth = useCallback(() => {
    if (containerRef.current) {
      setChartWidth(Math.max(800, containerRef.current.clientWidth));
    }
  }, []);

  useEffect(() => {
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [updateWidth]);

  const { bars, arrows, totalHeight } = computeLayout(plan, dependencies, chartWidth);

  // Build phase row positions for labels
  let labelY = 0;
  const phaseRows: { phase: OrchestrationPhase; y: number; taskCount: number; completedCount: number }[] = [];

  for (const phase of plan.phases) {
    const y = labelY;
    const taskCount = phase.tasks.length;
    const completedCount = phase.tasks.filter(t => t.status === 'completed').length;
    const rowHeight = PHASE_HEADER_HEIGHT + Math.max(1, taskCount) * ROW_HEIGHT;
    phaseRows.push({ phase, y, taskCount, completedCount });
    labelY += rowHeight;
  }

  return (
    <div ref={containerRef} className="relative overflow-x-auto">
      {/* Phase column headers */}
      <div className="flex border-b border-default mb-1" style={{ paddingLeft: LABEL_WIDTH }}>
        {plan.phases.map((phase, i) => {
          const width = (chartWidth - LABEL_WIDTH) / plan.phases.length;
          const completed = phase.tasks.filter(t => t.status === 'completed').length;
          const total = phase.tasks.length;
          const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
          return (
            <div
              key={phase.id}
              className="text-center px-1 py-2 border-r border-default/50 last:border-r-0"
              style={{ width, minWidth: MIN_BAR_WIDTH + BAR_PADDING * 2 }}
            >
              <div className="text-[10px] font-medium text-muted truncate">P{i + 1}</div>
              <div className="text-[9px] text-disabled">{pct}%</div>
            </div>
          );
        })}
      </div>

      {/* Chart body */}
      <div className="relative" style={{ height: totalHeight, minWidth: chartWidth }}>
        {/* Row labels */}
        {phaseRows.map(({ phase, y, taskCount, completedCount }) => (
          <div key={phase.id}>
            {/* Phase header */}
            <div
              className={`absolute left-0 flex items-center gap-2 px-3 border-b border-default/30 ${STATUS_BG_COLORS[phase.status] || ''}`}
              style={{ top: y, height: PHASE_HEADER_HEIGHT, width: LABEL_WIDTH }}
            >
              <span className={`w-2 h-2 rounded-full ${phase.status === 'completed' ? 'bg-green-500' : phase.status === 'in_progress' ? 'bg-accent animate-pulse' : phase.status === 'cancelled' ? 'bg-red-500/30' : 'bg-surface-muted'}`} />
              <span className={`text-xs font-semibold truncate flex-1 ${phase.status === 'cancelled' || phase.status === 'skipped' ? 'text-faint line-through' : 'text-secondary'}`}>{phase.title}</span>
              <span className="text-[10px] text-faint">{completedCount}/{taskCount}</span>
            </div>

            {/* Task labels */}
            {phase.tasks.map((task, ti) => {
              const taskY = y + PHASE_HEADER_HEIGHT + ti * ROW_HEIGHT;
              return (
                <div
                  key={task.id}
                  className={`absolute left-0 flex items-center gap-2 px-3 pl-6 border-b border-default/20 hover:bg-surface-2/30 transition-colors cursor-default ${hoveredTask === task.id ? 'bg-surface-2/30' : ''}`}
                  style={{ top: taskY, height: ROW_HEIGHT, width: LABEL_WIDTH }}
                  onMouseEnter={() => setHoveredTask(task.id)}
                  onMouseLeave={() => setHoveredTask(null)}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${STATUS_BAR_COLORS[task.status] ? '' : 'bg-surface-muted'}`}
                    style={{ backgroundColor: STATUS_BAR_COLORS[task.status] || '#4b5563' }}
                  />
                  <span className={`text-[11px] truncate flex-1 ${task.status === 'cancelled' || task.status === 'skipped' ? 'text-disabled line-through' : 'text-muted'}`}>{task.title}</span>
                  <span className={`text-[9px] ${STATUS_TEXT_COLORS[task.status] || 'text-disabled'}`}>
                    {task.id}
                  </span>
                </div>
              );
            })}

            {taskCount === 0 && (
              <div
                className="absolute left-0 flex items-center px-3 pl-6"
                style={{ top: y + PHASE_HEADER_HEIGHT, height: ROW_HEIGHT, width: LABEL_WIDTH }}
              >
                <span className="text-[10px] text-ghost italic">No tasks</span>
              </div>
            )}
          </div>
        ))}

        {/* Phase column separators */}
        {plan.phases.map((_, i) => {
          if (i === 0) return null;
          const x = LABEL_WIDTH + i * ((chartWidth - LABEL_WIDTH) / plan.phases.length);
          return (
            <div
              key={`sep-${i}`}
              className="absolute top-0 bottom-0 border-l border-default/30"
              style={{ left: x }}
            />
          );
        })}

        {/* Gantt bars */}
        {bars.map(bar => {
          const color = STATUS_BAR_COLORS[bar.status] || '#4b5563';
          const isActive = bar.status === 'in_progress' || bar.status === 'running';
          const isDeferred = bar.status === 'deferred' || bar.status === 'skipped' || bar.status === 'cancelled';
          const isHovered = hoveredTask === bar.taskId;

          return (
            <div
              key={`${bar.phaseId}-${bar.taskId}`}
              className="absolute group"
              style={{ left: bar.x, top: bar.y, width: bar.width, height: bar.height }}
              onMouseEnter={() => setHoveredTask(bar.taskId)}
              onMouseLeave={() => setHoveredTask(null)}
            >
              {/* Bar */}
              <div
                className={`h-full rounded-sm transition-all ${isHovered ? 'ring-1 ring-white/20' : ''} ${isActive ? 'animate-pulse' : ''}`}
                style={{
                  backgroundColor: color,
                  opacity: isDeferred ? 0.3 : 0.8,
                  backgroundImage: isDeferred ? 'repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(0,0,0,0.2) 3px, rgba(0,0,0,0.2) 6px)' : undefined,
                }}
              />

              {/* Tooltip */}
              {isHovered && (
                <TaskTooltip task={bar.task} phase={bar.phase} />
              )}
            </div>
          );
        })}

        {/* Dependency arrows */}
        <DependencyArrows arrows={arrows} />
      </div>
    </div>
  );
}
