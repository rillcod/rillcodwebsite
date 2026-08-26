import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveClassLinkedCourse } from './class-course-resolution';
import {
  acceptableCourseTitles,
  courseFitsSchoolClass,
  homeCourseTitle,
  TEEN_COURSE_SPECS,
  TEEN_COURSES,
  YOUNG_COURSE_SPECS,
  YOUNG_COURSES,
} from './school-pathway';

const LIVE_CLASSES: Array<{ name: string; programme: string; course: string | null }> = [
  { name: 'Abundant Grace · Teen Dev · JSS 1 - SS 3', programme: 'Teen Developers', course: TEEN_COURSES.python },
  { name: 'Abundant Grace · Young Innov · Basic 4 - 6', programme: 'Young Innovators', course: YOUNG_COURSES.scratch },
  { name: 'Abundant Grace · Young Innov · KG 3 & Basic 1 - 3', programme: 'Young Innovators', course: YOUNG_COURSES.scratch },
  { name: 'Bayflower · Teen Dev · JSS 1-3', programme: 'Teen Developers', course: TEEN_COURSES.python },
  { name: 'Bayflower · Young Innov · Basic 1-6', programme: 'Young Innovators', course: YOUNG_COURSES.scratch },
  { name: 'Charishill · Young Innov · Basic 1-6', programme: 'Young Innovators', course: YOUNG_COURSES.scratch },
  { name: 'Christ the Redeem · Teen Dev · JSS 1-3', programme: 'Teen Developers', course: TEEN_COURSES.python },
  { name: 'Christ the Redeem · Young Innov · Basic 1', programme: 'Young Innovators', course: YOUNG_COURSES.scratch },
  { name: 'Christ the Redeem · Young Innov · Basic 1-6', programme: 'Young Innovators', course: YOUNG_COURSES.scratch },
  { name: 'Christ the Redeem · Young Innov · Basic 6', programme: 'Young Innovators', course: YOUNG_COURSES.scratch },
  { name: 'Franej · Young Innov · Basic 1-3', programme: 'Young Innovators', course: YOUNG_COURSES.scratch },
  { name: 'Franej · Young Innov · Basic 4', programme: 'Young Innovators', course: YOUNG_COURSES.scratch },
  { name: 'Franej · Young Innov · Basic 5', programme: 'Young Innovators', course: YOUNG_COURSES.scratch },
  { name: 'Franej · Young Innov · Basic 6', programme: 'Young Innovators', course: YOUNG_COURSES.scratch },
  { name: 'Franej Gra · Young Innov · Basic 1-3', programme: 'Young Innovators', course: YOUNG_COURSES.scratch },
  { name: 'Franej Gra · Young Innov · Basic 4-6', programme: 'Young Innovators', course: YOUNG_COURSES.scratch },
  { name: 'Franej High · Teen Dev · JSS 1-3', programme: 'Teen Developers', course: TEEN_COURSES.python },
  { name: 'Gabus Basic · Young Innov · Basic  4', programme: 'Young Innovators', course: YOUNG_COURSES.scratch },
  { name: 'Gabus Basic · Young Innov · Basic 1', programme: 'Young Innovators', course: YOUNG_COURSES.scratch },
  { name: 'Gabus Basic · Young Innov · Basic 3', programme: 'Young Innovators', course: YOUNG_COURSES.scratch },
  { name: 'Gabus Basic · Young Innov · Basic 4', programme: 'Young Innovators', course: YOUNG_COURSES.scratch },
  { name: 'Gabus Basic · Young Innov · Basic 5', programme: 'Young Innovators', course: YOUNG_COURSES.scratch },
  { name: 'Gabus High · Teen Dev · JSS 1-3', programme: 'Teen Developers', course: TEEN_COURSES.python },
  { name: 'Gabus High · Teen Dev · SS 1-3', programme: 'Teen Developers', course: TEEN_COURSES.python },
  { name: 'Gabus High · Young Innov · Basic 4-6', programme: 'Young Innovators', course: YOUNG_COURSES.scratch },
  { name: 'Greenville · Teen Dev · Basic 4-6', programme: 'Teen Developers', course: TEEN_COURSES.python },
  { name: 'Greenville · Young Innov · Basic 1-3', programme: 'Young Innovators', course: YOUNG_COURSES.scratch },
  { name: 'Henson Demonstration · Young Innov · Basic 1-3', programme: 'Young Innovators', course: YOUNG_COURSES.scratch },
  { name: 'Henson Demonstration Gra · Young Innov · Basic 1-6', programme: 'Young Innovators', course: YOUNG_COURSES.scratch },
  { name: 'Hilltop · Young Innov · Basic 1-3', programme: 'Young Innovators', course: YOUNG_COURSES.scratch },
  { name: 'Key to Success · Teen Dev · JSS 1-3', programme: 'Teen Developers', course: TEEN_COURSES.python },
  { name: 'Key to Success · Teen Dev · SS 1-3', programme: 'Teen Developers', course: TEEN_COURSES.python },
  { name: 'Key To Success · Young Innov · Basic 1 - 6', programme: 'Young Innovators', course: YOUNG_COURSES.scratch },
  { name: 'Made Xtreme · Young Innov · Basic 2-6', programme: 'Young Innovators', course: YOUNG_COURSES.scratch },
  { name: 'Megamind · Teen Dev · JSS 1-3', programme: 'Teen Developers', course: TEEN_COURSES.python },
  { name: 'Megamind · Young Innov · Basic 1-3', programme: 'Young Innovators', course: YOUNG_COURSES.scratch },
  { name: 'Megamind · Young Innov · Basic 4-6', programme: 'Young Innovators', course: YOUNG_COURSES.scratch },
  { name: 'Ocha Kids · Young Innov · Basic 1-6', programme: 'Young Innovators', course: YOUNG_COURSES.scratch },
  { name: 'Quincy · Teen Dev · Basic 4-6', programme: 'Teen Developers', course: TEEN_COURSES.python },
  { name: 'Quincy · Teen Dev · JSS 1-3', programme: 'Teen Developers', course: TEEN_COURSES.python },
  { name: 'Quincy · Young Innov · Basic 1-3', programme: 'Young Innovators', course: YOUNG_COURSES.scratch },
  { name: 'Royhills · Young Innov · Basic 1', programme: 'Young Innovators', course: YOUNG_COURSES.scratch },
  { name: 'Royhills · Young Innov · Basic 2', programme: 'Young Innovators', course: YOUNG_COURSES.scratch },
  { name: 'Royhills · Young Innov · Basic 3', programme: 'Young Innovators', course: YOUNG_COURSES.scratch },
  { name: 'Royhills · Young Innov · Nursery 1-3', programme: 'Young Innovators', course: YOUNG_COURSES.scratch },
  { name: 'St Peter · Young Innov · Basic 4-6', programme: 'Young Innovators', course: YOUNG_COURSES.scratch },
  { name: 'St. Bryan · Young Innov · Basic 1-3', programme: 'Young Innovators', course: YOUNG_COURSES.scratch },
  { name: 'St. Bryan · Young Innov · Basic 4-6', programme: 'Young Innovators', course: YOUNG_COURSES.scratch },
  { name: 'Sunflower · Teen Dev · JSS 1-3', programme: 'Teen Developers', course: TEEN_COURSES.python },
  { name: 'Sunflower · Young Innov · Basic 1-6', programme: 'Young Innovators', course: YOUNG_COURSES.scratch },
  { name: 'Winrose Basic · Young Innov · Basic 1-3', programme: 'Young Innovators', course: YOUNG_COURSES.scratch },
  { name: 'Winrose Basic · Young Innov · Basic 4-6', programme: 'Young Innovators', course: YOUNG_COURSES.scratch },
  { name: 'Winrose Sec · Teen Dev · SS 1-3', programme: 'Teen Developers', course: TEEN_COURSES.python },
  { name: 'Word of Faith · Teen Dev · JSS 1-3', programme: 'Teen Developers', course: TEEN_COURSES.python },
  { name: 'Word of Faith · Teen Dev · SS 1-3', programme: 'Teen Developers', course: TEEN_COURSES.python },
  { name: 'Word of Faith · Young Innov · Basic 1-6', programme: 'Young Innovators', course: YOUNG_COURSES.scratch },
];

