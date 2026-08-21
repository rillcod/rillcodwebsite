import type { SupabaseClient } from '@supabase/supabase-js';
import {
  endWeekForReportWindow,
  normalizeReportingWeeks,
  reportWeekNumbers,
  reportingWeekCount,
} from './delivery-declaration';
import { resolveDeliveryCoursesForReport, type DeliveryCourseRef } from './school-curriculum-scope';
import { isPlaceholderDeliveryLabel } from './topics-covered-presentation';
import { PROGRESSIVE_12_YEAR_SUMMARY } from './progressive-curriculum-prompt';
import type { SchoolReportSnapshot } from './types';
import {
  expandCourseDeliveryWeeks,
  type ExpandCourseWeeksInput,
  type ExpandedWeek,
  type WeekExpansion,
} from './week-expansion';

type AnyClient = SupabaseClient<any>;

export type GenerateOnSpotRange = {
  startTerm: number;
  startWeek: number;
  endTerm: number;
  endWeek: number;
};

export type GenerateOnSpotInput = {
  schoolId: string;
  createdBy: string;
  schoolName?: string | null;
  termLabel?: string | null;
  termNumber: number;
  range: GenerateOnSpotRange;
  snapshot?: Partial<SchoolReportSnapshot> | null;
  studentRows?: Array<Record<string, unknown>>;
};

export type GenerateOnSpotResult = {
  createdCount: number;
  updatedCount: number;
  courseCount: number;
  reportingWeeks: number;
  unresolvedCourses: string[];
  aiCourseCount: number;
  alreadyCoveredCount: number;
  placeholderCourseCount: number;
  usedPlaceholder: boolean;
};

type StoredWeek = {
  week: number;
  topic: string;
  source?: string;
  type?: string;
  lesson_plan?: unknown;
};

function contentRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function termNumberOf(term: Record<string, unknown>): number {
  return Number(term.term ?? term.term_number ?? term.national_term ?? 0);
}

export function isPlaceholderWeekRecord(
  week: { topic?: unknown; source?: unknown; week?: unknown },
  contentGeneratedSource?: string | null,
): boolean {
  const source = String(week.source ?? contentGeneratedSource ?? '').trim().toLowerCase();
  if (source === 'placeholder') return true;
  return isPlaceholderDeliveryLabel(String(week.topic ?? ''));
}

export function realWeekNumbersInTerm(
  content: unknown,
  termNumber: number,
): Set<number> {
  const record = contentRecord(content);
  const generatedSource = String(record.generated_source || '');
  const terms = Array.isArray(record.terms) ? record.terms : [];
  const weeks = new Set<number>();
  for (const term of terms) {
    if (!term || typeof term !== 'object') continue;
    const row = term as Record<string, unknown>;
    if (termNumberOf(row) !== termNumber) continue;
    const list = Array.isArray(row.weeks) ? row.weeks : [];
    for (const item of list) {
      if (!item || typeof item !== 'object') continue;
      const week = item as Record<string, unknown>;
      const weekNumber = Number(week.week ?? week.week_number ?? 0);
      if (weekNumber <= 0) continue;
      if (isPlaceholderWeekRecord(week, generatedSource)) continue;
      weeks.add(weekNumber);
    }
  }
  return weeks;
}

function storedWeeksForTerm(content: unknown, termNumber: number): StoredWeek[] {
  const record = contentRecord(content);
  const terms = Array.isArray(record.terms) ? record.terms : [];
  for (const term of terms) {
    if (!term || typeof term !== 'object') continue;
    const row = term as Record<string, unknown>;
    if (termNumberOf(row) !== termNumber) continue;
    const list = Array.isArray(row.weeks) ? row.weeks : [];
    return list
      .filter((item) => item && typeof item === 'object')
      .map((item) => {
        const week = item as Record<string, unknown>;
        return {
          week: Number(week.week ?? week.week_number ?? 0),
          topic: String(week.topic ?? '').trim(),
          source: week.source ? String(week.source) : undefined,
          type: week.type ? String(week.type) : undefined,
          lesson_plan: week.lesson_plan,
        };
      })
      .filter((week) => week.week > 0);
  }
  return [];
}

type MergedWeek = {
  week: number;
  type: string;
  topic: string;
  source?: string;
  lesson_plan: unknown;
};

function weekPayload(week: ExpandedWeek, source: 'ai'): MergedWeek {
  const objectives = week.objectives?.length
    ? week.objectives
    : [`Understand ${week.topic}`, 'Complete guided practical lab exercise'];
  return {
    week: week.week,
    type: week.weekType,
    topic: week.topic,
    source,
    lesson_plan: {
      duration_minutes: 40,
      objectives,
      teacher_activities: ['Introduce weekly concept', 'Demonstrate practical code sample', 'Guide student exercises'],
      student_activities: ['Listen to teacher intro', 'Write and test code exercises', 'Submit weekly output'],
      classwork: { title: `${week.topic} — Lab`, instructions: 'Complete the lab exercise.', materials: ['Computer/Tablet'] },
      assignment: { title: `${week.topic} — Practice`, instructions: 'Practice at home.', due: 'Next Session' },
    },
  };
}

