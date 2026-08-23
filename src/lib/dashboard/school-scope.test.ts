import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { isDashboardPathBlockedForSchool, isDashboardPathBlockedForParent } from './route-access';

/**
 * Partner schools are governed differently from everyone else, and that is the risk
 * these tests exist for.
 *
 * Students and parents have allow-lists: a new route is denied until someone grants
 * it. Partner schools have a deny-list: a new route is granted until someone
 * remembers to deny it — on a product where one partner school must never see
 * another's data, or a family's.
 *
 * Comparing the deny-list against the school sidebar found 55 route groups a school
 * could open with no row pointing at them, including the CRM contact book, the
 * office centre, safeguarding cases and every parent's personal screens.
 * `/dashboard/engagement` was denied while `/dashboard/engage` was not, which is
 * exactly what this failure mode looks like from the inside.
 */

const SOURCE = readFileSync(
  path.join(process.cwd(), 'src/components/layout/DashboardNavigation.tsx'),
  'utf8',
);

function schoolNavBlock(): string {
  const start = SOURCE.indexOf('case "school":');
  expect(start, 'DashboardNavigation must still have a school nav case').toBeGreaterThan(-1);
  const end = SOURCE.indexOf('case "parent":', start);
  expect(end).toBeGreaterThan(start);
  return SOURCE.slice(start, end);
}

const schoolHrefs = (): string[] =>
  [...new Set([...schoolNavBlock().matchAll(/href:\s*"([^"]+)"/g)].map((m) => m[1].split('?')[0]))];

describe('partner school scope', () => {
  it('never offers a row the guard will bounce them from', () => {
    const dead = schoolHrefs().filter((href) => isDashboardPathBlockedForSchool(href));
    expect(dead, `school sidebar rows leading to access-denied: ${dead.join(', ')}`).toEqual([]);
  });

  /**
   * The tenancy boundary. A partner school runs its own classes on this platform;
   * these are the tools for running the platform itself, or another tenant's data.
   */
  it('cannot reach platform operations or another tenant\'s records', () => {
    for (const route of [
      '/dashboard/customer-book',
      '/dashboard/crm',
      '/dashboard/office',
      '/dashboard/cases',
      '/dashboard/accountability',
      '/dashboard/email-log',
      '/dashboard/overview',
      '/dashboard/users',
      '/dashboard/schools',
      '/dashboard/platform-operations',
      '/dashboard/learner-safety',
      '/dashboard/settings',
    ]) {
      expect(isDashboardPathBlockedForSchool(route), `${route} should be closed to a partner school`).toBe(true);
    }
  });

  /**
   * A school has its own reporting on the same learners. These are the parent's
   * personal views of their own child and their own invoices, which is a different
   * thing from a school's roster.
   */
  it('cannot open a family\'s own screens', () => {
    for (const route of [
      '/dashboard/my-children',
      '/dashboard/my-payments',
      '/dashboard/parent-results',
      '/dashboard/parent-grades',
      '/dashboard/parent-attendance',
      '/dashboard/parent-certificates',
      '/dashboard/parent-path-progress',
      '/dashboard/parent-invoices',
      '/dashboard/parent-feedback',
    ]) {
      expect(isDashboardPathBlockedForSchool(route), `${route} is a family screen`).toBe(true);
    }
  });

  it('still reaches the work a partner school is here to do', () => {
    for (const route of [
      '/dashboard/school-overview',
      '/dashboard/students',
      '/dashboard/classes',
      '/dashboard/attendance',
      '/dashboard/timetable',
      '/dashboard/results',
      '/dashboard/school-reports',
      '/dashboard/school-billing',
      '/dashboard/finance',
      '/dashboard/consent-forms',
      // Their own QR claim queue — named close to the parent routes above, and
      // must not be caught by a prefix meant for those.
      '/dashboard/parent-claims',
    ]) {
      expect(isDashboardPathBlockedForSchool(route), `${route} is school work`).toBe(false);
    }
  });

  it('keeps the near-miss pair apart', () => {
    // engagement was denied and engage was not, for long enough to matter.
    expect(isDashboardPathBlockedForSchool('/dashboard/engagement')).toBe(true);
    expect(isDashboardPathBlockedForSchool('/dashboard/engage')).toBe(true);
  });

  it('does not let a school in where a parent is kept out of the same route', () => {
    // Anything closed to a parent for being a staff tool must also be closed to a
    // partner school, which is a narrower role than platform staff.
    for (const route of ['/dashboard/users', '/dashboard/schools', '/dashboard/settings', '/dashboard/crm']) {
      expect(isDashboardPathBlockedForParent(route)).toBe(true);
      expect(isDashboardPathBlockedForSchool(route)).toBe(true);
    }
  });
});
