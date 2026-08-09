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

/**
 * A span of teaching, written the way a person would say it.
 *
 * Reports printed "Term 1 Week 1  to  Term 1 Week 8", and the internal note went
 * further with a literal arrow: "Term 3 Week 1 → Term 1 Week 1". Parents and
 * head teachers read these. An arrow between two coordinates is a diagram of the
 * database, not a sentence about a child's term.
 *
 * Within one term the term is said once — "First Term, Weeks 1 to 8" — because
 * repeating it is how the mechanical version read.
 */
/**
 * A positive count, or nothing.
 *
 * Number(null) is 0 and Number('') is 0, and both pass Number.isFinite — so a
 * missing term read as term zero and printed "Term not set Week 1 to First Term
 * Week 8" instead of admitting it had nothing to show.
 */
function countOrNull(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;
}

export function humanCurriculumSpan(input: {
  startTerm: number | string | null | undefined;
  startWeek: number | string | null | undefined;
  endTerm: number | string | null | undefined;
  endWeek: number | string | null | undefined;
}): string {
  const startTerm = countOrNull(input.startTerm);
  const endTerm = countOrNull(input.endTerm);
  const startWeek = countOrNull(input.startWeek);
  const endWeek = countOrNull(input.endWeek);

  if (startTerm === null || endTerm === null || startWeek === null || endWeek === null) {
    return 'Teaching period not set';
  }
  if (startTerm === endTerm) {
    return startWeek === endWeek
      ? `${humanTermLabel(startTerm)}, Week ${startWeek}`
      : `${humanTermLabel(startTerm)}, Weeks ${startWeek} to ${endWeek}`;
  }
  return `${humanTermLabel(startTerm)} Week ${startWeek} to ${humanTermLabel(endTerm)} Week ${endWeek}`;
}

/**
 * Where a school joins, and where in the curriculum that lands.
 *
 * The two facts were shown as separate sentences — "Begins Third Term, Week 1"
 * then "Starts from Programme Year 1, First Term, Week 1" — which states both
 * and explains neither. The whole point is the relationship between them: a
 * school that joins late still starts the curriculum at the beginning.
 *
 * Schools here are onboarded termly, so this sentence is read most often by
 * whoever is settling a school that arrived mid-year, and it needs to answer
 * their actual question: are these children starting from scratch or picking up
 * partway through?
 */
export function humanDeliveryStart(input: {
  entryTerm: number | string | null | undefined;
  entryWeek: number | string | null | undefined;
  curriculumYear?: number | string | null;
  curriculumTerm?: number | string | null;
  curriculumWeek?: number | string | null;
}): string {
  const entryTerm = countOrNull(input.entryTerm);
  const entryWeek = countOrNull(input.entryWeek);
  if (entryTerm === null || entryWeek === null) {
    return 'Start point not set';
  }
  const begins = `Begins ${humanTermLabel(entryTerm)}, Week ${entryWeek}`;

  // An unset curriculum position is not the same as position one. Saying
  // "starting from the beginning" when nobody recorded a start point would be
  // reassuring and wrong — the entry alone is the honest answer.
  const year = countOrNull(input.curriculumYear);
  const term = countOrNull(input.curriculumTerm);
  const week = countOrNull(input.curriculumWeek);
  if (year === null || term === null || week === null) return begins;

  // The common case for a school joining mid-year, and the reassuring one:
  // nothing has been skipped.
  if (year === 1 && term === 1 && week === 1) {
    return `${begins} — starting the curriculum from the beginning`;
  }
  return `${begins} — picking up the curriculum at ${humanProgrammeYear(year)}, ${humanTermLabel(term)}, Week ${week}`;
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

