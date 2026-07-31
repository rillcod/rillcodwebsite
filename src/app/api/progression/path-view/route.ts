import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { canonicalPlanCurriculum } from "@/lib/curriculum/official-direction";

type EnrollmentRow = {
  id: string;
  student_id: string;
  course_id: string;
  school_id: string | null;
  term_label: string;
  start_week: number;
  status: string;
  promoted_to: string | null;
  updated_at: string;
  courses?: {
    title?: string | null;
    level_order?: number | null;
    programs?: { name?: string | null } | null;
  } | null;
};

type VisibilityMode = "full" | "milestone";

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function weekTopicFromCurriculum(
  content: Record<string, unknown> | null,
  termNumber: number,
  weekNumber: number
): string | null {
  const terms = Array.isArray(content?.terms)
    ? (content?.terms as Array<Record<string, unknown>>)
    : [];
  const term = terms.find((t) => Number(t.term ?? 0) === termNumber) ?? null;
  if (!term) return null;
  const weeks = Array.isArray(term.weeks)
    ? (term.weeks as Array<Record<string, unknown>>)
    : [];
  const week = weeks.find((w) => Number(w.week ?? 0) === weekNumber) ?? null;
  return typeof week?.topic === "string" ? week.topic : null;
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const admin = createAdminClient() as any;
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("portal_users")
    .select("id, role, email")
    .eq("id", user.id)
    .single();
  if (
    !profile ||
    !["student", "parent", "teacher", "admin", "school"].includes(
      profile.role ?? ""
    )
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const childId = url.searchParams.get("child_id");
  const studentId = url.searchParams.get("student_id");

  let targetStudentIds: string[] = [];
  let childOptions: Array<{
    id: string;
    full_name: string;
    user_id: string | null;
  }> = [];

  if (profile.role === "student") {
    targetStudentIds = [profile.id];
  } else if (profile.role === "parent") {
    const parentEmail = String(profile.email ?? "")
      .trim()
      .toLowerCase();
    let linkedIds: string[] = [];
    try {
      const { data: links } = await admin
        .from("parent_student_links")
        .select("student_id")
        .eq("parent_id", profile.id);
      linkedIds = (links ?? [])
        .map((x: { student_id: string }) => x.student_id)
        .filter(Boolean);
    } catch {
      linkedIds = [];
    }

    let q = admin
      .from("students")
      .select("id, full_name, user_id, parent_email")
      .order("full_name", { ascending: true });
    if (parentEmail && linkedIds.length > 0) {
      q = q.or(
        `parent_email.ilike.${parentEmail},id.in.(${linkedIds.join(",")})`
      );
    } else if (parentEmail) {
      q = q.ilike("parent_email", parentEmail);
    } else if (linkedIds.length > 0) {
      q = q.in("id", linkedIds);
    } else {
      return NextResponse.json({ data: { children: [], paths: [] } });
    }
    const { data: children } = await q;
    childOptions = (children ?? []).map((c: any) => ({
      id: c.id,
      full_name: c.full_name,
      user_id: c.user_id,
    }));
    const filtered = childId
      ? childOptions.filter((c) => c.id === childId)
      : childOptions;
    targetStudentIds = filtered
      .map((c) => c.user_id)
      .filter(Boolean) as string[];
  } else {
    if (!studentId) {
      return NextResponse.json(
        { error: "student_id is required for staff view" },
        { status: 400 }
      );
    }
    targetStudentIds = [studentId];
  }

  if (targetStudentIds.length === 0) {
    return NextResponse.json({ data: { children: childOptions, paths: [] } });
  }

  const { data: enrollmentsRaw, error: enrErr } = await admin
    .from("student_level_enrollments")
    .select(
      // course_id and promoted_to both point at courses, so the embed must name which one it
      // means. Unqualified, PostgREST refused the whole query and the progression path came back
      // empty. This is the enrolled course, not the one a learner was promoted into.
      "id, student_id, course_id, school_id, term_label, start_week, status, promoted_to, updated_at, courses!student_level_enrollments_course_id_fkey(title, level_order, programs(name))"
    )
    .in("student_id", targetStudentIds)
    .order("updated_at", { ascending: false });
  if (enrErr)
    return NextResponse.json({ error: enrErr.message }, { status: 500 });
  const enrollments = (enrollmentsRaw ?? []) as EnrollmentRow[];

  const uniqueStudentIds = Array.from(
    new Set(enrollments.map((e) => e.student_id))
  );
  const { data: studentRows } =
    uniqueStudentIds.length > 0
      ? await admin
          .from("portal_users")
          .select(
            "id, class_id, classes:class_id(id, name, term_id, current_course_id)"
          )
          .in("id", uniqueStudentIds)
      : { data: [] };
  const classByStudent: Record<string, string | null> = Object.fromEntries(
    (studentRows ?? []).map((s: any) => [s.id, s.class_id ?? null])
  );
  const classTermByStudent: Record<string, string | null> = Object.fromEntries(
    (studentRows ?? []).map((s: any) => [s.id, s.classes?.term_id ?? null])
  );
  const currentCourseByStudent: Record<string, string | null> =
    Object.fromEntries(
      (studentRows ?? []).map((s: any) => [
        s.id,
        s.classes?.current_course_id ?? null,
      ])
    );

  const classKeys = Array.from(
    new Set(Object.values(classByStudent).filter(Boolean))
  ).map((id) => `progression.path_visibility.class.${id}`);
  const studentKeys = uniqueStudentIds.map(
    (id) => `progression.path_visibility.student.${id}`
  );
  const allVisibilityKeys = [...classKeys, ...studentKeys];
  const { data: settingRows } =
    allVisibilityKeys.length > 0
      ? await admin
          .from("app_settings")
          .select("key, value")
          .in("key", allVisibilityKeys)
      : { data: [] };
  const visibilityByKey: Record<string, string> = Object.fromEntries(
    (settingRows ?? []).map((r: any) => [String(r.key), String(r.value)])
  );

  const paths = [];
  for (const enr of enrollments) {
    const classId = classByStudent[enr.student_id] ?? null;
    const classMode = classId
      ? visibilityByKey[`progression.path_visibility.class.${classId}`]
      : null;
    const studentMode =
      visibilityByKey[
        `progression.path_visibility.student.${enr.student_id}`
      ] ?? null;
    const visibilityMode: VisibilityMode =
      (studentMode ?? classMode ?? "full") === "milestone"
        ? "milestone"
        : "full";

    const pathClassId = classByStudent[enr.student_id] ?? null;
    const pathTermId = classTermByStudent[enr.student_id] ?? null;
    let planQuery = admin
      .from("lesson_plans")
      .select(
        // lesson_plans has no `title` column — asking for it failed the read with 42703 and the
        // plan never loaded. Nothing here consumed it; the displayed course title comes from the
        // enrolment's course, not the plan.
        "id,plan_data,status,updated_at,class_id,term_id,curriculum_release_id,curriculum_version_id,official_curriculum:academic_curriculum_releases!lesson_plans_curriculum_release_id_fkey(id,release_number,title,content,source_curriculum_id),curriculum:course_curricula!fk_lesson_plans_curriculum(id,version,content)"
      )
      .eq("course_id", enr.course_id)
      .neq("status", "archived")
      .order("updated_at", { ascending: false });
    if (pathClassId) planQuery = planQuery.eq("class_id", pathClassId);
    if (pathTermId) planQuery = planQuery.eq("term_id", pathTermId);
    const { data: plans } = await planQuery.limit(5);
    const lessonPlan = (plans ?? [])[0] ?? null;
    const curriculumSource = lessonPlan
      ? canonicalPlanCurriculum(lessonPlan)
      : null;
    const curriculumContent =
      curriculumSource?.content && typeof curriculumSource.content === "object"
        ? (curriculumSource.content as Record<string, unknown>)
        : null;
    const totalWeeks = Array.isArray(curriculumContent?.terms)
      ? (curriculumContent.terms as Array<Record<string, unknown>>).reduce(
          (acc, term) =>
            acc + (Array.isArray(term.weeks) ? term.weeks.length : 0),
          0
        )
      : 0;

    const progression = asObject(asObject(lessonPlan?.plan_data).progression);
    const generatedTerms = asObject(progression.generated_terms);
    const termStatuses = Object.entries(generatedTerms).map(([key, value]) => ({
      key,
      status: String(asObject(value).term_status ?? "draft"),
    }));

    let currentTerm = 1;
    let currentWeek = Math.max(1, Number(enr.start_week ?? 1));
    let completionPct = 0;
    let lastTopic: string | null = null;
    let completedWeeks = 0;

    const curriculumReleaseId = lessonPlan?.curriculum_release_id ?? null;
    const curriculumDraftId = lessonPlan?.curriculum_version_id ?? null;
    if (curriculumReleaseId || curriculumDraftId) {
      let q = admin
        .from("curriculum_week_tracking")
        .select("term_number, week_number, status, updated_at");
      q = curriculumReleaseId
        ? q.eq("curriculum_release_id", curriculumReleaseId)
        : q.eq("curriculum_id", curriculumDraftId);
      if (enr.school_id) q = q.eq("school_id", enr.school_id);
      else q = q.is("school_id", null);
      if (pathClassId) q = q.eq("class_id", pathClassId);
      const { data: trackingRows } = await q;
      const completed = (trackingRows ?? [])
        .filter((t: any) => t.status === "completed")
        .sort(
          (a: any, b: any) =>
            a.term_number - b.term_number || a.week_number - b.week_number
        );
      completedWeeks = completed.length;
      if (completed.length > 0) {
        const last = completed[completed.length - 1];
        currentTerm = Number(last.term_number ?? 1);
        currentWeek = Number(last.week_number ?? 1) + 1;
        lastTopic = weekTopicFromCurriculum(
          curriculumContent,
          Number(last.term_number ?? 1),
          Number(last.week_number ?? 1)
        );
      }
      completionPct =
        totalWeeks > 0
          ? Math.min(100, Math.round((completedWeeks / totalWeeks) * 100))
          : 0;
    }

    const [
      { data: assignmentRows },
      { data: submissionRows },
      { data: reportCandidates },
    ] = await Promise.all([
      admin
        .from("assignments")
        .select("id, term_id")
        .eq("course_id", enr.course_id)
        .eq("is_active", true),
      admin
        .from("assignment_submissions")
        .select("id, status, grade, assignments!inner(course_id, term_id)")
        .eq("portal_user_id", enr.student_id)
        .eq("assignments.course_id", enr.course_id),
      admin
        .from("student_progress_reports")
        .select(
          "id, overall_grade, overall_score, is_published, report_term, report_period, term_id, updated_at"
        )
        .eq("student_id", enr.student_id)
        .eq("course_id", enr.course_id)
        .order("updated_at", { ascending: false })
        .limit(20),
    ]);
    const { matchesAssignmentSession } = await import(
      "@/lib/assignments/session"
    );
    const sessionAssignments = ((assignmentRows ?? []) as any[]).filter((a) =>
      matchesAssignmentSession(a.term_id, pathTermId, true)
    );
    const totalAssignments = sessionAssignments.length;
    const gradedSubmissions = ((submissionRows ?? []) as any[]).filter(
      (s: any) => {
        if (!(s.grade != null || s.status === "graded")) return false;
        return matchesAssignmentSession(
          s.assignments?.term_id ?? null,
          pathTermId,
          true
        );
      }
    ).length;
    const assignmentPct =
      totalAssignments > 0
        ? Math.min(
            100,
            Math.round((gradedSubmissions / totalAssignments) * 100)
          )
        : 0;

    // Never fall back to another session's report — null if no match for this path term.
    let latestReport: any = null;
    if (pathTermId) {
      latestReport =
        ((reportCandidates ?? []) as any[]).find(
          (r) => r.term_id === pathTermId
        ) ?? null;
    } else {
      latestReport = (reportCandidates ?? [])[0] ?? null;
    }

    const statusSummary =
      enr.status === "active"
        ? "On active learning path"
        : enr.status === "completed"
        ? "Learning path completed"
        : `Enrollment status: ${enr.status}`;

    paths.push({
      enrollment_id: enr.id,
      student_id: enr.student_id,
      course_id: enr.course_id,
      course_title: enr.courses?.title ?? "Course",
      program_name: enr.courses?.programs?.name ?? "Program",
      level_order: enr.courses?.level_order ?? null,
      school_id: enr.school_id,
      enrollment_status: enr.status,
      promoted_to: enr.promoted_to,
      term_label: enr.term_label,
      start_week: enr.start_week,
      curriculum_id: curriculumDraftId,
      curriculum_release_id: curriculumReleaseId,
      curriculum_version:
        (curriculumSource as any)?.release_number ??
        (curriculumSource as any)?.version ??
        null,
      lesson_plan_id: lessonPlan?.id ?? null,
      lesson_plan_status: lessonPlan?.status ?? null,
      term_statuses: termStatuses,
      class_id: classByStudent[enr.student_id] ?? null,
      class_term_id: classTermByStudent[enr.student_id] ?? null,
      is_current_class_course: currentCourseByStudent[enr.student_id]
        ? currentCourseByStudent[enr.student_id] === enr.course_id
        : null,
      current_term: currentTerm,
      current_week: currentWeek,
      completed_weeks: completedWeeks,
      total_weeks: totalWeeks,
      completion_pct: completionPct,
      assignments_completed: gradedSubmissions,
      assignments_total: totalAssignments,
      assignment_completion_pct: assignmentPct,
      latest_report: latestReport
        ? {
            id: latestReport.id,
            overall_grade: latestReport.overall_grade,
            overall_score: latestReport.overall_score,
            is_published: latestReport.is_published,
            report_term: latestReport.report_term,
            report_period: latestReport.report_period,
          }
        : null,
      last_topic: lastTopic,
      status_summary: statusSummary,
      visibility_mode: visibilityMode,
      can_view_full: visibilityMode === "full",
      updated_at: enr.updated_at,
    });
  }

  return NextResponse.json({
    data: {
      role: profile.role,
      children: childOptions,
      paths,
    },
  });
}
