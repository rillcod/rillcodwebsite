'use client';

import { useState } from 'react';
import { hardRefreshApp } from '@/lib/pwa/hard-refresh';

/**
 * Non-blocking top banner shown when the deployed version is below
 * minimum_web_version (Req 11.4). Clicking "Refresh" hard-reloads past SW cache.
 */
export default function ForceRefreshBanner({ visible }: { visible: boolean }) {
  const [busy, setBusy] = useState(false);
  if (!visible) return null;

  return (
    <div className="fixed top-0 inset-x-0 z-[9998] flex items-center justify-between gap-4 bg-primary px-4 py-2 text-sm text-white">
      <span>A new version of Rillcod Technologies is available.</span>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void hardRefreshApp();
        }}
        className="shrink-0 min-h-9 rounded bg-white/20 px-3 py-1.5 font-semibold hover:bg-white/30 transition-colors disabled:opacity-60 touch-manipulation"
      >
        {busy ? 'Updating…' : 'Refresh'}
      </button>
    </div>
  );
}
