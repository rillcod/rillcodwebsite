import type { SupabaseClient } from '@supabase/supabase-js';
import { DEFAULT_SCHOOL_REPORT_POLICY, schoolReportPhaseLabel, type SchoolReportPolicy } from './report-policy';
import {
  loadSchoolProgrammeScope,
  normalizeProgrammeLabel,
  programmeCourseKey,
  resolveDeliveryCoursesForReport,
  scopeCurriculaForReport,
  type DeliveryCourseRef,
} from './school-curriculum-scope';
import { mergeProgrammeCoursePerformanceWithEnrolment } from './programme-course-performance';
import {
  buildTopicsCoveredPresentation,
  syntheticWeekTopicLabel,
} from './topics-covered-presentation';
import type { SchoolRosterRow } from './loaders/roster';
import type { SchoolReportSnapshot } from './types';

export type DeliveryTopicOption = {
  key: string;
  curriculumId: string;
  programme: string;
  course: string;
  termNumber: number;
  weekNumber: number;
  topic: string;
  weekType?: string;
};

export type DeliveryWeekSpan = {
  week: number;
  label: string;
  topics: string[];
  programme: string;
  course: string;
};

export type DeliveryCheckpoint = {
  programme: string;
  course: string;
  topic: string;
  termNumber: number;
  weekNumber: number;
  academicYear?: string;
  termLabel?: string;
};

export type DeliveryDeclaration = {
  reportingWeeks: number;
  /** First week in the report delivery window (for span follow-up). */
  rangeStartWeek?: number;
  /** Weeks reached in the window from span distribution (backend judgment basis). */
  pacingDepth?: number;
  selectedTopicKeys: string[];
  selectedTopics: Array<Pick<DeliveryTopicOption, 'key' | 'programme' | 'course' | 'topic' | 'weekNumber'>>;
  spannedWeeks: DeliveryWeekSpan[];
  programmeCoverage?: Array<{
    programme: string;
    selectedTopics: number;
    plannedTopics: number;
    coverage: number;
  }>;
  nextTermCheckpoint: DeliveryCheckpoint | null;
  updatedAt: string;
  /** Staff explicitly applied topics — auto-refresh must not replace this. */
  manualOverride?: boolean;
  /** System auto-filled delivery (tracking or full catalog). */
  autoApplied?: boolean;
  autoSource?: 'tracking' | 'catalog';
};

export function nigeriaTechPhaseLabel(
  termNumber: number,
  policy: SchoolReportPolicy = DEFAULT_SCHOOL_REPORT_POLICY,
  programme?: string,
): string {
  return schoolReportPhaseLabel(policy, termNumber, programme);
}

/** Partner schools pick a term delivery window — 8, 10, or 14 weeks. */
export const REPORT_WINDOW_WEEK_OPTIONS = [8, 10, 14] as const;
export type ReportWindowWeekPreset = (typeof REPORT_WINDOW_WEEK_OPTIONS)[number];

export function normalizeReportingWeeks(weeks: number): ReportWindowWeekPreset {
  const value = Math.max(1, Math.trunc(Number(weeks) || 1));
  let best: ReportWindowWeekPreset = REPORT_WINDOW_WEEK_OPTIONS[0];
  let bestDistance = Math.abs(best - value);
  for (const option of REPORT_WINDOW_WEEK_OPTIONS) {
    const distance = Math.abs(option - value);
    if (distance < bestDistance || (distance === bestDistance && option > best)) {
      best = option;
      bestDistance = distance;
    }
  }
  return best;
}

export function endWeekForReportWindow(startWeek: number, windowWeeks: ReportWindowWeekPreset): number {
  const start = Math.max(1, Math.trunc(Number(startWeek) || 1));
  return start + windowWeeks - 1;
}

export function reportWindowWeeksFromRange(range: {
  startTerm: number;
  startWeek: number;
  endTerm: number;
  endWeek: number;
}): number {
  return reportingWeekCount({
    startTerm: range.startTerm,
    startWeek: range.startWeek,
    endTerm: range.endTerm,
    endWeek: range.endWeek,
  });
}

