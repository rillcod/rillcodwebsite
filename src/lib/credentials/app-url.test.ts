import { describe, expect, it } from 'vitest';
import { portalAppUrl } from './app-url';

describe('portalAppUrl', () => {
  it('strips trailing slash from configured URL', () => {
    const prev = process.env.NEXT_PUBLIC_APP_URL;
    process.env.NEXT_PUBLIC_APP_URL = 'https://example.com/';
    expect(portalAppUrl()).toBe('https://example.com');
    process.env.NEXT_PUBLIC_APP_URL = prev;
  });

  it('falls back to www.rillcod.com when unset', () => {
    const prev = process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
    expect(portalAppUrl()).toBe('https://www.rillcod.com');
    process.env.NEXT_PUBLIC_APP_URL = prev;
  });
});
