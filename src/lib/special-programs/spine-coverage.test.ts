/**
 * Every week on a programme's spine must be claimed by a module.
 *
 * Week 7 ("Final Projects & Graduation") sat on the live AI Summer School page
 * with no track covering it. Nothing errored — the bridge simply had nothing to
 * build for that week, so no curriculum, no lesson and no homework ever
 * appeared, and the gap was invisible until someone counted by hand.
 */
import { describe, expect, it } from 'vitest';
import {
  parseTrackWeekRange,
  resolveTrackTeachingWindow,
  type PageContent,
} from '@/lib/academic/programme-bridge';

/** Weeks on the spine that no track's window covers. */
function uncoveredWeeks(page: PageContent): number[] {
  const spine = (page.weeks ?? []).map((w) => {
    const n = Number(String(w.num ?? '').replace(/\D+/g, ''));
    return Number.isFinite(n) && n > 0 ? n : null;
  }).filter((n): n is number => n != null);

  const claimed = new Set<number>();
  for (const track of page.tracks ?? []) {
    for (const n of resolveTrackTeachingWindow(track, page).weekNumbers) claimed.add(n);
  }
  return spine.filter((n) => !claimed.has(n));
}

describe('parseTrackWeekRange', () => {
  it('reads a range written with an en dash', () => {
    expect(parseTrackWeekRange('Module 4 · Weeks 5–6')).toEqual({ start: 5, end: 6 });
  });

  it('reads a single-week module', () => {
    expect(parseTrackWeekRange('Module 5 · Week 7')).toEqual({ start: 7, end: 7 });
  });

  it('does not mistake the module number for a week', () => {
    // "Module 5 · Week 7" must resolve to week 7, never week 5.
    expect(parseTrackWeekRange('Module 5 · Week 7')?.start).toBe(7);
  });

  it('scales past the current spine length', () => {
    expect(parseTrackWeekRange('Module 6 · Weeks 8-12')).toEqual({ start: 8, end: 12 });
  });
});

describe('spine coverage', () => {
  const spine = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ num: `Week ${i + 1}`, title: `W${i + 1}`, tag: '', desc: '' }));

  it('flags a week no module claims', () => {
    const page: PageContent = {
      weeks: spine(7),
      tracks: [
        { title: 'A', week: 'Module 1 · Weeks 1–3', topics: [] },
        { title: 'B', week: 'Module 2 · Weeks 4–6', topics: [] },
      ],
    } as PageContent;
    expect(uncoveredWeeks(page)).toEqual([7]);
  });

  it('is satisfied once a module claims the final week', () => {
    const page: PageContent = {
      weeks: spine(7),
      tracks: [
        { title: 'A', week: 'Module 1 · Weeks 1–3', topics: [] },
        { title: 'B', week: 'Module 2 · Weeks 4–6', topics: [] },
        { title: 'C', week: 'Module 3 · Week 7', topics: [] },
      ],
    } as PageContent;
    expect(uncoveredWeeks(page)).toEqual([]);
  });

  it('covers an inserted week without the spine being rewritten by hand', () => {
    // Insert a week: the spine grows to 8 and a module widens to absorb it.
    const page: PageContent = {
      weeks: spine(8),
      tracks: [
        { title: 'A', week: 'Module 1 · Weeks 1–3', topics: [] },
        { title: 'B', week: 'Module 2 · Weeks 4–7', topics: [] },
        { title: 'C', week: 'Module 3 · Week 8', topics: [] },
      ],
    } as PageContent;
    expect(uncoveredWeeks(page)).toEqual([]);
  });

  it('overlapping modules are allowed — parallel tracks share weeks', () => {
    const page: PageContent = {
      weeks: spine(3),
      tracks: [
        { title: 'A', week: 'Module 1 · Weeks 1–2', topics: [] },
        { title: 'B', week: 'Module 2 · Weeks 1–3', topics: [] },
      ],
    } as PageContent;
    expect(uncoveredWeeks(page)).toEqual([]);
  });
});
