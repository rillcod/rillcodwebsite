import { describe, expect, it } from 'vitest';
import { resolveOfficialCurriculumDirection } from './official-direction';

/**
 * A tiny stand-in for the PostgREST builder, recording which tables were asked.
 */
function fakeDb(rows: Record<string, any>) {
  const asked: string[] = [];
  const builder = (table: string) => {
    asked.push(table);
    const chain: any = {
      select: () => chain,
      eq: () => chain,
      lte: () => chain,
      order: () => chain,
      limit: () => chain,
      maybeSingle: async () => ({ data: rows[table] ?? null }),
    };
    return chain;
  };
  return { db: { from: builder }, asked };
}

const LIVE_PIN = {
  id: 'rel-live',
  course_id: 'course-1',
  title: 'Python · live',
  status: 'published',
};

const RETIRED_PIN = { ...LIVE_PIN, id: 'rel-retired', title: 'Python · withdrawn', status: 'retired' };

describe('a teaching plan pinned to an edition', () => {
  it('keeps following a live edition, so a class is not yanked mid-term', () => {
    const { db } = fakeDb({ academic_curriculum_releases: LIVE_PIN });
    return resolveOfficialCurriculumDirection(db as any, {
      schoolId: 'school-1',
      courseId: 'course-1',
      pinnedReleaseId: 'rel-live',
    } as any).then((direction) => {
      expect(direction?.id).toBe('rel-live');
    });
  });

  it('stops following one the Academic Office withdrew', async () => {
    // The trap: "a pin wins forever" included retired editions, so nine plans
    // followed a withdrawn Python curriculum while a live replacement was
    // already adopted by all 29 schools — and nothing could move them. The
    // readiness sweep re-resolved the same dead pin, the stranded tool only
    // re-points school adoptions, and no screen exposes the pin.
    const { db, asked } = fakeDb({
      academic_curriculum_releases: RETIRED_PIN,
      academic_curriculum_adoptions: { release: { id: 'rel-live', status: 'published' } },
    });
    const direction = await resolveOfficialCurriculumDirection(db as any, {
      schoolId: 'school-1',
      courseId: 'course-1',
      pinnedReleaseId: 'rel-retired',
    } as any);

    expect(direction?.id).not.toBe('rel-retired');
    // It fell through to the school's live adoption rather than giving up.
    expect(asked).toContain('academic_curriculum_adoptions');
  });

  it('falls through when the pinned edition no longer exists at all', async () => {
    const { db, asked } = fakeDb({ academic_curriculum_releases: null });
    await resolveOfficialCurriculumDirection(db as any, {
      schoolId: 'school-1',
      courseId: 'course-1',
      pinnedReleaseId: 'rel-deleted',
    } as any);
    expect(asked).toContain('academic_curriculum_adoptions');
  });
});
