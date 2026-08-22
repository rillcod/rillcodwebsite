/**
 * FCM HTTP v1 for Android (and iOS when using FCM registration tokens).
 * Requires FIREBASE_SERVICE_ACCOUNT_JSON (stringified service-account JSON).
 */

import { importPKCS8, SignJWT } from 'jose';
import type { PushPayload } from '@/lib/push';

type ServiceAccount = {
  client_email: string;
  private_key: string;
  project_id: string;
  token_uri?: string;
};

type CachedAccessToken = { token: string; expiresAt: number };
let cachedAccessToken: CachedAccessToken | null = null;

function readServiceAccount(): ServiceAccount | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    console.warn('[push/fcm] FIREBASE_SERVICE_ACCOUNT_JSON not set — skipping FCM.');
    return null;
  }
  try {
    const account = JSON.parse(raw) as Partial<ServiceAccount>;
    if (!account.client_email || !account.private_key || !account.project_id) {
      throw new Error('Service account is missing client_email, private_key, or project_id.');
    }
    return account as ServiceAccount;
  } catch (error) {
    console.error('[push/fcm] Invalid service-account configuration:', error);
    return null;
  }
}

async function getAccessToken(account: ServiceAccount): Promise<string | null> {
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60_000) {
    return cachedAccessToken.token;
  }

  const tokenUri = account.token_uri || 'https://oauth2.googleapis.com/token';
  const now = Math.floor(Date.now() / 1000);
  const key = await importPKCS8(account.private_key, 'RS256');
  const assertion = await new SignJWT({
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
  })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(account.client_email)
    .setSubject(account.client_email)
    .setAudience(tokenUri)
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);

  const response = await fetch(tokenUri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  if (!response.ok) {
    console.error('[push/fcm] Google access-token request failed:', response.status);
    return null;
  }
  const body = await response.json() as { access_token?: string; expires_in?: number };
  if (!body.access_token) return null;
  cachedAccessToken = {
    token: body.access_token,
    expiresAt: Date.now() + Math.max(300, Number(body.expires_in) || 3600) * 1000,
  };
  return cachedAccessToken.token;
}

export function buildFcmMessage(token: string, payload: PushPayload) {
  return {
    message: {
      token,
      notification: { title: payload.title, body: payload.body },
      data: { url: payload.url, title: payload.title, body: payload.body },
      android: {
        priority: 'high',
        notification: { sound: 'default', click_action: 'FCM_PLUGIN_ACTIVITY', icon: 'ic_launcher' },
      },
      apns: {
        payload: {
          aps: { alert: { title: payload.title, body: payload.body }, sound: 'default' },
          url: payload.url,
        },
      },
    },
  };
}

export async function sendFcmToToken(
  token: string,
  payload: PushPayload,
): Promise<'sent' | 'stale' | 'error'> {
  const account = readServiceAccount();
  if (!account) return 'error';

  try {
    const accessToken = await getAccessToken(account);
    if (!accessToken) return 'error';
    const response = await fetch(
      `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(account.project_id)}/messages:send`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(buildFcmMessage(token, payload)),
      },
    );
    if (response.ok) return 'sent';
    const responseText = await response.text();
    if (response.status === 404 || /UNREGISTERED|registration-token-not-registered|invalid-registration-token/i.test(responseText)) {
      return 'stale';
    }
    if (response.status === 401) cachedAccessToken = null;
    console.error('[push/fcm] send failed:', response.status);
    return 'error';
  } catch (err: unknown) {
    console.error('[push/fcm] send error:', err);
    return 'error';
  }
}
