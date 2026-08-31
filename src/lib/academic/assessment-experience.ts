import type { SchoolProgrammePolicy } from '@/lib/academic/school-programme-standing';

export type AssessmentExperience = {
  standingLabel: string;
  resultLabel: string;
  title: string;
  description: string;
  workLabel: string;
  cbtLabel: string;
  resultsAction: string;
};

/** Plain, role-facing copy for the two partner-school result arrangements. */
export function assessmentExperience(
  policy: Pick<SchoolProgrammePolicy, 'standing' | 'usesHostEvaluation'>,
): AssessmentExperience {
  if (policy.usesHostEvaluation || policy.standing === 'compulsory') {
    return {
      standingLabel: 'Compulsory subject',
      resultLabel: 'School examination results',
      title: 'School papers and learning evidence',
      description:
        'First Test, Second Test and Examination are the official result. Rillcod assignments, projects and practice remain beside them as learning evidence.',
      workLabel: 'Learning work',
      cbtLabel: 'CBT and digital papers',
      resultsAction: 'Open school results',
    };
  }
  return {
    standingLabel: 'Optional programme',
    resultLabel: 'Rillcod-managed results',
    title: 'Class assessment and results',
    description:
      'Assignments, projects, CBT and recorded class evidence feed one Rillcod result. Review the evidence before publishing.',
    workLabel: 'Assessment work',
    cbtLabel: 'CBT assessments',
    resultsAction: 'Open Rillcod results',
  };
}
