'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  LiveKitRoom,
  VideoConference,
  ConnectionStateToast,
} from '@livekit/components-react';
import { DefaultReconnectPolicy } from 'livekit-client';
import '@livekit/components-styles';
import '@livekit/components-styles/prefabs';
import HostControls from './HostControls';

interface LiveKitMeetingProps {
  sessionId: string;
  sessionTitle: string;
  onClose: () => void;
}

type Phase = 'loading' | 'live' | 'rejoining' | 'dropped' | 'ended';

const BTN_PRIMARY =
  'px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black uppercase tracking-widest transition-colors';
const BTN_GHOST =
  'px-6 py-3 bg-white/10 hover:bg-white/20 text-white text-xs font-black uppercase tracking-widest transition-colors';

/** Longer backoff than stock (~10 tries / ~50s) — Nigerian school networks blip hard. */
const POOR_NET_RECONNECT = new DefaultReconnectPolicy([
  0, 400, 900, 1600, 2500, 4000, 6000, 8000, 10000, 12000, 15000, 15000, 20000,
]);

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-[#0a0a0a] gap-4 px-6 text-center">
      {children}
    </div>
  );
}

export default function LiveKitMeeting({ sessionId, sessionTitle, onClose }: LiveKitMeetingProps) {
  const [token, setToken] = useState<string | null>(null);
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [isModerator, setIsModerator] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [autoTry, setAutoTry] = useState(0);

  const leftRef = useRef(false);
  const closedRef = useRef(false);
  const rejoinTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideLeaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (rejoinTimer.current) {
      clearTimeout(rejoinTimer.current);
      rejoinTimer.current = null;
    }
    if (hideLeaveTimer.current) {
      clearTimeout(hideLeaveTimer.current);
      hideLeaveTimer.current = null;
    }
  }, []);

  // Fetch a fresh token. Do NOT clear the old token up-front — that remounts LiveKitRoom
  // and shows up as CLIENT_INITIATED disconnect mid-rejoin.
  const loadToken = useCallback(async (opts?: { soft?: boolean }) => {
    setError(null);
    if (!opts?.soft) setPhase('loading');
    else setPhase('rejoining');
    try {
      const res = await fetch('/api/live-sessions/livekit-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? 'Token error');
      setToken(j.token);
      setServerUrl(j.url);
      setIsModerator(!!j.isModerator);
      setPhase('live');
      setAutoTry(0);
    } catch (e: any) {
      setError(e.message ?? 'Failed to connect');
      setPhase('dropped');
    }
  }, [sessionId]);

  useEffect(() => {
    void loadToken();
    return () => clearTimers();
  }, [loadToken, clearTimers]);

  const recordLeave = useCallback(() => {
    if (leftRef.current) return;
    leftRef.current = true;
    try {
      if (navigator.sendBeacon) navigator.sendBeacon(`/api/live-sessions/${sessionId}/leave`);
      else fetch(`/api/live-sessions/${sessionId}/leave`, { method: 'POST', keepalive: true }).catch(() => {});
    } catch {
      /* best-effort */
    }
  }, [sessionId]);

  const handleClose = useCallback(() => {
    if (closedRef.current) return;
    closedRef.current = true;
    clearTimers();
    recordLeave();
    onClose();
  }, [recordLeave, onClose, clearTimers]);

  // Only mark leave after the tab stays hidden for a long stretch (real exit / sleep).
  // Brief app switches were firing pagehide → leave + LiveKit CLIENT_INITIATED.
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        if (hideLeaveTimer.current) clearTimeout(hideLeaveTimer.current);
        hideLeaveTimer.current = setTimeout(() => {
          // Still hidden after 3 minutes → treat as gone for attendance.
          if (document.visibilityState === 'hidden' && !leftRef.current) {
            recordLeave();
          }
        }, 3 * 60_000);
      } else {
        if (hideLeaveTimer.current) {
          clearTimeout(hideLeaveTimer.current);
          hideLeaveTimer.current = null;
        }
        // Back from background while marked dropped → soft rejoin.
        if (phase === 'dropped' && !leftRef.current && !closedRef.current) {
          void loadToken({ soft: true });
        }
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [phase, loadToken, recordLeave]);

  // Host-ended poll
  useEffect(() => {
    if (phase !== 'live' && phase !== 'rejoining') return;
    const iv = setInterval(async () => {
      try {
        const res = await fetch(`/api/live-sessions/${sessionId}/status`, { cache: 'no-store' });
        if (!res.ok) return;
        const j = await res.json();
        if (['completed', 'cancelled'].includes(j.status)) {
          clearTimers();
          setPhase('ended');
        }
      } catch {
        /* transient */
      }
    }, 30_000);
    return () => clearInterval(iv);
  }, [phase, sessionId, clearTimers]);

  // Auto-rejoin after a terminal drop (poor network / radio handoff).
  useEffect(() => {
    if (phase !== 'dropped' || leftRef.current || closedRef.current) return;
    if (error && /not open|Unauthorized|Forbidden|no longer active/i.test(error)) return;
    if (autoTry >= 5) return;

    const delay = Math.min(2000 * Math.pow(1.6, autoTry), 12_000);
    rejoinTimer.current = setTimeout(() => {
      setAutoTry((n) => n + 1);
      void loadToken({ soft: true });
    }, delay);

    return () => {
      if (rejoinTimer.current) clearTimeout(rejoinTimer.current);
    };
  }, [phase, autoTry, error, loadToken]);

  if (error && phase !== 'rejoining' && autoTry >= 5) {
    return (
      <Overlay>
        <p className="text-rose-400 text-sm font-bold">{error}</p>
        <p className="text-white/40 text-[11px] max-w-sm">
          Weak network — check your connection, then retry. Keep this tab open during class.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setAutoTry(0);
              void loadToken();
            }}
            className={BTN_PRIMARY}
          >
            Retry
          </button>
          <button type="button" onClick={handleClose} className={BTN_GHOST}>
            Close
          </button>
        </div>
      </Overlay>
    );
  }

  if (phase === 'ended') {
    return (
      <Overlay>
        <p className="text-white/70 text-sm font-bold">This session has been ended by the host.</p>
        <button type="button" onClick={handleClose} className={BTN_PRIMARY}>
          Close
        </button>
      </Overlay>
    );
  }

  if (phase === 'dropped' || phase === 'rejoining') {
    return (
      <Overlay>
        <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent animate-spin" />
        <p className="text-amber-400 text-sm font-bold">
          {phase === 'rejoining' ? 'Reconnecting…' : 'Connection lost — reconnecting…'}
        </p>
        <p className="text-white/40 text-[11px]">
          Attempt {Math.min(autoTry + 1, 5)} of 5 · stay on this page
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setAutoTry(0);
              void loadToken({ soft: true });
            }}
            className={BTN_PRIMARY}
          >
            Rejoin now
          </button>
          <button type="button" onClick={handleClose} className={BTN_GHOST}>
            Leave
          </button>
        </div>
      </Overlay>
    );
  }

  if (!token || !serverUrl) {
    return (
      <Overlay>
        <div className="w-10 h-10 border-4 border-emerald-600 border-t-transparent animate-spin" />
        <p className="text-white/40 text-xs font-bold uppercase tracking-widest">Starting meeting…</p>
      </Overlay>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-[#0a0a0a]" data-lk-theme="default">
      {/* Hide LiveKit's leave control — accidental taps showed as CLIENT_INITIATED. */}
      <style>{`.lk-disconnect-button{display:none !important}`}</style>

      <div className="flex items-center justify-between px-4 py-2 bg-black/80 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="relative flex w-2 h-2 shrink-0">
            <span className="absolute inset-0 rounded-full bg-emerald-500 opacity-75 animate-ping" />
            <span className="relative rounded-full w-2 h-2 bg-emerald-500" />
          </span>
          <span className="text-[10px] font-black text-white uppercase tracking-widest truncate">
            {sessionTitle}
          </span>
        </div>
        <button
          type="button"
          onClick={handleClose}
          className="px-3 py-1 text-[10px] font-black uppercase tracking-widest text-rose-400 bg-rose-500/10 border border-rose-500/30 hover:bg-rose-500/20 transition-colors shrink-0"
        >
          Leave
        </button>
      </div>

      <div className="flex-1 min-h-0 relative">
        <LiveKitRoom
          token={token}
          serverUrl={serverUrl}
          connect={true}
          // Students start audio-only — camera burn kills weak links. Host keeps video on.
          video={isModerator}
          audio={true}
          onDisconnected={() => {
            if (leftRef.current || closedRef.current) {
              handleClose();
              return;
            }
            // Terminal drop after LiveKit's own reconnect gave up → auto-rejoin path.
            setPhase('dropped');
          }}
          onError={(e) => {
            // Don't blank the room for transient publish/media errors.
            const msg = e?.message ?? 'Connection error';
            if (/Permission|NotAllowed|NotFound|NotReadable/i.test(msg)) {
              setError(msg);
              return;
            }
            console.warn('[livekit]', msg);
          }}
          options={{
            adaptiveStream: true,
            dynacast: true,
            // Critical: stop CLIENT_INITIATED on tab/app switch / mobile multitasking.
            disconnectOnPageLeave: false,
            reconnectPolicy: POOR_NET_RECONNECT,
          }}
          connectOptions={{
            maxRetries: 5,
            peerConnectionTimeout: 45_000,
            websocketTimeout: 30_000,
          }}
          style={{ height: '100%' }}
        >
          <VideoConference />
          <ConnectionStateToast />
          {isModerator && <HostControls sessionId={sessionId} />}
        </LiveKitRoom>
      </div>
    </div>
  );
}
