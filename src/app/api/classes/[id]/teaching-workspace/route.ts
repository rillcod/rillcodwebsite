import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTeacherSchoolIds } from "@/lib/auth-utils";
import { humanEntryPoint, humanTermLabel } from "@/lib/curriculum/humanLabels";
import {
  mapOfficialCurriculumToCalendarWeeks,
  resolveOfficialCurriculumDirection,
  resolveOfficialDeliverySchedule,
} from "@/lib/curriculum/official-direction";

export const dynamic = "force-dynamic";

type Actor = { id: string; role: string; school_id: string | null };

async function getActor(): Promise<Actor | null> {
  const auth = await createClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) return null;
  const { data } = await createAdminClient()
    .from("portal_users")
    .select("id,role,school_id")
    .eq("id", user.id)
    .maybeSingle();
  return data as Actor | null;
}

async function scope(db: any, id: string, user: Actor) {
  const { data: klass } = await db
    .from("classes")
    .select(
      "id,name,school_id,teacher_id,program_id,term_id,current_course_id,academic_offering_id,offering_period_id,academic_terms(id,academic_year,term_number,term_label,start_date,end_date),academic_offering_periods(id,label,sequence_number,starts_on,ends_on),schools(name)"
    )
    .eq("id", id)
    .maybeSingle();
  if (!klass) return { error: "Class not found", status: 404 };
  if (user.role === "teacher") {
    const ids = await getTeacherSchoolIds(user.id, user.school_id);
    if (klass.teacher_id !== user.id || !ids.includes(klass.school_id))
      return { error: "This class is not assigned to you", status: 403 };
  }
  if (user.role === "school" && klass.school_id !== user.school_id)
    return { error: "This class belongs to another school", status: 403 };
  if (!["admin", "teacher", "school"].includes(user.role))
    return { error: "Staff access required", status: 403 };
  return { klass };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getActor();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const db: any = createAdminClient();
  const scoped: any = await scope(db, id, user);
  if (scoped.error)
    return NextResponse.json(
      { error: scoped.error },
      { status: scoped.status }
    );
  const klass = scoped.klass;
  const courseId =
    new URL(req.url).searchParams.get("course_id") ||
    klass.current_course_id ||
    null;
  const { data: courses } = klass.program_id
    ? await db
        .from("courses")
        .select("id,title,program_id,school_id")
        .eq("program_id", klass.program_id)
        .eq("is_active", true)
        .order("level_order")
    : { data: [] };
  if (
    courseId &&
    !(courses || []).some((course: any) => course.id === courseId)
  ) {
    return NextResponse.json(
      { error: "Course is not part of this class programme" },
      { status: 400 }
    );
  }

  let plan: any = null;
  let lessons: any[] = [];
  let deliveries: any[] = [];
  let progress: any = null;
  let direction: any = null;
  // Scheduled by an academic term (school pathways) or a delivery period
  // (bootcamps and short courses) — either identifies the plan.
  if (courseId && (klass.term_id || klass.offering_period_id)) {
    const planQuery = db
      .from("lesson_plans")
      .select("*")
      .eq("class_id", id)
      .eq("course_id", courseId)
      .neq("status", "archived");
    const { data: foundPlan } = await (klass.term_id
      ? planQuery.eq("term_id", klass.term_id)
      : planQuery.eq("offering_period_id", klass.offering_period_id)
    ).maybeSingle();
    plan = foundPlan;
    direction = await resolveOfficialCurriculumDirection(db, {
      schoolId: klass.school_id,
      offeringId: klass.academic_offering_id,
      courseId,
      academicSession: klass.academic_terms?.academic_year ?? null,
      academicTermNumber: klass.academic_terms?.term_number ?? null,
      pinnedReleaseId: plan?.curriculum_release_id,
    });
    if (plan) {
      const [lessonResult, deliveryResult, progressResult] = await Promise.all([
        db
          .from("lessons")
          .select(
            "id,title,description,status,session_date,duration_minutes,curriculum_week_number,lesson_plan_id"
          )
          .eq("lesson_plan_id", plan.id)
          .order("curriculum_week_number")
          .order("order_index"),
        db
          .from("class_lesson_delivery")
          .select("*")
          .eq("lesson_plan_id", plan.id)
          .order("week_number"),
        db
          .from("class_term_teaching_progress")
          .select("*")
          .eq("lesson_plan_id", plan.id)
          .maybeSingle(),
      ]);
      lessons = lessonResult.data || [];
      deliveries = deliveryResult.data || [];
      progress = progressResult.data;
    }
  }
  const legacyCurricula = direction
    ? [
        {
          id: direction.source_curriculum_id,
          course_id: direction.course_id,
          school_id: klass.school_id,
          version: 1,
          content: direction.content,
          official_direction_id: direction.id,
          title: direction.title,
        },
      ]
    : [];
  return NextResponse.json({
    data: {
      class: klass,
      courses: courses || [],
      selected_course_id: courseId,
      curricula: legacyCurricula,
      academic_direction: direction
        ? {
            available: true,
            title: direction.title,
            audience: direction.audience_label,
            academic_session: direction.academic_session,
            source: direction.source_metadata,
          }
        : {
            available: false,
            message:
              "The Academic Office has not assigned an official direction for this course yet.",
          },
      plan,
      lessons,
      deliveries,
      progress,
    },
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getActor();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["admin", "teacher"].includes(user.role))
    return NextResponse.json(
      { error: "Only teachers and administrators can change teaching records" },
      { status: 403 }
    );
  const { id } = await params;
  const db: any = createAdminClient();
  const scoped: any = await scope(db, id, user);
  if (scoped.error)
    return NextResponse.json(
      { error: scoped.error },
      { status: scoped.status }
    );
  const klass = scoped.klass;
  const body = await req.json();

  if (body.action === "ensure_plan") {
    // A school class is scheduled by an academic term; a bootcamp or short
    // course by a delivery period. Either is a valid basis for a plan.
    const hasTerm = !!klass.term_id && !!klass.academic_terms;
    const hasPeriod = !!klass.offering_period_id;
    if (!hasTerm && !hasPeriod)
      return NextResponse.json(
        {
          error:
            "This class has neither an academic term nor a delivery period. Give it a term for school pathways, or a delivery period for bootcamps and short courses.",
        },
        { status: 400 }
      );
    const courseId = typeof body.course_id === "string" ? body.course_id : "";
    const { data: course } = await db
      .from("courses")
      .select("id,program_id")
      .eq("id", courseId)
      .maybeSingle();
    if (
      !course ||
      (klass.program_id &&
        course.program_id &&
        klass.program_id !== course.program_id)
    ) {
      return NextResponse.json(
        { error: "Choose a course from this class programme." },
        { status: 400 }
      );
    }
    const existingQuery = db
      .from("lesson_plans")
      .select("id,curriculum_release_id")
      .eq("class_id", id)
      .eq("course_id", courseId)
      .neq("status", "archived");
    const { data: existing } = await (hasTerm
      ? existingQuery.eq("term_id", klass.term_id)
      : existingQuery.eq("offering_period_id", klass.offering_period_id)
    ).maybeSingle();
    const direction = await resolveOfficialCurriculumDirection(db, {
      schoolId: klass.school_id,
      offeringId: klass.academic_offering_id,
      courseId,
      academicSession: klass.academic_terms?.academic_year ?? null,
      academicTermNumber: klass.academic_terms?.term_number ?? null,
      pinnedReleaseId: existing?.curriculum_release_id,
    });
    if (!direction) {
      return NextResponse.json(
        {
          error:
            "The Academic Office must assign an official academic direction before this class plan can be created.",
        },
        { status: 409 }
      );
    }
    const schedule = (await resolveOfficialDeliverySchedule(db, {
      schoolId: klass.school_id,
      classId: id,
      courseId,
      releaseId: direction.id,
    })) ?? {
      entry_term_number:
        direction.effective_term_number ??
        klass.academic_terms?.term_number ??
        1,
      entry_week_number: 1,
      curriculum_year_number: 1,
      curriculum_term_number: 1,
      curriculum_week_number: 1,
      sessions_per_week: 1,
    };
    const { data, error } = await db.rpc("ensure_class_teaching_plan", {
      p_class_id: id,
      p_course_id: courseId,
      p_curriculum_version_id: direction.source_curriculum_id,
      p_actor_id: user.id,
      p_academic_term_id: hasTerm ? klass.term_id : null,
      p_offering_period_id: hasTerm ? null : klass.offering_period_id,
      p_sessions_per_week:
        Number(body.sessions_per_week) ||
        Number(schedule.sessions_per_week) ||
        1,
    });
    if (error)
      return NextResponse.json({ error: error.message }, { status: 400 });
    const result = data as { plan_id: string; created: boolean };
    if (!existing?.curriculum_release_id) {
      // A delivery period has no national term to map against, so its weeks
      // start from the edition's own entry point rather than a calendar term.
      const calendarTerm = hasTerm
        ? Number(klass.academic_terms.term_number)
        : Number(schedule.entry_term_number) || 1;
      const currentSession = hasTerm
        ? klass.academic_terms.academic_year
        : direction.academic_session;
      const weeks = mapOfficialCurriculumToCalendarWeeks({
        content: direction.content,
        directionAcademicSession: direction.academic_session,
        currentAcademicSession: currentSession,
        calendarTerm,
        schedule,
      });
      await db
        .from("lesson_plans")
        .update({
          curriculum_release_id: direction.id,
          curriculum_version_id: direction.source_curriculum_id,
          plan_data: {
            academic_direction: {
              title: direction.title,
              academic_session: direction.academic_session,
              entry_point: humanEntryPoint({
                termNumber: Number(schedule.entry_term_number),
                weekNumber: Number(schedule.entry_week_number),
              }),
              current_term: hasTerm
                ? humanTermLabel(Number(klass.academic_terms.term_number))
                : klass.academic_offering_periods?.label ?? "Delivery period",
            },
            starts_at_week: Number(schedule.entry_week_number),
            weeks,
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", result.plan_id);
    }
    return NextResponse.json(
      { data: { ...result, official_direction: direction.title } },
      { status: result.created ? 201 : 200 }
    );
  }

  // scope() proves the caller may act on this class, but the plan id arrives in
  // the body. Without this the caller could name a plan belonging to a class
  // they do not teach and write delivery against it.
  const planBelongsToClass = async (planId: unknown) => {
    if (typeof planId !== "string" || !planId) return false;
    const { data } = await db
      .from("lesson_plans")
      .select("id")
      .eq("id", planId)
      .eq("class_id", id)
      .maybeSingle();
    return !!data;
  };

  if (body.action === "record_delivery") {
    if (!(await planBelongsToClass(body.lesson_plan_id))) {
      return NextResponse.json(
        { error: "That teaching plan does not belong to this class" },
        { status: 403 }
      );
    }
    const { data, error } = await db.rpc("record_class_lesson_delivery", {
      p_lesson_plan_id: body.lesson_plan_id,
      p_week_number: Number(body.week_number),
      p_lesson_id: body.lesson_id || null,
      p_status: body.status || "delivered",
      p_actor_id: user.id,
      p_notes: body.notes || null,
      p_class_session_id: body.class_session_id || null,
    });
    if (error)
      return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ data });
  }

  // Same operation, several weeks of one plan. Delivery is class-scoped, so it
  // belongs here rather than under a curriculum id.
  if (body.action === "record_delivery_bulk") {
    const weekNumbers: number[] = Array.isArray(body.week_numbers)
      ? [
          ...new Set(
            (body.week_numbers as unknown[]).map((w) => Number(w))
          ),
        ].filter((w) => Number.isFinite(w) && w > 0)
      : [];
    if (weekNumbers.length === 0) {
      return NextResponse.json(
        { error: "Select at least one week" },
        { status: 400 }
      );
    }
    if (!(await planBelongsToClass(body.lesson_plan_id))) {
      return NextResponse.json(
        { error: "That teaching plan does not belong to this class" },
        { status: 403 }
      );
    }
    const status = body.status === "planned" ? "planned" : body.status === "skipped" ? "skipped" : "delivered";
    const results: unknown[] = [];
    for (const week of weekNumbers) {
      const { data, error } = await db.rpc("record_class_lesson_delivery", {
        p_lesson_plan_id: body.lesson_plan_id,
        p_week_number: week,
        p_lesson_id: null,
        p_status: status,
        p_actor_id: user.id,
        p_notes: body.notes || null,
        p_class_session_id: null,
      });
      if (error)
        return NextResponse.json(
          { error: `Week ${week}: ${error.message}` },
          { status: 400 }
        );
      results.push(data);
    }
    return NextResponse.json({ data: results, count: results.length, status });
  }

  return NextResponse.json(
    { error: "Unknown teaching action" },
    { status: 400 }
  );
}
