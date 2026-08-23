'use client';

import { memo, useCallback, useEffect, useRef, useState } from 'react';
import BodyPortal, { useOverlayScrollLock } from '@/components/ui/BodyPortal';

/**
 * The school's own Jitsi classroom, on the 8x8 tenant in JAAS_APP_ID.
 *
 * The credentials and the token route have existed for months with nothing calling
 * them, so this ran on the free public meet.jit.si instead — a room named after the
 * session id, with no password and no access control, holding a class of children.
 * Anyone with the link, or a guess, could walk in. This joins the authenticated
 * tenant, where the signed token decides who enters and who moderates.
 *
 * It is also the fallback that costs nothing per minute, which matters while the
 * metered provider is exhausted.
 *
 * The external API script is loaded from the tenant rather than bundled, because
 * 8x8 versions it per account. It is loaded once and reused.
 */

type JitsiApi = {
  dispose: () => void;
  addListener: (event: string, handler: (payload?: unknown) => void) => void;
  executeCommand: (command: string, ...args: unknown[]) => void;
};

declare global {
  interface Window {
    JitsiMeetExternalAPI?: new (domain: string, options: Record<string, unknown>) => JitsiApi;
  }
}

const SCRIPT_ID = 'jaas-external-api';

/** Resolves once the tenant's external API is on the page. Shared across mounts. */
function loadJaaSScript(appId: string): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.JitsiMeetExternalAPI) return Promise.resolve();

  const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('script failed')));
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = `https://8x8.vc/${encodeURIComponent(appId)}/external_api.js`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Could not load the classroom from the video provider.'));
    document.body.appendChild(script);
  });
}

function JaaSMeeting({
  sessionId,
  sessionTitle,
  onClose,
}: {
  sessionId: string;
  sessionTitle: string;
  onClose: () => void;
}) {
  useOverlayScrollLock(true);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const apiRef = useRef<JitsiApi | null>(null);
  const exitedRef = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const leave = useCallback(() => {
    if (exitedRef.current) return;
    exitedRef.current = true;
    try {
      apiRef.current?.dispose();
    } catch {
      /* already gone */
    }
    apiRef.current = null;
    // Best-effort attendance close, matching the LiveKit classroom.
    try {
      if (navigator.sendBeacon) navigator.sendBeacon(`/api/live-sessions/${sessionId}/leave`);
    } catch {
      /* best-effort */
    }
    onCloseRef.current();
  }, [sessionId]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch('/api/live-sessions/jaas-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId }),
        });
        const payload = await res.json();
        if (!res.ok) throw new Error(payload.error ?? 'Could not open this classroom.');
        if (cancelled) return;

        await loadJaaSScript(payload.appId);
        if (cancelled) return;

        const Api = window.JitsiMeetExternalAPI;
        if (!Api) throw new Error('Could not load the classroom from the video provider.');
        if (!containerRef.current) return;

        const api = new Api('8x8.vc', {
          roomName: `${payload.appId}/${payload.roomName}`,
          jwt: payload.token,
          parentNode: containerRef.current,
          configOverwrite: {
            prejoinPageEnabled: false,
            disableDeepLinking: true,
            // Nigerian school networks are the hard case: start audio-only-ish and
            // let people turn video on, rather than opening every camera at once.
            startWithVideoMuted: true,
            startWithAudioMuted: false,
          },
          interfaceConfigOverwrite: {
            MOBILE_APP_PROMO: false,
          },
        });
        apiRef.current = api;
        api.addListener('videoConferenceJoined', () => setReady(true));
        api.addListener('readyToClose', leave);
        // The provider's own "hang up" must end our screen too, or the user is left
        // staring at a dead frame with no way out.
        api.addListener('videoConferenceLeft', leave);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Could not open this classroom.');
      }
    })();

    return () => {
      cancelled = true;
      try {
        apiRef.current?.dispose();
      } catch {
        /* already gone */
      }
      apiRef.current = null;
    };
  }, [sessionId, leave]);

  return (
    <BodyPortal>
      <div className="fixed inset-0 z-[120] flex flex-col bg-[#0a0a0a]">
        <div className="flex items-center justify-between gap-3 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <p className="truncate text-xs font-black uppercase tracking-widest text-white/80">
            {sessionTitle}
          </p>
          <button
            type="button"
            onClick={leave}
            className="min-h-11 shrink-0 bg-white/10 px-5 text-xs font-black uppercase tracking-widest text-white transition-colors hover:bg-white/20"
          >
            Leave
          </button>
        </div>

        {error ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
            <p className="text-sm font-bold text-white">{error}</p>
            <button
              type="button"
              onClick={leave}
              className="min-h-11 bg-white/10 px-6 text-xs font-black uppercase tracking-widest text-white hover:bg-white/20"
            >
              Close
            </button>
          </div>
        ) : (
          <div className="relative flex-1 min-h-0">
            {!ready && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              </div>
            )}
            <div ref={containerRef} className="h-full w-full" />
          </div>
        )}
      </div>
    </BodyPortal>
  );
}

export default memo(JaaSMeeting);
