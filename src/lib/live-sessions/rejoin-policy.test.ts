import { describe, expect, it } from 'vitest';
import {
  CONNECT_DEADLINE_MS,
  MAX_AUTO_REJOIN,
  attemptLabel,
  hasExhaustedRejoins,
  isFatalJoinError,
  isRemovedJoinError,
  rejoinDelayMs,
  shouldAutoRejoin,
  type RejoinState,
} from './rejoin-policy';
import { LIVE_SESSION_REMOVED_MESSAGE } from './authz';

const base: RejoinState = { phase: 'dropped', attempt: 0, error: null, exited: false };

describe('isFatalJoinError', () => {
  it('stops retrying on errors that can never succeed', () => {
    expect(isFatalJoinError('This session is not open for joining yet.')).toBe(true);
    expect(isFatalJoinError('Unauthorized')).toBe(true);
    expect(isFatalJoinError('Forbidden')).toBe(true);
    expect(isFatalJoinError('This session is no longer active.')).toBe(true);
  });

  it('keeps retrying on transient network failures', () => {
    expect(isFatalJoinError('Failed to fetch')).toBe(false);
    expect(isFatalJoinError('Could not finish connecting — retrying…')).toBe(false);
    expect(isFatalJoinError(null)).toBe(false);
    expect(isFatalJoinError(undefined)).toBe(false);
    expect(isFatalJoinError('')).toBe(false);
  });
});

describe('rejoinDelayMs', () => {
  it('backs off exponentially and caps at 12s', () => {
    expect(rejoinDelayMs(0)).toBe(2000);
    expect(rejoinDelayMs(1)).toBe(3200);
    expect(rejoinDelayMs(5)).toBe(12_000);
    expect(rejoinDelayMs(50)).toBe(12_000);
  });

  it('never returns a negative or NaN delay', () => {
    expect(rejoinDelayMs(-1)).toBe(2000);
    expect(rejoinDelayMs(Number.NaN)).toBe(2000);
  });

  it('always retries well inside the connect deadline', () => {
    expect(rejoinDelayMs(MAX_AUTO_REJOIN)).toBeLessThan(CONNECT_DEADLINE_MS);
  });
});

describe('shouldAutoRejoin', () => {
  it('rejoins a dropped session inside the budget', () => {
    expect(shouldAutoRejoin(base)).toBe(true);
    expect(shouldAutoRejoin({ ...base, attempt: MAX_AUTO_REJOIN - 1 })).toBe(true);
  });

  it('stops once the budget is spent — this is the anti-loop guard', () => {
    expect(shouldAutoRejoin({ ...base, attempt: MAX_AUTO_REJOIN })).toBe(false);
    expect(shouldAutoRejoin({ ...base, attempt: 99 })).toBe(false);
  });

  it('never rejoins after the user left', () => {
    expect(shouldAutoRejoin({ ...base, exited: true })).toBe(false);
  });

  it('never rejoins a session that is not dropped', () => {
    for (const phase of ['loading', 'live', 'rejoining', 'ended', 'removed', 'superseded'] as const) {
      expect(shouldAutoRejoin({ ...base, phase })).toBe(false);
    }
  });

  it('does not burn the budget on fatal errors', () => {
    expect(shouldAutoRejoin({ ...base, error: 'Unauthorized' })).toBe(false);
  });

  it('never rejoins someone the host removed', () => {
    // Otherwise "Remove" is a ~2s pause: the client rejoins and the server re-seats them.
    expect(shouldAutoRejoin({ ...base, error: LIVE_SESSION_REMOVED_MESSAGE })).toBe(false);
  });
});

describe('isRemovedJoinError', () => {
  it('recognises the exact 403 the token route returns for a removed participant', () => {
    // These two strings live in different modules; if they drift, a kicked student lands on
    // the generic stalled screen, which offers Retry and the Jitsi backup room.
    expect(isRemovedJoinError(LIVE_SESSION_REMOVED_MESSAGE)).toBe(true);
    expect(isFatalJoinError(LIVE_SESSION_REMOVED_MESSAGE)).toBe(true);
  });

  it('does not fire on ordinary connection trouble', () => {
    expect(isRemovedJoinError('Failed to fetch')).toBe(false);
    expect(isRemovedJoinError('This session is no longer active.')).toBe(false);
    expect(isRemovedJoinError(null)).toBe(false);
  });
});

describe('attemptLabel', () => {
  it('is 1-based and clamped to the budget', () => {
    expect(attemptLabel(0)).toBe(1);
    expect(attemptLabel(4)).toBe(5);
    expect(attemptLabel(9)).toBe(MAX_AUTO_REJOIN);
    expect(attemptLabel(Number.NaN)).toBe(1);
  });
});

describe('hasExhaustedRejoins', () => {
  it('gates the give-up screen without needing an error message', () => {
    expect(hasExhaustedRejoins(MAX_AUTO_REJOIN - 1)).toBe(false);
    expect(hasExhaustedRejoins(MAX_AUTO_REJOIN)).toBe(true);
  });
});
