import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { canAccessLessonScope } from "./authz";
import { getTeacherSchoolIds } from "@/lib/auth-utils";
import { summarisePlanContent } from "@/lib/academic/plan-content-summary";

export const dynamic = "force-dynamic";
import { inferTermNumberFromPlanTerm } from "@/lib/lesson-plans/syllabusImport";
import {
  mapOfficialCurriculumToCalendarWeeks,
  resolveOfficialCurriculumDirection,
  resolveOfficialDeliverySchedule,
} from "@/lib/curriculum/official-direction";
import { fallbackScheduleRow } from "@/lib/academic/entry-point";

async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("portal_users")
    .select("role, school_id")
    .eq("id", user.id)
    .single();
  return data ? { ...user, role: data.role, school_id: data.school_id } : null;
}

type AcademicTermContext = {
  academic_year?: string | null;
  term_number?: number | null;
  term_label?: string | null;
};

function canCreateLessonPlan(role: string | undefined) {
  return role === "admin" || role === "teacher";
}

// GET /api/lesson-plans — list lesson plans for a lesson or all accessible ones
export async function GET(request: Request) {
  const user = await getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const lessonId = searchParams.get("lesson_id");
  const courseId = searchParams.get("course_id");
  const curriculumVersionId = searchParams.get("curriculum_version_id");
  const classId = searchParams.get("class_id");
  const termIdParam = searchParams.get("term_id");
  const allSessions = searchParams.get("all_sessions") === "1";
  const limitRaw = Number(searchParams.get("limit") ?? 0);

  const db = createAdminClient();

  // Two foreign keys join lesson_plans and lessons — lesson_plans.lesson_id
  // and lessons.lesson_plan_id — so the embed must name one or PostgREST
  // rejects the whole query. It had been failing with 500 for every
  // teaching-plan list. These are the lessons belonging to the plan.
  let query = db
    .from("lesson_plans")
    .select(
      `
    *,
    created_by,
    courses(id, title, program_id),
    classes!lesson_plans_class_id_fkey(id, name, teacher_id),
    schools!lesson_plans_school_id_fkey(id, name),
    lessons!lessons_lesson_plan_id_fkey(id, title, course_id, school_id, created_by,
      courses(id, title, program_id)
    )
  `
    )
    .order("created_at", { ascending: false });

  if (lessonId) {
    query = query.eq("lesson_id", lessonId);
  }
  if (courseId) {
    query = query.eq("course_id", courseId);
  }
  if (curriculumVersionId) {
    query = query.eq("curriculum_version_id", curriculumVersionId);
  }
  if (classId) {
    query = query.eq("class_id", classId);
  }
  if (Number.isInteger(limitRaw) && limitRaw > 0) {
    query = query.limit(Math.min(limitRaw, 100));
  }

  const { data, error } = await query;
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  const tSchoolIds =
    user.role === "teacher"
      ? await getTeacherSchoolIds(user.id, user.school_id)
      : [];

  // Filter by scope access for non-admins
  let plans = data ?? [];
  if (user.role !== "admin") {
    plans = plans.filter((p: any) => {
      const klass = Array.isArray(p?.classes) ? p.classes[0] : p?.classes;
      return canAccessLessonScope(
        { id: user.id, role: user.role, school_id: user.school_id },
        {
          school_id: p?.lessons?.school_id ?? p?.school_id ?? null,
          // Prefer the plan's own created_by for term-level plans (no lesson_id).
          created_by: p?.created_by ?? p?.lessons?.created_by ?? null,
          class_id: p?.class_id ?? null,
          class_teacher_id: klass?.teacher_id ?? null,
        },
        tSchoolIds
      );
    });
  }

  if (!allSessions) {
    const { resolveAssignmentTermId } = await import(
      "@/lib/assignments/session"
    );
    const liveTermId = await resolveAssignmentTermId(db as any, {});
    const termId = termIdParam || liveTermId;
    if (termId) {
      plans = plans.filter((p: any) => {
        const planTerm = p.term_id ?? null;
        if (planTerm === termId) return true;
        // Legacy untagged plans only surface for the live session.
        return !planTerm && termId === liveTermId;
      });
    }
  }

  // The list screen receives one canonical five-asset summary. Previously it
  // fetched lessons and assignments separately in the browser, ignored slides,
  // flashcards and projects, and therefore showed a different readiness number
  // from the class workspace and release gate.
  const planIds = plans.map((plan: any) => String(plan.id)).filter(Boolean);
  if (planIds.length > 0) {
    const [lessonRows, assignmentRows, slideRows, flashcardRows] =
      await Promise.all([
        db
          .from("lessons")
          .select(
            "id,lesson_plan_id,curriculum_week_number,session_number,status"
          )
          .in("lesson_plan_id", planIds),
        db
          .from("assignments")
          .select(
            "id,lesson_plan_id,lesson_id,curriculum_week_number,session_number,assignment_type,is_active"
          )
          .in("lesson_plan_id", planIds),
        (db as any)
          .from("lesson_materials")
          .select(
            "id,lesson_plan_id,lesson_id,curriculum_week_number,session_number,file_type,is_public"
          )
          .in("lesson_plan_id", planIds)
          .eq("file_type", "slide-deck"),
        (db as any)
          .from("flashcard_decks")
          .select(
            "id,lesson_plan_id,lesson_id,curriculum_week_number,session_number,is_public"
          )
          .in("lesson_plan_id", planIds),
      ]);

    const contentError = [
      lessonRows.error,
      assignmentRows.error,
      slideRows.error,
      flashcardRows.error,
    ].find(Boolean);
    if (contentError) {
      return NextResponse.json(
        { error: `Teaching content summary failed: ${contentError.message}` },
        { status: 500 }
      );
    }

    const rowsForPlan = (rows: any[] | null | undefined, planId: string) =>
      (rows ?? []).filter((row: any) => row.lesson_plan_id === planId);

    plans = plans.map((plan: any) => {
      const assignments = rowsForPlan(assignmentRows.data, plan.id);
      return {
        ...plan,
        content_summary: summarisePlanContent({
          planWeeks: Array.isArray(plan.plan_data?.weeks)
            ? plan.plan_data.weeks
            : [],
          lessons: rowsForPlan(lessonRows.data, plan.id),
          assignments: assignments.filter(
            (row: any) =>
              String(row.assignment_type ?? "").toLowerCase() !== "project"
          ),
          projects: assignments.filter(
            (row: any) =>
              String(row.assignment_type ?? "").toLowerCase() === "project"
          ),
          slideDecks: rowsForPlan(slideRows.data, plan.id),
          flashcardDecks: rowsForPlan(flashcardRows.data, plan.id),
        }),
      };
    });
  }

  return NextResponse.json({ data: plans });
}

