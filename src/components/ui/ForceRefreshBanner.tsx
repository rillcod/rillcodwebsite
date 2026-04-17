'use client';

/**
 * Non-blocking top banner shown when the deployed version is below
 * minimum_web_version (Req 11.4). Clicking "Refresh" triggers a hard reload.
 */
export default function ForceRefreshBanner({ visible }: { visible: boolean }) {
  if (!visible) return null;

  return (
    <div className="fixed top-0 inset-x-0 z-[9998] flex items-center justify-between gap-4 bg-blue-600 px-4 py-2 text-sm text-white">
      <span>A new version of Rillcod Academy is available.</span>
      <button
        onClick={() => window.location.reload()}
        className="shrink-0 rounded bg-white/20 px-3 py-1 font-semibold hover:bg-white/30 transition-colors"
      >
        Refresh
      </button>
    </div>
  );
}
