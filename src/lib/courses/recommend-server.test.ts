/**
 * Tenancy and scoping guards for the shared course-recommendation reads.
 *
 * This helper replaced several page-level course queries that each did their own school
 * scoping. These tests pin the rules it inherited, so a picker can never be widened to
 * another school's courses by accident.
 */
import { describe, expect, it } from 'vitest';
import { loadCourseRecommendation } from './recommend-server';

type Call = { table: string; filters: Record<string, unknown>; or: string[] };

/** Minimal Supabase query-builder double that records what was asked for. */
function fakeDb(rows: Record<string, any[]>) {
  const calls: Call[] = [];
  const from = (table: string) => {
    const call: Call = { table, filters: {}, or: [] };
    calls.push(call);
    const builder: any = {
      select: () => builder,
      eq: (column: string, value: unknown) => { call.filters[column] = value; return builder; },
      in: (column: string, value: unknown) => { call.filters[column] = value; return builder; },
      or: (clause: string) => { call.or.push(clause); return builder; },
      order: () => Promise.resolve({ data: rows[table] ?? [], error: null }),
      then: (resolve: (value: { data: any[]; error: null }) => unknown) =>
        resolve({ data: rows[table] ?? [], error: null }),
    };
    return builder;
  };
  return { db: { from } as any, calls };
}

const COURSES = [
  { id: 'scratch', title: 'Scratch Foundations', program_id: 'yi', is_active: true, level_order: 1, metadata: {}, programs: { name: 'Young Innovators' } },
  { id: 'robotics', title: 'Robotics Basics', program_id: 'yi', is_active: true, level_order: 2, metadata: {}, programs: { name: 'Young Innovators' } },
];

describe('loadCourseRecommendation', () => {
  it('limits courses to global plus this school when a school is known', async () => {
    const { db, calls } = fakeDb({ courses: COURSES });
    await loadCourseRecommendation(db, { programId: 'yi', schoolId: 'school-1' });
    const courseCall = calls.find((call) => call.table === 'courses')!;
    expect(courseCall.or).toContain('school_id.eq.school-1,school_id.is.null');
    expect(courseCall.filters.program_id).toBe('yi');
    expect(courseCall.filters.is_active).toBe(true);
  });

  it('does not apply a school filter when no school is known', async () => {
    const { db, calls } = fakeDb({ courses: COURSES });
    await loadCourseRecommendation(db, { programId: 'yi' });
    const courseCall = calls.find((call) => call.table === 'courses')!;
    expect(courseCall.or).toHaveLength(0);
  });

  it('reads adoptions for the school being asked about, not every school', async () => {
    const { db, calls } = fakeDb({
      courses: COURSES,
      academic_curriculum_adoptions: [{ course_id: 'scratch' }],
    });
    const result = await loadCourseRecommendation(db, { programId: 'yi', schoolId: 'school-1' });
    const adoptionCall = calls.find((call) => call.table === 'academic_curriculum_adoptions')!;
    expect(adoptionCall.filters.school_id).toBe('school-1');
    expect(adoptionCall.filters.status).toBe('active');
    expect(result.recommended?.id).toBe('scratch');
  });

  it('skips adoption and sibling reads entirely when there is no school', async () => {
    const { db, calls } = fakeDb({ courses: COURSES });
    await loadCourseRecommendation(db, { programId: 'yi' });
    expect(calls.some((call) => call.table === 'academic_curriculum_adoptions')).toBe(false);
    expect(calls.some((call) => call.table === 'classes')).toBe(false);
  });

  it('returns an empty recommendation rather than querying on for a programme with no courses', async () => {
    const { db, calls } = fakeDb({ courses: [] });
    const result = await loadCourseRecommendation(db, { programId: 'yi', schoolId: 'school-1' });
    expect(result.options).toEqual([]);
    expect(result.confidence).toBe('none');
    expect(calls.some((call) => call.table === 'academic_curriculum_releases')).toBe(false);
  });

  it('asks for nothing at all without a programme', async () => {
    const { db, calls } = fakeDb({ courses: COURSES });
    const result = await loadCourseRecommendation(db, { programId: '' });
    expect(calls).toHaveLength(0);
    expect(result.recommended).toBeNull();
  });

  it('surfaces a read failure instead of silently recommending nothing', async () => {
    const db = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({ order: () => Promise.resolve({ data: null, error: { message: 'boom' } }) }),
          }),
        }),
      }),
    } as any;
    await expect(loadCourseRecommendation(db, { programId: 'yi' })).rejects.toThrow('boom');
  });
});

describe('curriculum evidence', () => {
  it('treats a published release as curriculum even with no draft row', async () => {
    const { db } = fakeDb({
      courses: COURSES,
      academic_curriculum_releases: [{ course_id: 'scratch' }],
      course_curricula: [],
    });
    const result = await loadCourseRecommendation(db, { programId: 'yi', schoolId: 'school-1' });
    const scratch = result.options.find((option) => option.id === 'scratch')!;
    expect(scratch.status).toBe('published');
    expect(scratch.teachable).toBe(true);
    const robotics = result.options.find((option) => option.id === 'robotics')!;
    expect(robotics.status).toBe('none');
    expect(robotics.teachable).toBe(false);
  });
});

// Guards the fix for the auto-apply loop: a scope with no options must never clear a
// selection the caller already holds.
describe('empty scopes', () => {
  it('reports no options rather than a recommendation when the programme is empty', async () => {
    const { db } = fakeDb({ courses: [] });
    const result = await loadCourseRecommendation(db, {
      programId: 'yi',
      schoolId: 'school-1',
      currentCourseId: 'already-chosen',
    });
    expect(result.options).toHaveLength(0);
    expect(result.recommended).toBeNull();
  });
});
