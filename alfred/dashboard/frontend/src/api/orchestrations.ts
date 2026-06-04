// Type-only module — hook functions removed (no backend exists for /orchestrations endpoints)

export interface PlanSummary {
  file: string;
  title: string;
  status: string;
  created?: string;
  phaseCount: number;
  taskCount: number;
  completedTasks: number;
  cancelledTasks?: number;
  completedPhases: number;
  cancelledPhases?: number;
  progress: number;
  effectiveProgress?: number;
  completionNote?: string;
  completionSummary?: string;
}

export interface OrchestrationTask {
  id: string;
  title: string;
  status: string;
  description?: string;
  type?: string;
  file?: string;
  depends_on?: string[];
  done_criteria?: string;
  notes?: string;
  estimated_hours?: number;
  // Archon-inspired Phase 3+: conditional execution & workflow features
  when?: string;                    // Condition expression (e.g., "$T1.1.output.status == 'success'")
  trigger_rule?: string;            // all_success | one_success | all_done
  execution_mode?: string;          // single | loop
  loop_max_iterations?: number;
  has_output?: boolean;             // Whether task has stored output
}

export interface OrchestrationPhase {
  id: string;
  title: string;
  status: string;
  description?: string;
  depends_on?: string[];
  done_criteria?: string | string[];
  tasks: OrchestrationTask[];
  completed?: string;
  note?: string;
}

export interface OrchestrationPlan {
  file: string;
  filePath: string;
  id?: string;
  title: string;
  created?: string;
  status: string;
  spec?: string;
  task_id?: string;
  base_project?: string;
  project_path?: string;
  current_phase?: number;
  summary?: string;
  phases: OrchestrationPhase[];
}

export interface OrchestrationRun {
  id: number;
  plan_file: string;
  plan_title: string;
  status: string;
  launched_at: string;
  completed_at: string | null;
  master_task_id: string | null;
  launched_by: string;
}

export interface ExecutionTask {
  id: number;
  run_id: number;
  phase_id: string;
  task_id: string;
  pulse_task_id: string | null;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  error: string | null;
}

export interface LinkedTask {
  id: string;
  status: string;
  labels: string[];
  title: string;
}

export interface DependencyGraph {
  phaseOrder: string[];
  taskDeps: Record<string, string[]>;
  phaseDeps: Record<string, string[]>;
}

export interface OrchestrationTaskMapEntry {
  name: string;
  file: string;
  status: string;
  yamlTaskId?: string;
  phase?: string;
}
