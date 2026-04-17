'use client';

/**
 * Full-screen blocking overlay shown when maintenance_mode = true (Req 11.3).
 * Auto-dismisses when the next poll returns maintenance_mode = false (Req 11.5).
 */
export default function MaintenanceBanner({ visible }: { visible: boolean }) {
  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-background/95 backdrop-blur-sm">
      <div className="max-w-md text-center px-6">
        <div className="w-16 h-16 rounded-full bg-amber-500/20 flex items-center justify-center mx-auto mb-6">
          <svg className="w-8 h-8 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-foreground mb-3">Under Maintenance</h1>
        <p className="text-muted-foreground">
          Rillcod Academy is currently undergoing scheduled maintenance. We&apos;ll be back shortly.
        </p>
      </div>
    </div>
  );
}
