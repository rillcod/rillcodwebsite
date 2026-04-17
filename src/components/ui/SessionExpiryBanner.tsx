'use client';

import { ShieldExclamationIcon, XMarkIcon } from '@/lib/icons';

interface SessionExpiryBannerProps {
  onStaySignedIn: () => void;
  onDismiss?: () => void;
}

/**
 * Non-blocking top banner shown when the Supabase JWT is expiring soon (< 5 min).
 * Clicking "Stay signed in" triggers a silent session refresh (Req 16.1, 16.2).
 */
export default function SessionExpiryBanner({ onStaySignedIn, onDismiss }: SessionExpiryBannerProps) {
  return (
    <div className="fixed top-0 left-0 right-0 z-[100] flex items-center justify-between gap-3 px-4 py-2.5 bg-amber-500/95 backdrop-blur-sm text-black text-sm font-bold shadow-lg print:hidden">
      <div className="flex items-center gap-2">
        <ShieldExclamationIcon className="w-4 h-4 flex-shrink-0" />
        <span>Session expiring soon — Stay signed in</span>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={onStaySignedIn}
          className="px-3 py-1 bg-black/20 hover:bg-black/30 rounded-lg text-xs font-black transition-colors"
        >
          Stay signed in
        </button>
        {onDismiss && (
          <button onClick={onDismiss} className="p-1 hover:bg-black/20 rounded-lg transition-colors">
            <XMarkIcon className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
