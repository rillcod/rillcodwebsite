import webpush from 'web-push';
import { createAdminClient } from '@/lib/supabase/admin';

webpush.setVapidDetails(
  'mailto:support@rillcod.com',
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '',
  process.env.VAPID_PRIVATE_KEY || ''
);

/**
 * Sends a push notification to a specific user.
 */
export async function sendPushNotification(userId: string, payload: { title: string, body: string, url?: string }) {
  if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    console.warn('VAPID keys not configured, skipping push notification.');
    return;
  }

  const db = createAdminClient();
  const settingKey = `push_sub_${userId}`;

  const { data: setting, error } = await db
    .from('system_settings')
    .select('setting_value')
    .eq('setting_key', settingKey)
    .maybeSingle();

  if (error || !setting || !setting.setting_value) {
    return;
  }

  try {
    const subscription = JSON.parse(setting.setting_value);
    await webpush.sendNotification(subscription, JSON.stringify({
      title: payload.title,
      body: payload.body,
      url: payload.url || '/'
    }));
  } catch (err: any) {
    // If the subscription has expired or is invalid (e.g. 410 Gone), delete it
    if (err.statusCode === 410 || err.statusCode === 404) {
      await db.from('system_settings').delete().eq('setting_key', settingKey);
    }
  }
}