describe('school pathway — live classes still fit', () => {
  it('keeps every current Young Innovators and Teen Developers class on an acceptable course', () => {
    const misfits = LIVE_CLASSES.filter((row) => !courseFitsSchoolClass({
      programme: row.programme,
      courseTitle: row.course,
      className: row.name,
    }));
    expect(misfits).toEqual([]);
  });

  it('does not treat Scratch as a Teen Developers course', () => {
    expect(courseFitsSchoolClass({
      programme: 'Teen Developers',
      courseTitle: YOUNG_COURSES.scratch,
      className: 'Gabus High · Teen Dev · JSS 1-3',
    })).toBe(false);
  });

  it('does not treat Python as a Young Innovators course', () => {
    expect(courseFitsSchoolClass({
      programme: 'Young Innovators',
      courseTitle: TEEN_COURSES.python,
      className: 'Franej · Young Innov · Basic 1-3',
    })).toBe(false);
  });
});

describe('home course for a new class', () => {
  it('opens Nursery on Hello World', () => {
    expect(homeCourseTitle({
      programme: 'Young Innovators',
      className: 'Royhills · Young Innov · Nursery 1-3',
    })).toBe(YOUNG_COURSES.helloWorld);
  });

  it('opens Basic bands on Scratch, including mixed 1-6 and upper primary', () => {
    expect(homeCourseTitle({ programme: 'Young Innovators', className: 'Franej · Young Innov · Basic 1-3' }))
      .toBe(YOUNG_COURSES.scratch);
    expect(homeCourseTitle({ programme: 'Young Innovators', className: 'Franej Gra · Young Innov · Basic 4-6' }))
      .toBe(YOUNG_COURSES.scratch);
    expect(homeCourseTitle({ programme: 'Young Innovators', className: 'Christ the Redeem · Young Innov · Basic 1' }))
      .toBe(YOUNG_COURSES.scratch);
    expect(homeCourseTitle({ programme: 'Young Innovators', className: 'Young Innovators · JSS1' }))
      .toBeNull();
  });

  it('opens Teen JSS, SS, and early Basic 4-6 on Python', () => {
    expect(homeCourseTitle({ programme: 'Teen Developers', className: 'Megamind · Teen Dev · JSS 1-3' }))
      .toBe(TEEN_COURSES.python);
    expect(homeCourseTitle({ programme: 'Teen Developers', className: 'Winrose Sec · Teen Dev · SS 1-3' }))
      .toBe(TEEN_COURSES.python);
    expect(homeCourseTitle({ programme: 'Teen Developers', className: 'Greenville · Teen Dev · Basic 4-6' }))
      .toBe(TEEN_COURSES.python);
  });
});