/** Weeks in the report delivery window (same-term range). */
export function reportingWeekCount(input: {
  startTerm: number;
  startWeek: number;
  endTerm: number;
  endWeek: number;
  termWeekCounts?: Record<number, number>;
}): number {
  let count = 1;
  if (input.startTerm === input.endTerm) {
    count = Math.max(1, input.endWeek - input.startWeek + 1);
  } else {
    const startTermWeeks = input.termWeekCounts?.[input.startTerm];
    const startSegment = startTermWeeks
      ? Math.max(1, startTermWeeks - input.startWeek + 1)
      : 1;
    let middleWeeks = 0;
    for (let term = input.startTerm + 1; term < input.endTerm; term += 1) {
      middleWeeks += Math.max(0, input.termWeekCounts?.[term] || 0);
    }
    count = Math.max(1, startSegment + middleWeeks + input.endWeek);
  }
  return normalizeReportingWeeks(count);
}

export function reportWeekNumbers(startWeek: number, endWeek: number): number[] {
  const start = Math.max(1, Math.trunc(Number(startWeek) || 1));
  const end = Math.max(start, Math.trunc(Number(endWeek) || start));
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

export function topicInReportRange(
  termNumber: number,
  weekNumber: number,
  range: { startTerm: number; startWeek: number; endTerm: number; endWeek: number },
): boolean {
  const point = termNumber * 100 + weekNumber;
  return point >= range.startTerm * 100 + range.startWeek && point <= range.endTerm * 100 + range.endWeek;
}

function preferredTermNumbers(
  academicTermNumber: number,
  range: { startTerm: number; endTerm: number },
): number[] {
  return [...new Set([academicTermNumber, range.startTerm, range.endTerm].filter((term) => term > 0))];
}

function collectTopicsFromCurricula(
  curricula: Array<{
    id: string;
    content: unknown;
    courses?:
      | { title?: string; programs?: { name?: string } | Array<{ name?: string }> }
      | Array<{ title?: string; programs?: { name?: string } | Array<{ name?: string }> }>
      | null;
  }>,
  range: { startTerm: number; startWeek: number; endTerm: number; endWeek: number },
  termFilter: number[] | 'any',
): DeliveryTopicOption[] {
  const options: DeliveryTopicOption[] = [];
  for (const row of curricula) {
    const content = row.content && typeof row.content === 'object' ? (row.content as Record<string, unknown>) : {};
    const terms = Array.isArray(content.terms) ? content.terms : [];
    const courseRel = Array.isArray(row.courses) ? row.courses[0] : row.courses;
    const programmeRel = Array.isArray(courseRel?.programs) ? courseRel.programs[0] : courseRel?.programs;
    const programme = String(programmeRel?.name || 'Programme');
    const course = String(courseRel?.title || 'Course');

    for (const term of terms) {
      const termNumber = Number((term as any).term ?? (term as any).term_number ?? (term as any).national_term ?? 0);
      if (termFilter !== 'any' && !termFilter.includes(termNumber)) continue;
      const weeks = Array.isArray((term as any).weeks) ? (term as any).weeks : [];
      for (const week of weeks) {
        const weekNumber = Number(week.week ?? week.week_number ?? 0);
        const topic = String(week.topic || '').trim();
        if (!topic || weekNumber <= 0) continue;
        if (!topicInReportRange(termNumber, weekNumber, range)) continue;
        options.push({
          key: `${row.id}::${termNumber}::${weekNumber}`,
          curriculumId: row.id,
          programme,
          course,
          termNumber,
          weekNumber,
          topic,
          weekType: week.type ? String(week.type) : undefined,
        });
      }
    }
  }
  return options;
}

/** Pull tickable topics from school syllabi — report delivery only, no week tracking. */
export function extractDeliveryTopicCatalog(
  curricula: Array<{
    id: string;
    content: unknown;
    courses?:
      | { title?: string; programs?: { name?: string } | Array<{ name?: string }> }
      | Array<{ title?: string; programs?: { name?: string } | Array<{ name?: string }> }>
      | null;
  }>,
  academicTermNumber: number,
  range: { startTerm: number; startWeek: number; endTerm: number; endWeek: number },
): DeliveryTopicOption[] {
  const preferredTerms = preferredTermNumbers(academicTermNumber, range);
  let options = collectTopicsFromCurricula(curricula, range, preferredTerms);
  if (!options.length) {
    options = collectTopicsFromCurricula(curricula, range, 'any');
  }
  return options.sort(
    (a, b) =>
      a.programme.localeCompare(b.programme) ||
      a.course.localeCompare(b.course) ||
      a.weekNumber - b.weekNumber,
  );
}

/** In-memory checklist when syllabi exist but term/week metadata does not line up yet. */
export function buildSyntheticDeliveryCatalog(
  courses: Array<{ id: string; title: string; programme: string }>,
  range: { startTerm: number; startWeek: number; endTerm: number; endWeek: number },
  academicTermNumber: number,
): DeliveryTopicOption[] {
  const termNumber = range.startTerm || academicTermNumber || 1;
  const windowWeeks = reportingWeekCount(range);
  const startWeek = Math.max(1, range.startWeek);
  const endWeek = endWeekForReportWindow(startWeek, normalizeReportingWeeks(windowWeeks));
  const weeks = reportWeekNumbers(startWeek, endWeek);
  const options: DeliveryTopicOption[] = [];

  for (const course of courses) {
    for (const weekNumber of weeks) {
      const topic = syntheticWeekTopicLabel(course.title, weekNumber);
      options.push({
        key: `synthetic::${course.id}::${termNumber}::${weekNumber}`,
        curriculumId: `synthetic::${course.id}`,
        programme: course.programme,
        course: course.title,
        termNumber,
        weekNumber,
        topic,
        weekType: weekNumber % 3 === 0 ? 'assessment' : 'lesson',
      });
    }
  }

  return options.sort(
    (a, b) =>
      a.programme.localeCompare(b.programme) ||
      a.course.localeCompare(b.course) ||
      a.weekNumber - b.weekNumber,
  );
}

/** Add generated week topics for enrolled courses missing from the syllabus catalog. */
export function supplementDeliveryCatalogForMissingCourses(
  catalog: DeliveryTopicOption[],
  resolvedCourses: Array<{ id: string; title: string; programme: string }>,
  range: { startTerm: number; startWeek: number; endTerm: number; endWeek: number },
  academicTermNumber: number,
): DeliveryTopicOption[] {
  if (!resolvedCourses.length) return catalog;

  const coveredKeys = new Set(
    catalog.map((row) => programmeCourseKey(normalizeProgrammeLabel(row.programme), row.course)),
  );
  const missingCourses = resolvedCourses.filter(
    (course) => !coveredKeys.has(programmeCourseKey(normalizeProgrammeLabel(course.programme), course.title)),
  );
  if (!missingCourses.length) return catalog;

  const synthetic = buildSyntheticDeliveryCatalog(missingCourses, range, academicTermNumber);
  return [...catalog, ...synthetic].sort(
    (a, b) =>
      a.programme.localeCompare(b.programme) ||
      a.course.localeCompare(b.course) ||
      a.weekNumber - b.weekNumber,
  );
}

type AnyClient = SupabaseClient<any>;

/** School-owned and platform-wide syllabi visible for delivery declaration. */
export async function loadSchoolDeliveryCurricula(
  admin: AnyClient,
  schoolId: string,
  opts?: {
    studentRows?: SchoolRosterRow[];
    resolvedCourseIds?: string[];
  },
) {
  let studentRows = opts?.studentRows;
  if (!studentRows) {
    const { data: students } = await admin
      .from('portal_users')
      .select('id, class_id, grade, section_class')
      .eq('role', 'student')
      .eq('school_id', schoolId)
      .eq('is_active', true)
      .or('is_deleted.is.null,is_deleted.eq.false')
      .limit(5000);
    studentRows = (students ?? []) as SchoolRosterRow[];
  }
  const schoolScope = await loadSchoolProgrammeScope(admin, schoolId, studentRows);
  const { data: curricula } = await admin
    .from('course_curricula')
    .select('id, content, school_id, course_id, courses(title, is_active, programs(name))')
    .or(`school_id.eq.${schoolId},school_id.is.null`)
    .eq('is_visible_to_school', true)
    .limit(1000);
  return scopeCurriculaForReport(
    (curricula ?? []) as any[],
    schoolId,
    schoolScope,
    opts?.resolvedCourseIds || [],
  );
}

type DeliveryCatalogSnapshot = Partial<
  Pick<SchoolReportSnapshot, 'programmeCoursePerformance' | 'curriculum' | 'schoolProgrammes'>
>;

/** Resolve courses and build the tickable delivery catalog for a report window. */
export async function loadDeliveryTopicCatalogForReport(
  admin: AnyClient,
  input: {
    schoolId: string;
    snapshot?: DeliveryCatalogSnapshot | null;
    academicTermNumber: number;
    range: { startTerm: number; startWeek: number; endTerm: number; endWeek: number };
    studentRows?: SchoolRosterRow[];
  },
): Promise<{ catalog: DeliveryTopicOption[]; resolvedCourses: DeliveryCourseRef[] }> {
  let studentRows = input.studentRows;
  if (!studentRows) {
    const { data: students } = await admin
      .from('portal_users')
      .select('id, class_id, grade, section_class')
      .eq('role', 'student')
      .eq('school_id', input.schoolId)
      .eq('is_active', true)
      .or('is_deleted.is.null,is_deleted.eq.false')
      .limit(5000);
    studentRows = (students ?? []) as SchoolRosterRow[];
  }

  const resolvedCourses = await resolveDeliveryCoursesForReport(
    admin,
    input.schoolId,
    studentRows,
    input.snapshot,
  );
  const resolvedCourseIds = resolvedCourses.map((course) => course.id);
  const curricula = await loadSchoolDeliveryCurricula(admin, input.schoolId, {
    studentRows,
    resolvedCourseIds,
  });
  let catalog = extractDeliveryTopicCatalog(curricula, input.academicTermNumber, input.range);
  catalog = supplementDeliveryCatalogForMissingCourses(
    catalog,
    resolvedCourses,
    input.range,
    input.academicTermNumber,
  );
  if (!catalog.length && resolvedCourses.length) {
    catalog = buildSyntheticDeliveryCatalog(resolvedCourses, input.range, input.academicTermNumber);
  }
  return { catalog, resolvedCourses };
}

/** Spread selected topics evenly across the report week window for narrative/PDF. */
export function spanTopicsAcrossWeeks(
  selected: DeliveryTopicOption[],
  reportingWeeks: number,
  rangeStartWeek = 1,
): DeliveryWeekSpan[] {
  if (!selected.length || reportingWeeks <= 0) return [];
  const count = selected.length;
  const weeks: DeliveryWeekSpan[] = Array.from({ length: reportingWeeks }, (_, index) => ({
    week: rangeStartWeek + index,
    label: `Week ${rangeStartWeek + index}`,
    topics: [],
    programme: '',
    course: '',
  }));

  selected.forEach((topic, index) => {
    const slot =
      count === 1
        ? 0
        : Math.min(reportingWeeks - 1, Math.floor((index * reportingWeeks) / count));
    weeks[slot].topics.push(topic.topic);
    if (!weeks[slot].programme) weeks[slot].programme = topic.programme;
    if (!weeks[slot].course) weeks[slot].course = topic.course;
  });

  return weeks.filter((row) => row.topics.length > 0);
}

/**
 * How far delivery reached in the report window — based on span placement, not tick count.
 * Example: 3 ticks spanned across a 12-week window reaching week 9 → depth 9 (judgment 9/12).
 */
export function computeSpanPacingDepth(
  declaration: Pick<DeliveryDeclaration, 'spannedWeeks' | 'reportingWeeks' | 'selectedTopics'>,
  rangeStartWeek = 1,
): number {
  if (!declaration.selectedTopics.length) return 0;
  const filled = declaration.spannedWeeks.filter((row) => row.topics.length > 0);
  if (!filled.length) return Math.min(declaration.reportingWeeks, 1);
  const start = Math.max(1, Math.trunc(Number(rangeStartWeek) || 1));
  const maxWeek = Math.max(...filled.map((row) => row.week));
  return Math.min(declaration.reportingWeeks, Math.max(1, maxWeek - start + 1));
}

/** Full term timeline for UI preview — includes quiet weeks in the window. */
export function buildWeekSpanTimeline(
  selected: DeliveryTopicOption[],
  reportingWeeks: number,
  rangeStartWeek = 1,
): DeliveryWeekSpan[] {
  if (reportingWeeks <= 0) return [];
  const filled = spanTopicsAcrossWeeks(selected, reportingWeeks, rangeStartWeek);
  const byWeek = new Map(filled.map((row) => [row.week, row]));
  return Array.from({ length: reportingWeeks }, (_, index) => {
    const week = rangeStartWeek + index;
    return (
      byWeek.get(week) || {
        week,
        label: `Week ${week}`,
        topics: [],
        programme: '',
        course: '',
      }
    );
  });
}

export function buildNextTermCheckpoint(
  catalog: DeliveryTopicOption[],
  selectedKeys: string[],
): DeliveryCheckpoint | null {
  if (!catalog.length) return null;
  const selectedSet = new Set(selectedKeys);
  const firstUnhandled = catalog.find((row) => !selectedSet.has(row.key));
  if (firstUnhandled) {
    return {
      programme: firstUnhandled.programme,
      course: firstUnhandled.course,
      topic: firstUnhandled.topic,
      termNumber: firstUnhandled.termNumber,
      weekNumber: firstUnhandled.weekNumber,
    };
  }
  const last = catalog[catalog.length - 1];
  return {
    programme: last.programme,
    course: last.course,
    topic: last.topic,
    termNumber: last.termNumber,
    weekNumber: last.weekNumber,
  };
}

export function buildDeliveryDeclaration(input: {
  catalog: DeliveryTopicOption[];
  selectedTopicKeys: string[];
  reportingWeeks: number;
  rangeStartWeek?: number;
  academicYear?: string;
  termLabel?: string;
}): DeliveryDeclaration {
  const selected = input.catalog.filter((row) => input.selectedTopicKeys.includes(row.key));
  const spannedWeeks = spanTopicsAcrossWeeks(selected, input.reportingWeeks, input.rangeStartWeek ?? 1);
  const rangeStartWeek = Math.max(1, input.rangeStartWeek ?? 1);
  const checkpoint = buildNextTermCheckpoint(input.catalog, input.selectedTopicKeys);
  const selectedKeySet = new Set(input.selectedTopicKeys);
  const draft: DeliveryDeclaration = {
    reportingWeeks: input.reportingWeeks,
    rangeStartWeek,
    selectedTopicKeys: input.selectedTopicKeys,
    selectedTopics: selected.map((row) => ({
      key: row.key,
      programme: row.programme,
      course: row.course,
      topic: row.topic,
      weekNumber: row.weekNumber,
    })),
    spannedWeeks,
    programmeCoverage: [],
    nextTermCheckpoint: checkpoint
      ? {
          ...checkpoint,
          academicYear: input.academicYear,
          termLabel: input.termLabel,
        }
      : null,
    updatedAt: new Date().toISOString(),
  };
  draft.pacingDepth = computeSpanPacingDepth(draft, rangeStartWeek);
  draft.programmeCoverage = [...new Set(input.catalog.map((row) => row.programme))].map((programme) => {
    const programmeTopics = input.catalog.filter((row) => row.programme === programme);
    const selectedTopics = programmeTopics.filter((row) => selectedKeySet.has(row.key)).length;
    const plannedTopics = programmeTopics.length;
    const spanJudgment =
      input.reportingWeeks > 0 && draft.pacingDepth
        ? Math.min(100, Math.round((draft.pacingDepth / input.reportingWeeks) * 100))
        : plannedTopics > 0
          ? Math.round((selectedTopics / plannedTopics) * 100)
          : 0;
    return {
      programme,
      selectedTopics,
      plannedTopics,
      coverage: selectedTopics > 0 ? spanJudgment : 0,
    };
  });
  return draft;
}

/** Student-centered delivery prose from ticked topics — no syllabus week tracking required. */
export function buildTopicsCoveredFromDeclaration(
  declaration: DeliveryDeclaration,
  input: {
    schoolName: string;
    termLabel: string;
    academicTermNumber: number;
  },
): string {
  return buildTopicsCoveredPresentation(declaration, input).plainText;
}

/** Depth reached in the report window — span placement is the judgment basis, not tick count alone. */
export function declarationPacingDepth(declaration: DeliveryDeclaration): number {
  if (declaration.pacingDepth != null && declaration.pacingDepth > 0) {
    return Math.min(declaration.reportingWeeks, declaration.pacingDepth);
  }
  return computeSpanPacingDepth(declaration, declaration.rangeStartWeek ?? 1);
}

/** Overlay declared delivery onto snapshot stats for PDF/Data tab. */
export function applyDeliveryDeclarationToSnapshot(
  snapshot: SchoolReportSnapshot,
  declaration: DeliveryDeclaration,
  catalogSize: number,
): SchoolReportSnapshot {
  const reportingWeeks = declaration.reportingWeeks;
  const pacingDepth = Math.min(reportingWeeks, declarationPacingDepth(declaration));
  const selectedCount = declaration.selectedTopics.length;
  const coverage =
    reportingWeeks > 0
      ? Math.min(100, Math.round((pacingDepth / reportingWeeks) * 100))
      : selectedCount > 0
        ? 100
        : 0;

  type CourseAccumulator = {
    programme: string;
    course: string;
    completed: number;
    planned: number;
    inProgress: number;
    topics: string[];
    fromTicks: boolean;
  };

  const courseMap = new Map<string, CourseAccumulator>();

  for (const topic of declaration.selectedTopics) {
    const programme = normalizeProgrammeLabel(topic.programme);
    const course = String(topic.course || '').trim();
    const key = programmeCourseKey(programme, course);
    const row = courseMap.get(key) || {
      programme,
      course,
      completed: 0,
      planned: reportingWeeks,
      inProgress: 0,
      topics: [],
      fromTicks: true,
    };
    row.completed = pacingDepth;
    row.topics.push(topic.topic);
    courseMap.set(key, row);
  }

  const inferCompletedForCourse = (enrolledStudents: number): number => {
    if (enrolledStudents <= 0) return 0;
    if (selectedCount > 0) return pacingDepth;
    return 0;
  };

  for (const enrolment of snapshot.schoolProgrammes || []) {
    const programme = normalizeProgrammeLabel(enrolment.programme);
    const course = String(enrolment.course || '').trim();
    if (!course || Number(enrolment.enrolledStudents || 0) <= 0) continue;
    const key = programmeCourseKey(programme, course);
    if (courseMap.has(key)) continue;
    const completed = inferCompletedForCourse(Number(enrolment.enrolledStudents || 0));
    courseMap.set(key, {
      programme,
      course,
      completed,
      planned: reportingWeeks,
      inProgress: completed > 0 && completed < reportingWeeks ? 1 : 0,
      topics: [],
      fromTicks: false,
    });
  }

  for (const perf of snapshot.programmeCoursePerformance || []) {
    const programme = normalizeProgrammeLabel(perf.programme);
    const course = String(perf.course || '').trim();
    if (!course) continue;
    const key = programmeCourseKey(programme, course);
    if (courseMap.has(key)) continue;
    if (perf.students <= 0 && (perf.enrolledStudents ?? 0) <= 0) continue;
    const completed = inferCompletedForCourse(Math.max(perf.students, perf.enrolledStudents ?? 0));
    courseMap.set(key, {
      programme,
      course,
      completed,
      planned: reportingWeeks,
      inProgress: completed > 0 && completed < reportingWeeks ? 1 : 0,
      topics: [],
      fromTicks: false,
    });
  }

  const courses = [...courseMap.values()].map((row) => ({
    programme: row.programme,
    course: row.course,
    planned: reportingWeeks,
    completed: Math.min(reportingWeeks, row.fromTicks ? pacingDepth : (row.completed || 0)),
    inProgress: row.inProgress,
    skipped: 0,
    coverage:
      reportingWeeks > 0
        ? Math.round((Math.min(reportingWeeks, row.fromTicks ? pacingDepth : row.completed) / reportingWeeks) * 100)
        : 0,
    enrolledStudents:
      snapshot.schoolProgrammes?.find(
        (item) =>
          programmeCourseKey(normalizeProgrammeLabel(item.programme), item.course)
          === programmeCourseKey(row.programme, row.course),
      )?.enrolledStudents || 0,
  }));

  const programmeCoursePerformance = mergeProgrammeCoursePerformanceWithEnrolment(
    snapshot.programmeCoursePerformance || [],
    snapshot.schoolProgrammes || [],
  );

  return {
    ...snapshot,
    deliveryDeclaration: declaration,
    programmeCoursePerformance,
    summary: {
      ...snapshot.summary,
      curriculumCoverage: coverage,
    },
    curriculum: {
      ...snapshot.curriculum,
      plannedWeeks: reportingWeeks,
      completedWeeks: pacingDepth,
      inProgressWeeks: courses.some((row) => row.inProgress > 0) ? 1 : 0,
      skippedWeeks: 0,
      courses: courses.length ? courses : snapshot.curriculum.courses,
    },
  };
}
