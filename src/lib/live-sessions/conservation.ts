/**
 * Deciding when a live seat has stopped being worth what it costs.
 *
 * LiveKit bills connection minutes per participant. On 13 July 2026 the client was
 * set to `disconnectOnPageLeave: false` so a phone switching apps mid-class was not
 * kicked out — a real fix for a real problem. The cost of it is that nothing
 * disconnects a participant who simply walks away: the token lasts 12 hours and no
 * timeout exists, so one forgotten phone in a bag holds a paid seat all afternoon.
 * Six weeks of that exhausted the account's monthly minutes, and live classes stopped
 * for everyone.
 *
 * So the rule cannot be a flat timeout. A flat timeout either re-breaks
 * app-switching or leaves the leak open. The judgements below are about whether
 * anyone is actually being served:
 *
 *   - a brief hide is someone checking a message, and is always protected;
 *   - being alone in a room is the expensive case, because the seat serves nobody —
 *     it is dropped soonest;
 *   - a long hide is not participation, whoever else is present;
 *   - a moderator with a class in front of them gets the longest rope, because they
 *     may be presenting from another window and dropping the host ends the lesson.
 *
 * Pure and time-injected so every branch is testable without a browser or a clock.
 */

/** A short hide is app-switching, not leaving. Never disconnect inside this. */
export const HIDDEN_GRACE_MS = 2 * 60_000;

/** Hidden this long is not participation, whoever else is in the room. */
export const HIDDEN_LIMIT_MS = 10 * 60_000;

/** A host may legitimately present from another window, so they get longer. */
export const HIDDEN_LIMIT_MODERATOR_MS = 20 * 60_000;

/** Alone in a room this long serves nobody, visible or not. */
export const ALONE_LIMIT_MS = 5 * 60_000;

/** How often the watcher re-evaluates. Cheap; nothing here touches the network. */
export const CONSERVATION_TICK_MS = 15_000;

export type ConservationState = {
  /** Milliseconds the page has been hidden. 0 when visible. */
  hiddenMs: number;
  /** Milliseconds this participant has been the only one present. 0 when others are. */
  aloneMs: number;
  /** Remote participants currently in the room, excluding this one. */
  remoteCount: number;
  isModerator: boolean;
};

export type ConservationDecision =
  | { disconnect: false }
  | { disconnect: true; reason: string };

/**
 * The message is shown to the person being disconnected, so it says what happened
 * and that they can come back — not "you were idle".
 */
const AWAY_REASON =
  'You were disconnected because this class was left open in the background. Rejoin whenever you are ready.';
const ALONE_REASON =
  'You were disconnected because nobody else was in the room. Rejoin whenever you are ready.';

export function decideConservation(state: ConservationState): ConservationDecision {
  const { hiddenMs, aloneMs, remoteCount, isModerator } = state;
  const alone = remoteCount <= 0;

  // Protected window first, so nothing below can break app-switching.
  const withinGrace = hiddenMs > 0 && hiddenMs < HIDDEN_GRACE_MS;

  // Alone is the expensive case: a seat nobody is being served by. Once past the
  // grace window there is no argument for holding it, host or not.
  if (alone && aloneMs >= ALONE_LIMIT_MS && !withinGrace) {
    return { disconnect: true, reason: ALONE_REASON };
  }

  // Hidden and alone: both signals agree, so act at the end of the grace window
  // rather than waiting out the full away limit.
  if (alone && hiddenMs >= HIDDEN_GRACE_MS) {
    return { disconnect: true, reason: AWAY_REASON };
  }

  // Hidden with a class present. Only the length of the absence matters now.
  const hiddenLimit = isModerator ? HIDDEN_LIMIT_MODERATOR_MS : HIDDEN_LIMIT_MS;
  if (hiddenMs >= hiddenLimit) {
    return { disconnect: true, reason: AWAY_REASON };
  }

  return { disconnect: false };
}

/**
 * Rough minutes saved by ending a seat now instead of letting it run to the 12-hour
 * token expiry. Used only for the operator-facing log line, so a leak is visible as
 * a number rather than inferred from a bill weeks later.
 */
export function minutesConserved(remainingMs: number): number {
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) return 0;
  return Math.round(remainingMs / 60_000);
}
