import { NavLink } from 'react-router-dom';
import { usePulseProjects, type PulseProject } from '../api/pulse-projects';

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-accent/20 text-accent-text',
  pending: 'bg-blue-500/20 text-blue-400',
  paused: 'bg-amber-500/20 text-amber-400',
  completed: 'bg-green-500/20 text-green-400',
  archived: 'bg-surface-muted/20 text-faint',
};

const KNOWN_STATUSES = ['active', 'pending', 'paused', 'completed', 'archived'] as const;

function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] || STATUS_STYLES.active;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${style}`}
    >
      {status}
    </span>
  );
}

function ProgressBar({ progress }: { progress: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-surface-2 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${progress === 100 ? 'bg-green-500' : 'bg-accent'}`}
          style={{ width: `${progress}%` }}
        />
      </div>
      <span className="text-xs text-faint w-8 text-right">{progress}%</span>
    </div>
  );
}

function ProjectCard({ project }: { project: PulseProject }) {
  return (
    <NavLink
      to={`/projects/${encodeURIComponent(project.id)}`}
      className="block rounded-lg border border-default bg-surface-1 p-4 hover:border-subtle hover:bg-surface-1/80 transition-colors"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <h3 className="text-sm font-semibold text-primary leading-tight">{project.name}</h3>
        <StatusBadge status={project.status} />
      </div>

      <ProgressBar progress={project.progress_pct} />

      <div className="mt-3 flex items-center gap-4 text-xs text-faint">
        <span>{project.phases.length} phases</span>
        <span>
          {project.tasks_done}/{project.task_count} tasks
        </span>
        {project.description && (
          <span className="ml-auto truncate max-w-[200px]" title={project.description}>
            {project.description.slice(0, 60)}
          </span>
        )}
      </div>
    </NavLink>
  );
}

export default function ProjectsListPage() {
  const { data, isLoading, error } = usePulseProjects();
  const projects = data?.projects || [];

  const active = projects.filter((p) => p.status === 'active');
  const pending = projects.filter((p) => p.status === 'pending');
  const paused = projects.filter((p) => p.status === 'paused');
  const completed = projects.filter((p) => p.status === 'completed');
  const archived = projects.filter((p) => p.status === 'archived');
  const other = projects.filter((p) => !(KNOWN_STATUSES as readonly string[]).includes(p.status));

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-primary">Projects</h1>
          <p className="text-sm text-faint mt-1">{projects.length} projects</p>
        </div>
      </div>

      {isLoading && <p className="text-sm text-faint">Loading projects...</p>}
      {error && <p className="text-sm text-red-400">Failed to load projects</p>}

      {active.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xs font-semibold text-faint uppercase tracking-wider mb-3">
            Active ({active.length})
          </h2>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {active.map((p) => (
              <ProjectCard key={p.id} project={p} />
            ))}
          </div>
        </div>
      )}

      {pending.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xs font-semibold text-faint uppercase tracking-wider mb-3">
            Pending ({pending.length})
          </h2>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {pending.map((p) => (
              <ProjectCard key={p.id} project={p} />
            ))}
          </div>
        </div>
      )}

      {paused.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xs font-semibold text-faint uppercase tracking-wider mb-3">
            Paused ({paused.length})
          </h2>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {paused.map((p) => (
              <ProjectCard key={p.id} project={p} />
            ))}
          </div>
        </div>
      )}

      {completed.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xs font-semibold text-faint uppercase tracking-wider mb-3">
            Completed ({completed.length})
          </h2>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {completed.map((p) => (
              <ProjectCard key={p.id} project={p} />
            ))}
          </div>
        </div>
      )}

      {archived.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xs font-semibold text-faint uppercase tracking-wider mb-3">
            Archived ({archived.length})
          </h2>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {archived.map((p) => (
              <ProjectCard key={p.id} project={p} />
            ))}
          </div>
        </div>
      )}

      {other.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xs font-semibold text-faint uppercase tracking-wider mb-3">
            Other ({other.length})
          </h2>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {other.map((p) => (
              <ProjectCard key={p.id} project={p} />
            ))}
          </div>
        </div>
      )}

      {!isLoading && projects.length === 0 && (
        <div className="text-center py-12 text-faint">
          <p className="text-lg mb-2">No projects found</p>
          <p className="text-sm">Import a YAML to create a project</p>
        </div>
      )}
    </div>
  );
}
