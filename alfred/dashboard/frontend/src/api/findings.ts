import { useQuery } from '@tanstack/react-query'
import { get } from './client'

export interface FindingItem {
  id: string
  severity: 'critical' | 'warning' | 'info'
  title: string
  detail: string
  first_seen?: string
  occurrences?: number
  related_task?: string
  status?: string
  last_checked?: string
}

export interface FindingSection {
  source: string
  title: string
  last_run: string | null
  items: FindingItem[]
}

export interface FindingsResponse {
  summary: {
    total_findings: number
    by_severity: { critical: number; warning: number; info: number }
    last_updated: string
  }
  sections: FindingSection[]
}

export function useFindings(days = 7, source = 'all') {
  return useQuery({
    queryKey: ['findings', days, source],
    queryFn: () => get<FindingsResponse>('/findings', { days: String(days), source }),
    refetchInterval: 30_000,
  })
}
