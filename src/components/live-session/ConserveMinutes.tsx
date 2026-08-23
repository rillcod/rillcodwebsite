'use client';

import { useEffect, useRef } from 'react';
import { useRoomContext } from '@livekit/components-react';
import {
  CONSERVATION_TICK_MS,
  decideConservation,
  minutesConserved,
} from '@/lib/live-sessions/conservation';

/**
 * Ends a live seat that has stopped serving anyone.
 *
 * LiveKit bills per participant-minute and this client sets
 * `disconnectOnPageLeave: false`, so nothing ends the seat of someone who simply
 * walks away — the token runs 12 hours. Six weeks of that exhausted the account's
 * monthly minutes and every live class stopped.
 *
 * Deliberately a child of <LiveKitRoom> rather than a change to it. The connection
 * setup in LiveKitMeeting has a history of regressions from well-meant edits, so
 * this reads the room through context and touches none of its props, options or
 * callbacks. If this component were deleted, joining would behave exactly as before.
 *
 * The decision itself lives in lib/live-sessions/conservation.ts, tested without a
 * browser. This part only measures and acts.
 */
export default function ConserveMinutes({
  isModerator,
  onConserve,
}: {
  isModerator: boolean;
  onConserve: (reason: string) => void;
}) {
  const room = useRoomContext();
  const hiddenSinceRef = useRef<number | null>(null);
  const aloneSinceRef = useRef<number | null>(null);
  const firedRef = useRef(false);
  // Kept in a ref so changing it never re-runs the interval effect.
  const onConserveRef = useRef(onConserve);
  onConserveRef.current = onConserve;
  const isModeratorRef = useRef(isModerator);
  isModeratorRef.current = isModerator;

  useEffect(() => {
    if (!room) return;
    if (typeof document === 'undefined') return;

    const markVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenSinceRef.current ??= Date.now();
      } else {
        hiddenSinceRef.current = null;
      }
    };
    markVisibility();
    document.addEventListener('visibilitychange', markVisibility);

    const tick = () => {
      if (firedRef.current) return;

      const remoteCount = room.remoteParticipants?.size ?? 0;
      if (remoteCount > 0) {
        aloneSinceRef.current = null;
      } else {
        aloneSinceRef.current ??= Date.now();
      }

      const now = Date.now();
      const decision = decideConservation({
        hiddenMs: hiddenSinceRef.current ? now - hiddenSinceRef.current : 0,
        aloneMs: aloneSinceRef.current ? now - aloneSinceRef.current : 0,
        remoteCount,
        isModerator: isModeratorRef.current,
      });

      if (!decision.disconnect) return;
      firedRef.current = true;

      // Logged so a leak shows up as a number rather than as a surprise on a bill.
      console.info('[livekit] releasing an idle seat', {
        remoteCount,
        hiddenMs: hiddenSinceRef.current ? now - hiddenSinceRef.current : 0,
        approxMinutesSaved: minutesConserved(12 * 60 * 60_000),
      });

      // Disconnect first so billing stops even if the caller's teardown is slow.
      try {
        void room.disconnect();
      } catch {
        /* already gone */
      }
      onConserveRef.current(decision.reason);
    };

    /**
     * Closing the tab is how nearly every class actually ends, and nothing was
     * telling LiveKit about it. `disconnectOnPageLeave: false` disables the
     * library's own handling — deliberately, so an app switch does not eject a
     * phone — which left no path at all for a genuine departure. Every participant
     * of every session held a seat until the server timed them out.
     *
     * `pagehide` separates the two cases in a way `visibilitychange` cannot.
     * `persisted: true` means the page went into the back/forward cache and may be
     * restored, which is the app-switch case and must be left alone. `persisted:
     * false` means it is really going: closed, or navigated away.
     */
    const onPageHide = (event: PageTransitionEvent) => {
      if (event.persisted) return;
      if (firedRef.current) return;
      firedRef.current = true;
      try {
        void room.disconnect();
      } catch {
        /* the page is going anyway */
      }
    };
    window.addEventListener('pagehide', onPageHide);

    const timer = setInterval(tick, CONSERVATION_TICK_MS);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', markVisibility);
      window.removeEventListener('pagehide', onPageHide);
      // Unmounting is itself a departure — leaving the meeting screen must not
      // leave a seat running behind it.
      try {
        if (room.state !== 'disconnected') void room.disconnect();
      } catch {
        /* already gone */
      }
    };
  }, [room]);

  return null;
}
