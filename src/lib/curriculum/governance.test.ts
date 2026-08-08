import { describe, expect, it } from 'vitest';
import {
  classifyCurriculumChange,
  curriculumContentHash,
  determineRolloutStatus,
  normalizeChangedPaths,
  proposalInitialStatus,
  validateSourceMetadata,
} from './governance';

describe('curriculum governance policy', () => {
  it('auto-approves class delivery adaptations only', () => {
    const kind = classifyCurriculumChange(
      ['content.terms.0.weeks.1.lesson_plan.activities'],
      'class',
    );
    expect(kind).toBe('delivery_safe');
    expect(proposalInitialStatus(kind, 'class')).toBe('auto_approved');
  });

  it('routes official and academic-core changes to review', () => {
    expect(classifyCurriculumChange(['content.learning_outcomes'], 'official')).toBe('academic_core');
    expect(classifyCurriculumChange(['content.terms.0.weeks.0.topic'], 'class')).toBe('academic_core');
    expect(proposalInitialStatus('academic_core', 'official')).toBe('pending');
  });

  it('classifies school calendar and resource changes as operational', () => {
    expect(classifyCurriculumChange(['content.terms.0.start_date'], 'school')).toBe('school_operational');
    expect(classifyCurriculumChange(['content.recommended_tools'], 'school')).toBe('school_operational');
  });

  it('normalizes paths and produces stable content hashes', () => {
    expect(normalizeChangedPaths([' content.notes ', 'content.notes', '', 3])).toEqual(['content.notes']);
    expect(curriculumContentHash({ b: 2, a: 1 })).toBe(curriculumContentHash({ a: 1, b: 2 }));
  });

  it('requires named source provenance', () => {
    expect(validateSourceMetadata({}).ok).toBe(false);
    expect(validateSourceMetadata({ name: 'Rillcod', framework: 'CSTA + internal' }).ok).toBe(true);
  });

  it('rolls out by exception', () => {
    expect(determineRolloutStatus({ autoUpdate: true, requested: true }).status).toBe('eligible');
    expect(determineRolloutStatus({ autoUpdate: false, requested: true }).status).toBe('skipped');
    expect(determineRolloutStatus({ autoUpdate: true, requested: true, adoptionStatus: 'conflict' }).status).toBe('conflict');
  });

  it('resumes an adoption the platform paused, but still respects a school opting out', () => {
    // Withdrawing an edition pauses every adoption of it. Reading that back as
    // "this school paused updates" made re-publishing roll out to nobody: 29
    // schools skipped, every Teen Developers class left with no direction.
    expect(determineRolloutStatus({ autoUpdate: true, requested: true, adoptionStatus: 'paused' }).status)
      .toBe('eligible');
    // auto_update is the school's own switch and still wins.
    expect(determineRolloutStatus({ autoUpdate: false, requested: true, adoptionStatus: 'paused' }).status)
      .toBe('skipped');
    // An unresolved conflict is still a conflict.
    expect(determineRolloutStatus({ autoUpdate: true, requested: true, adoptionStatus: 'conflict' }).status)
      .toBe('conflict');
  });
});
