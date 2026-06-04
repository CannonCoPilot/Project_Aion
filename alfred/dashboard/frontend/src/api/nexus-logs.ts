import { useQuery } from '@tanstack/react-query'
import { get } from './client.js'

export interface NexusLogEntry {
  timestamp: number
  level: string
  component: string
  job: string
  msg: string
  status?: string
}

export interface NexusStats {
  totalLogs: number
  byLevel: Record<string, number>
  byComponent: Record<string, number>
  byJob: Record<string, number>
  errorCount: number
  warnCount: number
  recentJobs: Array<{ job: string; lastSeen: number; status?: string }>
}

export function useNexusHealth() {
  return useQuery({
    queryKey: ['nexus-logs-health'],
    queryFn: () => get<{ status: string }>('/nexus-logs/health'),
    refetchInterval: 30_000,
    retry: false,
  })
}

export function useNexusLogs(params?: {
  limit?: number
  since?: number
  level?: string
  component?: string
  job?: string
}) {
  const qs = new URLSearchParams()
  if (params?.limit) qs.set('limit', String(params.limit))
  if (params?.since) qs.set('since', String(params.since))
  if (params?.level) qs.set('level', params.level)
  if (params?.component) qs.set('component', params.component)
  if (params?.job) qs.set('job', params.job)

  const qsStr = qs.toString()
  return useQuery({
    queryKey: ['nexus-logs', qsStr],
    queryFn: () => get<NexusLogEntry[]>(`/nexus-logs/recent${qsStr ? '?' + qsStr : ''}`),
    refetchInterval: 10_000,
    retry: 1,
  })
}

export function useNexusStats(sinceMs = 86400000) {
  return useQuery({
    queryKey: ['nexus-stats', sinceMs],
    queryFn: () => get<NexusStats>(`/nexus-logs/stats?since=${sinceMs}`),
    refetchInterval: 30_000,
    retry: 1,
  })
}

export function useNexusIssues(sinceMs = 86400000) {
  return useQuery({
    queryKey: ['nexus-issues', sinceMs],
    queryFn: () => get<NexusLogEntry[]>(`/nexus-logs/issues?since=${sinceMs}&limit=50`),
    refetchInterval: 15_000,
    retry: 1,
  })
}

export interface NexusExecution {
  file: string
  job: string
  date: string
  time: string
  taskIds: string[]
  isError: boolean
  durationMs: number
  cost: number
  numTurns: number
  resultPreview: string
}

export function useNexusExecutions(limit = 20) {
  return useQuery({
    queryKey: ['nexus-executions', limit],
    queryFn: () => get<NexusExecution[]>(`/nexus-logs/executions?limit=${limit}`),
    refetchInterval: 30_000,
    retry: 1,
  })
}
