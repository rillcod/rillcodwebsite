import type { SupabaseClient } from "@supabase/supabase-js";
import { inCurriculumRange } from "./calculations";
import {
  endWeekForReportWindow,
  normalizeReportingWeeks,
} from "./delivery-declaration";
import {
  buildSchoolCourseDetections,
  loadSchoolProgrammeScope,
  scopeCurriculaForSchool,
} from "./school-curriculum-scope";
import { nounFor } from "./wording";
import { humanCurriculumSpan } from "@/lib/curriculum/humanLabels";

type AnyClient = SupabaseClient<any>;

export type CurriculumDetectionStatus =
  | "detected"
  | "no_tracking"
  | "no_curriculum"
  | "query_failed"
  | "migration_missing";

export type SuggestedCurriculumRange = {
  curriculumStartTerm: number;
  curriculumStartWeek: number;
  curriculumEndTerm: number;
  curriculumEndWeek: number;
  source: "delivery_tracking" | "term_default";
  trackedWeekCount: number;
  syllabusCount: number;
  hint: string;
  status: CurriculumDetectionStatus;
  checkedAt: string;
  sourceChecked: string;
  correctiveAction?: string;
  /** Per-programme/course detection from school classes. */
  schoolCourses?: Array<{
    programme: string;
    course: string;
    enrolledStudents: number;
    hasSyllabus: boolean;
    trackedWeeks: number;
    inReportRange: boolean;
  }>;
};

export type CurriculumDetectionResult = SuggestedCurriculumRange;

type TrackingRow = {
  term_number: number;
  week_number: number;
  status: string;
};

const ACTIVE_STATUSES = new Set(["completed", "in_progress", "skipped"]);

function curriculumWeeksForTerm(content: any, termNumber: number): number[] {
  const terms = Array.isArray(content?.terms) ? content.terms : [];
  return terms.flatMap((term: any) => {
    const number = Number(
      term.term ?? term.term_number ?? term.national_term ?? 0
    );
    if (number !== termNumber) return [];
    return (Array.isArray(term.weeks) ? term.weeks : [])
      .map((week: any) => Number(week.week ?? week.week_number ?? 0))
      .filter((week: number) => week > 0);
  });
}

export function curriculumEndWeekForTerm(
  curricula: Array<{ content?: unknown }>,
  termNumber: number
): number | null {
  const weeks = curricula.flatMap((curriculum) =>
    curriculumWeeksForTerm(curriculum.content, termNumber)
  );
  return weeks.length ? Math.max(...weeks) : null;
}

export function academicPeriodWeekCount(
  startDate?: string | null,
  endDate?: string | null
): number | null {
  if (!startDate || !endDate) return null;
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start)
    return null;
  return Math.max(1, Math.ceil((end - start + 86400000) / (7 * 86400000)));
}

function isMissingRelationError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("does not exist") ||
    (lower.includes("relation") &&
      lower.includes("curriculum_week_tracking")) ||
    (lower.includes("schema cache") &&
      lower.includes("curriculum_week_tracking"))
  );
}

function detectionStatusFromSuggestion(input: {
  source: "delivery_tracking" | "term_default";
  syllabusCount: number;
}): CurriculumDetectionStatus {
  if (input.source === "delivery_tracking") return "detected";
  if (input.syllabusCount > 0) return "no_tracking";
  return "no_curriculum";
}

function correctiveActionFor(
  status: CurriculumDetectionStatus
): string | undefined {
  switch (status) {
    case "no_tracking":
      return "Mark delivery weeks in Course Syllabus, then click Detect from delivery again.";
    case "no_curriculum":
      return "No authored syllabus exists for this term. Generate programme topics from the school report delivery step, or build syllabi in Course Syllabus, then retry detection.";
    case "query_failed":
      return "Check your connection and retry. If this persists, contact support.";
    case "migration_missing":
      return "The curriculum tracking table is not available in this environment. Apply pending database migrations.";
    default:
      return undefined;
  }
}

