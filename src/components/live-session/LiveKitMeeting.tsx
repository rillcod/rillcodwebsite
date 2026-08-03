'use client';

import { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  LiveKitRoom,
  VideoConference,
  ConnectionStateToast,
} from '@livekit/components-react';
import { DefaultReconnectPolicy, DisconnectReason } from 'livekit-client';
import type { RoomOptions, RoomConnectOptions } from 'livekit-client';
import '@livekit/components-styles';
import '@livekit/components-styles/prefabs';
import HostControls from './HostControls';
import {
  CONNECT_DEADLINE_MS,
  MAX_AUTO_REJOIN,
  attemptLabel,
  hasExhaustedRejoins,
  isFatalJoinError,
  isRemovedJoinError,
  rejoinDelayMs,
  shouldAutoRejoin,
  type MeetingPhase,
} from '@/lib/live-sessions/rejoin-policy';

interface LiveKitMeetingProps {
  sessionId: string;
  sessionTitle: string;
  onClose: () => void;
}

const BTN_PRIMARY =
  'px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black uppercase tracking-widest transition-colors';
const BTN_GHOST =
  'px-6 py-3 bg-white/10 hover:bg-white/20 text-white text-xs font-black uppercase tracking-widest transition-colors';

const POOR_NET_RECONNECT = new DefaultReconnectPolicy([
  0, 400, 900, 1600, 2500, 4000, 6000, 8000, 10000, 12000, 15000, 15000, 20000,
]);