/** Merge AI weeks into an existing school syllabus without wiping authored terms. */
export function mergeGeneratedWeeksIntoContent(
  existing: unknown,
  input: {
    courseTitle: string;
    programme: string;
    schoolName?: string | null;
    termLabel?: string | null;
    termNumber: number;
    weeks: ExpandedWeek[];
    source: 'ai';
    model: string | null;
  },
): Record<string, unknown> {
  const content = { ...contentRecord(existing) };
  const incoming = new Map(input.weeks.map((week) => [week.week, week]));
  const previous = storedWeeksForTerm(content, input.termNumber);
  const generatedSource = String(content.generated_source || '');
  const mergedByNumber = new Map<number, MergedWeek>();

  for (const week of previous) {
    if (incoming.has(week.week)) continue;
    if (isPlaceholderWeekRecord(week, generatedSource)) continue;
    mergedByNumber.set(week.week, {
      week: week.week,
      type: week.type === 'assessment' ? 'assessment' : 'lesson',
      topic: week.topic,
      source: week.source === 'ai' ? 'ai' : undefined,
      lesson_plan: week.lesson_plan ?? {
        duration_minutes: 40,
        objectives: [`Understand ${week.topic}`],
        teacher_activities: ['Introduce weekly concept', 'Demonstrate practical code sample', 'Guide student exercises'],
        student_activities: ['Listen to teacher intro', 'Write and test code exercises', 'Submit weekly output'],
        classwork: { title: `${week.topic} — Lab`, instructions: 'Complete the lab exercise.', materials: ['Computer/Tablet'] },
        assignment: { title: `${week.topic} — Practice`, instructions: 'Practice at home.', due: 'Next Session' },
      },
    });
  }

  for (const week of input.weeks) {
    mergedByNumber.set(week.week, weekPayload(week, input.source));
  }

  const weeks = [...mergedByNumber.values()].sort((a, b) => a.week - b.week);
  const terms = Array.isArray(content.terms) ? [...content.terms] : [];
  const termIndex = terms.findIndex(
    (term) => term && typeof term === 'object' && termNumberOf(term as Record<string, unknown>) === input.termNumber,
  );
  const nextTerm = {
    term: input.termNumber,
    year: 1,
    title: `${input.programme} — Term ${input.termNumber} Progressive Delivery`,
    weeks,
  };
  if (termIndex >= 0) {
    terms[termIndex] = { ...(terms[termIndex] as object), ...nextTerm };
  } else {
    terms.push(nextTerm);
  }

  return {
    ...content,
    course_title: String(content.course_title || input.courseTitle),
    overview:
      String(content.overview || '').trim() ||
      `${PROGRESSIVE_12_YEAR_SUMMARY} This ${input.programme} plan for ${input.courseTitle} at ${input.schoolName || 'partner school'} continues the ladder during ${input.termLabel || `Term ${input.termNumber}`} — each week is the next detailed step, never a repeat.`,
    generated_source: input.source,
    generated_model: input.model,
    generated_at: new Date().toISOString(),
    terms,
  };
}

async function loadStudentRows(admin: AnyClient, schoolId: string, existing?: GenerateOnSpotInput['studentRows']) {
  if (existing) return existing;
  const { data: students, error } = await admin
    .from('portal_users')
    .select('id,class_id,full_name,section_class,grade,class_arm')
    .eq('role', 'student')
    .eq('school_id', schoolId)
    .eq('is_active', true)
    .or('is_deleted.is.null,is_deleted.eq.false')
    .limit(5000);
  if (error) throw new Error(`Learner lookup failed: ${error.message}`);
  return (students ?? []) as Array<Record<string, unknown>>;
}

function courseLabel(course: DeliveryCourseRef): string {
  return `${course.programme} / ${course.title}`;
}

const CHUNKED_WEEK_BATCH = 4;

function chunkWeekNumbers(weekNumbers: number[], size: number): number[][] {
  const sorted = [...new Set(weekNumbers.filter((week) => Number.isFinite(week)))].sort((a, b) => a - b);
  const chunks: number[][] = [];
  for (let index = 0; index < sorted.length; index += size) {
    chunks.push(sorted.slice(index, index + size));
  }
  return chunks;
}

/**
 * Long report windows often fail in one model call. Try the full window first,
 * then smaller batches, and keep any real AI weeks we do get.
 */
export async function expandCourseWeeksForDelivery(
  input: ExpandCourseWeeksInput,
): Promise<WeekExpansion> {
  const direct = await expandCourseDeliveryWeeks(input);
  if (direct.source === 'ai' && direct.weeks.length) return direct;
  if (input.weekNumbers.length <= CHUNKED_WEEK_BATCH) return direct;

  const byWeek = new Map<number, ExpandedWeek>();
  let model = direct.model;

  for (const chunk of chunkWeekNumbers(input.weekNumbers, CHUNKED_WEEK_BATCH)) {
    const partial = await expandCourseDeliveryWeeks({ ...input, weekNumbers: chunk });
    if (partial.source !== 'ai' || !partial.weeks.length) continue;
    for (const week of partial.weeks) byWeek.set(week.week, week);
    model = model ?? partial.model;
  }

  const weeks = input.weekNumbers.filter((week) => byWeek.has(week)).map((week) => byWeek.get(week)!);
  if (!weeks.length) return direct;

  return {
    weeks,
    source: 'ai',
    model,
  };
}

