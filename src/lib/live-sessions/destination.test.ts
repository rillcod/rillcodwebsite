import { describe, expect, it } from 'vitest';
import { isJitsiUrl, normalizeLiveSessionUrl } from './destination';

describe('live session destinations', () => {
  it('accepts secure provider links and local development links', () => {
    expect(normalizeLiveSessionUrl('https://zoom.us/j/123')).toBe('https://zoom.us/j/123');
    expect(normalizeLiveSessionUrl('http://localhost:3000/room')).toBe('http://localhost:3000/room');
    expect(isJitsiUrl('https://meet.jit.si/Rillcod-room')).toBe(true);
  });

  it('rejects executable, insecure remote, and credential-bearing destinations', () => {
    expect(() => normalizeLiveSessionUrl('javascript:alert(1)')).toThrow('https://');
    expect(() => normalizeLiveSessionUrl('http://example.com/room')).toThrow('secure');
    expect(() => normalizeLiveSessionUrl('https://user:pass@example.com/room')).toThrow('sign-in details');
    expect(isJitsiUrl('javascript:meet.jit.si')).toBe(false);
  });

  it('only accepts the canonical internal room for the current session', () => {
    expect(normalizeLiveSessionUrl('livekit:session-1', { sessionId: 'session-1', allowInternal: true })).toBe('livekit:session-1');
    expect(() => normalizeLiveSessionUrl('livekit:session-2', { sessionId: 'session-1', allowInternal: true })).toThrow('not valid');
    expect(() => normalizeLiveSessionUrl('livekit:session-1')).toThrow('not valid');
  });
});