/**
 * Module-scope only. Inline options/callbacks on <LiveKitRoom> re-fire connect()
 * every parent render and abort LiveKit's own reconnect. Guarded by tests.
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
const ROOM_STYLE: React.CSSProperties = { height: '100%' };

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
  /** LiveKit media path confirmed — separate from phase so the header badge can update. */
  const [mediaReady, setMediaReady] = useState(false);
  /** Bump only when we need a brand-new Room after a terminal drop — never from the JWT. */
  const [roomEpoch, setRoomEpoch] = useState(0);
  /**
   * True while a token fetch is in flight. Without this, rejoin sets phase to
   * `rejoining` while the OLD token is still set → room remounts mid-fetch and
   * everyone spins on Connecting forever.
   */
  const [seatPending, setSeatPending] = useState(true);

  const exitedRef = useRef(false);
  const attendanceLeftRef = useRef(false);
  const connectedRef = useRef(false);
  /** True while we intentionally unmount the room (drop / leave / remount). */
  const intentionalUnmountRef = useRef(false);
  const loadSeqRef = useRef(0);

  const rejoinTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideLeaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectWatchdog = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

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
      // Surface a hint only — do NOT flip to dropped/unmount here. That regressed
      // live class after cleanup: slow joins never reached onConnected before we
      // tore the room down and entered a reconnect loop.
      setError((prev) => prev || 'Still connecting — check camera/mic permission and your network.');
    }, CONNECT_DEADLINE_MS);
  }, [clearWatchdog]);

  /**
   * Fetch a token and (re)mount the room.
   * CRITICAL: do NOT clear token/url up front — that remounts mid-flight and
   * shows up as endless Connecting / CLIENT_INITIATED disconnects.
   */
  const loadToken = useCallback(
    async (opts?: { rejoin?: boolean }) => {
      if (exitedRef.current) return;
      const seq = ++loadSeqRef.current;
      const rejoin = !!opts?.rejoin;

      setError(null);
      setPhase(rejoin ? 'rejoining' : 'loading');
      connectedRef.current = false;
      setMediaReady(false);
      // Hold the room unmounted until the new seat arrives — do NOT clear token
      // (that remount storm is worse); seatPending gates LiveKitRoom instead.
      intentionalUnmountRef.current = true;
      setSeatPending(true);

      const controller = new AbortController();
      const fetchTimeout = setTimeout(() => {
        if (seq === loadSeqRef.current && !exitedRef.current) {
          controller.abort();
        }
      }, 6000);

      try {
        const res = await fetch('/api/live-sessions/livekit-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId }),
          signal: controller.signal,
        });
        clearTimeout(fetchTimeout);
        const j = await res.json();
        if (!res.ok) throw new Error(j.error ?? 'Token error');
        if (seq !== loadSeqRef.current || exitedRef.current) return;

        // Remount only on rejoin (old room already unmounted via seatPending).
        // First join just sets credentials once — no epoch churn.
        if (rejoin) {
          setRoomEpoch((n) => n + 1);
        }
        setToken(j.token);
        setServerUrl(j.url);
        setIsModerator(!!j.isModerator);
        setSeatPending(false);
        // Pre-cleanup behaviour: show the room as soon as the seat is minted.
        // Waiting for onConnected left everyone on "Connecting…" on slow networks
        // and the watchdog below kept killing the attempt mid-flight.
        setPhase('live');
        // NB: the retry budget is NOT reset here. A seat is only proof the API is up; when
        // media can't get through (blocked UDP, unreachable TURN) the token keeps succeeding,
        // so resetting here pinned the counter at 0 and the loop ran forever at 2s intervals —
        // "Attempt 1 of 5" for eternity, and the Retry / Jitsi-backup screen was unreachable.
        // Only handleConnected — a real media path — clears it.
        armConnectWatchdog();
        requestAnimationFrame(() => {
          intentionalUnmountRef.current = false;
        });
      } catch (e: unknown) {
        if (seq !== loadSeqRef.current || exitedRef.current) return;
        clearTimeout(fetchTimeout);
        const isAbort = e instanceof Error && e.name === 'AbortError';
        const msg = isAbort
          ? 'LiveKit server gateway is slow to respond. Please try again or use the backup room.'
          : e instanceof Error ? e.message : 'Failed to connect';
        setSeatPending(false);
        setError(msg);
        // The server refusing a seat because the host kicked them is its own screen — the
        // generic drop screen offers Retry and a backup room, i.e. a way around the host.
        setPhase(isRemovedJoinError(msg) ? 'removed' : 'dropped');
      }
    },
    [sessionId, armConnectWatchdog],
  );

  useEffect(() => {
    exitedRef.current = false;
    attendanceLeftRef.current = false;
    intentionalUnmountRef.current = false;
    void loadToken();
    return clearTimers;
  }, [loadToken, clearTimers]);

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

  const recordRejoin = useCallback(() => {
    if (!attendanceLeftRef.current) return;
    attendanceLeftRef.current = false;
    fetch(`/api/live-sessions/${sessionId}/join`, { method: 'POST' }).catch(() => {});
  }, [sessionId]);

  const handleClose = useCallback(() => {
    if (exitedRef.current) return;
    exitedRef.current = true;
    intentionalUnmountRef.current = true;
    loadSeqRef.current++;
    clearTimers();
    recordLeave();
    onCloseRef.current();
  }, [recordLeave, clearTimers]);

  const handleConnected = useCallback(() => {
    intentionalUnmountRef.current = false;
    connectedRef.current = true;
    setMediaReady(true);
    clearWatchdog();
    setError(null);
    setPhase('live');
    setAutoTry(0);
  }, [clearWatchdog]);

  const handleDisconnected = useCallback((reason?: DisconnectReason) => {
    connectedRef.current = false;
    setMediaReady(false);
    if (exitedRef.current) return;
    if (intentionalUnmountRef.current) return;
    // Our Leave / phase-unmount — not a network death.
    if (reason === DisconnectReason.CLIENT_INITIATED) return;
    if (reason === DisconnectReason.ROOM_DELETED || reason === DisconnectReason.ROOM_CLOSED) {
      clearWatchdog();
      intentionalUnmountRef.current = true;
      setPhase('ended');
      return;
    }
    // The host kicked us. This used to fall through to 'dropped' → auto-rejoin, which handed
    // the student a fresh seat ~2s later and made Remove a no-op. Terminal now; the server
    // refuses a new token too, until the host re-admits them.
    if (reason === DisconnectReason.PARTICIPANT_REMOVED) {
      clearWatchdog();
      intentionalUnmountRef.current = true;
      setPhase('removed');
      return;
    }
    // The same account joined somewhere else and LiveKit evicted this connection. Rejoining
    // would evict the other one, which would rejoin and evict us — two tabs ping-ponging
    // forever. Stop, and let the user pick a device.
    if (reason === DisconnectReason.DUPLICATE_IDENTITY) {
      clearWatchdog();
      intentionalUnmountRef.current = true;
      setPhase('superseded');
      return;
    }
    // Terminal drop after LiveKit's own reconnect gave up → unmount + auto-rejoin.
    intentionalUnmountRef.current = true;
    setPhase((p) => (p === 'ended' ? p : 'dropped'));
  }, [clearWatchdog]);

  const handleError = useCallback((e: Error) => {
    const msg = e?.message ?? 'Connection error';
    if (/Permission|NotAllowed|NotFound|NotReadable/i.test(msg)) {
      setError(msg);
      return;
    }
    if (/duplicate.?identity|already connected/i.test(msg)) {
      // Every token mint already clears a stale ghost seat server-side, so a duplicate here
      // means a genuine second client. Auto-rejoining just started the ping-pong.
      intentionalUnmountRef.current = true;
      setPhase('superseded');
      return;
    }
    console.warn('[livekit]', msg);
  }, []);

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
      // Kicked / superseded is a decision, not a blip — don't re-open attendance either.
      if (phase === 'removed' || phase === 'superseded') return;
      recordRejoin();
      if (shouldAutoRejoin({ phase, attempt: autoTry, error: errorRef.current, exited: false })) {
        void loadToken({ rejoin: true });
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [phase, autoTry, loadToken, recordLeave, recordRejoin]);

  // Host-ended poll — do not latch exitedRef here or Close becomes inert.
  useEffect(() => {
    if (phase !== 'live' && phase !== 'rejoining' && phase !== 'loading') return;
    const iv = setInterval(async () => {
      try {
        const res = await fetch(`/api/live-sessions/${sessionId}/status`, { cache: 'no-store' });
        if (!res.ok) return;
        const j = await res.json();
        if (['completed', 'cancelled'].includes(j.status)) {
          intentionalUnmountRef.current = true;
          clearTimers();
          setPhase('ended');
        }
      } catch {
        /* transient */
      }
    }, 30_000);
    return () => clearInterval(iv);
  }, [phase, sessionId, clearTimers]);

  // Auto-rejoin after a terminal drop.
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

  const isFatal = isFatalJoinError(error);
  // A terminal decision (kicked / superseded) outranks `stalled`: the stalled screen offers
  // Retry and a backup room, and the removal 403 is itself a "fatal" error, so checking
  // stalled first would hand a kicked student two ways straight back around the host.
  const isTerminal = phase === 'removed' || phase === 'superseded';
  const stalled = !isTerminal && ((phase === 'dropped' && hasExhaustedRejoins(autoTry)) || isFatal);

  // Room shows once we have a seat and phase is live (set on token success).
  const roomMounted =
    !!token
    && !!serverUrl
    && !seatPending
    && phase === 'live';

  if (stalled) {
    return (
      <Overlay>
        <p className="text-rose-400 text-sm font-bold">{error ?? 'Lost connection to the class.'}</p>
        <p className="text-white/50 text-[11px] max-w-sm">
          Check camera/mic permission and your network.
        </p>
        <div className="flex flex-wrap gap-2 justify-center mt-2">
          <button type="button" onClick={manualRejoin} className={BTN_PRIMARY}>Retry</button>
          <button
            type="button"
            onClick={() => {
              const jitsiUrl = `https://meet.jit.si/Rillcod-${sessionId.slice(0, 12)}`;
              window.open(jitsiUrl, '_blank', 'noopener,noreferrer');
            }}
            className="px-4 py-2 text-xs font-black uppercase tracking-widest text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 hover:bg-emerald-500/20 transition-colors"
          >
            Launch via Jitsi Backup
          </button>
          <button type="button" onClick={handleClose} className={BTN_GHOST}>Close</button>
        </div>
      </Overlay>
    );
  }

  if (phase === 'ended') {
    return (
      <Overlay>
        <p className="text-white/70 text-sm font-bold">This session has been ended by the host.</p>
        <button type="button" onClick={handleClose} className={BTN_PRIMARY}>Close</button>
      </Overlay>
    );
  }

  // Deliberately offers no Retry and no backup room — both would walk straight around the
  // host's decision. Only the host re-admitting clears this.
  if (phase === 'removed') {
    return (
      <Overlay>
        <p className="text-rose-400 text-sm font-bold">You were removed from this session by the host.</p>
        <p className="text-white/50 text-[11px] max-w-sm">
          Ask your teacher to let you back in if you think this was a mistake.
        </p>
        <button type="button" onClick={handleClose} className={BTN_PRIMARY}>Close</button>
      </Overlay>
    );
  }

  if (phase === 'superseded') {
    return (
      <Overlay>
        <p className="text-amber-400 text-sm font-bold">You joined this class on another tab or device.</p>
        <p className="text-white/50 text-[11px] max-w-sm">
          Only one can be connected at a time. Continuing here will disconnect the other one.
        </p>
        <div className="flex flex-wrap gap-2 justify-center mt-2">
          <button type="button" onClick={manualRejoin} className={BTN_PRIMARY}>Continue here</button>
          <button type="button" onClick={handleClose} className={BTN_GHOST}>Close</button>
        </div>
      </Overlay>
    );
  }

  if (phase === 'dropped' || (phase === 'rejoining' && !roomMounted)) {
    return (
      <Overlay>
        <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent animate-spin" />
        <p className="text-amber-400 text-sm font-bold">
          {phase === 'rejoining' ? 'Reconnecting…' : 'Connection lost — reconnecting…'}
        </p>
        <p className="text-white/50 text-[11px]">
          Attempt {attemptLabel(autoTry)} of {MAX_AUTO_REJOIN} · stay on this page
        </p>
        <div className="flex flex-wrap gap-2 justify-center mt-2">
          <button type="button" onClick={manualRejoin} className={BTN_PRIMARY}>Rejoin now</button>
          <button
            type="button"
            onClick={() => {
              const jitsiUrl = `https://meet.jit.si/Rillcod-${sessionId.slice(0, 12)}`;
              window.open(jitsiUrl, '_blank', 'noopener,noreferrer');
            }}
            className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 hover:bg-emerald-500/20 transition-colors"
          >
            Launch Backup Room
          </button>
          <button type="button" onClick={handleClose} className={BTN_GHOST}>Leave</button>
        </div>
      </Overlay>
    );
  }

  if (!roomMounted) {
    return (
      <Overlay>
        <div className="w-10 h-10 border-4 border-emerald-600 border-t-transparent animate-spin" />
        <p className="text-white/70 text-sm font-bold">Starting live meeting…</p>
        {error && <p className="text-rose-400 text-xs max-w-sm font-bold text-center px-4">{error}</p>}
        <p className="text-white/40 text-[11px] mt-1">Connecting to secure video gateway…</p>
        <div className="flex gap-2 mt-4">
          <button
            type="button"
            onClick={() => {
              const jitsiUrl = `https://meet.jit.si/Rillcod-${sessionId.slice(0, 12)}`;
              window.open(jitsiUrl, '_blank', 'noopener,noreferrer');
            }}
            className="px-4 py-2 text-xs font-black uppercase tracking-widest text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 hover:bg-emerald-500/20 transition-colors"
          >
            Launch Jitsi Backup
          </button>
          <button type="button" onClick={handleClose} className={BTN_GHOST}>Close</button>
        </div>
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
          {!mediaReady && (
            <span className="text-[10px] font-bold text-amber-400 uppercase tracking-widest">
              Connecting…
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!mediaReady && (
            <button
              type="button"
              onClick={() => {
                const jitsiUrl = `https://meet.jit.si/Rillcod-${sessionId.slice(0, 12)}`;
                window.open(jitsiUrl, '_blank', 'noopener,noreferrer');
              }}
              className="px-3 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 hover:bg-emerald-500/20 transition-colors"
            >
              Use Jitsi Backup
            </button>
          )}
          <button
            type="button"
            onClick={handleClose}
            className="px-3 py-1 text-[10px] font-black uppercase tracking-widest text-rose-400 bg-rose-500/10 border border-rose-500/30 hover:bg-rose-500/20 transition-colors shrink-0"
          >
            Leave
          </button>
        </div>
      </div>

      {/* Once the room is mounted the overlays are gone, so this is the ONLY place an error
          can reach the user. Without it the 45s connect watchdog and every camera/mic
          permission failure were set into state and silently discarded — a denied mic looked
          like an eternal "Connecting…" with no explanation. */}
      {error && (
        <div className="flex items-center justify-between gap-3 px-4 py-2 bg-rose-950/60 border-b border-rose-500/30 shrink-0">
          <p className="text-rose-300 text-[11px] font-bold min-w-0">{error}</p>
          <button
            type="button"
            onClick={manualRejoin}
            className="px-3 py-1 text-[10px] font-black uppercase tracking-widest text-white bg-rose-600/40 hover:bg-rose-600/60 border border-rose-400/40 transition-colors shrink-0"
          >
            Retry
          </button>
        </div>
      )}

      <div className="flex-1 min-h-0 relative">
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

export default memo(LiveKitMeeting);
