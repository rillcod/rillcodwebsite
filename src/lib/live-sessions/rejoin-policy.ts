/**
 * Rejoin policy for the LiveKit meeting shell.
 *
 * Extracted from the component on purpose: this is the logic that decides
 * whether a student keeps getting pulled back into class after a network blip,
 * and it has regressed twice while living inline in JSX. Keep it pure and
 * covered by `rejoin-policy.test.ts`.
 */

/**
 * `removed` and `superseded` are terminal on purpose: both mean someone *decided* this client
 * should stop being in the room. Retrying either one fights that decision — a removed student
 * walks back in, and two tabs on one account kick each other forever.
 */
export type MeetingPhase =
  | 'loading'
  | 'live'
  | 'rejoining'
  | 'dropped'
  | 'ended'
  | 'removed'
  | 'superseded';

/** App-level rejoin attempts, on top of LiveKit's own per-connection backoff. */
export const MAX_AUTO_REJOIN = 5;

/** How long a fresh Room gets to reach Connected before we call it a drop. */
export const CONNECT_DEADLINE_MS = 15_000;

/**
 * Errors that will never succeed on retry — a closed session, a revoked seat.
 * Burning the rejoin budget on these just delays the honest error screen.
 *
 * `removed from this session` must stay in step with LIVE_SESSION_REMOVED_MESSAGE in
 * `authz.ts`: that is the 403 the token route returns to someone the host kicked.
 */
const FATAL_JOIN_ERROR = /not open|unauthorized|forbidden|no longer active|session not found|not configured|credential|LiveKit is not|removed from this session|reached its monthly limit/i;

export function isFatalJoinError(message?: string | null): boolean {
  return typeof message === 'string' && FATAL_JOIN_ERROR.test(message);
}

/**
 * The token route's 403 for someone the host kicked. Distinguished from other fatal errors so
 * the UI can show the removal screen rather than the generic "lost connection" one — the
 * latter offers Retry and a backup room, which would route straight around the host.
 */
export function isRemovedJoinError(message?: string | null): boolean {
  return typeof message === 'string' && /removed from this session/i.test(message);
}

/** Exponential backoff, capped so a long class never waits more than 12s to retry. */
export function rejoinDelayMs(attempt: number): number {
  const n = Number.isFinite(attempt) && attempt > 0 ? Math.floor(attempt) : 0;
  return Math.min(2000 * Math.pow(1.6, n), 12_000);
}

export interface RejoinState {
  phase: MeetingPhase;
  /** Auto-rejoins already spent. Reset to 0 only after a real media connection. */
  attempt: number;
  error?: string | null;
  /** The user deliberately left, or the meeting was closed/ended. */
  exited: boolean;
}

export function hasExhaustedRejoins(attempt: number): boolean {
  return attempt >= MAX_AUTO_REJOIN;
}

export function shouldAutoRejoin({ phase, attempt, error, exited }: RejoinState): boolean {
  if (exited) return false;
  if (phase !== 'dropped') return false;
  if (isFatalJoinError(error)) return false;
  return !hasExhaustedRejoins(attempt);
}

/** 1-based attempt number for the "Attempt N of 5" label, clamped to the budget. */
export function attemptLabel(attempt: number): number {
  const n = Number.isFinite(attempt) && attempt > 0 ? Math.floor(attempt) : 0;
  return Math.min(n + 1, MAX_AUTO_REJOIN);
}
