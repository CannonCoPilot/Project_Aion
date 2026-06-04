import { parseTaskEvents, parseNexusDbEvents, parseAiDavidDecisions, parseExecutionLogs, parseStructuredLogs, parseRelayMessages } from './event-correlator.js'
import type { NexusEvent } from './event-correlator.js'

// --- Types ---

export interface GraphNode {
  id: string
  type: 'task' | 'job' | 'persona' | 'project' | 'event'
  label: string
  status: 'running' | 'completed' | 'failed' | 'waiting' | 'idle'
  metadata: Record<string, unknown>
}

export interface GraphEdge {
  id: string
  source: string
  target: string
  type: 'triggered' | 'processed_by' | 'produced' | 'approved' | 'escalated' | 'feedback'
  label?: string
  animated?: boolean
}

export interface GraphCluster {
  id: string
  label: string
  nodeIds: string[]
}

export interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
  clusters: GraphCluster[]
}

interface GraphFilters {
  project?: string
  job?: string
  persona?: string
}

// --- Helpers ---

function edgeKey(source: string, target: string, type: string): string {
  return `${source}::${target}::${type}`
}

function resolveTaskStatus(events: NexusEvent[]): GraphNode['status'] {
  // Most recent event first — events are already sorted desc from getTimeline
  for (const e of events) {
    if (e.type === 'task_closed') return 'completed'
    if (e.type === 'task_created') return 'waiting'
    if (/^ai_(execute|fix)/.test(e.type)) return 'running'
    if (/^ai_(escalate|propose|defer)/.test(e.type)) return 'waiting'
  }
  return 'waiting'
}

function resolveJobStatus(events: NexusEvent[]): GraphNode['status'] {
  for (const e of events) {
    if (e.type === 'execution_success' || e.type === 'job_completed') return 'completed'
    if (e.type === 'execution_failure' || e.type === 'job_failed') return 'failed'
    if (e.type === 'job_started') return 'running'
  }
  return 'idle'
}

// --- Main ---

