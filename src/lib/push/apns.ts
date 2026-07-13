/**
 * Direct APNs HTTP/2 provider for Capacitor iOS (APNs device tokens).
 *
 * Env:
 *   APNS_KEY_P8       — PKCS8 .p8 private key (PEM, newlines as \n ok)
 *   APNS_KEY_ID       — 10-char Key ID from Apple Developer
 *   APNS_TEAM_ID      — Apple Team ID
 *   APNS_BUNDLE_ID    — e.g. com.rillcod.academy (defaults to that)
 *   APNS_PRODUCTION   — "true" for production APNs, else sandbox
 */

import http2 from 'http2';
import { importPKCS8, SignJWT } from 'jose';
import type { PushPayload } from '@/lib/push';

function apnsConfigured(): boolean {
  return Boolean(
    process.env.APNS_KEY_P8 &&
      process.env.APNS_KEY_ID &&
      process.env.APNS_TEAM_ID,
  );
}

let cachedJwt: { token: string; exp: number } | null = null;

async function getApnsJwt(): Promise<string | null> {
  if (!apnsConfigured()) {
    console.warn('[push/apns] APNS_* env not set — skipping APNs.');
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  if (cachedJwt && cachedJwt.exp - 60 > now) return cachedJwt.token;

  const pem = (process.env.APNS_KEY_P8 || '').replace(/\\n/g, '\n');
  const key = await importPKCS8(pem, 'ES256');
  const exp = now + 3500;
  const token = await new SignJWT({})
    .setProtectedHeader({
      alg: 'ES256',
      kid: process.env.APNS_KEY_ID!,
    })
    .setIssuer(process.env.APNS_TEAM_ID!)
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(key);

  cachedJwt = { token, exp };
  return token;
}

export async function sendApnsToToken(
  deviceToken: string,
  payload: PushPayload,
): Promise<'sent' | 'stale' | 'error'> {
  const jwt = await getApnsJwt();
  if (!jwt) return 'error';

  const host =
    process.env.APNS_PRODUCTION === 'true'
      ? 'api.push.apple.com'
      : 'api.sandbox.push.apple.com';
  const bundleId = process.env.APNS_BUNDLE_ID || 'com.rillcod.academy';
  const path = `/3/device/${deviceToken}`;

  const body = JSON.stringify({
    aps: {
      alert: { title: payload.title, body: payload.body },
      sound: 'default',
    },
    url: payload.url,
  });

  return new Promise((resolve) => {
    const client = http2.connect(`https://${host}`);
    client.on('error', (err) => {
      console.error('[push/apns] connection error:', err);
      resolve('error');
    });

    const req = client.request({
      ':method': 'POST',
      ':path': path,
      authorization: `bearer ${jwt}`,
      'apns-topic': bundleId,
      'apns-push-type': 'alert',
      'apns-priority': '10',
      'content-type': 'application/json',
    });

    let status = 0;
    let responseData = '';

    req.on('response', (headers) => {
      status = Number(headers[':status'] || 0);
    });
    req.on('data', (chunk) => {
      responseData += chunk;
    });
    req.on('end', () => {
      client.close();
      if (status === 200) {
        resolve('sent');
        return;
      }
      if (status === 410 || status === 400) {
        // Unregistered / BadDeviceToken
        resolve('stale');
        return;
      }
      console.error('[push/apns] delivery failed', status, responseData);
      resolve('error');
    });
    req.on('error', (err) => {
      console.error('[push/apns] request error:', err);
      client.close();
      resolve('error');
    });

    req.end(body);
  });
}
