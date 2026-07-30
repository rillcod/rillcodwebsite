'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParticipants } from '@livekit/components-react';

// Host-only in-call controls: mute-all, per-participant mute/remove, and record to R2.
// Rendered INSIDE <LiveKitRoom> so it has the room context (participant list is live).
// Mobile-first: a compact pill bar that expands into a bottom-sheet participants panel.
export default function HostControls({ sessionId }: { sessionId: string }) {
  const participants = useParticipants();
  const [panelOpen, setPanelOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [recBusy, setRecBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flash = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  // Poll recording state so the button reflects reality (also across host devices).
  const loadRecState = useCallback(async () => {
    try {
      const r = await fetch(`/api/live-sessions/${sessionId}/recording`, { cache: 'no-store' });
      if (r.ok) { const j = await r.json(); setRecording(!!j.recording); }
    } catch { /* transient */ }
  }, [sessionId]);
  useEffect(() => { void loadRecState(); const iv = setInterval(loadRecState, 20_000); return () => clearInterval(iv); }, [loadRecState]);

  const moderate = useCallback(async (body: Record<string, unknown>, key: string, okMsg: string) => {
    setBusy(key);
    try {
      const r = await fetch(`/api/live-sessions/${sessionId}/moderate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? 'Action failed');
      flash(okMsg);
    } catch (e: any) { flash(e.message ?? 'Action failed'); }
    finally { setBusy(null); }
  }, [sessionId, flash]);

  const toggleRecord = useCallback(async () => {
    setRecBusy(true);
    const next = recording ? 'stop' : 'start';
    try {
      const r = await fetch(`/api/live-sessions/${sessionId}/recording`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: next }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? 'Recording failed');
      setRecording(next === 'start');
      flash(next === 'start' ? '● Recording — saving to the cloud' : 'Recording stopped — processing replay');
    } catch (e: any) { flash(e.message ?? 'Recording failed'); }
    finally { setRecBusy(false); }
  }, [sessionId, recording, flash]);

  const remotes = participants.filter((p) => !p.isLocal);

  return (
    <>
      {/* Toast */}
      {toast && (
        <div className="fixed left-1/2 top-16 z-[80] -translate-x-1/2 rounded-full bg-black/85 px-4 py-2 text-[11px] font-bold text-foreground shadow-lg backdrop-blur">
          {toast}
        </div>
      )}

      {/* Host pill bar — sits just under the title bar, above the LiveKit control bar. */}
      <div className="pointer-events-none absolute inset-x-0 top-2 z-[70] flex justify-center px-2">
        <div className="pointer-events-auto flex max-w-full flex-wrap items-center gap-1.5 rounded-full border border-white/15 bg-black/70 px-2 py-1.5 backdrop-blur">
          <span className="px-2 text-[9px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400">Host</span>

          <button
            onClick={() => moderate({ action: 'muteAll' }, 'muteAll', 'Muted everyone')}
            disabled={busy === 'muteAll'}
            className="rounded-full bg-white/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-foreground hover:bg-white/20 disabled:opacity-50"
          >
            {busy === 'muteAll' ? '…' : '🔇 Mute all'}
          </button>

          <button
            onClick={toggleRecord}
            disabled={recBusy}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-wider transition-colors disabled:opacity-50 ${
              recording ? 'bg-rose-600 text-white hover:bg-rose-500' : 'bg-white/10 text-foreground hover:bg-white/20'
            }`}
          >
            <span className={`inline-block h-2 w-2 rounded-full ${recording ? 'animate-pulse bg-white' : 'bg-rose-500'}`} />
            {recBusy ? '…' : recording ? 'Stop rec' : 'Record'}
          </button>

          <button
            onClick={() => setPanelOpen((v) => !v)}
            className="rounded-full bg-white/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-foreground hover:bg-white/20"
          >
            👥 {remotes.length}
          </button>
        </div>
      </div>

      {/* Participants bottom-sheet (mobile-first) */}
      {panelOpen && (
        <div className="absolute inset-0 z-[75] flex flex-col justify-end" onClick={() => setPanelOpen(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-h-[70vh] overflow-y-auto rounded-t-2xl border-t border-white/10 bg-[#111] p-4 sm:mx-auto sm:mb-4 sm:max-w-md sm:rounded-2xl sm:border"
          >
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-black uppercase tracking-widest text-foreground">Participants · {remotes.length}</p>
              <button onClick={() => setPanelOpen(false)} className="text-muted-foreground hover:text-white text-lg leading-none">×</button>
            </div>
            {remotes.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">No one else has joined yet.</p>
            ) : (
              <ul className="space-y-1.5">
                {remotes.map((p) => {
                  const micOn = p.isMicrophoneEnabled;
                  return (
                    <li key={p.identity} className="flex items-center gap-2 rounded-xl bg-white/5 p-2.5">
                      <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-xs font-black text-emerald-600 dark:text-emerald-400">
                        {(p.name || p.identity || '?').charAt(0).toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-bold text-foreground">{p.name || 'Participant'}</span>
                      <button
                        onClick={() => moderate({ action: micOn ? 'mute' : 'unmute', identity: p.identity }, `m-${p.identity}`, micOn ? 'Muted' : 'Unmuted')}
                        disabled={busy === `m-${p.identity}`}
                        className="rounded-lg bg-white/10 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider text-foreground hover:bg-white/20 disabled:opacity-50"
                      >
                        {micOn ? '🔇 Mute' : '🔈 Unmute'}
                      </button>
                      <button
                        onClick={() => { if (confirm(`Remove ${p.name || 'this participant'} from the session?`)) moderate({ action: 'remove', identity: p.identity }, `r-${p.identity}`, 'Removed'); }}
                        disabled={busy === `r-${p.identity}`}
                        className="rounded-lg bg-rose-600/20 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider text-rose-700 dark:text-rose-300 hover:bg-rose-600/30 disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </>
  );
}
