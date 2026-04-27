// @refresh reset
'use client';

import { useState, useEffect } from 'react';
import { 
  DevicePhoneMobileIcon,
  XMarkIcon,
  ArrowDownTrayIcon
} from '@/lib/icons';

export default function PWAInstaller() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  // Track if user dismissed so we don't keep bugging them this session
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Check if already running as standalone PWA
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;
    if (isStandalone) {
      setIsInstalled(true);
      return;
    }

    // Delay the install prompt slightly so it doesn't distract on first load
    let showTimer: ReturnType<typeof setTimeout>;

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      showTimer = setTimeout(() => {
        setShowInstallPrompt(true);
      }, 4000);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setShowInstallPrompt(false);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      clearTimeout(showTimer);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
    }
    setDeferredPrompt(null);
    setShowInstallPrompt(false);
  };

  const handleDismiss = () => {
    setDismissed(true);
    setShowInstallPrompt(false);
  };

  if (isInstalled || !showInstallPrompt || dismissed) {
    return null;
  }

  return (
    // Sits above bottom nav on mobile (bottom-20 = 5rem), anchored to right on desktop
    <div className="fixed bottom-20 left-4 right-4 z-40 sm:left-auto sm:right-6 sm:bottom-6 sm:max-w-xs animate-in slide-in-from-bottom-4 duration-500">
      <div className="bg-popover border border-border/80 rounded-2xl shadow-2xl shadow-black/30 overflow-hidden backdrop-blur-xl">
        {/* Accent stripe */}
        <div className="h-1 w-full bg-gradient-to-r from-primary via-indigo-500 to-primary" />

        <div className="p-4 flex items-start gap-3">
          {/* Icon */}
          <div className="w-11 h-11 bg-gradient-to-br from-primary to-indigo-600 rounded-xl flex items-center justify-center shrink-0 shadow-lg shadow-primary/20">
            <DevicePhoneMobileIcon className="w-6 h-6 text-white" />
          </div>

          {/* Text */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black text-foreground uppercase tracking-tight leading-none">
              Install App
            </p>
            <p className="text-xs text-muted-foreground mt-1 leading-snug">
              Add Rillcod Academy to your home screen for quick, offline access.
            </p>
          </div>

          {/* Dismiss */}
          <button
            onClick={handleDismiss}
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors shrink-0 -mt-0.5 -mr-0.5"
            aria-label="Dismiss install prompt"
          >
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>

        <div className="px-4 pb-4 flex gap-2">
          <button
            onClick={handleDismiss}
            className="flex-1 py-2 text-xs font-bold text-muted-foreground bg-muted/60 hover:bg-muted rounded-lg transition-colors uppercase tracking-widest"
          >
            Later
          </button>
          <button
            onClick={handleInstallClick}
            className="flex-1 py-2 text-xs font-black text-white bg-gradient-to-r from-primary to-indigo-600 hover:from-primary hover:to-indigo-500 rounded-lg transition-all shadow-lg shadow-primary/30 flex items-center justify-center gap-1.5 uppercase tracking-widest"
          >
            <ArrowDownTrayIcon className="w-3.5 h-3.5" />
            Install
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Offline indicator ─────────────────────────────────────────────
export function OfflineIndicator() {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    setIsOnline(navigator.onLine);
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (isOnline) return null;

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] max-w-xs w-[calc(100%-2rem)] animate-in slide-in-from-top-4 duration-300">
      <div className="flex items-center gap-3 px-4 py-3 bg-amber-500/10 border border-amber-500/30 rounded-xl backdrop-blur-xl shadow-xl">
        <span className="w-2 h-2 bg-amber-400 rounded-full animate-pulse shrink-0" />
        <p className="text-xs font-bold text-amber-400 uppercase tracking-wide">
          You're offline — some features may be limited
        </p>
      </div>
    </div>
  );
}