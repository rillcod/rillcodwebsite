'use client';

import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { useAuth } from '@/contexts/auth-context';
import { useRouter } from 'next/navigation';

async function syncNativeToken(
  token: string,
  platform: 'android' | 'ios',
  deviceHint?: string,
): Promise<void> {
  const delays = [0, 1000, 2000, 4000];
  for (let attempt = 0; attempt < 3; attempt++) {
    if (delays[attempt]) await new Promise((r) => setTimeout(r, delays[attempt]));
    try {
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'native',
          token,
          platform,
          deviceHint,
        }),
      });
      if (res.ok) return;
    } catch (err) {
      if (attempt === 2) console.error('[native-push] sync failed:', err);
    }
  }
}

/**
 * Registers FCM (Android) / APNs (iOS) tokens and handles notification taps.
 * No-ops in browser / PWA (web push stays on PushSubscriptionManager).
 */
export default function NativePushManager() {
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!user || typeof window === 'undefined') return;
    if (!Capacitor.isNativePlatform()) return;
    if (!window.location.pathname.startsWith('/dashboard')) return;

    let removeFns: Array<() => void> = [];

    const setup = async () => {
      try {
        const { PushNotifications } = await import('@capacitor/push-notifications');
        const platform = Capacitor.getPlatform() === 'ios' ? 'ios' : 'android';

        let perm = await PushNotifications.checkPermissions();
        if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
          // Soft opt-in: ask once after dashboard settles; never required to use the app.
          const asked = window.localStorage.getItem('native-push-permission-asked');
          if (asked === 'declined') return;
          if (!asked) {
            await new Promise((r) => setTimeout(r, 2500));
            window.localStorage.setItem('native-push-permission-asked', '1');
          }
          perm = await PushNotifications.requestPermissions();
          if (perm.receive !== 'granted') {
            window.localStorage.setItem('native-push-permission-asked', 'declined');
          }
        }
        if (perm.receive !== 'granted') {
          console.warn('[native-push] permission not granted');
          return;
        }

        const regHandle = await PushNotifications.addListener('registration', (token) => {
          const deviceHint = `${platform}:${Capacitor.getPlatform()}`.slice(0, 100);
          void syncNativeToken(token.value, platform, deviceHint);
        });

        const errHandle = await PushNotifications.addListener('registrationError', (err) => {
          console.error('[native-push] registration error:', err);
        });

        const actionHandle = await PushNotifications.addListener(
          'pushNotificationActionPerformed',
          (event) => {
            const data = event.notification.data as Record<string, string> | undefined;
            const url = data?.url;
            if (url && typeof url === 'string') {
              if (url.startsWith('/')) router.push(url);
              else if (url.includes('rillcod.com')) {
                try {
                  const path = new URL(url).pathname + new URL(url).search;
                  router.push(path || '/dashboard');
                } catch {
                  router.push('/dashboard');
                }
              }
            }
          },
        );

        removeFns = [
          () => void regHandle.remove(),
          () => void errHandle.remove(),
          () => void actionHandle.remove(),
        ];

        await PushNotifications.register();

        // Android 8+ channel for consistent delivery
        if (platform === 'android') {
          try {
            await PushNotifications.createChannel({
              id: 'rillcod_default',
              name: 'Rillcod Academy',
              description: 'App alerts and reminders',
              importance: 5,
              visibility: 1,
              sound: 'default',
              vibration: true,
            });
          } catch {
            // channel may already exist
          }
        }
      } catch (err) {
        console.error('[native-push] setup failed:', err);
      }
    };

    void setup();

    return () => {
      removeFns.forEach((fn) => fn());
    };
  }, [user, router]);

  return null;
}
