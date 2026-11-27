export interface RawTermCalendarEntry {
  start?: string | null;
  end?: string | null;
}

export type NormalizedTermCalendar = Record<
  '1' | '2' | '3',
  { start: string; end: string }
>;

export interface CanonicalAcademicTermRow {
  academic_year?: string | null;
  term_number?: number | null;
  term_label?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  is_current?: boolean | null;
}

export interface SchoolDeliveryTiming {
  entryTerm?: number | null;
  entryWeek?: number | null;
  programmeYear?: number | null;
  programmeTerm?: number | null;
  programmeWeek?: number | null;
  sessionsPerWeek?: number | null;
  pacingMode?: string | null;
  source?: 'class_schedule' | 'school_schedule' | 'curriculum_metadata' | 'default';
}

export interface AlignableWeek {
  week: number;
  type?: 'lesson' | 'assessment' | 'examination' | string;
  topic: string;
  subtopics?: string[];
  lesson_plan?: {
    duration_minutes?: number;
    objectives?: string[];
    teacher_activities?: string[];
    student_activities?: string[];
    classwork?: { title?: string; instructions?: string; materials?: string[] } | null;
    assignment?: { title?: string; instructions?: string; due?: string } | null;
    project?: { title?: string; description?: string; deliverables?: string[] } | null;
    resources?: string[];
    engagement_tips?: string[];
  } | null;
  assessment_plan?: {
    type?: string;
    title?: string;
    coverage?: string[];
    format?: string;
    duration_minutes?: number;
    scoring_guide?: string;
    teacher_prep?: string[];
    sample_questions?: string[];
  } | null;
}

export interface AlignableTerm {
  year?: number;
  term: number;
  title?: string;
  objectives?: string[];
  start_date?: string;
  weeks?: AlignableWeek[];
}

export interface AlignableCurriculumContent {
  course_title?: string;
  overview?: string;
  learning_outcomes?: string[];
  terms?: AlignableTerm[];
  assessment_strategy?: string;
  materials_required?: string[];
  recommended_tools?: string[];
  description?: string | null;
  metadata?: {
    format?: string;
    program_start_term?: number;
    [key: string]: unknown;
  };
}

export interface AlignedCurriculumWeek {
  week: number;
  calendarWeek: number;
  type: 'lesson' | 'assessment' | 'examination';
  topic: string;
  subtopics: string[];
  startDateIso: string | null;
  endDateIso: string | null;
  dateRangeLabel: string | null;
  timelineState: 'past' | 'current' | 'upcoming';
  hasPlan: boolean;
  lessonPlan: AlignableWeek['lesson_plan'];
  assessmentPlan: AlignableWeek['assessment_plan'];
}

export interface AlignedCurriculumTerm {
  key: string;
  programmeYear: number;
  programmeTerm: number;
  programmeTheme: string;
  storedTermNumber: number;
  nationalTerm: number;
  nationalTermLabel: string;
  academicSession: string;
  title: string;
  objectives: string[];
  startDateIso: string | null;
  endDateIso: string | null;
  dateRangeLabel: string | null;
  isCurrentTerm: boolean;
  weeks: AlignedCurriculumWeek[];
}

export interface AlignedCurriculumRoadmap {
  format: 'school' | 'bootcamp' | 'online' | 'selfpaced';
  isCohortFormat: boolean;
  baseAcademicSession: string;
  entryTerm: number;
  entryWeek: number;
  sessionsPerWeek: number;
  pacingMode: string;
  timingSource: NonNullable<SchoolDeliveryTiming['source']>;
  years: number[];
  totalTerms: number;
  totalWeeks: number;
  plannedWeeks: number;
  terms: AlignedCurriculumTerm[];
  currentFocus: {
    programmeYear: number;
    programmeTerm: number;
    storedTermNumber: number;
    nationalTerm: number;
    nationalTermLabel: string;
    academicSession: string;
    week: number;
    calendarWeek: number;
    topic: string;
    dateRangeLabel: string | null;
  } | null;
}