// POST /api/lesson-plans — create a term-level lesson plan (or legacy per-lesson upsert)
export async function POST(request: Request) {
  const user = await getUser();
  if (!user || !canCreateLessonPlan(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const {
    // Legacy per-lesson fields
    lesson_id,
    objectives,
    activities,
    assessment_methods,
    staff_notes,
    summary_notes,
    // New term-level fields (Req 15)
    plan_data,
    status,
    version,
    curriculum_version_id,
    term_start,
    term_end,
    sessions_per_week,
    school_id,
    course_id,
    class_id,
    term,
    term_id,
  } = body;

  const db = createAdminClient();

  // ── Term-level plan (new flow) ──────────────────────────────────────────
  if (course_id || (!lesson_id && (term_start || term_end))) {
    let targetSchoolId = school_id || user.school_id || null;

    if (!course_id) {
      return NextResponse.json(
        { error: "course_id is required for class lesson plans" },
        { status: 400 }
      );
    }
    if (!class_id) {
      return NextResponse.json(
        { error: "Assign a class before creating a lesson plan" },
        { status: 400 }
      );
    }

    const { data: course } = await db
      .from("courses")
      .select("id, school_id, program_id")
      .eq("id", course_id)
      .maybeSingle();
    if (!course) {
      return NextResponse.json(
        { error: "Selected course not found" },
        { status: 400 }
      );
    }
    const courseRow = course as {
      school_id: string | null;
      program_id: string | null;
    };
    const courseSchoolId = courseRow.school_id;

    // The class owns the canonical academic term; callers cannot create a parallel term identity.
    let canonicalTermId: string | null = term_id || null;
    let canonicalOfferingPeriodId: string | null = null;
    let classOfferingId: string | null = null;
    let classAcademicTerm: AcademicTermContext | null = null;
    // Ensure selected class belongs to the chosen school scope.
    if (class_id) {
      const { data: klass } = await db
        .from("classes")
        .select(
          "id, school_id, program_id, teacher_id, term_id, offering_period_id, academic_offering_id, academic_terms(academic_year,term_number,term_label)"
        )
        .eq("id", class_id)
        .maybeSingle();
      if (!klass) {
        return NextResponse.json(
          { error: "Selected class not found" },
          { status: 400 }
        );
      }
      const classRow = klass as {
        school_id: string | null;
        program_id: string | null;
        teacher_id: string | null;
        term_id: string | null;
        offering_period_id: string | null;
      };
      const classContext = classRow as typeof classRow & {
        academic_offering_id: string | null;
        academic_terms: AcademicTermContext | AcademicTermContext[];
      };
      classOfferingId = classContext.academic_offering_id;
      classAcademicTerm = Array.isArray(classContext.academic_terms)
        ? classContext.academic_terms[0] ?? null
        : classContext.academic_terms;
      if (
        canonicalTermId &&
        classRow.term_id &&
        canonicalTermId !== classRow.term_id
      ) {
        return NextResponse.json(
          { error: "Academic term does not match the selected class" },
          { status: 400 }
        );
      }
      canonicalTermId = classRow.term_id || canonicalTermId;
      canonicalOfferingPeriodId = classRow.offering_period_id || null;
      const classSchoolId = classRow.school_id;
      if (!targetSchoolId && classSchoolId) {
        targetSchoolId = classSchoolId;
      }
      if (targetSchoolId && classSchoolId && classSchoolId !== targetSchoolId) {
        return NextResponse.json(
          { error: "Selected class does not belong to the selected school" },
          { status: 400 }
        );
      }
      if (user.role === "teacher" && classRow.teacher_id !== user.id) {
        return NextResponse.json(
          {
            error:
              "You can only create lesson plans for classes assigned to you",
          },
          { status: 403 }
        );
      }
      if (
        courseRow.program_id &&
        classRow.program_id &&
        courseRow.program_id !== classRow.program_id
      ) {
        return NextResponse.json(
          {
            error:
              "Selected class is not assigned to the selected course programme",
          },
          { status: 400 }
        );
      }
    }

    if (courseSchoolId && targetSchoolId && courseSchoolId !== targetSchoolId) {
      return NextResponse.json(
        { error: "Selected course belongs to a different school" },
        { status: 400 }
      );
    }
    if (courseSchoolId && !targetSchoolId) {
      return NextResponse.json(
        { error: "School-specific courses require a school-scoped plan" },
        { status: 400 }
      );
    }

    // Validate teacher can only create plans inside assigned schools.
    if (user.role === "teacher") {
      const teacherSchoolIds = await getTeacherSchoolIds(
        user.id,
        user.school_id
      );
      if (targetSchoolId && !teacherSchoolIds.includes(targetSchoolId)) {
        return NextResponse.json(
          { error: "You can only create plans for your assigned schools" },
          { status: 403 }
        );
      }
    }

    if (!targetSchoolId) {
      return NextResponse.json(
        { error: "The selected class has no school context." },
        { status: 400 }
      );
    }
    const officialDirection = await resolveOfficialCurriculumDirection(db, {
      schoolId: targetSchoolId,
      offeringId: classOfferingId,
      courseId: course_id,
      academicSession: classAcademicTerm?.academic_year ?? null,
      academicTermNumber: classAcademicTerm?.term_number ?? null,
    });
    if (!officialDirection) {
      return NextResponse.json(
        {
          error:
            "The Academic Office must assign an official curriculum direction before this teaching plan can be created.",
        },
        { status: 409 }
      );
    }
    if (
      curriculum_version_id &&
      curriculum_version_id !== officialDirection.source_curriculum_id
    ) {
      return NextResponse.json(
        {
          error:
            "The selected Studio draft is not the official direction assigned to this class. Reopen the class and use its assigned direction.",
        },
        { status: 409 }
      );
    }
    if (!officialDirection.source_curriculum_id) {
      return NextResponse.json(
        {
          error:
            "The approved curriculum direction is incomplete. Ask the Academic Office to repair its source before creating a class plan.",
        },
        { status: 409 }
      );
    }
    const sourceCurriculumId = officialDirection.source_curriculum_id;
    let duplicateQuery = db
      .from("lesson_plans")
      .select("id")
      .eq("course_id", course_id)
      .eq("class_id", class_id);
    if (canonicalTermId)
      duplicateQuery = duplicateQuery.eq("term_id", canonicalTermId);
    else if (canonicalOfferingPeriodId)
      duplicateQuery = duplicateQuery.eq(
        "offering_period_id",
        canonicalOfferingPeriodId
      );
    else if (term) duplicateQuery = duplicateQuery.eq("term", term);
    if (targetSchoolId) {
      duplicateQuery = duplicateQuery.eq(
        "school_id",
        targetSchoolId
      ) as typeof duplicateQuery;
    } else {
      duplicateQuery = duplicateQuery.is(
        "school_id",
        null
      ) as typeof duplicateQuery;
    }
    const { data: duplicatePlan } = await duplicateQuery.maybeSingle();
    if (duplicatePlan) {
      return NextResponse.json(
        {
          error:
            "A lesson plan already exists for this class, course, and academic term.",
          existing_id: (duplicatePlan as { id: string }).id,
        },
        { status: 409 }
      );
    }

    // Seed only from the immutable official release. The Studio draft remains
    // provenance and may change without changing an active teaching plan.
    let autoPlanData = plan_data ?? {};
    const targetYear =
      typeof body.curriculum_year === "number" ? body.curriculum_year : 1;
    autoPlanData.curriculum_year = targetYear;

    if (!plan_data || !plan_data.weeks?.length) {
      const calendarTerm =
        Number(classAcademicTerm?.term_number) ||
        inferTermNumberFromPlanTerm(term);
      const schedule = (await resolveOfficialDeliverySchedule(db, {
        schoolId: targetSchoolId,
        classId: class_id,
        courseId: course_id,
        releaseId: officialDirection.id,
      })) ??
        fallbackScheduleRow({
          entryTerm: officialDirection.effective_term_number ?? calendarTerm,
          curriculumYear: targetYear,
        });
      autoPlanData = {
        ...autoPlanData,
        academic_direction: {
          release_id: officialDirection.id,
          title: officialDirection.title,
          academic_session: officialDirection.academic_session,
        },
        starts_at_week: Number(schedule.entry_week_number ?? 1),
        weeks: mapOfficialCurriculumToCalendarWeeks({
          content: officialDirection.content,
          directionAcademicSession: officialDirection.academic_session,
          currentAcademicSession: classAcademicTerm?.academic_year ?? null,
          calendarTerm,
          schedule,
        }),
      };
    }
    const parsedSessions = Number(sessions_per_week);
    const effectiveSessions = Number.isFinite(parsedSessions)
      ? Math.max(1, Math.floor(parsedSessions))
      : 1;
    // The database function owns plan identity and takes an advisory lock.
    // This closes the check-then-insert race that could create two plans when
    // automation and a teacher opened the same class at the same time. It also
    // keys special programmes by their delivery period instead of a loose term
    // label, so school and special-programme plans use the same authority.
    const { data: ensured, error: ensureError } = await db.rpc(
      "ensure_class_teaching_plan",
      {
        p_class_id: class_id,
        p_course_id: course_id,
        p_curriculum_version_id: sourceCurriculumId,
        p_actor_id: user.id,
        p_academic_term_id: canonicalTermId ?? undefined,
        p_offering_period_id: canonicalTermId
          ? undefined
          : canonicalOfferingPeriodId ?? undefined,
        p_sessions_per_week: effectiveSessions,
      }
    );
    if (ensureError) {
      return NextResponse.json(
        { error: "The class plan could not be created. Refresh and try again." },
        { status: 400 }
      );
    }
    const ensuredPlan = ensured as unknown as {
      plan_id: string;
      created: boolean;
    };
    if (!ensuredPlan.created) {
      return NextResponse.json(
        {
          error:
            "A class plan already exists for this class, course, and teaching period.",
          existing_id: ensuredPlan.plan_id,
        },
        { status: 409 }
      );
    }

    const { data, error } = await db
      .from("lesson_plans")
      .update({
        curriculum_release_id: officialDirection.id,
        curriculum_version_id: sourceCurriculumId,
        plan_data: autoPlanData,
        status: status ?? "draft",
        version: version ?? 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", ensuredPlan.plan_id)
      .select()
      .single();

    if (error)
      return NextResponse.json(
        {
          error:
            "The class plan was created, but its curriculum could not be attached. Reopen the class to repair it.",
          existing_id: ensuredPlan.plan_id,
        },
        { status: 500 }
      );
    return NextResponse.json({ data }, { status: 201 });
  }

  // ── Legacy per-lesson upsert ────────────────────────────────────────────
  if (!lesson_id)
    return NextResponse.json(
      { error: "lesson_id or course_id required" },
      { status: 400 }
    );

  const { data: lesson, error: lessonErr } = await db
    .from("lessons")
    .select("id, school_id, class_id, created_by")
    .eq("id", lesson_id)
    .maybeSingle();
  if (lessonErr || !lesson)
    return NextResponse.json({ error: "Lesson not found" }, { status: 404 });

  if (user.role === "teacher") {
    const teacherSchoolIds = await getTeacherSchoolIds(user.id, user.school_id);
    const { data: lessonClass } = lesson.class_id
      ? await db
          .from("classes")
          .select("teacher_id")
          .eq("id", lesson.class_id)
          .maybeSingle()
      : { data: null };
    const allowed = canAccessLessonScope(
      { id: user.id, role: user.role, school_id: user.school_id },
      {
        school_id: lesson.school_id ?? null,
        created_by: lesson.created_by ?? null,
        class_id: lesson.class_id ?? null,
        class_teacher_id: lessonClass?.teacher_id ?? null,
      },
      teacherSchoolIds
    );
    if (!allowed)
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await db
    .from("lesson_plans")
    .upsert(
      {
        lesson_id,
        objectives: objectives || null,
        activities: activities || null,
        assessment_methods: assessment_methods || null,
        staff_notes: staff_notes || null,
        summary_notes: summary_notes || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "lesson_id" }
    )
    .select()
    .single();

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
