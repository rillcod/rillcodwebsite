'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  LiveKitRoom,
  VideoConference,
  RoomAudioRenderer,
  ControlBar,
  GridLayout,
  ParticipantTile,
  useTracks,
  useRoomContext,
  useParticipants,
  RoomName,
  ConnectionStateToast,
  FocusLayout,
  FocusLayoutContainer,
  CarouselLayout,
  LayoutContextProvider,
  useCreateLayoutContext,
  Chat,
  MessageFormatter,
} from '@livekit/components-react';
import '@livekit/components-styles';
import '@livekit/components-styles/prefabs';
import { Track, RoomEvent } from 'livekit-client';
import { XMarkIcon, SignalIcon } from '@/lib/icons';

interface LiveKitMeetingProps {
  sessionId: string;
  sessionTitle: string;
  onClose: () => void;
}

// Inner component — has access to room context
function MeetingInner({ sessionTitle, isModerator, onClose }: {
  sessionTitle: string;
  isModerator: boolean;
  onClose: () => void;
}) {
  const room        = useRoomContext();
  const participants = useParticipants();
  const tracks      = useTracks(
    [
      { source: Track.Source.Camera,      withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  );

  const layoutContext = useCreateLayoutContext();

  // Record leave on disconnect
  useEffect(() => {
    const handler = () => onClose();
    room.on(RoomEvent.Disconnected, handler);
    return () => { room.off(RoomEvent.Disconnected, handler); };
  }, [room, onClose]);

  return (
    <div className="lk-room-container" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Custom top bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 16px', background: '#111', borderBottom: '1px solid rgba(255,255,255,0.08)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ position: 'relative', display: 'flex', width: 8, height: 8 }}>
            <span style={{
              position: 'absolute', inset: 0, borderRadius: '50%',
              background: '#10b981', opacity: 0.75, animation: 'ping 1s infinite',
            }} />
            <span style={{ position: 'relative', borderRadius: '50%', width: 8, height: 8, background: '#10b981' }} />
          </span>
          <span style={{ fontSize: 10, fontWeight: 900, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.15em' }}>
            {sessionTitle}
          </span>
          {isModerator && (
            <span style={{
              fontSize: 8, fontWeight: 900, color: '#10b981', textTransform: 'uppercase',
              letterSpacing: '0.15em', padding: '2px 8px',
              background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)',
            }}>Host</span>
          )}
          <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', fontWeight: 700 }}>
            {participants.length} participant{participants.length !== 1 ? 's' : ''}
          </span>
        </div>
        <button
          onClick={onClose}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 14px', background: 'rgba(220,38,38,0.15)',
            border: '1px solid rgba(220,38,38,0.3)', color: '#f87171',
            fontSize: 10, fontWeight: 900, textTransform: 'uppercase',
            letterSpacing: '0.15em', cursor: 'pointer',
          }}
        >
          Leave
        </button>
      </div>

      {/* LiveKit VideoConference — full Google Meet-like UI */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        <LayoutContextProvider value={layoutContext}>
          <div className="lk-video-conference" style={{ height: '100%' }}>
            {tracks.length > 0 ? (
              <div className="lk-grid-layout-wrapper" style={{ height: 'calc(100% - 60px)' }}>
                <GridLayout tracks={tracks} style={{ height: '100%' }}>
                  <ParticipantTile />
                </GridLayout>
              </div>
            ) : (
              <div style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'rgba(255,255,255,0.3)', fontSize: 14, fontWeight: 700,
              }}>
                Waiting for participants…
              </div>
            )}
            {/* Full control bar — mic, camera, screen share, chat, settings, leave */}
            <ControlBar
              variation="verbose"
              controls={{
                microphone: true,
                camera: true,
                screenShare: true,
                chat: true,
                leave: false, // we handle leave ourselves
                settings: true,
              }}
            />
          </div>
        </LayoutContextProvider>
        <ConnectionStateToast />
        <RoomAudioRenderer />
      </div>
    </div>
  );
}

export default function LiveKitMeeting({ sessionId, sessionTitle, onClose }: LiveKitMeetingProps) {
  const [token, setToken]             = useState<string | null>(null);
  const [serverUrl, setServerUrl]     = useState<string | null>(null);
  const [isModerator, setIsModerator] = useState(false);
  const [error, setError]             = useState<string | null>(null);

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
        setIsModerator(j.isModerator);
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
    <div className="fixed inset-0 z-[60] flex flex-col bg-[#0a0a0a]">
      <LiveKitRoom
        token={token}
        serverUrl={serverUrl}
        connect={true}
        video={true}
        audio={true}
        onDisconnected={handleClose}
        options={{
          adaptiveStream: true,
          dynacast: true,
        }}
        style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
      >
        <MeetingInner
          sessionTitle={sessionTitle}
          isModerator={isModerator}
          onClose={handleClose}
        />
      </LiveKitRoom>
    </div>
  );
}
