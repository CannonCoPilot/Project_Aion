import { buildGraph } from './graph-builder.js'
import type { GraphNode, GraphEdge } from './graph-builder.js'

// --- Types ---

export interface CascadeImpact {
  failedNode: GraphNode
  affectedNodes: AffectedNode[]
  totalAffected: number
}

export interface AffectedNode {
  node: GraphNode
  distance: number  // hops from failed node
  via: string       // edge ID that connects it
  relationship: string
}

// --- Edge direction helpers ---

// Returns true if this edge type flows FROM source TO target (downstream)
// For cascade: if A fails, B is affected when A → B
function isDownstreamEdge(edge: GraphEdge, nodeId: string): string | null {
  if (edge.source === nodeId) {
    return edge.target
  }
  // processed_by is stored as job→task but means "job processes task"
  // if a job fails, its tasks are downstream
  return null
}

// --- Main ---

/**
 * Given a node ID (e.g., "job:task-executor"), find all downstream nodes
 * that would be affected if the upstream node fails.
 *
 * Uses the real-time graph built from correlation events so it reflects
 * actual pipeline activity in the time window.
 */
export async function detectCascade(
  nodeId: string,
  from?: string,
  to?: string,
): Promise<CascadeImpact | null> {
  const graph = await buildGraph(from, to)

  const failedNode = graph.nodes.find(n => n.id === nodeId)
  if (!failedNode) return null

  // Build adjacency list: nodeId → downstream nodeIds
  const adjacency = new Map<string, string[]>()
  for (const edge of graph.edges) {
    const downstream = isDownstreamEdge(edge, edge.source)
    if (downstream) {
      const list = adjacency.get(edge.source) ?? []
      list.push(edge.target)
      adjacency.set(edge.source, list)
    }
  }

  // BFS from failed node
  const visited = new Set<string>([nodeId])
  const affected: AffectedNode[] = []
  const queue: Array<{ id: string; distance: number; via: string }> = []

  // Seed with direct downstream neighbors
  const edgesFrom = graph.edges.filter(e => e.source === nodeId)
  for (const edge of edgesFrom) {
    if (!visited.has(edge.target)) {
      visited.add(edge.target)
      queue.push({ id: edge.target, distance: 1, via: edge.id })
    }
  }

  while (queue.length > 0) {
    const { id, distance, via } = queue.shift()!
    const node = graph.nodes.find(n => n.id === id)
    if (!node) continue

    // Find the edge that brought us here to label the relationship
    const inboundEdge = graph.edges.find(e => e.id === via)

    affected.push({
      node,
      distance,
      via,
      relationship: inboundEdge?.type ?? 'connected',
    })

    // Continue BFS
    const nextEdges = graph.edges.filter(e => e.source === id)
    for (const edge of nextEdges) {
      if (!visited.has(edge.target)) {
        visited.add(edge.target)
        queue.push({ id: edge.target, distance: distance + 1, via: edge.id })
      }
    }
  }

  // Sort by distance (closest impact first)
  affected.sort((a, b) => a.distance - b.distance)

  return {
    failedNode,
    affectedNodes: affected,
    totalAffected: affected.length,
  }
}

/**
 * For a given node ID, return just the IDs of downstream nodes — lightweight
 * version for use in alert rules.
 */
export async function getDownstreamNodeIds(
  nodeId: string,
  from?: string,
  to?: string,
): Promise<string[]> {
  const impact = await detectCascade(nodeId, from, to)
  return impact ? impact.affectedNodes.map((a: any) => a.node.id) : []
}
