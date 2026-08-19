import { DEFAULT_SCHOOL_REPORT_POLICY } from './report-policy';
import type { SchoolReportSnapshot } from './types';
import { countNoun } from './wording';

const PARTNERSHIP_PATTERNS = [
  /\bcoach\b/i,
  /\bclass\b/i,
  /\bcurriculum week/i,
  /\bRillcod\b/i,
  /\bschool leadership\b/i,
  /\bteacher-noted\b/i,
  /\bimprove attendance \(now \d/i,
];

export function isStudentFacingRecommendation(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  return !PARTNERSHIP_PATTERNS.some((pattern) => pattern.test(trimmed));
}

/** Canonical school attendance line — never use a single class or learner rate here. */
export function describeSchoolAttendance(
  snapshot: Pick<SchoolReportSnapshot, 'summary'>,
): string {
  const rate = snapshot.summary.attendanceRate;
  const covered = Number(snapshot.summary.learnersWithAttendance ?? 0);
  if (covered === 0) {
    return 'School-wide attendance is still being captured for this term.';
  }
  const fromResult = snapshot.summary.attendanceFromResultEntry ?? 0;
  const fromRoll = snapshot.summary.attendanceFromManualRoll ?? 0;
  let source = 'professional sessional rolls and Report Builder Attendance %';
  if (fromRoll > 0 && fromResult === 0) source = 'professional sessional class rolls (overrides score entry)';
  else if (fromResult > 0 && fromRoll === 0) source = 'Report Builder Attendance % backfill (participation_score)';
  else if (fromRoll > 0) source = 'session rolls where taken, with score-entry backfill elsewhere';
  const roster = Number(snapshot.summary.activeStudents ?? 0);
  const coverage =
    roster > covered
      ? `${countNoun(covered, 'learner')} of ${roster} with evidence`
      : `${countNoun(covered, 'learner')} with evidence`;
  return `School-wide attendance is ${rate}% (average across ${coverage}, from ${source}).`;
}

/** Student-facing recommendations for Section E — not partnership priorities or per-learner roll lines. */
export function buildStudentRecommendations(snapshot: SchoolReportSnapshot, maxItems = 4): string[] {
  const policy = snapshot.reportPolicy || DEFAULT_SCHOOL_REPORT_POLICY;
  const learners = snapshot.learners || [];
  const attendanceRisk = learners.filter((row) => row.status === 'Attendance risk').length;
  const needsSupport = learners.filter((row) => row.status === 'Needs support').length;
  const developing = learners.filter((row) => row.status === 'Developing').length;
  const excellent = learners.filter((row) => row.status === 'Excellent').length;

  const items: string[] = [];

  if (snapshot.summary.attendanceRate > 0 && snapshot.summary.attendanceRate < policy.attendance.riskBelow) {
    items.push(
      `${describeSchoolAttendance(snapshot)} Work with teachers and families on a shared plan to attend every scheduled lesson.`,
    );
  } else if (attendanceRisk > 0) {
    items.push(
      'Some learners need help catching up after missed lessons — review missed topics with your teacher and complete any outstanding class tasks.',
    );
  } else if (snapshot.summary.attendanceRate >= policy.attendance.strongMin) {
    items.push('Keep attending every lesson so you stay on track with new topics and class projects.');
  } else {
    items.push('Aim for consistent attendance each week and ask your teacher when you need help catching up.');
  }

  if (needsSupport > 0) {
    items.push('Spend a few minutes each day revisiting topics you found difficult, and ask for help when a step is unclear.');
  } else if (developing > 0) {
    items.push('Practise one key skill for a few minutes each day and share a piece of completed work for feedback.');
  } else if (excellent > 0) {
    items.push('Stretch yourself with an advanced mini-project and help a classmate understand a topic you enjoy.');
  } else {
    items.push('Complete age-appropriate practice each week and use teacher feedback to improve your work.');
  }

  items.push('Share one thing you learned each week at home and bring questions back to class.');
  items.push('Finish assignments on time and review graded work so you know what to improve next.');

  return [...new Set(items.map((item) => item.trim()).filter(Boolean))].slice(0, maxItems);
}

export function bandCoachingMessage(
  band: SchoolReportSnapshot['learners'][number]['status'],
): string {
  switch (band) {
    case 'Excellent':
      return 'Stretch further with advanced projects and peer mentoring.';
    case 'On track':
      return 'Keep weekly momentum and share strong work with the class.';
    case 'Developing':
      return 'Short daily practice and a weekly teacher check-in on two focus topics.';
    case 'Needs support':
      return 'Targeted practice, re-try weak areas, and a parent–teacher progress check.';
    case 'Attendance risk':
      return 'Improve consistent attendance and catch up on missed lessons with teacher support.';
    default:
      return 'Complete term assessments and class attendance so the next report can coach you personally.';
  }
}
