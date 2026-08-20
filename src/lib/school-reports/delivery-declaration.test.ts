import { describe, expect, it } from 'vitest';
import {
  applyDeliveryDeclarationToSnapshot,
  buildDeliveryDeclaration,
  buildSyntheticDeliveryCatalog,
  buildWeekSpanTimeline,
  computeSpanPacingDepth,
  endWeekForReportWindow,
  extractDeliveryTopicCatalog,
  normalizeReportingWeeks,
  reportWeekNumbers,
  reportingWeekCount,
  resolveDeliveryTermNumber,
  spanTopicsAcrossWeeks,
  supplementDeliveryCatalogForMissingCourses,
  type DeliveryTopicOption,
} from './delivery-declaration';
import type { SchoolReportSnapshot } from './types';

const sampleCatalog: DeliveryTopicOption[] = [
  { key: 'a::1::1', curriculumId: 'a', programme: 'STEM', course: 'Coding', termNumber: 1, weekNumber: 1, topic: 'Intro' },
  { key: 'a::1::2', curriculumId: 'a', programme: 'STEM', course: 'Coding', termNumber: 1, weekNumber: 2, topic: 'Loops' },
  { key: 'a::1::3', curriculumId: 'a', programme: 'STEM', course: 'Coding', termNumber: 1, weekNumber: 3, topic: 'Projects' },
  { key: 'a::1::4', curriculumId: 'a', programme: 'STEM', course: 'Coding', termNumber: 1, weekNumber: 4, topic: 'Demo day' },
];

