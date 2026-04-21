'use client';

import { useEffect, useState, useCallback } from 'react';
import { LiveKitRoom, VideoConference } from '@livekit/components-react';
import '@livekit/components-styles';
import '@livekit/components-styles/prefabs';

interface LiveKitMeetingProps {
  sessionId: string;
  sessionTitle: string;
  onClose: () => void;
}

export default function LiveKitMeeting({ sessionId, sessionTitle, onClose }: LiveKitMeetingProps) {
  const [token, setToken]     = useState<string | null>(null);
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [error, setError]     = useState<string | null>(null);

  const handleClose = useCallback(async () => {
    try { await fetch(`/api/live-sessions/${sessionId}/leave`, { method: 'POST' }); } catch { /* silent */ }
    onClose();
  }, [sessionId, onClose]);

  useEffect(() => {
    (async () => {
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
      } catch (e: any) {
        setError(e.message ?? 'Failed to connect');
      }
    })();
  }, [sessionId]);

  if (error) {
    return (
      <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-[#0a0a0a] gap-4">
        <p className="text-rose-400 text-sm font-bold">{error}</p>
        <button onClick={handleClose} className="px-6 py-3 bg-white/10 text-white text-xs font-black uppercase tracking-widest">
          Close
        </button>
      </div>
    );
  }

  if (!token || !serverUrl) {
    return (
      <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-[#0a0a0a] gap-3">
        <div className="w-10 h-10 border-4 border-emerald-600 border-t-transparent animate-spin" />
        <p className="text-white/40 text-xs font-bold uppercase tracking-widest">Starting meeting…</p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-[#0a0a0a]" data-lk-theme="default">
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

      {/* LiveKit VideoConference — handles camera, mic, layout, chat, screen share */}
      <div className="flex-1 min-h-0">
        <LiveKitRoom
          token={token}
          serverUrl={serverUrl}
          connect={true}
          video={true}
          audio={true}
          onDisconnected={handleClose}
          options={{ adaptiveStream: true, dynacast: true }}
          style={{ height: '100%' }}
        >
          <VideoConference />
        </LiveKitRoom>
      </div>
    </div>
  );
}
