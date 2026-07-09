'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { LiveKitRoom, VideoConference, ConnectionStateToast } from '@livekit/components-react';
import '@livekit/components-styles';
import '@livekit/components-styles/prefabs';
import HostControls from './HostControls';

interface LiveKitMeetingProps {
  sessionId: string;
  sessionTitle: string;
  onClose: () => void;
}

type Phase = 'loading' | 'live' | 'dropped' | 'ended';

const BTN_PRIMARY = 'px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black uppercase tracking-widest transition-colors';
const BTN_GHOST   = 'px-6 py-3 bg-white/10 hover:bg-white/20 text-white text-xs font-black uppercase tracking-widest transition-colors';

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-[#0a0a0a] gap-4">
      {children}
    </div>
  );
}

export default function LiveKitMeeting({ sessionId, sessionTitle, onClose }: LiveKitMeetingProps) {
  const [token, setToken]         = useState<string | null>(null);
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [isModerator, setIsModerator] = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [phase, setPhase]         = useState<Phase>('loading');
  const leftRef   = useRef(false);
  const closedRef = useRef(false);

  // Fetch a fresh LiveKit token (also used to Rejoin / Retry).
  const loadToken = useCallback(async () => {
    setError(null);
    setToken(null);
    setPhase('loading');
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
    } catch (e: any) {
      setError(e.message ?? 'Failed to connect');
    }
  }, [sessionId]);

  useEffect(() => { void loadToken(); }, [loadToken]);

  // Record leaving exactly once — used by explicit Leave AND the tab-close beacon,
  // so attendance is accurate even when the browser/tab is closed abruptly.
  const recordLeave = useCallback(() => {
    if (leftRef.current) return;
    leftRef.current = true;
    try {
      if (navigator.sendBeacon) navigator.sendBeacon(`/api/live-sessions/${sessionId}/leave`);
      else fetch(`/api/live-sessions/${sessionId}/leave`, { method: 'POST', keepalive: true }).catch(() => {});
    } catch { /* best-effort */ }
  }, [sessionId]);

  const handleClose = useCallback(() => {
    if (closedRef.current) return;
    closedRef.current = true;
    recordLeave();
    onClose();
  }, [recordLeave, onClose]);

  // #5 — flush a leave only on a REAL unload (tab/browser close). Skip when the page is
  // entering the back-forward cache (persisted=true, e.g. a mobile tab switch) so we don't
  // prematurely mark the user as gone when they may return in a moment.
  useEffect(() => {
    const onHide = (e: PageTransitionEvent) => { if (!e.persisted) recordLeave(); };
    window.addEventListener('pagehide', onHide);
    return () => window.removeEventListener('pagehide', onHide);
  }, [recordLeave]);

  // #4 — poll session status; if the host ends/cancels it, release participants.
  useEffect(() => {
    if (phase !== 'live') return;
    const iv = setInterval(async () => {
      try {
        const res = await fetch(`/api/live-sessions/${sessionId}/status`, { cache: 'no-store' });
        if (!res.ok) return;
        const j = await res.json();
        if (['completed', 'cancelled'].includes(j.status)) setPhase('ended');
      } catch { /* transient — keep polling */ }
    }, 30_000);
    return () => clearInterval(iv);
  }, [phase, sessionId]);

  // ── UI states ──────────────────────────────────────────────────────────────
  if (error) {
    return (
      <Overlay>
        <p className="text-rose-400 text-sm font-bold">{error}</p>
        <div className="flex gap-2">
          <button onClick={() => void loadToken()} className={BTN_PRIMARY}>Retry</button>
          <button onClick={handleClose} className={BTN_GHOST}>Close</button>
        </div>
      </Overlay>
    );
  }

  if (phase === 'ended') {
    return (
      <Overlay>
        <p className="text-white/70 text-sm font-bold">This session has been ended by the host.</p>
        <button onClick={handleClose} className={BTN_PRIMARY}>Close</button>
      </Overlay>
    );
  }

  if (phase === 'dropped') {
    return (
      <Overlay>
        <p className="text-amber-400 text-sm font-bold">Connection lost — you can rejoin.</p>
        <div className="flex gap-2">
          <button onClick={() => void loadToken()} className={BTN_PRIMARY}>Rejoin</button>
          <button onClick={handleClose} className={BTN_GHOST}>Leave</button>
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
      {/* Leave is deliberate: hide LiveKit's own control-bar leave button so the only exit
          is our labelled "Leave" above — this removes the accidental-tap that was ejecting
          students with a CLIENT_INITIATED disconnect. */}
      <style>{`.lk-disconnect-button{display:none !important}`}</style>

      {/* Title bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-black/80 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2">
          <span className="relative flex w-2 h-2">
            <span className="absolute inset-0 rounded-full bg-emerald-500 opacity-75 animate-ping" />
            <span className="relative rounded-full w-2 h-2 bg-emerald-500" />
          </span>
          <span className="text-[10px] font-black text-white uppercase tracking-widest">{sessionTitle}</span>
        </div>
        <button
          onClick={handleClose}
          className="px-3 py-1 text-[10px] font-black uppercase tracking-widest text-rose-400 bg-rose-500/10 border border-rose-500/30 hover:bg-rose-500/20 transition-colors"
        >
          Leave
        </button>
      </div>

      {/* LiveKit VideoConference — camera, mic, layout, chat, screen share */}
      <div className="flex-1 min-h-0 relative">
        <LiveKitRoom
          token={token}
          serverUrl={serverUrl}
          connect={true}
          video={true}
          audio={true}
          // #1 — LiveKit auto-reconnects transient drops (ConnectionStateToast shows the
          // "Reconnecting…" state). onDisconnected only fires on a TERMINAL drop. We NEVER
          // kick a student out on a stray disconnect: only our own top-bar Leave button
          // (which sets leftRef) fully closes the meeting, and staff ending the session is
          // handled separately by the status poll -> 'ended'. Everything else — a network
          // blip, a reconnect that gave up, even a CLIENT_INITIATED event we didn't trigger
          // — drops to the Rejoin screen so the student can come straight back.
          onDisconnected={() => {
            if (leftRef.current) handleClose();
            else setPhase('dropped');
          }}
          onError={(e) => setError(e.message)}
          options={{ adaptiveStream: true, dynacast: true }}
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
