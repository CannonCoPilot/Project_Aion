import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';
import {
  addSubscription,
  removeSubscription,
  getAllSubscriptions,
  getNotificationPrefs,
  updateNotificationPrefs,
  getNotificationHistory,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
} from '../services/dashboard-db.js';
import { sendTestNotification } from '../services/push.js';

export async function notificationRoutes(app: FastifyInstance) {
  // Get VAPID public key (frontend needs this to subscribe)
  app.get('/api/notifications/vapid-key', async () => {
    return { publicKey: config.vapidPublicKey };
  });

  // Register push subscription
  app.post('/api/notifications/subscribe', async (request, reply) => {
    const body = request.body as {
      endpoint: string;
      keys: { p256dh: string; auth: string };
      label?: string;
    };
    if (!body.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
      return reply.status(400).send({ error: 'Invalid subscription: endpoint and keys required' });
    }

    const sub = addSubscription(body.endpoint, body.keys, body.label);
    return { subscription: sub };
  });

  // Unsubscribe
  app.post('/api/notifications/unsubscribe', async (request, reply) => {
    const body = request.body as { endpoint: string };
    if (!body.endpoint) {
      return reply.status(400).send({ error: 'Endpoint required' });
    }

    removeSubscription(body.endpoint);
    return { message: 'Unsubscribed' };
  });

  // List subscriptions
  app.get('/api/notifications/subscriptions', async () => {
    const subscriptions = getAllSubscriptions();
    return { subscriptions };
  });

  // Get notification preferences
  app.get('/api/notifications/prefs', async () => {
    return { prefs: getNotificationPrefs() };
  });

  // Update notification preferences
  app.patch('/api/notifications/prefs', async (request) => {
    const body = request.body as {
      escalations?: boolean;
      completions?: boolean;
      health_critical?: boolean;
      pipeline?: boolean;
      min_severity?: 'info' | 'warn' | 'error' | 'critical';
      quiet_hours_start?: string | null;
      quiet_hours_end?: string | null;
      quiet_hours_weekend_start?: string | null;
      quiet_hours_weekend_end?: string | null;
      timezone?: string;
      telegram_enabled?: boolean;
    };
    const prefs = updateNotificationPrefs(body);
    return { prefs };
  });

  // Send test notification
  app.post('/api/notifications/test', async () => {
    const sent = await sendTestNotification();
    return { sent, message: sent > 0 ? 'Test notification sent' : 'No subscriptions registered' };
  });

  // --- Notification History ---

  // Get notification history
  app.get('/api/notifications/history', async (request) => {
    const query = request.query as { limit?: string; unread_only?: string };
    const limit = query.limit ? parseInt(query.limit, 10) : 50;
    const unreadOnly = query.unread_only === '1';
    return { notifications: getNotificationHistory(limit, unreadOnly) };
  });

  // Get unread count
  app.get('/api/notifications/unread-count', async () => {
    return { count: getUnreadCount() };
  });

  // Mark single notification as read
  app.post('/api/notifications/:id/read', async (request) => {
    const { id } = request.params as { id: string };
    markNotificationRead(parseInt(id, 10));
    return { message: 'Marked as read' };
  });

  // Mark all notifications as read
  app.post('/api/notifications/read-all', async () => {
    markAllNotificationsRead();
    return { message: 'All marked as read' };
  });
}
