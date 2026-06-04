import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'

type NexusOpsChannel = 'timeline' | 'alerts' | 'graph' | 'analytics'

interface NexusOpsUpdateMessage {
  type: 'nexus-ops:update'
  data: { type: NexusOpsChannel; timestamp: string }
}

const QUERY_KEY_MAP: Record<NexusOpsChannel, string[][]> = {
  timeline: [['nexus-ops-timeline']],
  alerts: [['nexus-ops-alerts']],
  graph: [['nexus-ops-graph']],
  analytics: [['nexus-ops-analytics']],
}

export function useNexusOpsWebSocket() {
  const queryClient = useQueryClient()
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    function connect() {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws`)
      wsRef.current = ws

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as { type: string; data: unknown }
          if (message.type !== 'nexus-ops:update') return

          const { data } = message as NexusOpsUpdateMessage
          const keys = QUERY_KEY_MAP[data.type]
          if (!keys) return

          for (const key of keys) {
            queryClient.invalidateQueries({ queryKey: key })
          }
        } catch {
          // Ignore malformed messages
        }
      }

      ws.onclose = () => {
        wsRef.current = null
        // Reconnect after 3s
        reconnectTimer.current = setTimeout(connect, 3000)
      }

      ws.onerror = () => {
        ws.close()
      }
    }

    connect()

    return () => {
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current)
        reconnectTimer.current = null
      }
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
    }
  }, [queryClient])
}
