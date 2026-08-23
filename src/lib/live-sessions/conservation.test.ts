import { describe, expect, it } from 'vitest';
import {
  decideConservation,
  minutesConserved,
  HIDDEN_GRACE_MS,
  HIDDEN_LIMIT_MS,
  HIDDEN_LIMIT_MODERATOR_MS,
  ALONE_LIMIT_MS,
} from './conservation';

const state = (over: Partial<Parameters<typeof decideConservation>[0]> = {}) => ({
  hiddenMs: 0,
  aloneMs: 0,
  remoteCount: 3,
  isModerator: false,
  ...over,
});

describe('conservation policy', () => {
  it('leaves an ordinary participant in a live class alone', () => {
    expect(decideConservation(state()).disconnect).toBe(false);
  });

  /**
   * The reason disconnectOnPageLeave was turned off in the first place. If this
   * test ever fails, mobile users are being kicked out for switching apps again and
   * the original bug is back.
   */
  it('never disconnects inside the app-switch grace window', () => {
    for (const hiddenMs of [1, 30_000, HIDDEN_GRACE_MS - 1]) {
      expect(decideConservation(state({ hiddenMs })).disconnect, `hidden ${hiddenMs}ms`).toBe(false);
      expect(
        decideConservation(state({ hiddenMs, remoteCount: 0, aloneMs: 60 * 60_000 })).disconnect,
        `hidden ${hiddenMs}ms while alone`,
      ).toBe(false);
    }
  });

  it('drops a seat that is alone once the grace window passes', () => {
    const decision = decideConservation(state({ remoteCount: 0, hiddenMs: HIDDEN_GRACE_MS }));
    expect(decision.disconnect).toBe(true);
    expect(decision.disconnect && decision.reason).toMatch(/nobody else|background/i);
  });

  it('drops a seat left alone in a visible tab, which still costs minutes', () => {
    expect(decideConservation(state({ remoteCount: 0, aloneMs: ALONE_LIMIT_MS })).disconnect).toBe(true);
    // Not yet — someone may be waiting a moment for the class to fill.
    expect(decideConservation(state({ remoteCount: 0, aloneMs: ALONE_LIMIT_MS - 1 })).disconnect).toBe(false);
  });

  it('drops a long absence even with a full class present', () => {
    expect(decideConservation(state({ hiddenMs: HIDDEN_LIMIT_MS })).disconnect).toBe(true);
    expect(decideConservation(state({ hiddenMs: HIDDEN_LIMIT_MS - 1 })).disconnect).toBe(false);
  });

  it('gives a moderator with a class in front of them longer', () => {
    const hidden = HIDDEN_LIMIT_MS + 60_000;
    expect(decideConservation(state({ hiddenMs: hidden, isModerator: false })).disconnect).toBe(true);
    expect(decideConservation(state({ hiddenMs: hidden, isModerator: true })).disconnect).toBe(false);
    expect(decideConservation(state({ hiddenMs: HIDDEN_LIMIT_MODERATOR_MS, isModerator: true })).disconnect).toBe(true);
  });

  it('does not spare a moderator who is alone, because that seat serves nobody', () => {
    expect(
      decideConservation(state({ isModerator: true, remoteCount: 0, hiddenMs: HIDDEN_GRACE_MS })).disconnect,
    ).toBe(true);
    expect(
      decideConservation(state({ isModerator: true, remoteCount: 0, aloneMs: ALONE_LIMIT_MS })).disconnect,
    ).toBe(true);
  });

  it('explains itself in words the person can act on', () => {
    const away = decideConservation(state({ hiddenMs: HIDDEN_LIMIT_MS }));
    expect(away.disconnect && away.reason).toMatch(/rejoin/i);
    const alone = decideConservation(state({ remoteCount: 0, aloneMs: ALONE_LIMIT_MS }));
    expect(alone.disconnect && alone.reason).toMatch(/rejoin/i);
  });

  it('treats a negative or missing remote count as being alone', () => {
    expect(decideConservation(state({ remoteCount: -1, aloneMs: ALONE_LIMIT_MS })).disconnect).toBe(true);
  });
});

describe('minutesConserved', () => {
  it('reports whole minutes and never a negative', () => {
    expect(minutesConserved(90_000)).toBe(2);
    expect(minutesConserved(0)).toBe(0);
    expect(minutesConserved(-5)).toBe(0);
    expect(minutesConserved(Number.NaN)).toBe(0);
  });
});
