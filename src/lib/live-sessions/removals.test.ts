import { describe, expect, it, vi } from 'vitest';
import { isRemovedFromLiveSession, LIVE_SESSION_REMOVED_MESSAGE } from './authz';

/**
 * The gate that makes a host's "Remove" stick.
 *
 * LiveKit's removeParticipant only closes the socket; the meeting client rejoins ~2s later
 * with a fresh token. Verified against the live server: without this check the removed
 * participant is back in the room on the next mint. Every seat-issuing path consults it.
 */

/** Minimal stand-in for the chained Supabase query the helper builds. */
function fakeAdmin(result: { data: unknown; error: unknown }) {
  const maybeSingle = vi.fn().mockResolvedValue(result);
  const eq2 = vi.fn(() => ({ maybeSingle }));
  const eq1 = vi.fn(() => ({ eq: eq2 }));
  const select = vi.fn(() => ({ eq: eq1 }));
  const from = vi.fn(() => ({ select }));
  return { client: { from } as any, from, select, eq1, eq2 };
}

describe('isRemovedFromLiveSession', () => {
  it('refuses a participant the host removed', async () => {
    const { client, from, eq1, eq2 } = fakeAdmin({ data: { id: 'row-1' }, error: null });
    await expect(isRemovedFromLiveSession(client, 'session-1', 'user-1')).resolves.toBe(true);
    expect(from).toHaveBeenCalledWith('live_session_removals');
    expect(eq1).toHaveBeenCalledWith('session_id', 'session-1');
    expect(eq2).toHaveBeenCalledWith('portal_user_id', 'user-1');
  });

  it('lets everyone else through', async () => {
    const { client } = fakeAdmin({ data: null, error: null });
    await expect(isRemovedFromLiveSession(client, 'session-1', 'user-1')).resolves.toBe(false);
  });

  it('fails OPEN when the lookup errors', async () => {
    // A transient DB blip (or the migration not yet applied) must not lock a whole class out
    // of their lesson. Losing a removal is recoverable; losing the lesson is not.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { client } = fakeAdmin({ data: null, error: { message: 'relation does not exist' } });
    await expect(isRemovedFromLiveSession(client, 'session-1', 'user-1')).resolves.toBe(false);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('does not query at all without both ids', async () => {
    const { client, from } = fakeAdmin({ data: { id: 'row-1' }, error: null });
    await expect(isRemovedFromLiveSession(client, '', 'user-1')).resolves.toBe(false);
    await expect(isRemovedFromLiveSession(client, 'session-1', '')).resolves.toBe(false);
    expect(from).not.toHaveBeenCalled();
  });
});

describe('LIVE_SESSION_REMOVED_MESSAGE', () => {
  it('is phrased for a student, not an engineer', () => {
    expect(LIVE_SESSION_REMOVED_MESSAGE).toMatch(/removed from this session/i);
    expect(LIVE_SESSION_REMOVED_MESSAGE).not.toMatch(/403|error|forbidden/i);
  });
});
