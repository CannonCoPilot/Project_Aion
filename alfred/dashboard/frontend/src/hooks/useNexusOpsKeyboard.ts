import { useEffect, useCallback } from 'react'

const TIME_RANGE_MAP: Record<string, number> = {
  '1': 1,
  '2': 6,
  '3': 24,
  '4': 168,
  '5': 720,
}

interface KeyboardConfig {
  onTabChange: (tab: 'timeline' | 'graph' | 'analytics') => void
  onTimeRange: (hours: number) => void
  onEscape: () => void
  onToggleHelp: () => void
}

export function useNexusOpsKeyboard({
  onTabChange,
  onTimeRange,
  onEscape,
  onToggleHelp,
}: KeyboardConfig) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const isInput =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT'

      if (e.key === 'Escape') {
        onEscape()
        return
      }

      if (isInput) return

      if (e.key === '?') {
        e.preventDefault()
        onToggleHelp()
        return
      }

      if (e.key === 't') {
        e.preventDefault()
        onTabChange('timeline')
        return
      }

      if (e.key === 'g') {
        e.preventDefault()
        onTabChange('graph')
        return
      }

      if (e.key === 'a') {
        e.preventDefault()
        onTabChange('analytics')
        return
      }

      if (e.key === 'f') {
        e.preventDefault()
        const filterInput = document.querySelector<HTMLInputElement>(
          'input[placeholder="Task ID..."]'
        )
        filterInput?.focus()
        return
      }

      const hours = TIME_RANGE_MAP[e.key]
      if (hours) {
        e.preventDefault()
        onTimeRange(hours)
        return
      }
    },
    [onTabChange, onTimeRange, onEscape, onToggleHelp]
  )

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])
}
