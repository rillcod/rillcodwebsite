import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Source-level guard for the LiveKit rejoin loop.
 *
 * This bug has shipped twice and is invisible in review: every prop *looks*
 * right, and the damage happens inside the library's effect deps.
 *
 * `useLiveKitRoom` (@livekit/components-react) lists `onError` in the deps of
 * the effect that calls `room.connect()`, and compares `options` by
 * JSON.stringify. So an inline arrow or inline object literal on <LiveKitRoom>
 * re-runs connect() on EVERY render. Per livekit-client's
 * `Room.attemptConnection`, a connect() issued while the room is Reconnecting
 * logs "Reconnection attempt replaced by new connection attempt" and calls
 * `recreateEngine(true)` — killing LiveKit's own backoff and restarting from
 * zero. With the live-sessions page re-rendering on every realtime UPDATE, the
 * reconnect can never converge and students spin on "Reconnecting…" forever.
 */

const SOURCE = path.join(process.cwd(), 'src/components/live-session/LiveKitMeeting.tsx');
const src = readFileSync(SOURCE, 'utf8');

/**
 * The LiveKitRoom opening tag, attributes only. Matches the JSX element (tag
 * name at end of line) rather than any prose mention of it in a comment.
 */
function liveKitRoomProps(): string {
  const start = src.search(/^\s*<LiveKitRoom$/m);
  expect(start, 'LiveKitMeeting.tsx must render a LiveKitRoom element').toBeGreaterThan(-1);
  const end = src.indexOf('\n        >', start);
  expect(end, 'could not find the end of the LiveKitRoom opening tag').toBeGreaterThan(start);
  return src.slice(start, end);
}

describe('LiveKitRoom prop stability', () => {
  it('passes no inline arrow functions — they re-fire room.connect() every render', () => {
    expect(liveKitRoomProps()).not.toMatch(/=>/);
  });

  it('passes no inline object literals — options identity re-creates the Room', () => {
    expect(liveKitRoomProps()).not.toMatch(/=\{\{/);
  });

  it('keeps room + connect options at module scope', () => {
    expect(src).toMatch(/^const ROOM_OPTIONS\b/m);
    expect(src).toMatch(/^const CONNECT_OPTIONS\b/m);
    expect(liveKitRoomProps()).toMatch(/options=\{ROOM_OPTIONS\}/);
    expect(liveKitRoomProps()).toMatch(/connectOptions=\{CONNECT_OPTIONS\}/);
  });

  it('routes every callback through a stable useCallback handler', () => {
    const props = liveKitRoomProps();
    expect(props).toMatch(/onConnected=\{handleConnected\}/);
    expect(props).toMatch(/onDisconnected=\{handleDisconnected\}/);
    expect(props).toMatch(/onError=\{handleError\}/);
    for (const handler of ['handleConnected', 'handleDisconnected', 'handleError']) {
      expect(src, `${handler} must be a useCallback`).toMatch(
        new RegExp(`const ${handler} = useCallback\\(`),
      );
    }
  });

  it('does not derive the remount key from the token', () => {
    const props = liveKitRoomProps();
    // A LiveKit JWT starts with the constant header `eyJhbGciOiJIUzI1NiJ9.`,
    // so any key built from a token prefix is the same string forever and the
    // Room never actually remounts.
    expect(props).toMatch(/key=\{roomEpoch\}/);
    expect(props).not.toMatch(/key=.*token/);
    expect(src).not.toMatch(/token\.slice\(/);
  });
});

describe('LiveKitMeeting reconnect invariants', () => {
  it('only resets the retry budget from onConnected, never from a token fetch', () => {
    // `setAutoTry(0)` on token success made a failing media connect retry forever.
    const resets = src.match(/setAutoTry\(0\)/g) ?? [];
    expect(resets.length, 'expected exactly one in handleConnected + one in manualRejoin').toBe(2);

    const connected = src.slice(
      src.indexOf('const handleConnected'),
      src.indexOf('const handleDisconnected'),
    );
    expect(connected).toMatch(/setAutoTry\(0\)/);

    const loadToken = src.slice(src.indexOf('const loadToken'), src.indexOf('useEffect(() => {'));
    expect(loadToken).not.toMatch(/setAutoTry/);
  });

  it('never flips to the live phase optimistically on token success', () => {
    const loadToken = src.slice(src.indexOf('const loadToken'), src.indexOf('useEffect(() => {'));
    expect(loadToken).not.toMatch(/setPhase\('live'\)/);
  });

  it('is memoised so the parent page realtime feed cannot re-render it', () => {
    expect(src).toMatch(/export default memo\(LiveKitMeeting\)/);
  });

  it('leaves the Close button reachable after the host ends the session', () => {
    // exitedRef also gates handleClose. Setting it from the host-ended poll made
    // the ended overlay's Close button inert — a full-screen z-[60] dead end.
    const poll = src.slice(src.indexOf('// Host-ended poll'), src.indexOf('// Auto-rejoin'));
    expect(poll).toMatch(/setPhase\('ended'\)/);
    expect(poll, 'host-ended poll must not latch exitedRef').not.toMatch(/exitedRef\.current\s*=/);

    // Only handleClose itself may latch it, plus the StrictMode reset on mount.
    const latches = src.match(/exitedRef\.current = true/g) ?? [];
    expect(latches.length, 'exitedRef must only be latched by handleClose').toBe(1);
  });

  it('keeps attendance bookkeeping separate from a real exit', () => {
    // Conflating these ejected students who backgrounded their phone for 3 min.
    expect(src).toMatch(/attendanceLeftRef/);
    expect(src).toMatch(/exitedRef/);
    const recordLeave = src.slice(src.indexOf('const recordLeave'), src.indexOf('const recordRejoin'));
    expect(recordLeave).not.toMatch(/exitedRef/);
  });
});

describe('live-sessions page', () => {
  it('passes a stable onClose so the memo boundary holds', () => {
    const page = readFileSync(path.join(process.cwd(), 'src/app/dashboard/live-sessions/page.tsx'), 'utf8');
    expect(page).toMatch(/const closeMeeting = useCallback\(/);
    expect(page).toMatch(/onClose=\{closeMeeting\}/);
  });
});
