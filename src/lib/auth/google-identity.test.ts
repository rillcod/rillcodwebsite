import { describe, expect, it } from 'vitest';
import { googleDisplayName, isGoogleIdentity, resolveVerifiedGoogleEmail } from './google-identity';

const googleUser = (over: Record<string, unknown> = {}) => ({
  id: 'auth-1',
  email: 'Parent@Gmail.com',
  email_confirmed_at: '2026-07-26T00:00:00Z',
  app_metadata: { provider: 'google', providers: ['google'] },
  user_metadata: { full_name: 'Ada Parent' },
  identities: [{ provider: 'google' }],
  ...over,
});

describe('isGoogleIdentity', () => {
  it('detects google via provider, providers array, or identities', () => {
    expect(isGoogleIdentity(googleUser())).toBe(true);
    expect(isGoogleIdentity(googleUser({ app_metadata: { providers: ['google'] } }))).toBe(true);
    expect(isGoogleIdentity(googleUser({ app_metadata: {}, identities: [{ provider: 'google' }] }))).toBe(true);
  });

  it('rejects a password-only session', () => {
    expect(isGoogleIdentity(googleUser({
      app_metadata: { provider: 'email', providers: ['email'] },
      identities: [{ provider: 'email' }],
    }))).toBe(false);
  });
});

describe('resolveVerifiedGoogleEmail', () => {
  it('returns the normalised email and display name', () => {
    const result = resolveVerifiedGoogleEmail(googleUser());
    expect(result).toEqual({ ok: true, email: 'parent@gmail.com', fullName: 'Ada Parent' });
  });

  it('accepts a google account with no display name', () => {
    const result = resolveVerifiedGoogleEmail(googleUser({ user_metadata: {} }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.fullName).toBeNull();
  });

  it('rejects a missing session', () => {
    const result = resolveVerifiedGoogleEmail(null);
    expect(result).toMatchObject({ ok: false, status: 401 });
  });

  it('rejects a password session even though it owns its email', () => {
    // Otherwise any signed-in user — a student, say — could drive the Google
    // branch of the claim form without ever proving the email through Google.
    const result = resolveVerifiedGoogleEmail(googleUser({
      app_metadata: { provider: 'email', providers: ['email'] },
      identities: [{ provider: 'email' }],
    }));
    expect(result).toMatchObject({ ok: false, status: 403 });
  });

  it('rejects a google account with no email', () => {
    const result = resolveVerifiedGoogleEmail(googleUser({ email: null }));
    expect(result).toMatchObject({ ok: false, status: 400 });
  });

  it('rejects an unconfirmed email', () => {
    const result = resolveVerifiedGoogleEmail(googleUser({ email_confirmed_at: null }));
    expect(result).toMatchObject({ ok: false, status: 403 });
  });
});

describe('googleDisplayName', () => {
  it('reads full_name, name, or fullName in order', () => {
    expect(googleDisplayName({ user_metadata: { full_name: ' Ada ' } })).toBe('Ada');
    expect(googleDisplayName({ user_metadata: { name: 'Bola' } })).toBe('Bola');
    expect(googleDisplayName({ user_metadata: { fullName: 'Chidi' } })).toBe('Chidi');
  });

  it('never invents a name', () => {
    expect(googleDisplayName({ user_metadata: {} })).toBeNull();
    expect(googleDisplayName({ user_metadata: { full_name: '   ' } })).toBeNull();
  });
});
