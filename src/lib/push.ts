/**
 * Push notification helpers — Web Push (VAPID) + native FCM/APNs.
 *
 * Web: `web_push_subscriptions`
 * Native Capacitor: `device_push_tokens` (android FCM / ios APNs)
 */

import webpush from 'web-push';
import { createAdminClient } from '@/lib/supabase/admin';
import { brandContact } from '@/config/brand';
import { sendFcmToToken } from '@/lib/push/fcm';
import { sendApnsToToken } from '@/lib/push/apns';

webpush.setVapidDetails(
  `mailto:${brandContact.email}`,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '',
  process.env.VAPID_PRIVATE_KEY || '',
);

export interface PushPayload {
  title: string;
  body: string;
  /** Deep-link URL opened when the user taps the notification */
  url: string;
  icon?: string;
}

/**
 * Sends a push notification to ALL web + native subscriptions for a user.
 * Stale tokens / endpoints are deleted automatically.
 */
export async function sendPushNotification(
  userId: string,
  payload: PushPayload,
  notificationType?: NotificationType,
): Promise<{ sent: number; deleted: number }> {
  const db = createAdminClient();

  if (notificationType) {
    const prefColumn = getPreferenceColumn(notificationType);
    if (prefColumn) {
      const { data: prefs } = await db
        .from('notification_preferences')
        .select(prefColumn)
        .eq('portal_user_id', userId)
        .single();

      if (prefs && (prefs as unknown as Record<string, unknown>)[prefColumn] === false) {
        return { sent: 0, deleted: 0 };
      }
    }
  }

  let sent = 0;
  let deleted = 0;

  const webResult = await sendWebPush(db, userId, payload);
  sent += webResult.sent;
  deleted += webResult.deleted;

  const nativeResult = await sendNativePush(db, userId, payload);
  sent += nativeResult.sent;
  deleted += nativeResult.deleted;

  return { sent, deleted };
}

async function sendWebPush(
  db: ReturnType<typeof createAdminClient>,
  userId: string,
  payload: PushPayload,
): Promise<{ sent: number; deleted: number }> {
  if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    return { sent: 0, deleted: 0 };
  }

  const { data: rows, error } = await db
    .from('web_push_subscriptions')
    .select('id, endpoint, subscription_json')
    .eq('portal_user_id', userId);

  if (error) {
    console.error('[push] Error fetching web subscriptions:', error);
    return { sent: 0, deleted: 0 };
  }
  if (!rows?.length) return { sent: 0, deleted: 0 };

  let sent = 0;
  let deleted = 0;
  const notificationPayload = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url,
    icon: payload.icon,
  });

  for (const row of rows) {
    try {
      const subscription =
        typeof row.subscription_json === 'string'
          ? JSON.parse(row.subscription_json)
          : row.subscription_json;

      await webpush.sendNotification(subscription, notificationPayload);
      sent++;
    } catch (err: unknown) {
      const statusCode =
        err && typeof err === 'object' && 'statusCode' in err
          ? Number((err as { statusCode: number }).statusCode)
          : 0;
      if (statusCode === 410 || statusCode === 404) {
        await db.from('web_push_subscriptions').delete().eq('endpoint', row.endpoint);
        deleted++;
      } else {
        const message =
          err && typeof err === 'object' && 'message' in err
            ? String((err as { message: string }).message)
            : String(err);
        console.error(`[push] Web delivery error for ${row.endpoint}:`, message);
      }
    }
  }

  return { sent, deleted };
}

async function sendNativePush(
  db: ReturnType<typeof createAdminClient>,
  userId: string,
  payload: PushPayload,
): Promise<{ sent: number; deleted: number }> {
  const { data: rows, error } = await db
    .from('device_push_tokens')
    .select('id, token, platform')
    .eq('portal_user_id', userId);

  if (error) {
    // Table may not exist yet before migration — don't break web push
    console.error('[push] Error fetching device tokens:', error.message);
    return { sent: 0, deleted: 0 };
  }
  if (!rows?.length) return { sent: 0, deleted: 0 };

  let sent = 0;
  let deleted = 0;

  for (const row of rows) {
    const result =
      row.platform === 'ios'
        ? await sendApnsToToken(row.token, payload)
        : await sendFcmToToken(row.token, payload);

    if (result === 'sent') sent++;
    if (result === 'stale') {
      await db.from('device_push_tokens').delete().eq('token', row.token);
      deleted++;
    }
  }

  return { sent, deleted };
}

function getPreferenceColumn(type: NotificationType): string | null {
  switch (type) {
    case 'payment_confirmed':
    case 'instalment_due':
      return 'payment_updates';
    case 'report_published':
      return 'report_published';
    case 'streak_reminder':
      return 'streak_reminder';
    case 'assignment_graded':
    case 'support_ticket':
    case 'announcement':
    case 'consent_form':
    case 'parent_message':
      return null;
    default:
      return null;
  }
}

export type NotificationType =
  | 'payment_confirmed'
  | 'report_published'
  | 'assignment_graded'
  | 'support_ticket'
  | 'announcement'
  | 'streak_reminder'
  | 'instalment_due'
  | 'consent_form'
  | 'parent_message'
  | 'live_session';

export function buildNotificationUrl(type: NotificationType, resourceId?: string): string {
  switch (type) {
    case 'payment_confirmed':
    case 'instalment_due':
      return resourceId ? `/dashboard/money?invoice=${resourceId}` : '/dashboard/money';
    case 'report_published':
      return resourceId ? `/dashboard/results/${resourceId}` : '/dashboard/results';
    case 'assignment_graded':
      return resourceId ? `/dashboard/assignments/${resourceId}` : '/dashboard/assignments';
    case 'support_ticket':
      return resourceId ? `/dashboard/support/${resourceId}` : '/dashboard/support';
    case 'announcement':
      return '/dashboard/notifications';
    case 'streak_reminder':
      return '/dashboard/learning';
    case 'consent_form':
      return resourceId ? `/dashboard/consent-forms/${resourceId}` : '/dashboard/consent-forms';
    case 'parent_message':
      return resourceId ? `/dashboard/messages/${resourceId}` : '/dashboard/messages';
    case 'live_session':
      return resourceId ? `/dashboard/live-sessions` : '/dashboard/live-sessions';
    default:
      return '/dashboard';
  }
}
