import { describe, expect, it } from 'vitest';
import { chooseConsentedRecipient } from './audience';

describe('WhatsApp audience consent', () => {
  it('prefers an explicitly opted-in linked parent', () => {
    const result = chooseConsentedRecipient([
      { userId: 'parent', phone: '08012345678', optedIn: true, source: 'parent' },
      { userId: 'student', phone: '08011111111', optedIn: true, source: 'student' },
    ], new Map());
    expect(result?.userId).toBe('parent');
  });
  it('honours STOP even when the profile still says opted in', () => {
    const result = chooseConsentedRecipient([
      { userId: 'parent', phone: '08012345678', optedIn: true, source: 'parent' },
    ], new Map([['2348012345678', { optedOut: true, optedInAt: null }]]));
    expect(result).toBeNull();
  });
  it('accepts legacy parent numbers only after an inbound opt-in', () => {
    const candidate = { userId: 'student', phone: '08012345678', optedIn: false, source: 'legacy_parent' as const };
    expect(chooseConsentedRecipient([candidate], new Map())).toBeNull();
    expect(chooseConsentedRecipient([candidate], new Map([['2348012345678', { optedOut: false, optedInAt: '2026-07-10' }]]))?.phone).toBe('2348012345678');
  });
});