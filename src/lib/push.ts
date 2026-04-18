/**
 * Web Push notification helpers.
 *
 * Subscriptions are now stored in the `web_push_subscriptions` table
 * (migration 20260501000001) instead of the legacy `system_settings` key-value
 * store. Stale subscriptions (HTTP 410 Gone / 404 Not Found) are deleted
 * automatically on send failure (Req 1.4, 1.7).
 *
 * Every notification payload includes a `url` field for deep-link routing
 * (Req 21.1).
 */

import webpush from 'web-push';
import { createAdminClient } from '@/lib/supabase/admin';

webpush.setVapidDetails(
  'mailto:support@rillcod.com',
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '',
  process.env.VAPID_PRIVATE_KEY || '',
);

export interface PushPayload {
  title: string;
  body: string;
  /** Deep-link URL opened when the user taps the notification (Req 21) */
  url: string;
  icon?: string;
}

/**
 * Sends a push notification to ALL subscriptions for a given user.
 * Stale subscriptions (410 / 404) are deleted from `web_push_subscriptions`.
 * Respects user notification preferences based on notification type.
 *
 * @param notificationType - Optional type to check against user preferences
 * @returns { sent, deleted } counts
 */
export async function sendPushNotification(
  userId: string,
  payload: PushPayload,
  notificationType?: NotificationType,
): Promise<{ sent: number; deleted: number }> {
  if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    console.warn('[push] VAPID keys not configured, skipping push notification.');
    return { sent: 0, deleted: 0 };
  }

  const db = createAdminClient();

  // Check user notification preferences if type is provided
  if (notificationType) {
    const prefColumn = getPreferenceColumn(notificationType);
    if (prefColumn) {
      const { data: prefs } = await db
        .from('notification_preferences')
        .select(prefColumn)
        .eq('portal_user_id', userId)
        .single();

      // If preference exists and is false, skip sending
      if (prefs && (prefs as any)[prefColumn] === false) {
        return { sent: 0, deleted: 0 };
      }
    }
  }

  // Fetch all subscriptions for this user from the new table (Req 1.7)
  const { data: rows, error } = await db
    .from('web_push_subscriptions')
    .select('id, endpoint, subscription_json')
    .eq('portal_user_id', userId);

  if (error) {
    console.error('[push] Error fetching subscriptions:', error);
    return { sent: 0, deleted: 0 };
  }

  if (!rows || rows.length === 0) {
    return { sent: 0, deleted: 0 };
  }

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
    } catch (err: any) {
      // Auto-delete stale subscriptions (Req 1.4)
      if (err.statusCode === 410 || err.statusCode === 404) {
        await db
          .from('web_push_subscriptions')
          .delete()
          .eq('endpoint', row.endpoint);
        deleted++;
      } else {
        console.error(`[push] Delivery error for endpoint ${row.endpoint}:`, err.message);
      }
    }
  }

  return { sent, deleted };
}

/**
 * Maps notification type to the corresponding preference column name.
 * Returns null if no preference check is needed for this type.
 */
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
      // These don't have specific preference columns yet, always send
      return null;
    default:
      return null;
  }
}

// ── Deep-link URL map (Req 21.2) ──────────────────────────────────────────────

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

/**
 * Builds the deep-link URL for a notification type + optional resource id.
 * Falls back to /dashboard for unrecognised types (Req 21.4).
 */
export function buildNotificationUrl(type: NotificationType, resourceId?: string): string {
  switch (type) {
    case 'payment_confirmed':
    case 'instalment_due':
      return resourceId ? `/dashboard/payments/invoices/${resourceId}` : '/dashboard/payments';
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
      return resourceId ? `/dashboard/learning?session=${resourceId}` : '/dashboard/learning';
    default:
      return '/dashboard';
  }
}