/** Report-only: infer curriculum window from marked delivery weeks (not full curriculum integration). */
export function suggestReportCurriculumRange(input: {
  academicTermNumber: number;
  trackingRows: TrackingRow[];
  syllabusCount?: number;
  defaultEndWeek?: number;
  checkedAt?: string;
}): SuggestedCurriculumRange {
  const termNum = Math.max(1, Number(input.academicTermNumber) || 1);
  const defaultEnd = endWeekForReportWindow(
    1,
    normalizeReportingWeeks(Number(input.defaultEndWeek) || 1)
  );
  const syllabusCount = Number(input.syllabusCount) || 0;
  const checkedAt = input.checkedAt || new Date().toISOString();

  const active = (input.trackingRows || []).filter(
    (row) =>
      ACTIVE_STATUSES.has(String(row.status || "").toLowerCase()) &&
      Number(row.term_number) === termNum &&
      Number(row.week_number) > 0
  );

  if (!active.length) {
    const status = detectionStatusFromSuggestion({
      source: "term_default",
      syllabusCount,
    });
    return {
      curriculumStartTerm: termNum,
      curriculumStartWeek: 1,
      curriculumEndTerm: termNum,
      curriculumEndWeek: defaultEnd,
      source: "term_default",
      trackedWeekCount: 0,
      syllabusCount,
      hint:
        status === "no_curriculum"
          ? `No authored syllabus exists for this school this term. The academic-period fallback is Term ${termNum}, Weeks 1-${defaultEnd}. Generate programme topics from the report delivery step, or build syllabi in Course Syllabus.`
          : `No marked weeks for Term ${termNum} yet. The detected syllabus window is Weeks 1-${defaultEnd}. Mark delivery in Course Syllabus, then click Detect from delivery.`,
      status,
      checkedAt,
      sourceChecked: "curriculum_week_tracking, course_curricula",
      correctiveAction: correctiveActionFor(status),
    };
  }

  const points = active.map((row) => ({
    term: Number(row.term_number),
    week: Number(row.week_number),
  }));
  const min = points.reduce((best, row) =>
    row.term * 100 + row.week < best.term * 100 + best.week ? row : best
  );
  const max = points.reduce((best, row) =>
    row.term * 100 + row.week > best.term * 100 + best.week ? row : best
  );

  return {
    curriculumStartTerm: min.term,
    curriculumStartWeek: min.week,
    curriculumEndTerm: max.term,
    curriculumEndWeek: endWeekForReportWindow(
      min.week,
      normalizeReportingWeeks(max.week - min.week + 1)
    ),
    source: "delivery_tracking",
    trackedWeekCount: active.length,
    syllabusCount,
    // Was "Term 3 Week 1 → Term 1 Week 1". An arrow between two coordinates is
    // a diagram of the database, not a sentence someone settling a school reads.
    hint: `Detected ${active.length} marked ${nounFor(
      active.length,
      "week"
    )} from delivery tracking: ${humanCurriculumSpan({
      startTerm: min.term,
      startWeek: min.week,
      endTerm: max.term,
      endWeek: max.week,
    })}. Adjust below if needed.`,
    status: "detected",
    checkedAt,
    sourceChecked: "curriculum_week_tracking",
    correctiveAction: undefined,
  };
}

