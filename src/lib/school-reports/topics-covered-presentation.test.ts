import { describe, expect, it } from 'vitest';
import { buildTopicsCoveredFromDeclaration } from './delivery-declaration';
import type { DeliveryDeclaration } from './delivery-declaration';
import {
  buildTopicsCoveredPresentation,
  buildTopicsCoveredPresentationFromCourses,
  buildTopicsCoveredPdfStack,
  buildTopicsCoveredPdfBodyForReport,
  buildNextLinesPdfCallout,
  buildCelebrationWallPdfStack,
  buildProgrammeSpotlightPdfStack,
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
    expect(presentation.plainText).toContain('• Introduction to sprites');
    expect(presentation.plainText).toContain('Teen Developers');
    expect(presentation.plainText).not.toContain('Module 3:');
    expect(buildTopicsCoveredFromDeclaration(sampleDeclaration, {
      schoolName: 'Franej College',
      termLabel: 'First Term 2025/2026',
      academicTermNumber: 1,
    })).toBe(presentation.plainText);
  });

  it('builds a two-course evidence presentation without week numbering in client copy', () => {
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
    expect(presentation.plainText).not.toMatch(/Week\s+\d+/i);
    expect(presentation.pacingLine).toContain('module pacing');
    const pdfStack = buildTopicsCoveredPdfStack(presentation, { ink: '#111', brand: '#700', muted: '#666' });
    expect(JSON.stringify(pdfStack)).toContain('"columns"');
    expect(JSON.stringify(pdfStack)).not.toMatch(/Week\\s+\\d+/i);
    expect(JSON.stringify(pdfStack)).toContain('fillColor');
  });

  it('keeps structured course cards when leadership narrative text is also saved', () => {
    const presentation = buildTopicsCoveredPresentation(sampleDeclaration, {
      schoolName: 'Franej College',
      termLabel: 'First Term 2025/2026',
      academicTermNumber: 1,
    });
    const colors = { ink: '#111', brand: '#700', muted: '#666' };
    const body = buildTopicsCoveredPdfBodyForReport(
      { topicsCovered: 'Expanded leadership paragraph.\n\n• Follow-up item one' },
      presentation,
      colors,
    );
    const json = JSON.stringify(body);
    expect(json).toContain('Introduction to sprites');
    expect(json).toContain('Leadership narrative');
    expect(json).toContain('Expanded leadership paragraph');
    expect(json).toContain('fillColor');
  });

  it('appends what opens next callout when nextLines are provided', () => {
    const colors = { ink: '#111', brand: '#700', muted: '#666' };
    const body = buildTopicsCoveredPdfBodyForReport({ topicsCovered: '' }, null, colors, {
      nextLines: ['Continue Python from Module 4', 'Scratch animation project'],
    });
    const json = JSON.stringify(body);
    expect(json).toContain('What opens next');
    expect(json).toContain('Continue Python from Module 4');
  });

  it('builds celebration wall rows with star markers up to five', () => {
    const colors = { ink: '#111', brand: '#700', muted: '#666' };
    const rows = Array.from({ length: 6 }, (_, index) => ({
      name: `Learner ${index + 1}`,
      classLabel: `JSS ${index + 1}`,
      highlight: `${90 - index}%`,
    }));
    const stack = buildCelebrationWallPdfStack(rows, colors);
    expect(stack).toHaveLength(5);
    expect(JSON.stringify(stack)).toContain('★');
    expect(JSON.stringify(stack)).toContain('Learner 1');
    expect(JSON.stringify(stack)).not.toContain('Learner 6');
  });

  it('builds programme spotlight cards in a two-column layout', () => {
    const colors = { ink: '#111', brand: '#700', muted: '#666' };
    const stack = buildProgrammeSpotlightPdfStack(
      [
        {
          programme: 'Young Innovators',
          course: 'Scratch',
          summary: 'Sprites and loops delivered across four weeks.',
          nextIntro: 'Continue animation projects next term.',
        },
        {
          programme: 'Teen Developers',
          course: 'Python',
          summary: 'Functions and practical exercises completed.',
          nextIntro: 'Open with data structures.',
        },
      ],
      colors,
    );
    const json = JSON.stringify(stack);
    expect(json).toContain('Scratch');
    expect(json).toContain('Python');
    expect(json).toContain('"columns"');
    expect(json).toContain('fillColor');
  });

  it('builds a standalone next-lines callout panel', () => {
    const colors = { ink: '#111', brand: '#700', muted: '#666' };
    const stack = buildNextLinesPdfCallout(['Line one', 'Line two'], colors);
    expect(stack).toHaveLength(2);
    expect(JSON.stringify(stack)).toContain('What opens next');
    expect(JSON.stringify(stack)).toContain('Line one');
  });
});