const NG_TERM_LABELS: Record<number, string> = {
  1: 'First Term',
  2: 'Second Term',
  3: 'Third Term',
};

const PROGRAMME_THEMES: Record<number, string> = {
  1: 'Foundations',
  2: 'Application',
  3: 'Innovation',
};

function parseSessionYears(academicSession: string): [number, number] | null {
  const match = String(academicSession ?? '')
    .trim()
    .match(/^(\d{4})\s*[/-]\s*(\d{4})$/);
  if (!match) return null;
  const startY = Number(match[1]);
  const endY = Number(match[2]);
  if (!Number.isFinite(startY) || !Number.isFinite(endY)) return null;
  return [startY, endY];
}

export function shiftAcademicSession(academicSession: string, yearDelta: number): string {
  const parsed = parseSessionYears(academicSession);
  if (!parsed) return academicSession;
  const delta = Number.isFinite(yearDelta) ? Math.trunc(yearDelta) : 0;
  return `${parsed[0] + delta}/${parsed[1] + delta}`;
}

export function defaultNigerianTermDates(
  termNumber: number,
  academicSession: string,
): { start: string; end: string } | null {
  const parsed = parseSessionYears(academicSession);
  if (!parsed) return null;
  const [startY, endY] = parsed;
  if (termNumber === 1) return { start: `${startY}-09-01`, end: `${startY}-12-15` };
  if (termNumber === 2) return { start: `${endY}-01-10`, end: `${endY}-04-10` };
  if (termNumber === 3) return { start: `${endY}-05-01`, end: `${endY}-07-25` };
  return null;
}

/**
 * Normalizes both `app_settings` shapes:
 *   - `{ term1: { start, end }, term2: { start, end }, term3: { start, end } }`
 *   - `{ "1": { start, end }, "2": { start, end }, "3": { start, end } }`
 */
