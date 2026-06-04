import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { get, post, patch } from './client';

export type MinSeverity = 'info' | 'warn' | 'error' | 'critical';

export interface NotificationPrefs {
  escalations: boolean;
  completions: boolean;
  health_critical: boolean;
  pipeline: boolean;
  min_severity: MinSeverity;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  quiet_hours_weekend_start: string | null;
  quiet_hours_weekend_end: string | null;
  timezone: string;
  telegram_enabled: boolean;
}

export interface Subscription {
  id: number;
  endpoint: string;
  label: string | null;
  created_at: string;
}

export function useNotificationPrefs() {
  return useQuery({
    queryKey: ['notification-prefs'],
    queryFn: () => get<{ prefs: NotificationPrefs }>('/notifications/prefs').then((r) => r.prefs),
  });
}

export function useUpdateNotificationPrefs() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (prefs: Partial<NotificationPrefs>) =>
      patch<{ prefs: NotificationPrefs }>('/notifications/prefs', prefs),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-prefs'] });
    },
  });
}

export function useSubscriptions() {
  return useQuery({
    queryKey: ['push-subscriptions'],
    queryFn: () =>
      get<{ subscriptions: Subscription[] }>('/notifications/subscriptions').then(
        (r) => r.subscriptions,
      ),
  });
}

async function getVapidKey(): Promise<string> {
  const res = await get<{ publicKey: string }>('/notifications/vapid-key');
  return res.publicKey;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

export async function subscribeToPush(): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return false;
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return false;

  const registration = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;

  const vapidKey = await getVapidKey();

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidKey).buffer as ArrayBuffer,
  });

  const json = subscription.toJSON();
  await post('/notifications/subscribe', {
    endpoint: json.endpoint,
    keys: json.keys,
    label: navigator.userAgent.includes('Mobile') ? 'mobile' : 'desktop',
  });

  return true;
}

export async function unsubscribeFromPush(): Promise<void> {
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return;

  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;

  await subscription.unsubscribe();
  await post('/notifications/unsubscribe', { endpoint: subscription.endpoint });
}

export async function isPushSubscribed(): Promise<boolean> {
  if (!('serviceWorker' in navigator)) return false;
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return false;
  const subscription = await registration.pushManager.getSubscription();
  return subscription !== null;
}

export async function sendTestNotification(): Promise<{ sent: number }> {
  return post<{ sent: number }>('/notifications/test');
}
