import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { canAccessLessonScope } from "./authz";
import { getTeacherSchoolIds } from "@/lib/auth-utils";

export const dynamic = "force-dynamic";
import { inferTermNumberFromPlanTerm } from "@/lib/lesson-plans/syllabusImport";
import {
  mapOfficialCurriculumToCalendarWeeks,
  resolveOfficialCurriculumDirection,
  resolveOfficialDeliverySchedule,
} from "@/lib/curriculum/official-direction";

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
    classes!lesson_plans_class_id_fkey(id, name),
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
    plans = plans.filter((p: any) =>
      canAccessLessonScope(
        { id: user.id, role: user.role, school_id: user.school_id },
        {
          school_id: p?.lessons?.school_id ?? p?.school_id ?? null,
          // Prefer the plan's own created_by for term-level plans (no lesson_id).
          created_by: p?.created_by ?? p?.lessons?.created_by ?? null,
        },
        tSchoolIds
      )
    );
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
    let classOfferingId: string | null = null;
    let classAcademicTerm: AcademicTermContext | null = null;
    // Ensure selected class belongs to the chosen school scope.
    if (class_id) {
      const { data: klass } = await db
        .from("classes")
        .select(
          "id, school_id, program_id, teacher_id, term_id, academic_offering_id, academic_terms(academic_year,term_number,term_label)"
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
    let duplicateQuery = db
      .from("lesson_plans")
      .select("id")
      .eq("course_id", course_id)
      .eq("class_id", class_id);
    if (canonicalTermId)
      duplicateQuery = duplicateQuery.eq("term_id", canonicalTermId);
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
      })) ?? {
        entry_term_number:
          officialDirection.effective_term_number ?? calendarTerm,
        entry_week_number: 1,
        curriculum_year_number: targetYear,
        curriculum_term_number: 1,
        curriculum_week_number: 1,
      };
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
    const { data, error } = await db
      .from("lesson_plans")
      .insert({
        course_id: course_id || null,
        class_id: class_id || null,
        school_id: targetSchoolId,
        term: term || null,
        term_id: canonicalTermId,
        term_start: term_start || null,
        term_end: term_end || null,
        sessions_per_week: sessions_per_week ? Number(sessions_per_week) : null,
        curriculum_release_id: officialDirection.id,
        curriculum_version_id: officialDirection.source_curriculum_id,
        plan_data: autoPlanData,
        status: status ?? "draft",
        version: version ?? 1,
        created_by: user.id,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });
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
    .select("id, school_id, created_by")
    .eq("id", lesson_id)
    .maybeSingle();
  if (lessonErr || !lesson)
    return NextResponse.json({ error: "Lesson not found" }, { status: 404 });

  if (user.role === "teacher") {
    const teacherSchoolIds = await getTeacherSchoolIds(user.id, user.school_id);
    const allowed = canAccessLessonScope(
      { id: user.id, role: user.role, school_id: user.school_id },
      {
        school_id: lesson.school_id ?? null,
        created_by: lesson.created_by ?? null,
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