export function normalizeSchoolTermCalendar(
  raw: Record<string, unknown> | null | undefined,
): Partial<NormalizedTermCalendar> | null {
  if (!raw || typeof raw !== 'object') return null;
  const out: Partial<NormalizedTermCalendar> = {};
  for (const n of [1, 2, 3] as const) {
    const keyNum = String(n) as '1' | '2' | '3';
    const candidate = (raw[keyNum] ?? raw[`term${n}`]) as RawTermCalendarEntry | undefined;
    if (candidate && typeof candidate === 'object') {
      const start = typeof candidate.start === 'string' ? candidate.start.slice(0, 10).trim() : '';
      const end = typeof candidate.end === 'string' ? candidate.end.slice(0, 10).trim() : '';
      if (start || end) {
        out[keyNum] = { start, end };
      }
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}

function parseIsoDateUtc(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const clean = String(iso).trim().slice(0, 10);
  const match = clean.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const dt = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function toIsoDateUtc(dt: Date): string {
  return dt.toISOString().slice(0, 10);
}

function formatShortDateUtc(iso: string | null | undefined, includeYear = false): string {
  const dt = parseIsoDateUtc(iso);
  if (!dt) return '';
  return dt.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    ...(includeYear ? { year: 'numeric' } : {}),
    timeZone: 'UTC',
  });
}

function shiftIsoYearIfDifferentSession(
  savedIso: string,
  baseAcademicSession: string,
  targetAcademicSession: string,
): string {
  if (!savedIso || baseAcademicSession === targetAcademicSession) return savedIso;
  const baseYears = parseSessionYears(baseAcademicSession);
  const targetYears = parseSessionYears(targetAcademicSession);
  const dt = parseIsoDateUtc(savedIso);
  if (!baseYears || !targetYears || !dt) return savedIso;
  const yearDelta = targetYears[0] - baseYears[0];
  if (yearDelta === 0) return savedIso;
  const shifted = new Date(
    Date.UTC(dt.getUTCFullYear() + yearDelta, dt.getUTCMonth(), dt.getUTCDate()),
  );
  return toIsoDateUtc(shifted);
}

/**
 * Resolves exact start/end ISO dates for a school's national term in a given session.
 * Priority:
 *   1. Explicit `customStartDate` on the curriculum term (when in base session)
 *   2. School or platform `termCalendar` (`term1`/`"1"`, shifted cleanly for future years)
 *   3. Canonical `academic_terms` row matching `(targetSession, termNumber)`
 *   4. Standard Nigerian school calendar (`Sept 1–Dec 15`, `Jan 10–Apr 10`, `May 1–Jul 25`)
 */
export function resolveSchoolTermDates(input: {
  termNumber: number;
  academicSession: string;
  baseAcademicSession?: string;
  termCalendar?: Record<string, unknown> | null;
  academicTerms?: CanonicalAcademicTermRow[] | null;
  customStartDate?: string | null;
}): { start: string; end: string } | null {
  const termNum = [1, 2, 3].includes(Number(input.termNumber)) ? Number(input.termNumber) : 1;
  const baseSession = input.baseAcademicSession || input.academicSession;
  const ng = defaultNigerianTermDates(termNum, input.academicSession);
  const normalizedCal = normalizeSchoolTermCalendar(input.termCalendar);
  const calEntry = normalizedCal?.[String(termNum) as '1' | '2' | '3'];

  const canonicalRow = (input.academicTerms ?? []).find(
    (row) =>
      String(row.academic_year ?? '').trim() === input.academicSession &&
      Number(row.term_number ?? 0) === termNum,
  );

  const calStart = calEntry?.start
    ? shiftIsoYearIfDifferentSession(calEntry.start, baseSession, input.academicSession)
    : '';
  const calEnd = calEntry?.end
    ? shiftIsoYearIfDifferentSession(calEntry.end, baseSession, input.academicSession)
    : '';

  const customStart = input.customStartDate
    ? shiftIsoYearIfDifferentSession(
        String(input.customStartDate).slice(0, 10),
        baseSession,
        input.academicSession,
      )
    : '';

  const start =
    customStart ||
    calStart ||
    (canonicalRow?.start_date ? String(canonicalRow.start_date).slice(0, 10) : '') ||
    ng?.start ||
    '';
  const end =
    calEnd ||
    (canonicalRow?.end_date ? String(canonicalRow.end_date).slice(0, 10) : '') ||
    ng?.end ||
    '';

  if (!start) return null;
  return { start, end };
}

export function firstTeachingMondayUtc(termStartIso: string): Date | null {
  const start = parseIsoDateUtc(termStartIso);
  if (!start) return null;
  const day = start.getUTCDay();
  const toMon = day === 0 ? 1 : day === 1 ? 0 : 8 - day;
  const mon = new Date(start);
  mon.setUTCDate(start.getUTCDate() + toMon);
  return mon;
}

export function resolveSchoolWeekDateRange(input: {
  termStartIso: string | null | undefined;
  calendarWeekNumber: number;
}): { startIso: string; endIso: string; label: string } | null {
  if (!input.termStartIso) return null;
  const week1Mon = firstTeachingMondayUtc(input.termStartIso);
  if (!week1Mon) return null;
  const weekIndex = Math.max(1, Math.trunc(input.calendarWeekNumber)) - 1;
  const mon = new Date(week1Mon);
  mon.setUTCDate(week1Mon.getUTCDate() + weekIndex * 7);
  const fri = new Date(mon);
  fri.setUTCDate(mon.getUTCDate() + 4);
  const startIso = toIsoDateUtc(mon);
  const endIso = toIsoDateUtc(fri);
  return {
    startIso,
    endIso,
    label: `${formatShortDateUtc(startIso)} – ${formatShortDateUtc(endIso)}`,
  };
}

export function lagosTodayIso(now = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });
}

function normalizeWeekType(raw?: string): 'lesson' | 'assessment' | 'examination' {
  if (raw === 'assessment' || raw === 'examination') return raw;
  return 'lesson';
}

/**
 * Projects the ENTIRE curriculum (all years, all terms, all weeks) onto a
 * specific school's calendar and programme entry schedule.
 */
