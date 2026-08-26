import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Stops a retry-prone caller from writing notifications without a key.
 *
 * Idempotency was added for assignment release, then extended by hand. Doing it
 * by hand does not hold: there are around forty places in this codebase that
 * insert notifications, and the next one added to a cron will be written by
 * copying a neighbour that has no key. Nobody will notice until a parent is
 * told twice about the same money.
 *
 * So this is enforced rather than remembered. A file under a path that can run
 * more than once for the same event must go through deliverNotificationsOnce.
 *
 * ── Why an allow-list of paths, not of files ─────────────────────────────────
 *
 * A notification a person triggers by pressing a button does not need a key.
 * The duplicate is a double-click, it is visible to the person who caused it,
 * and inventing a version for an action that has none would be ceremony. The
 * boundary is therefore "can this run again on its own?", which is a property
 * of where the code lives: crons, sweeps, digests and post-payment flows can,
 * request handlers answering a click cannot.
 */

const SRC = join(process.cwd(), 'src');

/** Paths whose code can re-run for the same event without a person asking. */
const RETRY_PRONE = [
  'app/api/cron/',
  'lib/operations/cron-',
  'lib/communication/followup-runner',
  'lib/academic/readiness-automation',
  'lib/academic/week-generation',
  'lib/curriculum/milestone-digest',
  'lib/reports/publication-delivery',
  'lib/registration/',
  'lib/credentials/',
  'lib/parent-claim/',
  'lib/consent/lead-notifications',
  'lib/special-programs/teaching-launch-status',
];

/**
 * Known outstanding conversions.
 *
 * Every entry is a real duplicate-notification risk that has not been closed
 * yet — this list is a backlog, not an exemption, and it should only ever get
 * shorter. It exists so the guard can be switched on today and block anything
 * NEW, instead of waiting until all of them are done and protecting nothing in
 * the meantime.
 */
const KNOWN_OUTSTANDING = new Set<string>([
  'lib/academic/readiness-automation.ts',
  'lib/academic/week-generation.ts',
  'lib/communication/followup-runner.ts',
  'lib/consent/lead-notifications.ts',
  'lib/credentials/summer-school-credentials.ts',
  'lib/curriculum/milestone-digest.ts',
  'lib/operations/cron-monitor.ts',
  'lib/parent-claim/complete.ts',
  'lib/registration/native-enrolment-email.ts',
  'lib/registration/payment-link-email.ts',
  'lib/registration/school-activation.ts',
  'lib/registration/term-activation.ts',
  'lib/special-programs/teaching-launch-status.ts',
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const files = walk(SRC).map((full) => ({
  path: relative(SRC, full).replace(/\\/g, '/'),
  source: readFileSync(full, 'utf8'),
}));

const insertsNotificationsDirectly = (source: string) =>
  /from\(['"]notifications['"]\)\s*\.\s*(insert|upsert)/.test(source) ||
  /from\(['"]notifications['"]\)[\s\S]{0,40}\.\s*(insert|upsert)\(/.test(source);

describe('notification idempotency is enforced, not remembered', () => {
  const retryProne = files.filter((file) =>
    RETRY_PRONE.some((prefix) => file.path.startsWith(prefix)),
  );

  it('finds the retry-prone surface at all', () => {
    // Guard the guard: a refactor that moves these paths would otherwise make
    // this whole file silently vacuous.
    expect(retryProne.length).toBeGreaterThan(10);
  });

  it('no NEW retry-prone caller writes notifications without the shared helper', () => {
    const offenders = retryProne
      .filter((file) => insertsNotificationsDirectly(file.source))
      .map((file) => file.path)
      .filter((path) => !KNOWN_OUTSTANDING.has(path));

    expect(
      offenders,
      `These can run twice for one event and would notify twice.\n` +
        `Use deliverNotificationsOnce from @/lib/notifications/deliver-once:\n` +
        offenders.map((p) => `  - ${p}`).join('\n'),
    ).toEqual([]);
  });

  it('the backlog only shrinks', () => {
    // An entry that no longer inserts directly has been converted, and must be
    // removed from the list — otherwise the backlog stops reflecting reality
    // and a future regression could hide behind a stale name.
    const stale = [...KNOWN_OUTSTANDING].filter((path) => {
      const file = files.find((candidate) => candidate.path === path);
      return !file || !insertsNotificationsDirectly(file.source);
    });

    expect(
      stale,
      `Converted (or moved) — remove from KNOWN_OUTSTANDING:\n` +
        stale.map((p) => `  - ${p}`).join('\n'),
    ).toEqual([]);
  });

  it('the crons already converted stay converted', () => {
    for (const path of [
      'app/api/cron/invoice-reminders/route.ts',
      'app/api/cron/school-report-readiness/route.ts',
    ]) {
      const file = files.find((candidate) => candidate.path === path);
      expect(file, `${path} should exist`).toBeTruthy();
      expect(file!.source).toContain('deliverNotificationsOnce');
      expect(insertsNotificationsDirectly(file!.source)).toBe(false);
    }
  });
});