/**
 * Build a real week-by-week checklist for report delivery when the term has no
 * authored syllabus. Placeholder expansions are never written.
 */
export async function generateReportDeliveryCurriculum(
  admin: AnyClient,
  input: GenerateOnSpotInput,
): Promise<GenerateOnSpotResult> {
  const studentRows = await loadStudentRows(admin, input.schoolId, input.studentRows);
  const deliveryCourses = await resolveDeliveryCoursesForReport(
    admin,
    input.schoolId,
    studentRows as any[],
    input.snapshot,
  );

  if (!deliveryCourses.length) {
    throw Object.assign(
      new Error(
        input.snapshot
          ? 'No courses could be resolved for this report. Refresh the report snapshot first so programme courses are detected, then try again.'
          : 'No active course could be matched to this school. Assign learners to a class or programme course, then retry.',
      ),
      { status: 409 },
    );
  }

  const reportingWeeks = reportingWeekCount(input.range);
  const startWeek = input.range.startWeek;
  const endWeek = endWeekForReportWindow(startWeek, normalizeReportingWeeks(reportingWeeks));
  const reportWeeks = reportWeekNumbers(startWeek, endWeek);
  const termNumber = input.termNumber;

  let createdCount = 0;
  let updatedCount = 0;
  let aiCourseCount = 0;
  let alreadyCoveredCount = 0;
  const unresolvedCourses: string[] = [];

  for (const course of deliveryCourses) {
    const { data: existing, error: existingError } = await admin
      .from('course_curricula')
      .select('id,content,school_id,version')
      .eq('course_id', course.id)
      .or(`school_id.eq.${input.schoolId},school_id.is.null`);
    if (existingError) {
      throw new Error(`Could not load the ${courseLabel(course)} syllabus: ${existingError.message}`);
    }

    const rows = (existing ?? []) as Array<{
      id: string;
      content: unknown;
      school_id: string | null;
      version?: number | null;
    }>;
    const schoolOwned = rows.filter((row) => String(row.school_id || '') === input.schoolId);
    const reachable = schoolOwned.length ? schoolOwned : rows;
    const existingWeekNumbers = new Set(
      reachable.flatMap((curriculum) => [...realWeekNumbersInTerm(curriculum.content, termNumber)]),
    );
    const missingWeeks = reportWeeks.filter((week) => !existingWeekNumbers.has(week));
    if (!missingWeeks.length) {
      alreadyCoveredCount++;
      continue;
    }

    const reachedTopics = reachable.flatMap((curriculum) =>
      storedWeeksForTerm(curriculum.content, termNumber)
        .filter((week) => !isPlaceholderWeekRecord(week, String(contentRecord(curriculum.content).generated_source || '')))
        .map((week) => week.topic)
        .filter(Boolean),
    );

    const expansion = await expandCourseWeeksForDelivery({
      courseTitle: course.title,
      programme: course.programme,
      schoolName: input.schoolName ?? null,
      termLabel: input.termLabel ?? null,
      termNumber,
      weekNumbers: missingWeeks,
      reachedTopics,
    });

    if (expansion.source !== 'ai' || !expansion.weeks.length) {
      unresolvedCourses.push(courseLabel(course));
      continue;
    }

    aiCourseCount++;
    const target = schoolOwned[0];
    const content = mergeGeneratedWeeksIntoContent(target?.content, {
      courseTitle: course.title,
      programme: course.programme,
      schoolName: input.schoolName,
      termLabel: input.termLabel,
      termNumber,
      weeks: expansion.weeks,
      source: 'ai',
      model: expansion.model,
    });

    if (target) {
      const { error: updateError } = await admin
        .from('course_curricula')
        .update({
          content,
          is_visible_to_school: true,
          version: Number(target.version || 1) + 1,
        })
        .eq('id', target.id);
      if (updateError) {
        throw new Error(`Could not update the ${courseLabel(course)} delivery checklist: ${updateError.message}`);
      }
      updatedCount++;
      continue;
    }

    const { error: insertError } = await admin.from('course_curricula').insert({
      course_id: course.id,
      school_id: input.schoolId,
      content,
      version: 1,
      created_by: input.createdBy,
      is_visible_to_school: true,
    });
    if (insertError) {
      throw new Error(`Could not create the ${courseLabel(course)} delivery checklist: ${insertError.message}`);
    }
    createdCount++;
  }

  return {
    createdCount,
    updatedCount,
    courseCount: deliveryCourses.length,
    reportingWeeks: reportWeeks.length,
    unresolvedCourses,
    aiCourseCount,
    alreadyCoveredCount,
    placeholderCourseCount: 0,
    usedPlaceholder: false,
  };
}
