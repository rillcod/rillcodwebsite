import { liveAcademicSession } from '@/lib/reports/academic-period';

const TERM_LABELS: Record<number, string> = { 1: 'First Term', 2: 'Second Term', 3: 'Third Term' };
const GRADE_LABELS: Record<string, string> = {
  basic_1: 'Basic 1', basic_2: 'Basic 2', basic_3: 'Basic 3', basic_4: 'Basic 4', basic_5: 'Basic 5', basic_6: 'Basic 6',
  jss_1: 'JSS 1', jss_2: 'JSS 2', jss_3: 'JSS 3', ss_1: 'SS 1', ss_2: 'SS 2', ss_3: 'SS 3',
};

export function humanTermLabel(termNumber: number | string | null | undefined): string {
  return TERM_LABELS[Number(termNumber)] ?? 'Term not set';
}

export function humanGradeLabel(gradeKey: string | null | undefined): string {
  if (!gradeKey) return 'All suitable levels';
  const normalized = gradeKey.trim().toLowerCase().replace(/[\s-]+/g, '_');
  return GRADE_LABELS[normalized]
    ?? gradeKey.replace(/_/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}

export function humanProgrammeYear(year: number | string | null | undefined): string {
  const value = Number(year);
  return Number.isFinite(value) && value > 0 ? `Programme Year ${Math.floor(value)}` : 'Programme year not set';
}

export function humanAcademicSession(session?: string | null, now = new Date()): string {
  const value = session?.trim() || liveAcademicSession(now).periodLabel;
  return `${value} Academic Session`;
}

export function humanEntryPoint(input: { termNumber: number; weekNumber: number }): string {
  return `Teaching begins in ${humanTermLabel(input.termNumber)}, Week ${input.weekNumber}`;
}

export function humanCalendarProgrammeLabel(input: {
  academicSession?: string | null;
  calendarTerm: number;
  programmeYear: number;
  programmeTerm?: number | null;
}): string {
  const session = input.academicSession?.trim() || liveAcademicSession(new Date()).periodLabel;
  const programme = input.programmeTerm && input.programmeTerm !== 1
    ? `${humanProgrammeYear(input.programmeYear)} · ${humanTermLabel(input.programmeTerm)}`
    : humanProgrammeYear(input.programmeYear);
  return `${humanTermLabel(input.calendarTerm)} ${session} (${programme})`;
}

export function humanCurriculumContext(input: {
  academicSession?: string | null;
  termNumber?: number | null;
  gradeKey?: string | null;
  programmeYear?: number | null;
  programmeTerm?: number | null;
}): string {
  const calendar = input.termNumber && input.programmeYear
    ? humanCalendarProgrammeLabel({
        academicSession: input.academicSession,
        calendarTerm: input.termNumber,
        programmeYear: input.programmeYear,
        programmeTerm: input.programmeTerm,
      })
    : humanAcademicSession(input.academicSession);
  return [calendar, input.gradeKey ? humanGradeLabel(input.gradeKey) : null].filter(Boolean).join(' · ');
}