export async function loadReportCurriculumRangeSuggestion(
  admin: AnyClient,
  schoolId: string,
  academicTermId: string
): Promise<CurriculumDetectionResult | null> {
  if (!schoolId || !academicTermId) return null;

  const checkedAt = new Date().toISOString();

  const { data: academicTerm, error: termError } = await admin
    .from("academic_terms")
    .select("term_number,start_date,end_date,academic_year")
    .eq("id", academicTermId)
    .maybeSingle();

  if (termError) {
    const migrationMissing = isMissingRelationError(termError.message);
    return {
      curriculumStartTerm: 1,
      curriculumStartWeek: 1,
      curriculumEndTerm: 1,
      curriculumEndWeek: 1,
      source: "term_default",
      trackedWeekCount: 0,
      syllabusCount: 0,
      hint: migrationMissing
        ? "Academic term lookup failed — database schema may be incomplete."
        : "Could not load the academic term for this report.",
      status: migrationMissing ? "migration_missing" : "query_failed",
      checkedAt,
      sourceChecked: "academic_terms",
      correctiveAction: correctiveActionFor(
        migrationMissing ? "migration_missing" : "query_failed"
      ),
    };
  }

  const termNumber = Number(academicTerm?.term_number) || 1;
  const academicFallbackWeeks =
    academicPeriodWeekCount(academicTerm?.start_date, academicTerm?.end_date) ||
    1;

  const { data: tracking, error: trackingError } = await admin
    .from("curriculum_week_tracking")
    .select("curriculum_id,term_number,week_number,status")
    .eq("school_id", schoolId)
    .limit(5000);

  if (trackingError) {
    const migrationMissing = isMissingRelationError(trackingError.message);
    return {
      curriculumStartTerm: termNumber,
      curriculumStartWeek: 1,
      curriculumEndTerm: termNumber,
      curriculumEndWeek: academicFallbackWeeks,
      source: "term_default",
      trackedWeekCount: 0,
      syllabusCount: 0,
      hint: migrationMissing
        ? "Delivery tracking is not available in this environment."
        : "Delivery tracking lookup failed — this is a system error, not missing curriculum.",
      status: migrationMissing ? "migration_missing" : "query_failed",
      checkedAt,
      sourceChecked: "curriculum_week_tracking",
      correctiveAction: correctiveActionFor(
        migrationMissing ? "migration_missing" : "query_failed"
      ),
    };
  }

  // Curriculum detection was the slowest step in opening a report, because this
  // pulled the full `content` document — every term, week, lesson plan,
  // objective and activity — for up to 1,000 curricula INCLUDING every
  // platform-wide one, and then discarded all but the handful this school
  // actually uses. A school with five courses was downloading the entire
  // syllabus library to read one number: the last taught week.
  //
  // Scoping needs only school_id, course_id and courses.is_active, so the
  // metadata is fetched first, scoped, and `content` is then loaded for the
  // survivors alone.
  const [
    { data: students },
    { data: officialAdoptions, error: officialError },
    { data: curriculaMeta, error: legacyError },
  ] = await Promise.all([
    admin
      .from("portal_users")
      .select("id,class_id,full_name,section_class,grade,class_arm")
      .eq("role", "student")
      .eq("school_id", schoolId)
      .eq("is_active", true)
      .or("is_deleted.is.null,is_deleted.eq.false")
      .limit(5000),
    admin
      .from("academic_curriculum_adoptions")
      .select(
        "course_id,effective_term_number,release:academic_curriculum_releases!academic_curriculum_adoptions_release_id_fkey(id,course_id,content,courses(is_active))"
      )
      .eq("school_id", schoolId)
      .eq("academic_session", academicTerm?.academic_year)
      .eq("status", "active")
      .lte("effective_term_number", termNumber)
      .order("effective_term_number", { ascending: false }),
    admin
      .from("course_curricula")
      .select("id,course_id,school_id,courses(is_active)")
      .or(`school_id.eq.${schoolId},school_id.is.null`)
      .limit(1000),
  ]);

  const schoolScope = await loadSchoolProgrammeScope(
    admin,
    schoolId,
    (students ?? []) as any[]
  );
  const latestAdoptionByCourse = new Map<string, any>();
  for (const row of officialAdoptions ?? []) {
    const key = String((row as any).course_id);
    if (!latestAdoptionByCourse.has(key)) latestAdoptionByCourse.set(key, row);
  }
  const officialCurricula = [...latestAdoptionByCourse.values()].flatMap((row: any) => {
    const release = Array.isArray(row.release) ? row.release[0] : row.release;
    return release ? [{ ...release, school_id: schoolId }] : [];
  });
  const officialCourseIds = new Set(
    officialCurricula.map((row: any) => String(row.course_id))
  );
  const legacyMeta = ((curriculaMeta ?? []) as any[]).filter(
    (row) => !officialCourseIds.has(String(row.course_id))
  );
  const scopedMeta = scopeCurriculaForSchool(
    [...officialCurricula, ...legacyMeta] as any[],
    schoolId,
    schoolScope
  );
  const syllabusCount = scopedMeta.length;

  let scopedCurricula: any[] = scopedMeta;
  const legacyScoped = scopedMeta.filter((row: any) => !row.content);
  if (legacyScoped.length) {
    const scopedIds = legacyScoped
      .map((row: any) => row?.id)
      .filter((id: unknown): id is string => Boolean(id));
    if (scopedIds.length) {
      const { data: contentRows } = await admin
        .from("course_curricula")
        .select("id,content")
        .in("id", scopedIds);
      const contentById = new Map(
        ((contentRows ?? []) as Array<{ id: string; content: unknown }>).map(
          (row) => [row.id, row.content]
        )
      );
      scopedCurricula = scopedMeta.map((row: any) => ({
        ...row,
        content: row.content ?? contentById.get(row.id) ?? null,
      }));
    }
  }
  const syllabusEndWeek = curriculumEndWeekForTerm(scopedCurricula, termNumber);
  const detectedEndWeek = syllabusEndWeek || academicFallbackWeeks;

  const syllabusError = officialError || legacyError;
  if (syllabusError) {
    return {
      curriculumStartTerm: termNumber,
      curriculumStartWeek: 1,
      curriculumEndTerm: termNumber,
      curriculumEndWeek: academicFallbackWeeks,
      source: "term_default",
      trackedWeekCount: 0,
      syllabusCount: 0,
      hint: "Syllabus lookup failed — this is a system error, not missing curriculum.",
      status: "query_failed",
      checkedAt,
      sourceChecked:
        "academic_curriculum_adoptions, academic_curriculum_releases, course_curricula",
      correctiveAction: correctiveActionFor("query_failed"),
    };
  }

  const suggestion = suggestReportCurriculumRange({
    academicTermNumber: termNumber,
    trackingRows: (tracking ?? []) as TrackingRow[],
    syllabusCount,
    defaultEndWeek: detectedEndWeek,
    checkedAt,
  });

  const inRange = (term: number, week: number) =>
    inCurriculumRange(
      term,
      week,
      suggestion.curriculumStartTerm,
      suggestion.curriculumStartWeek,
      suggestion.curriculumEndTerm,
      suggestion.curriculumEndWeek
    );

  const schoolCourses = buildSchoolCourseDetections({
    scope: schoolScope,
    curricula: scopedCurricula,
    trackingRows: (tracking ?? []) as any[],
    academicTermNumber: termNumber,
    inRange,
  });

  const missingCourses = schoolCourses.filter((row) => !row.inReportRange);
  const hintSuffix =
    schoolScope.length > 0
      ? missingCourses.length
        ? ` Found ${schoolScope.length} programme/course${
            schoolScope.length === 1 ? "" : "s"
          } from classes; ${
            missingCourses.length
          } still need delivery ticks or syllabi (${missingCourses
            .map((row) => `${row.programme} · ${row.course}`)
            .join(", ")}).`
        : ` All ${schoolScope.length} school programme/course${
            schoolScope.length === 1 ? "" : "s"
          } have delivery evidence in range.`
      : "";

  return {
    ...suggestion,
    syllabusCount,
    hint: `${suggestion.hint}${hintSuffix}`,
    schoolCourses,
  };
}
