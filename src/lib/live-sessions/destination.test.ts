import { describe, expect, it } from 'vitest';
import { isJitsiUrl, isJaasUrl, isInternalClassroomUrl, normalizeLiveSessionUrl } from './destination';

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

  /**
   * The school's own Jitsi tenant, which is authenticated, as opposed to the free
   * public meet.jit.si the failure screens fall back to, which is not.
   */
  it('accepts the school Jitsi classroom under the same rule as LiveKit', () => {
    expect(normalizeLiveSessionUrl('jaas:session-1', { sessionId: 'session-1', allowInternal: true })).toBe('jaas:session-1');
    expect(() => normalizeLiveSessionUrl('jaas:session-2', { sessionId: 'session-1', allowInternal: true })).toThrow('not valid');
    // Without allowInternal a caller cannot conjure a classroom address out of user input.
    expect(() => normalizeLiveSessionUrl('jaas:session-1')).toThrow('not valid');
  });

  it('tells the two Jitsi destinations apart', () => {
    expect(isJaasUrl('jaas:session-1')).toBe(true);
    // The public server is not the school tenant and must not be mistaken for it.
    expect(isJaasUrl('https://meet.jit.si/Rillcod-room')).toBe(false);
    expect(isJitsiUrl('jaas:session-1')).toBe(false);
    expect(isJaasUrl('jaas:')).toBe(false);
    expect(isJaasUrl('javascript:jaas:x')).toBe(false);
  });

  it('counts both hosted classrooms as internal', () => {
    expect(isInternalClassroomUrl('livekit:s1')).toBe(true);
    expect(isInternalClassroomUrl('jaas:s1')).toBe(true);
    expect(isInternalClassroomUrl('https://zoom.us/j/1')).toBe(false);
    expect(isInternalClassroomUrl(null)).toBe(false);
  });
});