export function alignCurriculumToSchoolCalendar(input: {
  content: AlignableCurriculumContent | null | undefined;
  academicSession: string;
  termCalendar?: Record<string, unknown> | null;
  academicTerms?: CanonicalAcademicTermRow[] | null;
  schedule?: SchoolDeliveryTiming | null;
  todayIso?: string;
}): AlignedCurriculumRoadmap {
  const content = input.content ?? {};
  const rawFormat = String(content.metadata?.format ?? 'school').toLowerCase();
  const format = (
    ['school', 'bootcamp', 'online', 'selfpaced'].includes(rawFormat) ? rawFormat : 'school'
  ) as AlignedCurriculumRoadmap['format'];
  const isCohortFormat = format !== 'school';

  const metaPst = Number(content.metadata?.program_start_term ?? 1);
  const safeMetaPst = [1, 2, 3].includes(metaPst) ? metaPst : 1;
  const schedEntryTerm = Number(input.schedule?.entryTerm ?? 0);
  const entryTerm = [1, 2, 3].includes(schedEntryTerm) ? schedEntryTerm : safeMetaPst;
  const entryWeek = Math.max(1, Math.min(20, Math.trunc(Number(input.schedule?.entryWeek ?? 1) || 1)));
  const sessionsPerWeek = Math.max(1, Math.trunc(Number(input.schedule?.sessionsPerWeek ?? 1) || 1));
  const pacingMode = String(input.schedule?.pacingMode || 'standard');
  const timingSource: NonNullable<SchoolDeliveryTiming['source']> =
    input.schedule?.source ??
    (schedEntryTerm >= 1 && schedEntryTerm <= 3
      ? 'school_schedule'
      : safeMetaPst !== 1
        ? 'curriculum_metadata'
        : 'default');

  const today = input.todayIso || lagosTodayIso();
  const rawTerms = Array.isArray(content.terms) ? content.terms : [];

  const years = Array.from(
    new Set(rawTerms.map((t) => Math.max(1, Math.trunc(Number(t.year ?? 1) || 1)))),
  ).sort((a, b) => a - b);

  const alignedTerms: AlignedCurriculumTerm[] = [];
  let currentFocus: AlignedCurriculumRoadmap['currentFocus'] = null;
  let totalWeeks = 0;
  let plannedWeeks = 0;

  if (isCohortFormat) {
    const sortedCohortTerms = [...rawTerms].sort((a, b) => {
      const ya = Number(a.year ?? 1);
      const yb = Number(b.year ?? 1);
      if (ya !== yb) return ya - yb;
      return Number(a.term ?? 1) - Number(b.term ?? 1);
    });

    const unitNoun = format === 'bootcamp' ? 'Week' : 'Module';
    sortedCohortTerms.forEach((term, idx) => {
      const programmeYear = Math.max(1, Math.trunc(Number(term.year ?? 1) || 1));
      const storedTermNumber = Number(term.term ?? idx + 1);
      const sortedWeeks = [...(term.weeks ?? [])].sort((a, b) => a.week - b.week);
      const weeks: AlignedCurriculumWeek[] = sortedWeeks.map((w) => {
        const hasPlan = Boolean(w.lesson_plan || w.assessment_plan);
        totalWeeks += 1;
        if (hasPlan) plannedWeeks += 1;
        return {
          week: w.week,
          calendarWeek: w.week,
          type: normalizeWeekType(w.type),
          topic: w.topic || `Session ${w.week}`,
          subtopics: Array.isArray(w.subtopics) ? w.subtopics : [],
          startDateIso: null,
          endDateIso: null,
          dateRangeLabel: null,
          timelineState: 'upcoming',
          hasPlan,
          lessonPlan: w.lesson_plan ?? null,
          assessmentPlan: w.assessment_plan ?? null,
        };
      });

      alignedTerms.push({
        key: `y${programmeYear}-m${storedTermNumber}`,
        programmeYear,
        programmeTerm: idx + 1,
        programmeTheme: '',
        storedTermNumber,
        nationalTerm: storedTermNumber,
        nationalTermLabel: `${unitNoun} ${storedTermNumber}`,
        academicSession: input.academicSession,
        title: term.title?.trim() || `${unitNoun} ${storedTermNumber}`,
        objectives: Array.isArray(term.objectives) ? term.objectives : [],
        startDateIso: null,
        endDateIso: null,
        dateRangeLabel: null,
        isCurrentTerm: idx === 0,
        weeks,
      });
    });
  } else {
    // School termly format: align every Year & Term to the school's real national
    // calendar sequence starting from `entryTerm` in `baseAcademicSession`.
    for (const yr of years) {
      const yearIndex = yr - (years[0] ?? 1);
      const termsInYear = rawTerms
        .filter((t) => Math.max(1, Math.trunc(Number(t.year ?? 1) || 1)) === yr)
        .sort((a, b) => {
          // Order terms within the programme year by their offset from the curriculum's
          // stored start term (`safeMetaPst`), so Foundations → Application → Innovation
          // always stays in true learning sequence!
          const progA = ((Number(a.term ?? 1) - safeMetaPst + 3) % 3) + 1;
          const progB = ((Number(b.term ?? 1) - safeMetaPst + 3) % 3) + 1;
          return progA - progB;
        });

      termsInYear.forEach((term, idxInYear) => {
        const storedTermNumber = Number(term.term ?? idxInYear + 1);
        const programmeTerm = ((storedTermNumber - safeMetaPst + 3) % 3) + 1;
        // Map programmeTerm (1, 2, 3) onto the school's actual entryTerm:
        // e.g. if school starts in Term 3 (May), Programme Term 1 = National Term 3 (session +0),
        // Programme Term 2 = National Term 1 (session +1), Programme Term 3 = National Term 2 (session +1).
        const zeroBasedCalendarStep = yearIndex * 3 + (programmeTerm - 1);
        const rawNational = entryTerm - 1 + zeroBasedCalendarStep;
        const nationalTerm = (rawNational % 3) + 1;
        const sessionYearOffset = Math.floor(rawNational / 3);
        const termAcademicSession = shiftAcademicSession(
          input.academicSession,
          sessionYearOffset,
        );

        const resolvedDates = resolveSchoolTermDates({
          termNumber: nationalTerm,
          academicSession: termAcademicSession,
          baseAcademicSession: input.academicSession,
          termCalendar: input.termCalendar,
          academicTerms: input.academicTerms,
          customStartDate: term.start_date ?? null,
        });

        const termStartIso = resolvedDates?.start ?? null;
        const termEndIso = resolvedDates?.end || null;
        const termDateRangeLabel = termStartIso
          ? `${formatShortDateUtc(termStartIso, true)}${
              termEndIso ? ` – ${formatShortDateUtc(termEndIso, true)}` : ''
            }`
          : null;

        const isFirstEntryTerm = yearIndex === 0 && programmeTerm === 1;
        const weekShift = isFirstEntryTerm ? entryWeek - 1 : 0;

        const sortedWeeks = [...(term.weeks ?? [])].sort((a, b) => a.week - b.week);
        let termContainsToday = false;
        if (termStartIso && termEndIso && today >= termStartIso && today <= termEndIso) {
          termContainsToday = true;
        }

        const weeks: AlignedCurriculumWeek[] = sortedWeeks.map((w, weekIdx) => {
          // Use ordinal position (weekIdx + 1) when week numbers restart per term, or w.week
          const localWeekOrdinal = w.week >= 1 && w.week <= 20 ? w.week : weekIdx + 1;
          const calendarWeek = localWeekOrdinal + weekShift;
          const span = resolveSchoolWeekDateRange({
            termStartIso,
            calendarWeekNumber: calendarWeek,
          });
          // Widen check to Sunday (`endIso + 2 days`) so weekend study still highlights current week
          let timelineState: 'past' | 'current' | 'upcoming' = 'upcoming';
          if (span) {
            const sun = parseIsoDateUtc(span.startIso);
            let sunIso = span.endIso;
            if (sun) {
              sun.setUTCDate(sun.getUTCDate() + 6);
              sunIso = toIsoDateUtc(sun);
            }
            if (today >= span.startIso && today <= sunIso) {
              timelineState = 'current';
              termContainsToday = true;
            } else if (today > sunIso) {
              timelineState = 'past';
            }
          }

          const hasPlan = Boolean(w.lesson_plan || w.assessment_plan);
          totalWeeks += 1;
          if (hasPlan) plannedWeeks += 1;

          const alignedWeek: AlignedCurriculumWeek = {
            week: w.week,
            calendarWeek,
            type: normalizeWeekType(w.type),
            topic: w.topic || `Week ${w.week}`,
            subtopics: Array.isArray(w.subtopics) ? w.subtopics : [],
            startDateIso: span?.startIso ?? null,
            endDateIso: span?.endIso ?? null,
            dateRangeLabel: span?.label ?? null,
            timelineState,
            hasPlan,
            lessonPlan: w.lesson_plan ?? null,
            assessmentPlan: w.assessment_plan ?? null,
          };

          if (timelineState === 'current' && !currentFocus) {
            currentFocus = {
              programmeYear: yr,
              programmeTerm,
              storedTermNumber,
              nationalTerm,
              nationalTermLabel: NG_TERM_LABELS[nationalTerm] ?? `Term ${nationalTerm}`,
              academicSession: termAcademicSession,
              week: w.week,
              calendarWeek,
              topic: alignedWeek.topic,
              dateRangeLabel: alignedWeek.dateRangeLabel,
            };
          }

          return alignedWeek;
        });

        alignedTerms.push({
          key: `y${yr}-t${storedTermNumber}-nt${nationalTerm}`,
          programmeYear: yr,
          programmeTerm,
          programmeTheme: PROGRAMME_THEMES[programmeTerm] ?? '',
          storedTermNumber,
          nationalTerm,
          nationalTermLabel: NG_TERM_LABELS[nationalTerm] ?? `Term ${nationalTerm}`,
          academicSession: termAcademicSession,
          title: term.title?.trim() || `${NG_TERM_LABELS[nationalTerm] ?? `Term ${nationalTerm}`}`,
          objectives: Array.isArray(term.objectives) ? term.objectives : [],
          startDateIso: termStartIso,
          endDateIso: termEndIso,
          dateRangeLabel: termDateRangeLabel,
          isCurrentTerm: termContainsToday,
          weeks,
        });
      });
    }
  }

  return {
    format,
    isCohortFormat,
    baseAcademicSession: input.academicSession,
    entryTerm,
    entryWeek,
    sessionsPerWeek,
    pacingMode,
    timingSource,
    years,
    totalTerms: alignedTerms.length,
    totalWeeks,
    plannedWeeks,
    terms: alignedTerms,
    currentFocus,
  };
}

