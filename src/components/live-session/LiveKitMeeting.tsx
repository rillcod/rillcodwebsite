'use client';

import { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  LiveKitRoom,
  VideoConference,
  ConnectionStateToast,
} from '@livekit/components-react';
import { DefaultReconnectPolicy } from 'livekit-client';
import type { RoomOptions, RoomConnectOptions } from 'livekit-client';
import '@livekit/components-styles';
import '@livekit/components-styles/prefabs';
import HostControls from './HostControls';
import {
  CONNECT_DEADLINE_MS,
  MAX_AUTO_REJOIN,
  attemptLabel,
  hasExhaustedRejoins,
  rejoinDelayMs,
  shouldAutoRejoin,
  type MeetingPhase,
} from '@/lib/live-sessions/rejoin-policy';

interface LiveKitMeetingProps {
  sessionId: string;
  sessionTitle: string;
  onClose: () => void;
}

/** Meeting chrome is always dark — keep labels white for contrast. */
const BTN_PRIMARY =
  'px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black uppercase tracking-widest transition-colors';
const BTN_GHOST =
  'px-6 py-3 bg-white/10 hover:bg-white/20 text-white text-xs font-black uppercase tracking-widest transition-colors';

/** Longer backoff than stock — school networks blip hard. */
const POOR_NET_RECONNECT = new DefaultReconnectPolicy([
  0, 400, 900, 1600, 2500, 4000, 6000, 8000, 10000, 12000, 15000, 15000, 20000,
]);

/**
 * Module scope is load-bearing, not style. `useLiveKitRoom` re-creates its Room
 * when `options` stringifies differently, and re-runs `room.connect()` whenever
 * any prop identity changes (`onError` is in that effect's deps). A connect()
 * issued while the Room is Reconnecting aborts LiveKit's in-flight backoff and
 * recreates the engine — inline props here mean a reconnect on every render,
 * which is exactly the loop this component keeps regressing into.
 * Guarded by `livekit-props-stability.test.ts`.
 */
const ROOM_OPTIONS: RoomOptions = {
  adaptiveStream: true,
  dynacast: true,
  disconnectOnPageLeave: false,
  reconnectPolicy: POOR_NET_RECONNECT,
};
const CONNECT_OPTIONS: RoomConnectOptions = {
  maxRetries: 5,
  peerConnectionTimeout: 45_000,
  websocketTimeout: 30_000,
};
/** Hoisted with the rest: no inline literals on <LiveKitRoom>, no exceptions. */
const ROOM_STYLE: React.CSSProperties = { height: '100%' };

/** Tab hidden this long counts as gone for attendance — not as leaving class. */
const HIDDEN_LEAVE_MS = 3 * 60_000;

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-[#0a0a0a] gap-4 px-6 text-center">
      {children}
    </div>
  );
}