describe('acceptable next courses while later editions are unpublished', () => {
  it('lets upper-primary Young Innovators rotate into robots without leaving the programme', () => {
    expect(acceptableCourseTitles({
      programme: 'Young Innovators',
      className: 'St Peter · Young Innov · Basic 4-6',
    })).toEqual(expect.arrayContaining([
      YOUNG_COURSES.scratch,
      YOUNG_COURSES.robots,
      YOUNG_COURSES.art,
      YOUNG_COURSES.showcase,
    ]));
  });

  it('lets senior Teen Developers rotate into web and app courses', () => {
    expect(acceptableCourseTitles({
      programme: 'Teen Developers',
      className: 'Key to Success · Teen Dev · SS 1-3',
    })).toEqual(expect.arrayContaining([
      TEEN_COURSES.python,
      TEEN_COURSES.html,
      TEEN_COURSES.javascript,
      TEEN_COURSES.apps,
    ]));
  });
});

const SCHOOL_CATALOG = [
  ...YOUNG_COURSE_SPECS.map((spec, index) => ({
    id: `yi-${index + 1}`,
    title: spec.title,
    program_id: 'yi-id',
    is_active: true,
  })),
  ...TEEN_COURSE_SPECS.map((spec, index) => ({
    id: `td-${index + 1}`,
    title: spec.title,
    program_id: 'td-id',
    is_active: true,
  })),
];

describe('class-by-class resolution for live rooms', () => {
  it('leaves every current Scratch or Python class on that course', () => {
    const misfits = LIVE_CLASSES.map((row) => {
      const current = SCHOOL_CATALOG.find((course) => course.title === row.course);
      const linked = resolveClassLinkedCourse(
        {
          name: row.name,
          program_id: row.programme === 'Young Innovators' ? 'yi-id' : 'td-id',
          current_course_id: current?.id ?? null,
        },
        SCHOOL_CATALOG,
      );
      return linked?.title === row.course ? null : { name: row.name, got: linked?.title, want: row.course };
    }).filter(Boolean);
    expect(misfits).toEqual([]);
  });
});

describe('catalogue sequence stays aligned with the migration', () => {
  const sql = () =>
    readFileSync(
      join(process.cwd(), 'supabase/migrations/20260929000119_fit_young_and_teen_course_bands.sql'),
      'utf8',
    );

  it('writes every course title and its level_order into 00119', () => {
    // level_order genuinely lives in the database — teaching-workspace orders by
    // it, and path-view and student-level-enrollments read it — so the migration
    // and these specs must agree on the sequence.
    for (const spec of [...YOUNG_COURSE_SPECS, ...TEEN_COURSE_SPECS]) {
      expect(sql()).toContain(spec.title);
      expect(sql(), `${spec.title} should be level ${spec.levelOrder}`).toContain(
        `'${spec.title}', ${spec.levelOrder}`,
      );
    }
  });

  it('does NOT copy grade bands into the database', () => {
    /*
     * This assertion is inverted on purpose, and replaced one that required the
     * opposite.
     *
     * The previous version asserted the migration contained
     * JSON.stringify(spec.gradeLevels) for all twelve courses — it required the
     * constants above to be duplicated into SQL, and would have failed anyone
     * who tried to remove that copy. The rigidity was enforced by its own test.
     *
     * Bands belong in code. recommend-server reads them as the default whenever
     * a course carries no metadata, and /dashboard/courses/new writes metadata
     * only when a school needs a genuine per-course override. Writing the
     * defaults into every row changes nothing today and freezes them tomorrow:
     * a later edit here would silently stop applying to any existing course.
     */
    // Comments are stripped first: the header explains at length why bands are
    // NOT written here, and matching that prose would defeat the check.
    const statements = sql()
      .split(/\r?\n/)
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n');

    for (const spec of [...YOUNG_COURSE_SPECS, ...TEEN_COURSE_SPECS]) {
      expect(statements).not.toContain(JSON.stringify(spec.gradeLevels));
    }
    expect(statements).not.toContain('grade_levels');
    expect(statements).not.toContain('metadata');
  });
});
