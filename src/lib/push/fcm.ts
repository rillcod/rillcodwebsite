/**
 * Firebase Admin (FCM) for Android (and iOS when using FCM registration tokens).
 * Requires FIREBASE_SERVICE_ACCOUNT_JSON (stringified service-account JSON).
 */

import admin from 'firebase-admin';
import type { PushPayload } from '@/lib/push';

let initAttempted = false;

function getMessaging(): admin.messaging.Messaging | null {
  if (!initAttempted) {
    initAttempted = true;
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!raw) {
      console.warn('[push/fcm] FIREBASE_SERVICE_ACCOUNT_JSON not set — skipping FCM.');
      return null;
    }
    try {
      const cred = JSON.parse(raw) as admin.ServiceAccount;
      if (!admin.apps.length) {
        admin.initializeApp({ credential: admin.credential.cert(cred) });
      }
    } catch (err) {
      console.error('[push/fcm] Failed to init firebase-admin:', err);
      return null;
    }
  }
  if (!admin.apps.length) return null;
  return admin.messaging();
}

export async function sendFcmToToken(
  token: string,
  payload: PushPayload,
): Promise<'sent' | 'stale' | 'error'> {
  const messaging = getMessaging();
  if (!messaging) return 'error';

  try {
    await messaging.send({
      token,
      notification: {
        title: payload.title,
        body: payload.body,
      },
      data: {
        url: payload.url,
        title: payload.title,
        body: payload.body,
      },
      android: {
        priority: 'high',
        notification: {
          sound: 'default',
          clickAction: 'FCM_PLUGIN_ACTIVITY',
          icon: 'ic_launcher',
        },
      },
      apns: {
        payload: {
          aps: {
            alert: { title: payload.title, body: payload.body },
            sound: 'default',
          },
          url: payload.url,
        },
      },
    });
    return 'sent';
  } catch (err: unknown) {
    const code =
      err && typeof err === 'object' && 'code' in err
        ? String((err as { code: string }).code)
        : '';
    if (
      code.includes('registration-token-not-registered') ||
      code.includes('invalid-registration-token') ||
      code.includes('messaging/registration-token-not-registered') ||
      code.includes('messaging/invalid-registration-token')
    ) {
      return 'stale';
    }
    console.error('[push/fcm] send error:', err);
    return 'error';
  }
}
