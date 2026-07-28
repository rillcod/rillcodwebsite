import { describe, expect, it } from 'vitest';
import { runAcademicQualityEngine } from './academicQualityEngine';

const context = {
  sourceMetadata: { name: 'Rillcod Academic Office', framework: 'Coding and Robotics Standard' },
  academicSession: '2026/2027',
  audienceLabel: 'Basic 1',
};

describe('runAcademicQualityEngine', () => {
  it('separates publication blockers from useful teaching improvements', () => {
    const report = runAcademicQualityEngine({
      overview: 'A practical introduction to computational thinking.',
      terms: [{ year: 1, term: 1, weeks: [{ week: 1, topic: 'Giving clear instructions', subtopics: ['Sequence'] }] }],
    }, context);
    expect(report.mustFix).toHaveLength(0);
    expect(report.improvements.map((issue) => issue.code)).toEqual(expect.arrayContaining(['activity_missing', 'assessment_missing']));
    expect(report.coverage).toEqual({ years: 1, terms: 1, weeks: 1 });
  });

  it('blocks missing sources, duplicate weeks, blank topics, and placeholders', () => {
    const report = runAcademicQualityEngine({
      terms: [{ term: 1, weeks: [
        { week: 1, topic: '' },
        { week: 1, topic: 'TODO' },
      ] }],
    });
    expect(report.readiness).toBe('not_ready');
    expect(report.mustFix.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      'source_name_missing', 'framework_missing', 'week_duplicated', 'topic_missing', 'placeholder_topic',
    ]));
  });

  it('uses human academic labels in issue locations', () => {
    const report = runAcademicQualityEngine({ terms: [{ year: 1, term: 3, weeks: [] }] }, context);
    expect(report.mustFix[0]?.location).toBe('Year 1, Third Term');
  });

  it('keeps school entry timing outside the academic readiness decision', () => {
    const report = runAcademicQualityEngine({
      overview: 'A reusable sequence.',
      terms: [{ term: 1, weeks: [{
        week: 1,
        topic: 'Robot safety',
        subtopics: ['Safe handling'],
        activities: ['Identify safe behaviours'],
        assessment: 'Student demonstrates safe handling',
      }] }],
    }, context);
    expect(report.mustFix).toHaveLength(0);
    expect(report.readiness).not.toBe('not_ready');
  });
});
