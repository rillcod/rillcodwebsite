import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import crypto from 'crypto';

/**
 * Rotation behaviour for parent payment links.
 *
 * The module reads process.env at call time, so each test sets the environment
 * and re-imports. What is being pinned here is the migration path, not the
 * crypto: a link signed under the old secret must survive the rotation, and
 * must stop working once the window is closed.
 */

const ENV_KEYS = [
  'BILLING_LINK_SECRET',
  'BILLING_CRON_SECRET',
  'CRON_SECRET',
  'BILLING_LINK_LEGACY_UNTIL',
] as const;

function mintLegacyToken(cycleId: string, secret: string, ttlHours = 24 * 14) {
  const payload = { cycleId, exp: Date.now() + ttlHours * 60 * 60 * 1000 };
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
  vi.resetModules();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k]!;
  }
  vi.resetModules();
});

async function load() {
  return import('./public-billing-link');
}

describe('before rotation (only CRON_SECRET is set)', () => {
  it('refuses to mint new links with the cron secret', async () => {
    process.env.CRON_SECRET = 'cron-old';
    const { createPublicBillingToken } = await load();
    expect(() => createPublicBillingToken('cycle-1')).toThrow(/Missing billing token secret/);
  });

  it('still accepts links that were already stamped with the cron secret', async () => {
    process.env.CRON_SECRET = 'cron-old';
    const { verifyPublicBillingToken } = await load();
    const token = mintLegacyToken('cycle-1', 'cron-old');
    expect(verifyPublicBillingToken(token)?.cycleId).toBe('cycle-1');
  });
});

describe('after rotation (dedicated secret set, window open)', () => {
  beforeEach(() => {
    process.env.CRON_SECRET = 'cron-old';
  });

  it('signs new links with the dedicated secret, not the cron secret', async () => {
    const legacyToken = mintLegacyToken('cycle-1', 'cron-old');

    process.env.BILLING_LINK_SECRET = 'billing-new';
    const rotated = await load();
    const newToken = rotated.createPublicBillingToken('cycle-1');

    expect(newToken).not.toEqual(legacyToken);

    vi.resetModules();
    delete process.env.BILLING_LINK_SECRET;
    const cronOnly = await load();
    expect(cronOnly.verifyPublicBillingToken(newToken)).toBeNull();
  });

  it('still accepts links already sitting in parents inboxes', async () => {
    const legacyToken = mintLegacyToken('cycle-1', 'cron-old');

    process.env.BILLING_LINK_SECRET = 'billing-new';
    const rotated = await load();

    expect(rotated.verifyPublicBillingToken(legacyToken)?.cycleId).toBe('cycle-1');
  });
});

describe('after the grace window closes', () => {
  it('rejects the old secret but keeps the new one working', async () => {
    process.env.CRON_SECRET = 'cron-old';
    const legacyToken = mintLegacyToken('cycle-1', 'cron-old');

    vi.resetModules();
    process.env.BILLING_LINK_SECRET = 'billing-new';
    process.env.BILLING_LINK_LEGACY_UNTIL = '2000-01-01T00:00:00.000Z'; // already past
    const closed = await load();

    expect(closed.verifyPublicBillingToken(legacyToken)).toBeNull();

    const fresh = closed.createPublicBillingToken('cycle-2');
    expect(closed.verifyPublicBillingToken(fresh)?.cycleId).toBe('cycle-2');
  });

  it('treats an unparseable cutover as still open rather than stranding links', async () => {
    process.env.CRON_SECRET = 'cron-old';
    const legacyToken = mintLegacyToken('cycle-1', 'cron-old');

    vi.resetModules();
    process.env.BILLING_LINK_SECRET = 'billing-new';
    process.env.BILLING_LINK_LEGACY_UNTIL = 'not-a-date';
    const openMod = await load();

    expect(openMod.verifyPublicBillingToken(legacyToken)?.cycleId).toBe('cycle-1');
  });
});

describe('general guarantees', () => {
  it('rejects a tampered payload', async () => {
    process.env.BILLING_LINK_SECRET = 'billing-new';
    const { createPublicBillingToken, verifyPublicBillingToken } = await load();
    const token = createPublicBillingToken('cycle-1');
    const [, sig] = token.split('.');
    const forged = `${Buffer.from(JSON.stringify({ cycleId: 'cycle-999', exp: Date.now() + 60_000 }), 'utf8').toString('base64url')}.${sig}`;
    expect(verifyPublicBillingToken(forged)).toBeNull();
  });

  it('rejects an expired link', async () => {
    process.env.BILLING_LINK_SECRET = 'billing-new';
    const { createPublicBillingToken, verifyPublicBillingToken } = await load();
    const token = createPublicBillingToken('cycle-1', -1); // already expired
    expect(verifyPublicBillingToken(token)).toBeNull();
  });

  it('refuses to sign when no secret is configured at all', async () => {
    const { createPublicBillingToken } = await load();
    expect(() => createPublicBillingToken('cycle-1')).toThrow(/Missing billing token secret/);
  });
});