/**
 * Strips staff-only teaching/marking notes (`teacher_activities`, `engagement_tips`,
 * `scoring_guide`, `teacher_prep`, `sample_questions`) while preserving the FULL
 * multi-year, multi-term, multi-week curriculum scope for students and parents.
 */
export function sanitizeCurriculumForLearner<T extends Record<string, any>>(
  content: T | null | undefined,
): T | null | undefined {
  if (!content || typeof content !== 'object') return content;
  const terms = Array.isArray(content.terms)
    ? content.terms.map((term: any) => ({
        ...term,
        weeks: Array.isArray(term?.weeks)
          ? term.weeks.map((week: any) => {
              const nextWeek = { ...week };
              if (nextWeek.lesson_plan && typeof nextWeek.lesson_plan === 'object') {
                const {
                  teacher_activities: _ta,
                  engagement_tips: _et,
                  ...safeLessonPlan
                } = nextWeek.lesson_plan;
                nextWeek.lesson_plan = safeLessonPlan;
              }
              if (nextWeek.assessment_plan && typeof nextWeek.assessment_plan === 'object') {
                const {
                  scoring_guide: _sg,
                  teacher_prep: _tp,
                  sample_questions: _sq,
                  ...safeAssessmentPlan
                } = nextWeek.assessment_plan;
                nextWeek.assessment_plan = safeAssessmentPlan;
              }
              return nextWeek;
            })
          : [],
      }))
    : content.terms;

  return {
    ...content,
    terms,
  };
}