function LiveKitMeeting({ sessionId, sessionTitle, onClose }: LiveKitMeetingProps) {
  const [token, setToken] = useState<string | null>(null);
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [isModerator, setIsModerator] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<MeetingPhase>('loading');
  const [autoTry, setAutoTry] = useState(0);
  /**
   * Remount key for LiveKitRoom. Bumped on every deliberate (re)join so we get a
   * brand-new Room and no zombie engine from the previous attempt. Never derive
   * this from the token — a LiveKit JWT's leading chars are a constant header.
   */
  const [roomEpoch, setRoomEpoch] = useState(0);

  /** The user really left: pressed Leave, or the meeting closed/ended. */
  const exitedRef = useRef(false);
  /** We already sent the attendance leave beacon (dedupe only — NOT an exit). */
  const attendanceLeftRef = useRef(false);
  /** True once LiveKit reports a real media connection on the current Room. */
  const connectedRef = useRef(false);
  /** Only the newest token request may apply its result. */
  const loadSeqRef = useRef(0);

  const rejoinTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideLeaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectWatchdog = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Keeps the LiveKitRoom callbacks referentially stable across parent renders. */
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Read by effects below without widening their dep arrays.
  const errorRef = useRef<string | null>(null);
  errorRef.current = error;

  const clearWatchdog = useCallback(() => {
    if (connectWatchdog.current) {
      clearTimeout(connectWatchdog.current);
      connectWatchdog.current = null;
    }
  }, []);

  const clearTimers = useCallback(() => {
    if (rejoinTimer.current) {
      clearTimeout(rejoinTimer.current);
      rejoinTimer.current = null;
    }
    if (hideLeaveTimer.current) {
      clearTimeout(hideLeaveTimer.current);
      hideLeaveTimer.current = null;
    }
    clearWatchdog();
  }, [clearWatchdog]);

  const armConnectWatchdog = useCallback(() => {
    clearWatchdog();
    connectWatchdog.current = setTimeout(() => {
      connectWatchdog.current = null;
      if (exitedRef.current || connectedRef.current) return;
      setPhase((p) => (p === 'ended' ? p : 'dropped'));
      setError((prev) => prev || 'Could not finish connecting — retrying…');
    }, CONNECT_DEADLINE_MS);
  }, [clearWatchdog]);

  /**
   * Fetch a fresh token and mount a fresh Room.
   * `phase` stays 'loading'/'rejoining' until LiveKit reports Connected — never
   * flip to 'live' optimistically, or the watchdog and the overlay both lie.
   */
  const loadToken = useCallback(
    async (opts?: { rejoin?: boolean }) => {
      if (exitedRef.current) return;
      const seq = ++loadSeqRef.current;

      setError(null);
      setPhase(opts?.rejoin ? 'rejoining' : 'loading');
      connectedRef.current = false;

      try {
        const res = await fetch('/api/live-sessions/livekit-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId }),
        });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error ?? 'Token error');
        // A newer attempt overtook this one — drop the stale result.
        if (seq !== loadSeqRef.current || exitedRef.current) return;

        setToken(j.token);
        setServerUrl(j.url);
        setIsModerator(!!j.isModerator);
        setRoomEpoch((n) => n + 1);
        armConnectWatchdog();
      } catch (e: unknown) {
        if (seq !== loadSeqRef.current || exitedRef.current) return;
        setError(e instanceof Error ? e.message : 'Failed to connect');
        setPhase('dropped');
      }
    },
    [sessionId, armConnectWatchdog],
  );

  useEffect(() => {
    // Reset the latches: StrictMode mounts, unmounts and mounts again in dev.
    exitedRef.current = false;
    attendanceLeftRef.current = false;
    void loadToken();
    return clearTimers;
  }, [loadToken, clearTimers]);

  /** Attendance bookkeeping only — never treat this as "the user left class". */
  const recordLeave = useCallback(() => {
    if (attendanceLeftRef.current) return;
    attendanceLeftRef.current = true;
    try {
      if (navigator.sendBeacon) navigator.sendBeacon(`/api/live-sessions/${sessionId}/leave`);
      else fetch(`/api/live-sessions/${sessionId}/leave`, { method: 'POST', keepalive: true }).catch(() => {});
    } catch {
      /* best-effort */
    }
  }, [sessionId]);

  /** Undo a background-timeout leave once the student is demonstrably back. */
  const recordRejoin = useCallback(() => {
    if (!attendanceLeftRef.current) return;
    attendanceLeftRef.current = false;
    fetch(`/api/live-sessions/${sessionId}/join`, { method: 'POST' }).catch(() => {});
  }, [sessionId]);

  const handleClose = useCallback(() => {
    if (exitedRef.current) return;
    exitedRef.current = true;
    loadSeqRef.current++; // invalidate any in-flight token fetch
    clearTimers();
    recordLeave();
    onCloseRef.current();
  }, [recordLeave, clearTimers]);

  // ── Stable LiveKitRoom callbacks ───────────────────────────────────────────
  // These MUST keep their identity between renders — see ROOM_OPTIONS above.
  const handleConnected = useCallback(() => {
    connectedRef.current = true;
    clearWatchdog();
    setError(null);
    setPhase('live');
    // Only reset the retry budget after a real media connection.
    setAutoTry(0);
  }, [clearWatchdog]);

  const handleDisconnected = useCallback(() => {
    connectedRef.current = false;
    if (exitedRef.current) return;
    // Terminal drop after LiveKit's own reconnect gave up. A remount does not
    // land here: LiveKitRoom detaches its listeners before calling disconnect().
    setPhase((p) => (p === 'ended' ? p : 'dropped'));
  }, []);

  const handleError = useCallback((e: Error) => {
    const msg = e?.message ?? 'Connection error';
    if (/Permission|NotAllowed|NotFound|NotReadable/i.test(msg)) {
      setError(msg);
      return;
    }
    console.warn('[livekit]', msg);
  }, []);

  // Only mark leave after the tab stays hidden for a long stretch (real exit /
  // sleep). Backgrounding a phone mid-class must never eject the student.
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        if (hideLeaveTimer.current) clearTimeout(hideLeaveTimer.current);
        hideLeaveTimer.current = setTimeout(() => {
          if (document.visibilityState === 'hidden' && !exitedRef.current) {
            recordLeave();
          }
        }, HIDDEN_LEAVE_MS);
        return;
      }

      if (hideLeaveTimer.current) {
        clearTimeout(hideLeaveTimer.current);
        hideLeaveTimer.current = null;
      }
      if (exitedRef.current) return;
      recordRejoin();
      // Back from background while dropped → soft rejoin (one shot).
      if (shouldAutoRejoin({ phase, attempt: autoTry, error: errorRef.current, exited: false })) {
        void loadToken({ rejoin: true });
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [phase, autoTry, loadToken, recordLeave, recordRejoin]);

  // Host-ended poll
  useEffect(() => {
    if (phase !== 'live' && phase !== 'rejoining') return;
    const iv = setInterval(async () => {
      try {
        const res = await fetch(`/api/live-sessions/${sessionId}/status`, { cache: 'no-store' });
        if (!res.ok) return;
        const j = await res.json();
        if (['completed', 'cancelled'].includes(j.status)) {
          // Do NOT set exitedRef here — that guard also gates handleClose, and
          // setting it would make the "Close" button on the ended overlay inert,
          // trapping the user in a full-screen z-[60] panel. Phase 'ended' is
          // enough: it blocks auto-rejoin and unmounts the room on its own.
          clearTimers();
          setPhase('ended');
        }
      } catch {
        /* transient */
      }
    }, 30_000);
    return () => clearInterval(iv);
  }, [phase, sessionId, clearTimers]);

  // Auto-rejoin after a terminal drop. autoTry only increments here — never reset
  // on token success, or a failing media connect spins forever.
  useEffect(() => {
    if (!shouldAutoRejoin({ phase, attempt: autoTry, error: errorRef.current, exited: exitedRef.current })) {
      return;
    }
    rejoinTimer.current = setTimeout(() => {
      setAutoTry((n) => n + 1);
      void loadToken({ rejoin: true });
    }, rejoinDelayMs(autoTry));

    return () => {
      if (rejoinTimer.current) clearTimeout(rejoinTimer.current);
    };
  }, [phase, autoTry, loadToken]);

  const manualRejoin = useCallback(() => {
    setAutoTry(0);
    setError(null);
    void loadToken({ rejoin: true });
  }, [loadToken]);

  const stalled = phase === 'dropped' && hasExhaustedRejoins(autoTry);

  if (stalled) {
    return (
      <Overlay>
        <p className="text-rose-400 text-sm font-bold">{error ?? 'Lost connection to the class.'}</p>
        <p className="text-white/50 text-[11px] max-w-sm">
          Weak network — check your connection, then retry. Keep this tab open during class.
        </p>
        <div className="flex gap-2">
          <button type="button" onClick={manualRejoin} className={BTN_PRIMARY}>
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

  // No credentials yet — nothing to mount.
  if (!token || !serverUrl) {
    const starting = phase === 'loading';
    return (
      <Overlay>
        <div
          className={`w-10 h-10 border-4 ${starting ? 'border-emerald-600' : 'border-amber-500'} border-t-transparent animate-spin`}
        />
        <p className={`text-sm font-bold ${starting ? 'text-white/50' : 'text-amber-400'}`}>
          {starting ? 'Starting meeting…' : 'Connection lost — reconnecting…'}
        </p>
        {!starting && (
          <>
            <p className="text-white/50 text-[11px]">
              Attempt {attemptLabel(autoTry)} of {MAX_AUTO_REJOIN} · stay on this page
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={manualRejoin} className={BTN_PRIMARY}>
                Rejoin now
              </button>
              <button type="button" onClick={handleClose} className={BTN_GHOST}>
                Leave
              </button>
            </div>
          </>
        )}
      </Overlay>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-[#0a0a0a]" data-lk-theme="default">
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
        {(phase === 'dropped' || phase === 'rejoining') && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/80 gap-3 px-6 text-center">
            <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent animate-spin" />
            <p className="text-amber-400 text-sm font-bold">
              {phase === 'rejoining' ? 'Reconnecting…' : 'Connection lost — reconnecting…'}
            </p>
            <p className="text-white/50 text-[11px]">
              Attempt {attemptLabel(autoTry)} of {MAX_AUTO_REJOIN} · stay on this page
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={manualRejoin} className={BTN_PRIMARY}>
                Rejoin now
              </button>
              <button type="button" onClick={handleClose} className={BTN_GHOST}>
                Leave
              </button>
            </div>
          </div>
        )}

        <LiveKitRoom
          key={roomEpoch}
          token={token}
          serverUrl={serverUrl}
          connect={true}
          video={isModerator}
          audio={true}
          onConnected={handleConnected}
          onDisconnected={handleDisconnected}
          onError={handleError}
          options={ROOM_OPTIONS}
          connectOptions={CONNECT_OPTIONS}
          style={ROOM_STYLE}
        >
          <VideoConference />
          <ConnectionStateToast />
          {isModerator && <HostControls sessionId={sessionId} />}
        </LiveKitRoom>
      </div>
    </div>
  );
}

/**
 * Memoised: the live-sessions page re-renders on every `live_sessions` realtime
 * UPDATE. Without this the meeting re-renders mid-class for reasons that have
 * nothing to do with the meeting. Requires a stable `onClose` from the parent.
 */
export default memo(LiveKitMeeting);
