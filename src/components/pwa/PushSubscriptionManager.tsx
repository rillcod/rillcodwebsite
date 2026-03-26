'use client';

import { useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export default function PushSubscriptionManager() {
  const { user } = useAuth();
  
  useEffect(() => {
    if (!user || typeof window === 'undefined') return;
    
    const setupPush = async () => {
      try {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
        
        const registration = await navigator.serviceWorker.ready;
        
        // Wait briefly so we don't block main thread on load
        await new Promise(r => setTimeout(r, 1500));
        
        // Check existing subscription
        let subscription = await registration.pushManager.getSubscription();
        
        // If not subscribed and we already have permission, or it's implicitly granted, subscribe
        if (!subscription && Notification.permission === 'granted') {
          const publicVapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
          if (!publicVapidKey) return;
          
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(publicVapidKey)
          });
        }
        
        // If we have a subscription (either newly minted or existing), sync it
        if (subscription) {
          await fetch('/api/notifications/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ subscription })
          });
        }
      } catch (err) {
        console.error('Push setup failed:', err);
      }
    };

    setupPush();
  }, [user]);

  return null;
}
