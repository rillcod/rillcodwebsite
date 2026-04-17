'use client';

import { useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

/** POST to /api/push/subscribe with up to 3 retries (exponential backoff 1s/2s/4s) — Req 1.5 */
async function syncSubscription(subscription: PushSubscription, deviceHint?: string): Promise<void> {
  const delays = [0, 1000, 2000, 4000];
  
  // Check if we've failed too many times recently
  const failureKey = 'push_subscription_failures';
  const failureData = localStorage.getItem(failureKey);
  if (failureData) {
    const { count, lastAttempt } = JSON.parse(failureData);
    const hoursSinceLastAttempt = (Date.now() - lastAttempt) / (1000 * 60 * 60);
    
    // Exponential backoff: wait 1h, 2h, 4h, 8h, 16h, 24h (max)
    const backoffHours = Math.min(Math.pow(2, count - 1), 24);
    if (hoursSinceLastAttempt < backoffHours) {
      console.log(`[push] Skipping subscription attempt (backoff: ${backoffHours}h)`);
      return;
    }
  }
  
  for (let attempt = 0; attempt < 3; attempt++) {
    if (delays[attempt]) await new Promise(r => setTimeout(r, delays[attempt]));
    try {
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription, deviceHint }),
      });
      if (res.ok) {
        // Success - clear failure count
        localStorage.removeItem(failureKey);
        return;
      }
      if (attempt === 2) {
        console.error('[push] Failed to sync subscription after 3 attempts');
        // Track failure for exponential backoff
        const existing = localStorage.getItem(failureKey);
        const count = existing ? JSON.parse(existing).count + 1 : 1;
        localStorage.setItem(failureKey, JSON.stringify({ count, lastAttempt: Date.now() }));
      }
    } catch (err) {
      if (attempt === 2) {
        console.error('[push] Network error syncing subscription:', err);
        // Track failure for exponential backoff
        const existing = localStorage.getItem(failureKey);
        const count = existing ? JSON.parse(existing).count + 1 : 1;
        localStorage.setItem(failureKey, JSON.stringify({ count, lastAttempt: Date.now() }));
      }
    }
  }
}

export default function PushSubscriptionManager() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user || typeof window === 'undefined') return;

    const setupPush = async () => {
      try {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

        const registration = await navigator.serviceWorker.ready;

        // Small delay so we don't block the main thread on load
        await new Promise(r => setTimeout(r, 1500));

        let subscription = await registration.pushManager.getSubscription();

        if (!subscription && Notification.permission === 'granted') {
          const publicVapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
          if (!publicVapidKey) return;
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(publicVapidKey),
          });
        }

        if (subscription) {
          const deviceHint = navigator.userAgent.slice(0, 100);
          await syncSubscription(subscription, deviceHint);
        }
      } catch (err) {
        console.error('[push] Push setup failed:', err);
      }
    };

    setupPush();
  }, [user]);

  return null;
}
