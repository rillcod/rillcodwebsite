import { describe, expect, it } from 'vitest';
import {
  isInvalidRefreshTokenError,
  isSupabaseAuthStorageKey,
} from './session-recovery';

describe('auth session recovery', () => {
  it('recognises only unusable refresh-token failures', () => {
    expect(isInvalidRefreshTokenError({
      code: 'refresh_token_not_found',
      message: 'Invalid Refresh Token: Refresh Token Not Found',
    })).toBe(true);
    expect(isInvalidRefreshTokenError('Refresh token has already been used')).toBe(true);
    expect(isInvalidRefreshTokenError({ message: 'Failed to fetch' })).toBe(false);
    expect(isInvalidRefreshTokenError({ message: 'Invalid login credentials' })).toBe(false);
  });

  it('matches base, chunked, and verifier auth storage keys', () => {
    expect(isSupabaseAuthStorageKey('sb-project-auth-token')).toBe(true);
    expect(isSupabaseAuthStorageKey('sb-project-auth-token.0')).toBe(true);
    expect(isSupabaseAuthStorageKey('sb-project-auth-token-code-verifier')).toBe(true);
    expect(isSupabaseAuthStorageKey('rillcod_registration_draft')).toBe(false);
    expect(isSupabaseAuthStorageKey('theme')).toBe(false);
  });
});
