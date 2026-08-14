import { describe, it, expect, afterEach, vi } from 'vitest';
import { isPromotable, isRegistrationOpen } from './types';

/**
 * What the public site is allowed to advertise.
 *
 * A finished intake that keeps its banner in the nav, its card over the hero and
 * its popup on every stray link makes a live site look abandoned — and takes
 * registrations for seats that do not exist. These guard the moment it stops.
 */

const day = (offsetDays: number) => {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return d.toISOString().slice(0, 10);
};

afterEach(() => vi.useRealTimers());

describe('isPromotable', () => {
  it('promotes a published programme that is running and still taking registrations', () => {
    expect(
      isPromotable({ is_published: true, registration_deadline: day(7), ends_on: day(30) }),
    ).toBe(true);
  });

  it('stops once registration has closed, even while the programme still runs', () => {
    // The classes are mid-flight but nobody new can join, so promoting it only
    // collects details we cannot honour.
    expect(
      isPromotable({ is_published: true, registration_deadline: day(-1), ends_on: day(20) }),
    ).toBe(false);
  });

  it('stops once the programme has finished, even with no registration deadline', () => {
    // This is the gap `isRegistrationOpen` alone leaves: no deadline set reads as
    // "open forever", so a summer school stayed on the homepage into the new year.
    const finished = { is_published: true, registration_deadline: null, ends_on: day(-1) };

    expect(isRegistrationOpen(finished)).toBe(true);
    expect(isPromotable(finished)).toBe(false);
  });

  it('never promotes an unpublished programme', () => {
    expect(
      isPromotable({ is_published: false, registration_deadline: day(7), ends_on: day(30) }),
    ).toBe(false);
  });

  it('treats both dates as running to the end of the day they name', () => {
    // Mid-morning on the deadline itself. A date-only field means the whole day,
    // so a school registering at 09:00 on closing day is still in time.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-14T09:00:00Z'));

    expect(
      isPromotable({
        is_published: true,
        registration_deadline: '2026-08-14',
        ends_on: '2026-08-14',
      }),
    ).toBe(true);
  });

  it('promotes an open-ended programme with neither date set', () => {
    expect(
      isPromotable({ is_published: true, registration_deadline: null, ends_on: null }),
    ).toBe(true);
  });

  it('ignores an unparseable end date rather than hiding a live programme', () => {
    // A bad date is a data problem, not a reason to take a running intake off the
    // site without telling anybody.
    expect(
      isPromotable({ is_published: true, registration_deadline: null, ends_on: 'not-a-date' }),
    ).toBe(true);
  });
});