describe('delivery-declaration', () => {
  it('resolves the same term number for catalog load and on-spot generation', () => {
    expect(resolveDeliveryTermNumber(null, 2, 1)).toBe(2);
    expect(resolveDeliveryTermNumber(3, 2, 1)).toBe(3);
    expect(resolveDeliveryTermNumber(0, null, 0)).toBe(1);
  });

  it('generates exactly the selected term weeks', () => {
    expect(reportWeekNumbers(3, 8)).toEqual([3, 4, 5, 6, 7, 8]);
  });
  it('counts a 14-week same-term window', () => {
    expect(reportingWeekCount({ startTerm: 1, startWeek: 1, endTerm: 1, endWeek: 14 })).toBe(14);
  });

  it('snaps runaway windows to the nearest 8/10/14-week preset', () => {
    expect(reportingWeekCount({ startTerm: 1, startWeek: 1, endTerm: 1, endWeek: 154 })).toBe(14);
    expect(reportingWeekCount({ startTerm: 1, startWeek: 1, endTerm: 1, endWeek: 9 })).toBe(10);
    expect(reportingWeekCount({ startTerm: 1, startWeek: 1, endTerm: 1, endWeek: 11 })).toBe(10);
  });

  it('offers 8, 10, and 14 week presets', () => {
    expect(normalizeReportingWeeks(8)).toBe(8);
    expect(normalizeReportingWeeks(10)).toBe(10);
    expect(normalizeReportingWeeks(14)).toBe(14);
    expect(endWeekForReportWindow(1, 14)).toBe(14);
  });

  it('uses supplied curriculum lengths for a cross-term window', () => {
    expect(reportingWeekCount({
      startTerm: 1,
      startWeek: 9,
      endTerm: 2,
      endWeek: 3,
      termWeekCounts: { 1: 10, 2: 8 },
    })).toBe(8);
  });

  it('places each ticked topic on the week it was actually taught', () => {
    const selected = sampleCatalog.slice(0, 2);
    const spanned = spanTopicsAcrossWeeks(selected, 12, 1);
    // Weeks 1 and 2 in the catalog must report as weeks 1 and 2. Distributing by
    // array position used to spread these to weeks 1 and 7 of the window.
    expect(spanned.map((row) => row.week)).toEqual([1, 2]);
    expect(spanned[0].topics).toContain('Intro');
    expect(spanned[1].topics).toContain('Loops');
  });

  it('keeps two topics taught in the same week together', () => {
    const sameWeek: DeliveryTopicOption[] = [
      { key: 'b::1::5a', curriculumId: 'b', programme: 'STEM', course: 'Coding', termNumber: 1, weekNumber: 5, topic: 'Arrays' },
      { key: 'b::1::5b', curriculumId: 'b', programme: 'STEM', course: 'Coding', termNumber: 1, weekNumber: 5, topic: 'Sorting' },
    ];
    const spanned = spanTopicsAcrossWeeks(sameWeek, 10, 1);
    expect(spanned).toHaveLength(1);
    expect(spanned[0].week).toBe(5);
    expect(spanned[0].topics).toEqual(['Arrays', 'Sorting']);
  });

  it('clamps topics taught outside the window instead of dropping them', () => {
    const outside: DeliveryTopicOption[] = [
      { key: 'c::1::99', curriculumId: 'c', programme: 'STEM', course: 'Coding', termNumber: 1, weekNumber: 99, topic: 'Late topic' },
    ];
    const spanned = spanTopicsAcrossWeeks(outside, 10, 1);
    expect(spanned).toHaveLength(1);
    expect(spanned[0].week).toBe(10);
    expect(spanned[0].topics).toContain('Late topic');
  });

  it('judges pacing depth from span reach, not tick count alone', () => {
    // Three ticks that genuinely reach week 9 of a twelve-week window: depth 9,
    // not 3. Previously this passed only because index-spreading manufactured the
    // week-9 placement — the same three topics taught in weeks 1-3 also scored 9.
    const spreadCatalog: DeliveryTopicOption[] = [
      { key: 'd::1::1', curriculumId: 'd', programme: 'STEM', course: 'Coding', termNumber: 1, weekNumber: 1, topic: 'Intro' },
      { key: 'd::1::5', curriculumId: 'd', programme: 'STEM', course: 'Coding', termNumber: 1, weekNumber: 5, topic: 'Loops' },
      { key: 'd::1::9', curriculumId: 'd', programme: 'STEM', course: 'Coding', termNumber: 1, weekNumber: 9, topic: 'Projects' },
    ];
    const declaration = buildDeliveryDeclaration({
      catalog: spreadCatalog,
      selectedTopicKeys: spreadCatalog.map((row) => row.key),
      reportingWeeks: 12,
      rangeStartWeek: 1,
    });
    expect(declaration.pacingDepth).toBe(9);
    expect(computeSpanPacingDepth(declaration, 1)).toBe(9);
    expect(declaration.reportingWeeks).toBe(12);
  });

  it('reports shallow depth when the same number of ticks stayed early in the term', () => {
    // The distinction the previous implementation could not express at all.
    const earlyOnly = sampleCatalog.slice(0, 3); // weeks 1, 2, 3
    const declaration = buildDeliveryDeclaration({
      catalog: sampleCatalog,
      selectedTopicKeys: earlyOnly.map((row) => row.key),
      reportingWeeks: 12,
      rangeStartWeek: 1,
    });
    expect(declaration.pacingDepth).toBe(3);
  });

  it('builds a full timeline for live UI preview', () => {
    const selected = sampleCatalog.slice(0, 2);
    const timeline = buildWeekSpanTimeline(selected, 14, 1);
    expect(timeline).toHaveLength(14);
    expect(timeline.filter((row) => row.topics.length > 0)).toHaveLength(2);
    expect(timeline[0].topics).toContain('Intro');
  });

  it('builds declaration with next-term checkpoint', () => {
    const decl = buildDeliveryDeclaration({
      catalog: sampleCatalog,
      selectedTopicKeys: ['a::1::1', 'a::1::2'],
      reportingWeeks: 12,
    });
    expect(decl.selectedTopics).toHaveLength(2);
    expect(decl.nextTermCheckpoint?.topic).toBe('Projects');
    expect(decl.spannedWeeks.length).toBeGreaterThan(0);
  });
  it('calculates coverage separately for every programme', () => {
    const catalog: DeliveryTopicOption[] = [
      ...sampleCatalog,
      { key: 'b::1::1', curriculumId: 'b', programme: 'Robotics', course: 'Robotics Basics', termNumber: 1, weekNumber: 1, topic: 'Sensors' },
      { key: 'b::1::2', curriculumId: 'b', programme: 'Robotics', course: 'Robotics Basics', termNumber: 1, weekNumber: 2, topic: 'Motion' },
    ];
    const declaration = buildDeliveryDeclaration({
      catalog,
      selectedTopicKeys: ['a::1::1', 'a::1::2', 'b::1::1'],
      reportingWeeks: 12,
    });

    // STEM reached week 2 of a 12-week window (2/12 → 17%); Robotics only week 1
    // (1/12 → 8%). These must be two independent measurements — the previous
    // implementation printed the school-wide pacing figure for both, so this test
    // asserted 75 and 75 and could never have caught the duplication.
    expect(declaration.programmeCoverage).toEqual([
      { programme: 'STEM', selectedTopics: 2, plannedTopics: 4, coverage: 17 },
      { programme: 'Robotics', selectedTopics: 1, plannedTopics: 2, coverage: 8 },
    ]);
  });

  it('gives a programme that ran deeper into the term a higher coverage figure', () => {
    const catalog: DeliveryTopicOption[] = [
      { key: 'x::1::1', curriculumId: 'x', programme: 'STEM', course: 'Coding', termNumber: 1, weekNumber: 1, topic: 'Intro' },
      { key: 'x::1::10', curriculumId: 'x', programme: 'STEM', course: 'Coding', termNumber: 1, weekNumber: 10, topic: 'Capstone' },
      { key: 'y::1::1', curriculumId: 'y', programme: 'Robotics', course: 'Robotics', termNumber: 1, weekNumber: 1, topic: 'Sensors' },
      { key: 'y::1::2', curriculumId: 'y', programme: 'Robotics', course: 'Robotics', termNumber: 1, weekNumber: 2, topic: 'Motion' },
    ];
    const declaration = buildDeliveryDeclaration({
      catalog,
      selectedTopicKeys: ['x::1::1', 'x::1::10', 'y::1::1', 'y::1::2'],
      reportingWeeks: 10,
      rangeStartWeek: 1,
    });
    const byProgramme = Object.fromEntries(
      (declaration.programmeCoverage ?? []).map((row) => [row.programme, row.coverage]),
    );
    // Same tick count each (2), but STEM ran to week 10 and Robotics stopped at 2.
    expect(byProgramme.STEM).toBe(100);
    expect(byProgramme.Robotics).toBe(20);
  });

  it('extracts topics when syllabus term differs from academic term but matches report range', () => {
    const catalog = extractDeliveryTopicCatalog(
      [
        {
          id: 'cur1',
          content: {
            terms: [
              {
                term_number: 2,
                weeks: [
                  { week: 1, topic: 'Scratch basics' },
                  { week: 2, topic: 'Scratch loops' },
                ],
              },
            ],
          },
          courses: { title: 'Scratch', programs: { name: 'Young Innovators' } },
        },
      ],
      1,
      { startTerm: 2, startWeek: 1, endTerm: 2, endWeek: 14 },
    );
    expect(catalog).toHaveLength(2);
    expect(catalog[0].topic).toBe('Scratch basics');
  });

  it('omits placeholder weeks from the tickable catalog', () => {
    const catalog = extractDeliveryTopicCatalog(
      [
        {
          id: 'cur-ph',
          content: {
            generated_source: 'placeholder',
            terms: [
              {
                term: 1,
                weeks: [
                  { week: 1, topic: 'Week 1: Core concepts & guided practice', source: 'placeholder' },
                  { week: 2, topic: 'Variables and input', source: 'ai' },
                ],
              },
            ],
          },
          courses: { title: 'Python', programs: { name: 'Teen Developers' } },
        },
      ],
      1,
      { startTerm: 1, startWeek: 1, endTerm: 1, endWeek: 14 },
    );
    expect(catalog.map((row) => row.topic)).toEqual(['Variables and input']);
  });

  it('builds a synthetic catalog for resolved courses when syllabi are missing', () => {
    const catalog = buildSyntheticDeliveryCatalog(
      [{ id: 'c1', title: 'Python', programme: 'Teen Developers' }],
      { startTerm: 1, startWeek: 1, endTerm: 1, endWeek: 14 },
      1,
    );
    expect(catalog.length).toBe(14);
    expect(catalog[0].course).toBe('Python');
    expect(catalog[0].key.startsWith('synthetic::c1::')).toBe(true);
  });

  it('supplements missing enrolled courses when only one course has syllabus topics', () => {
    const pythonOnly: DeliveryTopicOption[] = [
      {
        key: 'cur-py::1::1',
        curriculumId: 'cur-py',
        programme: 'Teen Developers',
        course: 'Python Programming',
        termNumber: 1,
        weekNumber: 1,
        topic: 'Python basics',
      },
    ];
    const merged = supplementDeliveryCatalogForMissingCourses(
      pythonOnly,
      [
        { id: 'scratch-id', title: 'Scratch', programme: 'Young Innovators' },
        { id: 'python-id', title: 'Python Programming', programme: 'Teen Developers' },
      ],
      { startTerm: 1, startWeek: 1, endTerm: 1, endWeek: 8 },
      1,
    );

    const programmes = [...new Set(merged.map((row) => row.course))];
    expect(programmes).toContain('Scratch');
    expect(programmes).toContain('Python Programming');
    expect(merged.filter((row) => row.course === 'Scratch').length).toBe(8);
    expect(merged.filter((row) => row.course === 'Python Programming').length).toBe(1);
  });

  it('fills curriculum and performance rows for every enrolled course when only one is ticked', () => {
    const declaration = buildDeliveryDeclaration({
      catalog: sampleCatalog,
      selectedTopicKeys: ['a::1::1', 'a::1::2'],
      reportingWeeks: 8,
    });
    const snapshot = {
      programmeCoursePerformance: [
        {
          programme: 'Young Innovators',
          course: 'Scratch',
          submissions: 18,
          averageScore: 72,
          students: 18,
          enrolledStudents: 18,
        },
      ],
      schoolProgrammes: [
        { programme: 'Young Innovators', course: 'Scratch', enrolledStudents: 18, classNames: [] },
        { programme: 'Teen Developers', course: 'Python Programming', enrolledStudents: 12, classNames: [] },
      ],
      curriculum: { plannedWeeks: 8, completedWeeks: 0, inProgressWeeks: 0, skippedWeeks: 0, courses: [] },
      summary: { curriculumCoverage: 0 },
    } as unknown as SchoolReportSnapshot;

    const next = applyDeliveryDeclarationToSnapshot(snapshot, declaration, sampleCatalog.length);

    expect(next.programmeCoursePerformance).toHaveLength(2);
    expect(next.curriculum.courses.map((row) => row.course)).toEqual(
      expect.arrayContaining(['Scratch', 'Python Programming']),
    );
    expect(next.curriculum.courses.find((row) => row.course === 'Python Programming')?.completed).toBe(0);
    expect(next.curriculum.courses.find((row) => row.course === 'Coding')?.completed).toBeGreaterThan(0);
  });
});
