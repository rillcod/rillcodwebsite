import { describe, expect, it } from 'vitest';
import { buildDeliveryLedger } from './delivery-structure';
import { buildCurriculumDeliveryPdfStack } from './delivery-presentation';

const colors = { ink: '#111827', brand: '#7a0606', muted: '#6b7280', emerald: '#059669' };

describe('buildCurriculumDeliveryPdfStack', () => {
  it('uses a card grid for two to four programme rows', () => {
    const ledger = buildDeliveryLedger(
      {
        school: { id: 's1', name: 'Grace Academy' },
        summary: {
          activeStudents: 20,
          assignmentsCreated: 4,
          submissionsReceived: 18,
          studentsWithScores: 16,
          curriculumCoverage: 80,
        },
        curriculum: { plannedWeeks: 8, completedWeeks: 6, inProgressWeeks: 1, skippedWeeks: 0, courses: [] },
        period: { termLabel: 'First Term' },
        programmeCoursePerformance: [],
      },
      {
        nextLines: ['Continue Python projects next term.'],
        curriculumRange: 'Term 1 Week 1 to Term 1 Week 8',
        programmeNames: ['Digital Skills'],
        evidenceQualityPct: 80,
      },
    );
    ledger.topicRows = [
      {
        programme: 'Digital Skills',
        course: 'Scratch',
        weekRange: 'Weeks 1–4',
        evidence: 'Guided projects completed.',
        source: 'both',
      },
      {
        programme: 'Digital Skills',
        course: 'Python',
        weekRange: 'Weeks 5–8',
        evidence: 'Core syntax and exercises.',
        source: 'curriculum',
      },
    ];

    const stack = buildCurriculumDeliveryPdfStack({ ledger, colors });
    const flat = JSON.stringify(stack);

    expect(flat).toContain('Reporting window');
    expect(flat).toContain('Programme & course delivery');
    expect(flat).toContain('Evidence captured');
    expect(flat).toContain('Scratch');
    expect(flat).toContain('Python');
    expect(flat).not.toContain('Delivery range');
  });

  it('uses a table layout when more than four programme rows are present', () => {
    const ledger = buildDeliveryLedger(
      {
        school: { id: 's1', name: 'Grace Academy' },
        summary: {
          activeStudents: 40,
          assignmentsCreated: 8,
          submissionsReceived: 30,
          studentsWithScores: 28,
          curriculumCoverage: 75,
        },
        curriculum: { plannedWeeks: 8, completedWeeks: 6, inProgressWeeks: 1, skippedWeeks: 0, courses: [] },
        period: { termLabel: 'First Term' },
        programmeCoursePerformance: [],
      },
      {
        nextLines: [],
        curriculumRange: 'Term 1 Week 1 to Term 1 Week 8',
        programmeNames: ['STEM'],
        evidenceQualityPct: 75,
      },
    );
    ledger.topicRows = Array.from({ length: 5 }, (_, index) => ({
      programme: 'STEM',
      course: `Course ${index + 1}`,
      weekRange: `Weeks ${index + 1}`,
      evidence: 'Delivered.',
      source: 'both' as const,
    }));

    const stack = buildCurriculumDeliveryPdfStack({ ledger, colors });
    expect(JSON.stringify(stack)).toContain('Evidence & next step');
  });
});
