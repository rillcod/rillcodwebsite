import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Source-level guard for the billing leak that took live classes down.
 *
 * The leak was invisible in review and the policy tests do not catch it. On three
 * minutes hidden, LiveKitMeeting called `recordLeave()` — a beacon to our own
 * attendance endpoint. The learner was recorded as having left in our database
 * while their LiveKit seat stayed open and kept billing, for up to the 12-hour
 * token life. Six weeks of that exhausted the account's monthly minutes and every
 * live class stopped.
 *
 * conservation.test.ts proves the *decision* is right. Nothing there proves anyone
 * acts on it: delete ConserveMinutes from the meeting and every one of those tests
 * still passes while the leak returns. These assertions are about the action.
 */

const read = (rel: string) => readFileSync(path.join(process.cwd(), rel), 'utf8');
const meeting = read('src/components/live-session/LiveKitMeeting.tsx');
const conserver = read('src/components/live-session/ConserveMinutes.tsx');

describe('a seat that stops serving anyone is actually released', () => {
  it('the conserver calls room.disconnect — recording attendance is not enough', () => {
    expect(
      conserver,
      'ConserveMinutes must disconnect the room. Marking attendance leaves the meter running.',
    ).toMatch(/room\.disconnect\s*\(/);
  });

  it('is mounted inside the LiveKitRoom, or nothing ever runs it', () => {
    const roomBlock = meeting.slice(
      meeting.search(/^\s*<LiveKitRoom$/m),
      meeting.indexOf('</LiveKitRoom>'),
    );
    expect(roomBlock).toContain('<ConserveMinutes');
  });

  it('reads the decision from the shared policy rather than its own timeout', () => {
    // A second, private threshold here is how the two halves drift apart.
    expect(conserver).toMatch(/decideConservation/);
    expect(conserver).toMatch(/from '@\/lib\/live-sessions\/conservation'/);
  });

  it('leaves the connection setup alone — it is a child, not a prop', () => {
    const openingTag = meeting.slice(
      meeting.search(/^\s*<LiveKitRoom$/m),
      meeting.indexOf('\n        >'),
    );
    expect(openingTag, 'conservation must not become a LiveKitRoom prop').not.toMatch(/[Cc]onserve/);
  });

  /**
   * The reason disconnectOnPageLeave was turned off. If someone "fixes" the leak by
   * flipping this back, mobile users get dropped for switching apps and the bug
   * that change was written to solve returns.
   */
  it('does not fix the leak by re-breaking app switching', () => {
    expect(meeting).toMatch(/disconnectOnPageLeave:\s*false/);
  });

  it('routes release through the leave path so it cannot trigger an auto-rejoin', () => {
    // Reconnecting a seat we deliberately gave up costs more than it saves.
    const handler = meeting.slice(meeting.indexOf('const handleConserve'));
    expect(handler.slice(0, 400)).toMatch(/handleClose\s*\(/);
  });
});
