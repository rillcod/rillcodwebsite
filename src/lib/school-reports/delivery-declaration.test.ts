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

  it('spans selected topics across the report window', () => {
    const selected = sampleCatalog.slice(0, 2);
    const spanned = spanTopicsAcrossWeeks(selected, 12, 1);
    expect(spanned.length).toBeGreaterThan(0);
    expect(spanned[0].topics).toContain('Intro');
    expect(spanned.some((row) => row.topics.includes('Loops'))).toBe(true);
  });

  it('judges pacing depth from span reach, not tick count alone', () => {
    const selected = sampleCatalog.slice(0, 3);
    const declaration = buildDeliveryDeclaration({
      catalog: sampleCatalog,
      selectedTopicKeys: selected.map((row) => row.key),
      reportingWeeks: 12,
      rangeStartWeek: 1,
    });
    expect(declaration.pacingDepth).toBe(9);
    expect(computeSpanPacingDepth(declaration, 1)).toBe(9);
    expect(declaration.reportingWeeks).toBe(12);
    expect(declaration.spannedWeeks.length).toBeGreaterThan(0);
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

    expect(declaration.programmeCoverage).toEqual([
      { programme: 'STEM', selectedTopics: 2, plannedTopics: 4, coverage: 75 },
      { programme: 'Robotics', selectedTopics: 1, plannedTopics: 2, coverage: 75 },
    ]);
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
    expect(next.curriculum.courses.find((row) => row.course === 'Python Programming')?.completed).toBeGreaterThan(0);
  });
});
