import { resolveUpstashConfig } from './redis-config';

describe('resolveUpstashConfig', () => {
  it('accepts a real Upstash REST URL', () => {
    expect(resolveUpstashConfig('https://witty-cat-12345.upstash.io', 'AbCdToken')).toEqual({
      url: 'https://witty-cat-12345.upstash.io',
      token: 'AbCdToken',
    });
  });

  it('rejects the "[SENSITIVE]" placeholder vercel env pull writes for protected vars', () => {
    expect(resolveUpstashConfig('[SENSITIVE]', 'AbCdToken')).toBeNull();
  });

  it('rejects non-https values instead of letting the Upstash client throw', () => {
    expect(resolveUpstashConfig('rediss://default:pass@host:6379', 'AbCdToken')).toBeNull();
    expect(resolveUpstashConfig('http://witty-cat-12345.upstash.io', 'AbCdToken')).toBeNull();
    expect(resolveUpstashConfig('witty-cat-12345.upstash.io', 'AbCdToken')).toBeNull();
  });

  it('returns null when either credential is missing or blank', () => {
    expect(resolveUpstashConfig(undefined, 'AbCdToken')).toBeNull();
    expect(resolveUpstashConfig('https://witty-cat-12345.upstash.io', undefined)).toBeNull();
    expect(resolveUpstashConfig('   ', '   ')).toBeNull();
  });

  it('strips quotes left behind by copy-pasted .env values', () => {
    expect(resolveUpstashConfig('"https://witty-cat-12345.upstash.io"', '"AbCdToken"')).toEqual({
      url: 'https://witty-cat-12345.upstash.io',
      token: 'AbCdToken',
    });
  });
});
