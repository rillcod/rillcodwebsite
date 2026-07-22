import { describe, expect, it } from 'vitest';
import {
  buildDeliveryDeclaration,
  reportWeekNumbers,
  reportingWeekCount,
  spanTopicsAcrossWeeks,
  type DeliveryTopicOption,
} from './delivery-declaration';

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
  it('counts reporting weeks in same term', () => {
    expect(
      reportingWeekCount({ startTerm: 1, startWeek: 1, endTerm: 1, endWeek: 12 }),
    ).toBe(12);
  });

  it('uses supplied curriculum lengths for a cross-term window', () => {
    expect(reportingWeekCount({
      startTerm: 1,
      startWeek: 9,
      endTerm: 2,
      endWeek: 3,
      termWeekCounts: { 1: 10, 2: 8 },
    })).toBe(5);
  });

  it('spans selected topics across the report window', () => {
    const selected = sampleCatalog.slice(0, 2);
    const spanned = spanTopicsAcrossWeeks(selected, 12, 1);
    expect(spanned.length).toBeGreaterThan(0);
    expect(spanned[0].topics).toContain('Intro');
    expect(spanned.some((row) => row.topics.includes('Loops'))).toBe(true);
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
      { programme: 'STEM', selectedTopics: 2, plannedTopics: 4, coverage: 50 },
      { programme: 'Robotics', selectedTopics: 1, plannedTopics: 2, coverage: 50 },
    ]);
  });
});