export async function buildGraph(from?: string, to?: string, filters?: GraphFilters): Promise<GraphData> {
  // Pull from all parsers — include dispatcher and relay for complete pipeline visibility
  const taskEvts = await parseTaskEvents(from, to)
  const events: NexusEvent[] = [
    ...taskEvts,
    ...parseNexusDbEvents(from, to),
    ...parseAiDavidDecisions(from, to),
    ...parseExecutionLogs(from, to),
    ...parseStructuredLogs(from, to).filter(e => e.type !== 'log_info'), // skip noisy info logs
    ...parseRelayMessages(from, to),
  ].filter(e => e.timestamp)

  // Group events by entity
  const taskEvents = new Map<string, NexusEvent[]>()
  const jobEvents = new Map<string, NexusEvent[]>()
  const personaSet = new Map<string, NexusEvent[]>()
  const projectSet = new Map<string, NexusEvent[]>()

  // Track relationships for edge building
  // task_id -> jobs that processed it
  const taskToJobs = new Map<string, Set<string>>()
  // job -> persona that drives it
  const jobToPersona = new Map<string, string>()
  // task_id -> project
  const taskToProject = new Map<string, string>()

  for (const event of events) {
    if (event.task_id) {
      const list = taskEvents.get(event.task_id) || []
      list.push(event)
      taskEvents.set(event.task_id, list)

      if (event.project) {
        taskToProject.set(event.task_id, event.project)
      }
    }

    if (event.job) {
      const list = jobEvents.get(event.job) || []
      list.push(event)
      jobEvents.set(event.job, list)

      // Link task to job
      if (event.task_id) {
        const jobs = taskToJobs.get(event.task_id) || new Set()
        jobs.add(event.job)
        taskToJobs.set(event.task_id, jobs)
      }

      // Link job to persona
      if (event.persona) {
        jobToPersona.set(event.job, event.persona)
      }
    }

    if (event.persona) {
      const list = personaSet.get(event.persona) || []
      list.push(event)
      personaSet.set(event.persona, list)
    }

    if (event.project) {
      const list = projectSet.get(event.project) || []
      list.push(event)
      projectSet.set(event.project, list)
    }
  }

  // --- Build Nodes ---

  const nodes: GraphNode[] = []

  for (const [taskId, evts] of taskEvents) {
    const costSum = evts.reduce((sum, e) => sum + (e.cost ?? 0), 0)
    nodes.push({
      id: `task:${taskId}`,
      type: 'task',
      label: taskId,
      status: resolveTaskStatus(evts),
      metadata: {
        eventCount: evts.length,
        costSum: costSum || undefined,
      },
    })
  }

  for (const [jobName, evts] of jobEvents) {
    const costSum = evts.reduce((sum, e) => sum + (e.cost ?? 0), 0)
    const successCount = evts.filter(e => e.type === 'execution_success').length
    const failCount = evts.filter(e => e.type === 'execution_failure').length
    const totalRuns = successCount + failCount
    nodes.push({
      id: `job:${jobName}`,
      type: 'job',
      label: jobName,
      status: resolveJobStatus(evts),
      metadata: {
        runCount: totalRuns || undefined,
        costSum: costSum || undefined,
        successRate: totalRuns > 0 ? successCount / totalRuns : undefined,
      },
    })
  }

  for (const [persona, evts] of personaSet) {
    const tasksProcessed = new Set(evts.filter(e => e.task_id).map(e => e.task_id))
    nodes.push({
      id: `persona:${persona}`,
      type: 'persona',
      label: persona,
      status: 'idle',
      metadata: {
        tasksProcessedCount: tasksProcessed.size,
      },
    })
  }

  for (const [project] of projectSet) {
    nodes.push({
      id: `project:${project}`,
      type: 'project',
      label: project,
      status: 'idle',
      metadata: {},
    })
  }

  // --- Build Edges ---

  const edgesSeen = new Set<string>()
  const edges: GraphEdge[] = []

  function addEdge(source: string, target: string, type: GraphEdge['type'], label?: string, animated?: boolean) {
    const key = edgeKey(source, target, type)
    if (edgesSeen.has(key)) return
    edgesSeen.add(key)
    edges.push({
      id: key,
      source,
      target,
      type,
      label,
      animated,
    })
  }

  // Task → Job (processed_by)
  for (const [taskId, jobs] of taskToJobs) {
    for (const job of jobs) {
      addEdge(`job:${job}`, `task:${taskId}`, 'processed_by')
    }
  }

  // Job → Task from execution log results (taskIds extracted from result text)
  for (const [jobName, evts] of jobEvents) {
    for (const e of evts) {
      const taskIds = e.details?.taskIds as string[] | undefined
      if (taskIds) {
        for (const tid of taskIds) {
          addEdge(`job:${jobName}`, `task:${tid}`, 'processed_by')
        }
      }
      // Job → Task (produced): if job events contain task_created events
      if (e.type === 'task_created' && e.task_id) {
        addEdge(`job:${jobName}`, `task:${e.task_id}`, 'produced')
      }
    }
  }

  // AI David decisions → tasks
  for (const [persona, evts] of personaSet) {
    for (const e of evts) {
      if (!e.task_id) continue
      const taskNodeId = `task:${e.task_id}`
      const personaNodeId = `persona:${persona}`

      if (/^ai_execute/.test(e.type)) {
        addEdge(personaNodeId, taskNodeId, 'approved', 'execute', true)
      } else if (/^ai_propose/.test(e.type)) {
        addEdge(personaNodeId, taskNodeId, 'feedback', 'propose')
      } else if (/^ai_escalate/.test(e.type)) {
        addEdge(personaNodeId, taskNodeId, 'escalated', 'escalate')
      } else if (/^ai_(close|defer|fix)/.test(e.type)) {
        addEdge(personaNodeId, taskNodeId, 'approved', e.type.replace(/^ai_/, ''))
      }
    }
  }

  // Persona → Job (triggered)
  for (const [jobName, persona] of jobToPersona) {
    addEdge(`persona:${persona}`, `job:${jobName}`, 'triggered')
  }

  // --- Build Clusters ---

  const clusters: GraphCluster[] = []
  const projectTaskGroups = new Map<string, string[]>()

  for (const [taskId, project] of taskToProject) {
    const group = projectTaskGroups.get(project) || []
    group.push(`task:${taskId}`)
    projectTaskGroups.set(project, group)
  }

  for (const [project, nodeIds] of projectTaskGroups) {
    if (nodeIds.length > 0) {
      clusters.push({
        id: `cluster:${project}`,
        label: project,
        nodeIds,
      })
    }
  }

  // --- Apply Filters ---

  if (filters?.project || filters?.job || filters?.persona) {
    const keepNodeIds = new Set<string>()

    // Seed with directly matching nodes
    for (const node of nodes) {
      if (filters.project && node.type === 'project' && node.label === filters.project) {
        keepNodeIds.add(node.id)
      }
      if (filters.job && node.type === 'job' && node.label === filters.job) {
        keepNodeIds.add(node.id)
      }
      if (filters.persona && node.type === 'persona' && node.label === filters.persona) {
        keepNodeIds.add(node.id)
      }
    }

    // Project filter: include all tasks in that project
    if (filters.project) {
      for (const [taskId, project] of taskToProject) {
        if (project === filters.project) {
          keepNodeIds.add(`task:${taskId}`)
        }
      }
      keepNodeIds.add(`project:${filters.project}`)
    }

    // Expand via edges — include connected nodes
    let expanded = true
    while (expanded) {
      expanded = false
      for (const edge of edges) {
        const srcIn = keepNodeIds.has(edge.source)
        const tgtIn = keepNodeIds.has(edge.target)
        if (srcIn && !tgtIn) {
          keepNodeIds.add(edge.target)
          expanded = true
        }
        if (tgtIn && !srcIn) {
          keepNodeIds.add(edge.source)
          expanded = true
        }
      }
    }

    // Filter nodes and edges
    const filteredNodes = nodes.filter(n => keepNodeIds.has(n.id))
    const filteredEdges = edges.filter(e => keepNodeIds.has(e.source) && keepNodeIds.has(e.target))
    const filteredClusters = clusters
      .map(c => ({
        ...c,
        nodeIds: c.nodeIds.filter(id => keepNodeIds.has(id)),
      }))
      .filter(c => c.nodeIds.length > 0)

    return {
      nodes: filteredNodes,
      edges: filteredEdges,
      clusters: filteredClusters,
    }
  }

  return { nodes, edges, clusters }
}
