import { describe, expect, it } from 'vitest';
import { buildTopicsCoveredFromDeclaration } from './delivery-declaration';
import type { DeliveryDeclaration } from './delivery-declaration';
import {
  buildTopicsCoveredPresentation,
  buildTopicsCoveredPresentationFromCourses,
  buildTopicsCoveredPdfStack,
  cleanTopicTitle,
  syntheticWeekTopicLabel,
} from './topics-covered-presentation';

const sampleDeclaration: DeliveryDeclaration = {
  reportingWeeks: 8,
  selectedTopicKeys: ['a::1::1', 'a::1::2', 'b::1::3'],
  selectedTopics: [
    { key: 'a::1::1', programme: 'Young Innovators', course: 'Scratch', topic: 'Scratch — Introduction to sprites', weekNumber: 1 },
    { key: 'a::1::2', programme: 'Young Innovators', course: 'Scratch', topic: 'Scratch — Animation and loops', weekNumber: 2 },
    { key: 'b::1::3', programme: 'Teen Developers', course: 'Python', topic: 'Python Module 3: Practical Application & Hands-On Exercises', weekNumber: 3 },
  ],
  spannedWeeks: [
    { week: 1, label: 'Week 1', topics: ['Scratch — Introduction to sprites'], programme: 'Young Innovators', course: 'Scratch' },
    { week: 2, label: 'Week 2', topics: ['Scratch — Animation and loops'], programme: 'Young Innovators', course: 'Scratch' },
    { week: 3, label: 'Week 3', topics: ['Python Module 3: Practical Application & Hands-On Exercises'], programme: 'Teen Developers', course: 'Python' },
  ],
  nextTermCheckpoint: null,
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('topics-covered-presentation', () => {
  it('cleans noisy synthetic topic titles', () => {
    expect(cleanTopicTitle('Python Module 3: Practical Application & Hands-On Exercises', 'Python')).toBe(
      'Hands-on practice & exercises',
    );
    expect(cleanTopicTitle('Scratch — Introduction to sprites', 'Scratch')).toBe('Introduction to sprites');
  });

  it('uses readable synthetic week labels', () => {
    expect(syntheticWeekTopicLabel('Scratch', 1)).toBe('Week 1: Core concepts & guided practice');
    expect(syntheticWeekTopicLabel('Scratch', 4)).toBe('Week 4: Progress check & practical demonstration');
  });

  it('formats what we taught with programme sections and bullet topics', () => {
    const presentation = buildTopicsCoveredPresentation(sampleDeclaration, {
      schoolName: 'Franej College',
      termLabel: 'First Term 2025/2026',
      academicTermNumber: 1,
    });

    expect(presentation.sections).toHaveLength(2);
    expect(presentation.plainText).toContain('Young Innovators');
    expect(presentation.plainText).toContain('• Week 1: Introduction to sprites');
    expect(presentation.plainText).toContain('Teen Developers');
    expect(presentation.plainText).not.toContain('Module 3:');
    expect(buildTopicsCoveredFromDeclaration(sampleDeclaration, {
      schoolName: 'Franej College',
      termLabel: 'First Term 2025/2026',
      academicTermNumber: 1,
    })).toBe(presentation.plainText);
  });

  it('builds a two-course evidence presentation and pdf columns', () => {
    const presentation = buildTopicsCoveredPresentationFromCourses({
      schoolName: 'Abundant Grace',
      termLabel: 'Second Term',
      academicTermNumber: 1,
      windowWeeks: 8,
      programmes: [
        {
          programme: 'Young Innovators',
          courses: [
            {
              course: 'Scratch',
              weekRangeLabel: 'Weeks 1–4: Scratch — focused module delivery within the 8-week term',
              evidenceLabel: '18 learners · 72% term average',
            },
          ],
        },
        {
          programme: 'Teen Developers',
          courses: [
            {
              course: 'Python Programming',
              weekRangeLabel: 'Term delivery (8-week window): Python Programming — taught through class sessions',
              evidenceLabel: '12 learners',
            },
          ],
        },
      ],
    });

    expect(presentation.sections).toHaveLength(2);
    expect(presentation.plainText).toContain('Scratch');
    expect(presentation.plainText).toContain('Python Programming');
    const pdfStack = buildTopicsCoveredPdfStack(presentation, { ink: '#111', brand: '#700', muted: '#666' });
    expect(JSON.stringify(pdfStack)).toContain('"columns"');
  });
});
