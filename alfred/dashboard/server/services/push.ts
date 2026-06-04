import webpush from 'web-push'
import { config } from '../config.js'
import {
  getAllSubscriptions,
  removeSubscription,
  getNotificationPrefs,
  addNotificationHistory,
  type PushSubscription,
} from './dashboard-db.js'

webpush.setVapidDetails(
  config.vapidSubject,
  config.vapidPublicKey,
  config.vapidPrivateKey,
)

export type NotificationCategory = 'escalation' | 'completion' | 'health_critical' | 'pipeline'

// --- Delivery tracking ---
const stats = {
  sent: 0,
  failed: 0,
  staleRemoved: 0,
  lastSentAt: null as string | null,
  lastFailedAt: null as string | null,
}

// Track consecutive failures per endpoint for auto-prune
const failureCounts = new Map<string, number>()
const STALE_THRESHOLD = 3

interface NotificationPayload {
  title: string
  body: string
  category: NotificationCategory
  severity?: string
  url?: string
  tag?: string
  task_id?: string
  source?: string
}

function isInQuietHours(): boolean {
  const prefs = getNotificationPrefs()
  if (!prefs.quiet_hours_start || !prefs.quiet_hours_end) return false

  const now = new Date()
  const currentMinutes = now.getHours() * 60 + now.getMinutes()

  const [startH, startM] = prefs.quiet_hours_start.split(':').map(Number)
  const [endH, endM] = prefs.quiet_hours_end.split(':').map(Number)
  const startMinutes = startH * 60 + startM
  const endMinutes = endH * 60 + endM

  if (startMinutes <= endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes < endMinutes
  }
  // Wraps midnight (e.g. 22:00 - 07:00)
  return currentMinutes >= startMinutes || currentMinutes < endMinutes
}

const SEVERITY_ORDER: Record<string, number> = { info: 0, warn: 1, error: 2, critical: 3 }

function shouldSend(category: NotificationCategory, severity?: string): boolean {
  if (isInQuietHours() && category !== 'health_critical') return false

  const prefs = getNotificationPrefs()

  // Check minimum severity threshold
  if (severity) {
    const minLevel = SEVERITY_ORDER[prefs.min_severity] ?? 0
    const eventLevel = SEVERITY_ORDER[severity] ?? 0
    if (eventLevel < minLevel) return false
  }

  switch (category) {
    case 'escalation': return prefs.escalations
    case 'completion': return prefs.completions
    case 'health_critical': return prefs.health_critical
    case 'pipeline': return prefs.pipeline
    default: return false
  }
}

async function sendToSubscription(sub: PushSubscription, payload: string): Promise<boolean> {
  try {
    await webpush.sendNotification(
      {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.keys_p256dh, auth: sub.keys_auth },
      },
      payload,
    )
    stats.sent++
    stats.lastSentAt = new Date().toISOString()
    failureCounts.delete(sub.endpoint)
    return true
  } catch (err: unknown) {
    stats.failed++
    stats.lastFailedAt = new Date().toISOString()
    const statusCode = (err as { statusCode?: number }).statusCode
    if (statusCode === 404 || statusCode === 410) {
      removeSubscription(sub.endpoint)
      stats.staleRemoved++
      failureCounts.delete(sub.endpoint)
    } else {
      // Track consecutive failures for non-terminal errors
      const count = (failureCounts.get(sub.endpoint) || 0) + 1
      failureCounts.set(sub.endpoint, count)
      if (count >= STALE_THRESHOLD) {
        removeSubscription(sub.endpoint)
        stats.staleRemoved++
        failureCounts.delete(sub.endpoint)
      }
    }
    return false
  }
}

export async function sendNotification(notification: NotificationPayload): Promise<number> {
  // Record in history regardless of delivery outcome
  addNotificationHistory({
    title: notification.title,
    body: notification.body,
    category: notification.category,
    severity: notification.severity ?? 'info',
    url: notification.url,
    task_id: notification.task_id,
    source: notification.source,
  })

  if (!shouldSend(notification.category, notification.severity)) return 0

  const subscriptions = getAllSubscriptions()
  if (subscriptions.length === 0) return 0

  const payload = JSON.stringify({
    title: notification.title,
    body: notification.body,
    url: notification.url ?? '/approvals',
    tag: notification.tag ?? notification.category,
  })

  let sent = 0
  await Promise.all(
    subscriptions.map(async sub => {
      if (await sendToSubscription(sub, payload)) sent++
    })
  )

  return sent
}

export function getNotificationStats() {
  const subscriptions = getAllSubscriptions()
  return {
    ...stats,
    activeSubscriptions: subscriptions.length,
  }
}

export async function sendTestNotification(): Promise<number> {
  const subscriptions = getAllSubscriptions()
  if (subscriptions.length === 0) return 0

  const payload = JSON.stringify({
    title: 'Nexus Dashboard',
    body: 'Push notifications are working!',
    url: '/health',
    tag: 'test',
  })

  let sent = 0
  await Promise.all(
    subscriptions.map(async sub => {
      if (await sendToSubscription(sub, payload)) sent++
    })
  )

  return sent
}
