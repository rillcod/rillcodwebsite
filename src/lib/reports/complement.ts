/**
 * Rillcod is the central record. Compulsory schools keep First Test,
 * Second Test and Examination as the academic papers; those marks live on
 * this same progress report, beside classwork, assignments and projects
 * from what we taught. One picture. Nothing competes with it.
 */

export type ReportScoreAuthority = 'rillcod' | 'host_school';

export function parseScoreAuthority(value: unknown): ReportScoreAuthority {
  if (value === 'host_school' || value === 'compulsory') return 'host_school';
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const rec = value as Record<string, unknown>;
    if (rec.score_authority === 'host_school') return 'host_school';
    if (rec.programme_standing === 'compulsory') return 'host_school';
  }
  return 'rillcod';
}

export function scoreAuthorityFromStanding(standing: unknown): ReportScoreAuthority {
  return standing === 'compulsory' ? 'host_school' : 'rillcod';
}

export function progressReportComplement(authority: ReportScoreAuthority) {
  if (authority === 'host_school') {
    return {
      documentTitle: 'Rillcod Progress Report',
      parentPageTitle: 'Rillcod Progress Reports',
      parentPageSubtitle:
        'One Rillcod record: First Test, Second Test and Examination plus the learning we taught.',
      parentNotice:
        'This is your Rillcod progress report. First Test, Second Test and Examination each use the total the teacher set for that paper, and they add together here. Classwork, assignments and projects from what we taught sit beside them so you see the full picture.',
      overallCaption: 'First Test + Second Test + Examination',
      schoolTestsCaption: 'First Test, Second Test and Examination',
      learningCaption: 'Learning we taught',
      learningNote:
        'Classwork, assignments and projects complete the picture. They are not mixed into First Test, Second Test and Examination.',
      theory: 'Examination',
      assessment: 'First Test and Second Test',
      classwork: 'Classwork',
      practical: 'Practical / Projects',
      assignments: 'Assignments',
      attendance: 'Attendance',
    };
  }
  return {
    documentTitle: 'Progress Report',
    parentPageTitle: 'Report Cards',
    parentPageSubtitle: 'Published progress reports for your children.',
    parentNotice: null as string | null,
    overallCaption: 'Overall',
    schoolTestsCaption: 'Scores',
    learningCaption: 'Classwork',
    learningNote: null as string | null,
    theory: 'Theory / Written',
    assessment: 'Mid-term Assessment',
    classwork: 'Classwork',
    practical: 'Practical / Projects',
    assignments: 'Assignments',
    attendance: 'Attendance',
  };
}
