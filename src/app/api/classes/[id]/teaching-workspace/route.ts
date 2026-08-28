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
import { diagnoseDirection } from "@/lib/academic/status";
import type { StageStatus } from "@/lib/academic/status";
import { parseRequestSession } from "@/lib/academic/session-identity";
import {
  buildTeachingWeekRows,
  parseTeachingTargets,
} from "@/lib/academic/teaching-workspace";
import { classCoverageFromRows } from "@/lib/academic/class-coverage";
import {
  describeAutoGenerateSettings,
  parseAutoGenerateSettings,
} from "@/lib/academic/auto-generate-settings";
import {
  schoolCalendarDate,
  schoolWeekRange,
} from "@/lib/timetable/sessions-from-slots";
import {
  defaultCompulsoryTermActivities,
  expandPlanWeeksForMeetings,
  policyFromClassSchool,
} from "@/lib/academic/school-programme-standing";
import { fallbackScheduleRow, readDeliveryPosition } from "@/lib/academic/entry-point";
import { logAudit } from "@/lib/audit/log";

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
      "id,name,school_id,teacher_id,program_id,term_id,current_course_id,academic_offering_id,offering_period_id,academic_terms(id,academic_year,term_number,term_label,start_date,end_date),academic_offerings(id,title,enrollment_type,pathway,programme_id),academic_offering_periods(id,label,sequence_number,starts_on,ends_on),schools(name,programme_standing,sessions_per_week,exam_capture,test_capture)"
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
  let courseId =
    new URL(req.url).searchParams.get("course_id") ||
    klass.current_course_id ||
    null;
  const effectiveProgrammeId =
    klass.program_id || klass.academic_offerings?.programme_id || null;
  const { data: courses } = effectiveProgrammeId
    ? await db
        .from("courses")
        .select("id,title,program_id,school_id")
        .eq("program_id", effectiveProgrammeId)
        .eq("is_active", true)
        .order("level_order")
    : { data: [] };
  // Fallback: If no courseId was provided or set on class, pick the course that
  // already has a lesson plan, or default to courses[0].
  if (!courseId && (courses || []).length > 0) {
    const { data: existingPlanRow } = await db
      .from("lesson_plans")
      .select("course_id")
      .eq("class_id", id)
      .neq("status", "archived")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    courseId = existingPlanRow?.course_id || courses[0].id;
  }

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
  let projects: any[] = [];
  let assignments: any[] = [];
  let slideDecks: any[] = [];
  let flashcardDecks: any[] = [];
  // Evaluations were the one asset the workspace could create but never read
  // back, so a week that already had one looked identical to a week that did
  // not, and "Evaluation" always reopened the create form.
  let exams: any[] = [];
  let deliveries: any[] = [];
  let progress: any = null;
  let direction: any = null;

  const hasTerm = Boolean(klass.term_id && klass.academic_terms);
  const hasPeriod = Boolean(klass.offering_period_id);
  const hasOffering = Boolean(klass.academic_offering_id);

  // Scheduled by an academic term (school pathways), delivery period, or academic offering
  if (courseId && (hasTerm || hasPeriod || hasOffering)) {
    let planQuery = db
      .from("lesson_plans")
      .select("*")
      .eq("class_id", id)
      .eq("course_id", courseId)
      .neq("status", "archived");

    if (hasTerm) {
      planQuery = planQuery.eq("term_id", klass.term_id);
    } else if (hasPeriod) {
      planQuery = planQuery.eq("offering_period_id", klass.offering_period_id);
    } else if (hasOffering) {
      planQuery = planQuery.eq("academic_offering_id", klass.academic_offering_id);
    }

    const { data: foundPlan } = await planQuery
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
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
      const [lessonResult, deliveryResult, progressResult] =
        await Promise.all([
          db
            .from("lessons")
            .select(
              "id,title,description,content_layout,status,session_date,session_number,duration_minutes,curriculum_week_number,lesson_plan_id,metadata,shared_master_id"
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
      const lessonIds = lessons.map((lesson: any) => lesson.id).filter(Boolean);
      const planOrLessonScope = [
        `lesson_plan_id.eq.${plan.id}`,
        ...(lessonIds.length ? [`lesson_id.in.(${lessonIds.join(",")})`] : []),
      ].join(",");
      const [assignmentResult, slideResult, flashcardResult, examResult] =
        await Promise.all([
          db
            .from("assignments")
            .select(
              "id,title,is_active,due_date,lesson_id,lesson_plan_id,curriculum_week_number,session_number,metadata,assignment_type,shared_master_id"
            )
            .or(
              [
                `lesson_plan_id.eq.${plan.id}`,
                ...(lessonIds.length
                  ? [`lesson_id.in.(${lessonIds.join(",")})`]
                  : []),
              ].join(",")
            )
            .order("curriculum_week_number", { ascending: true, nullsFirst: false })
            .order("session_number", { ascending: true, nullsFirst: false })
            .order("created_at", { ascending: false }),
          db
            .from("lesson_materials")
            .select(
              "id,title,lesson_id,lesson_plan_id,curriculum_week_number,session_number,is_public,content_stale_at"
            )
            .or(planOrLessonScope)
            .eq("file_type", "slide-deck")
            .order("curriculum_week_number", { ascending: true, nullsFirst: false })
            .order("session_number", { ascending: true, nullsFirst: false })
            .order("created_at", { ascending: false }),
          db
            .from("flashcard_decks")
            .select(
              "id,title,lesson_id,lesson_plan_id,curriculum_week_number,session_number,is_public,content_stale_at"
            )
            .or(planOrLessonScope)
            .order("curriculum_week_number", { ascending: true, nullsFirst: false })
            .order("session_number", { ascending: true, nullsFirst: false })
            .order("created_at", { ascending: false }),
          // exam_type is not a column — it lives in metadata, the way the
          // results views read it (metadata->>'exam_type').
          db
            .from("cbt_exams")
            .select(
              "id,title,is_active,metadata,lesson_id,lesson_plan_id,curriculum_week_number"
            )
            .or(planOrLessonScope)
            .order("curriculum_week_number", { ascending: true, nullsFirst: false })
            .order("session_number", { ascending: true, nullsFirst: false })
            .order("created_at", { ascending: false }),
        ]);
      const assignmentRows = assignmentResult.data || [];
      const isLegacyAssignmentBlock = (row: any) =>
        row.metadata?.source === "week-ai-generator";
      assignments = assignmentRows.filter(
        (row: any) =>
          row.assignment_type !== "project" || isLegacyAssignmentBlock(row)
      );
      projects = assignmentRows.filter(
        (row: any) =>
          row.assignment_type === "project" && !isLegacyAssignmentBlock(row)
      );
      slideDecks = slideResult.data || [];
      flashcardDecks = flashcardResult.data || [];
      exams = examResult.data || [];
    }
    // Auto-heal plan_data.weeks if missing Week 1 or truncated from legacy term-slicing
    if (direction?.content && plan?.plan_data) {
      const existingWeeks: any[] = Array.isArray(plan.plan_data.weeks)
        ? plan.plan_data.weeks
        : [];
      if (
        existingWeeks.length === 0 ||
        !existingWeeks.some((w: any) => Number(w.week) === 1)
      ) {
        const fullWeeks = mapOfficialCurriculumToCalendarWeeks({
          content: direction.content,
          directionAcademicSession: direction.academic_session,
          currentAcademicSession: klass.academic_terms?.academic_year ?? null,
          calendarTerm: klass.academic_terms?.term_number ?? 1,
          schedule: {},
        });
        if (fullWeeks.length > 0) {
          plan = {
            ...plan,
            plan_data: {
              ...plan.plan_data,
              weeks: fullWeeks,
            },
          };
        }
      }
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
  const schoolPolicy = policyFromClassSchool(
    klass.schools,
    plan?.sessions_per_week
  );
  const termActivities = schoolPolicy.usesHostEvaluation
    ? defaultCompulsoryTermActivities(
        klass.academic_terms?.start_date,
        klass.academic_terms?.end_date
      )
    : [];
  const weekRows = plan
    ? buildTeachingWeekRows({
        planWeeks: expandPlanWeeksForMeetings(
          Array.isArray(plan.plan_data?.weeks) ? plan.plan_data.weeks : [],
          schoolPolicy.sessionsPerWeek
        ),
        lessons,
        assignments,
        projects,
        slideDecks,
        flashcardDecks,
        exams,
        deliveries,
        standing: schoolPolicy.standing,
        usesHostEvaluation: schoolPolicy.usesHostEvaluation,
        examCapture: schoolPolicy.examCapture,
        testCapture: schoolPolicy.testCapture,
        termStart: klass.academic_terms?.start_date ?? null,
        activities: termActivities,
      })
    : [];
  const coverage = classCoverageFromRows(deliveries);
  const today = schoolCalendarDate();
  const week = schoolWeekRange(today);
  let timetableSessionsQuery = db
    .from("class_sessions")
    .select("id,session_date,start_time,end_time,title,topic,location")
    .eq("class_id", id)
    .gte("session_date", week.start)
    .lte("session_date", week.end)
    .order("session_date")
    .order("start_time");
  if (hasTerm) timetableSessionsQuery = timetableSessionsQuery.eq("term_id", klass.term_id);
  const { data: timetableSessions } = await timetableSessionsQuery;
  const planStage: StageStatus | null = !courseId
    ? null
    : !direction
      ? {
          id: "plan",
          state: "blocked",
          headline: "Official curriculum direction is not ready.",
          detail:
            "The class cannot prepare teaching content until this course has an official edition for its pathway.",
          actionLabel: "Open the guide",
          actionHref: "/dashboard/academic/guide",
        }
      : plan?.curriculum_release_id
        ? {
            id: "plan",
            state: "done",
            headline: "Teaching plan follows the official edition.",
          }
        : plan
          ? {
              id: "plan",
              state: "ready",
              headline: "Teaching plan needs its official edition.",
              detail: "Refresh the academic direction to attach this plan.",
            }
          : {
              id: "plan",
              state: "ready",
              headline: "Teaching plan is ready to start automatically.",
            };
  const autoGenerate = parseAutoGenerateSettings(
    plan?.metadata?.auto_generate_settings
  );
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
      assignments,
      projects,
      slide_decks: slideDecks,
      flashcard_decks: flashcardDecks,
      exams,
      deliveries,
      progress,
      week_rows: weekRows,
      plan_stage: planStage,
      coverage,
      timetable_sessions: timetableSessions ?? [],
      programme_policy: schoolPolicy,
      term_activities: termActivities,
      auto_generate: autoGenerate,
      prep_policy: describeAutoGenerateSettings(autoGenerate),
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
    const hasTerm = !!klass.term_id && !!klass.academic_terms;
    const hasPeriod = !!klass.offering_period_id;
    const hasOffering = !!klass.academic_offering_id;

    if (!hasTerm && !hasPeriod && !hasOffering)
      return NextResponse.json(
        {
          error:
            "This class has neither an academic term, delivery period, nor academic offering.",
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
    let existingQuery = db
      .from("lesson_plans")
      .select("id,curriculum_release_id,plan_data")
      .eq("class_id", id)
      .eq("course_id", courseId)
      .neq("status", "archived");

    if (hasTerm) {
      existingQuery = existingQuery.eq("term_id", klass.term_id);
    } else if (hasPeriod) {
      existingQuery = existingQuery.eq("offering_period_id", klass.offering_period_id);
    } else if (hasOffering) {
      existingQuery = existingQuery.eq("academic_offering_id", klass.academic_offering_id);
    }

    const { data: existing } = await existingQuery
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const direction = await resolveOfficialCurriculumDirection(db, {
      schoolId: klass.school_id,
      offeringId: klass.academic_offering_id,
      courseId,
      academicSession: klass.academic_terms?.academic_year ?? null,
      academicTermNumber: klass.academic_terms?.term_number ?? null,
      pinnedReleaseId: existing?.curriculum_release_id,
    });
    if (!direction) {
      const [{ data: offering }, { data: release }, { data: adoptions }] =
        await Promise.all([
          klass.academic_offering_id
            ? db
                .from("academic_offerings")
                .select("id, enrollment_type")
                .eq("id", klass.academic_offering_id)
                .maybeSingle()
            : Promise.resolve({ data: null }),
          db
            .from("academic_curriculum_releases")
            .select("id")
            .eq("course_id", courseId)
            .eq("status", "published")
            .order("published_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
          db
            .from("academic_curriculum_adoptions")
            .select("release_id, academic_session, effective_term_number")
            .eq("school_id", klass.school_id)
            .eq("course_id", courseId)
            .eq("status", "active"),
        ]);
      const term = klass.academic_terms;
      const candidates = (adoptions ?? []) as Array<{
        release_id: string;
        academic_session: string | null;
        effective_term_number: number | null;
      }>;
      const sameSession = candidates.filter(
        (a) => !term?.academic_year || a.academic_session === term.academic_year
      );
      const applicable = (sameSession.length ? sameSession : candidates).find(
        (a) =>
          !term?.term_number ||
          !a.effective_term_number ||
          a.effective_term_number <= term.term_number
      );
      const adoption =
        applicable ??
        (sameSession.length ? sameSession[0] : candidates[0]) ??
        null;
      const [{ data: offeringDirection }] = klass.academic_offering_id
        ? await Promise.all([
            db
              .from("academic_offering_curriculum_directions")
              .select("release_id")
              .eq("academic_offering_id", klass.academic_offering_id)
              .eq("course_id", courseId)
              .eq("status", "active")
              .maybeSingle(),
          ])
        : [{ data: null }];
      const diagnosis = diagnoseDirection({
        courseId,
        enrollmentType: offering?.enrollment_type ?? "school",
        pinnedReleaseId: existing?.curriculum_release_id ?? null,
        publishedRelease: release ?? null,
        offeringDirection: offeringDirection ?? null,
        adoption,
        classSession: term?.academic_year ?? null,
        classTermNumber: term?.term_number ?? null,
      });
      if (!diagnosis.resolved) {
        return NextResponse.json(
          {
            error: diagnosis.headline,
            detail: diagnosis.detail,
            action_href: diagnosis.actionHref,
            action_label: diagnosis.actionLabel,
            reason: diagnosis.reason,
          },
          { status: 409 }
        );
      }
      return NextResponse.json(
        {
          error:
            "The Academic Office must assign an official academic direction before this class plan can be created.",
        },
        { status: 409 }
      );
    }
    const schoolPolicy = policyFromClassSchool(
      klass.schools,
      body.sessions_per_week
    );
    const schedule = (await resolveOfficialDeliverySchedule(db, {
      schoolId: klass.school_id,
      classId: id,
      courseId,
      releaseId: direction.id,
    })) ?? {
      ...fallbackScheduleRow({
        entryTerm:
          direction.effective_term_number ?? klass.academic_terms?.term_number,
      }),
      sessions_per_week: schoolPolicy.sessionsPerWeek,
    };
    // One safe read, rather than re-coercing each field at every use below.
    const position = readDeliveryPosition(schedule);
    const sessionsPerWeek = schoolPolicy.sessionsPerWeek;
    const { data, error } = await db.rpc("ensure_class_teaching_plan", {
      p_class_id: id,
      p_course_id: courseId,
      p_curriculum_version_id: direction.source_curriculum_id,
      p_actor_id: user.id,
      p_academic_term_id: hasTerm ? klass.term_id : null,
      p_offering_period_id: hasTerm ? null : klass.offering_period_id,
      p_sessions_per_week: sessionsPerWeek,
    });
    if (error)
      return NextResponse.json({ error: error.message }, { status: 400 });
    const result = data as { plan_id: string; created: boolean };
    // Match readiness-automation: backfill weeks when missing even if a release
    // is already pinned. Refresh used to skip fill once pinned, leaving teachers
    // stuck on "no curriculum weeks yet". Always refresh direction metadata so
    // Refresh stays meaningful when weeks already exist; never overwrite
    // teacher-edited weeks.
    const currentPlanData =
      existing?.plan_data && typeof existing.plan_data === "object"
        ? (existing.plan_data as Record<string, unknown>)
        : {};
    const alreadyHasWeeks =
      Array.isArray(currentPlanData.weeks) &&
      (currentPlanData.weeks as unknown[]).length > 0;
    // A delivery period has no national term to map against, so its weeks
    // start from the edition's own entry point rather than a calendar term.
    const calendarTerm = hasTerm
      ? Number(klass.academic_terms.term_number)
      : position.entryTerm;
    const currentSession = hasTerm
      ? klass.academic_terms.academic_year
      : direction.academic_session;
    const weeks = !alreadyHasWeeks
      ? expandPlanWeeksForMeetings(
          mapOfficialCurriculumToCalendarWeeks({
            content: direction.content,
            directionAcademicSession: direction.academic_session,
            currentAcademicSession: currentSession,
            calendarTerm,
            schedule,
          }),
          sessionsPerWeek
        )
      : null;
    await db
      .from("lesson_plans")
      .update({
        curriculum_release_id: direction.id,
        curriculum_version_id: direction.source_curriculum_id,
        plan_data: {
          ...currentPlanData,
          academic_direction: {
            title: direction.title,
            academic_session: direction.academic_session,
            entry_point: humanEntryPoint({
              termNumber: position.entryTerm,
              weekNumber: position.entryWeek,
            }),
            current_term: hasTerm
              ? humanTermLabel(Number(klass.academic_terms.term_number))
              : klass.academic_offering_periods?.label ?? "Delivery period",
          },
          starts_at_week: position.entryWeek,
          ...(weeks ? { weeks } : {}),
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", result.plan_id);
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
    const week = Number(body.week_number);
    if (!Number.isInteger(week) || week <= 0 || week > 53) {
      return NextResponse.json(
        { error: "week_number must be between 1 and 53" },
        { status: 400 }
      );
    }
    const session = parseRequestSession(body as Record<string, unknown>) ?? 1;
    const { data, error } = await db.rpc("record_class_lesson_delivery", {
      p_lesson_plan_id: body.lesson_plan_id,
      p_week_number: week,
      p_lesson_id: body.lesson_id || null,
      p_status: body.status || "delivered",
      p_actor_id: user.id,
      p_notes: body.notes || null,
      p_class_session_id: body.class_session_id || null,
      p_session_number: session,
    });
    if (error)
      return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ data });
  }

  // Same operation, several weeks of one plan. Delivery is class-scoped, so it
  // belongs here rather than under a curriculum id.
  if (body.action === "record_delivery_bulk") {
    const targets = parseTeachingTargets(body as Record<string, unknown>);
    if (targets.length === 0) {
      return NextResponse.json(
        { error: "Select at least one teaching slot" },
        { status: 400 }
      );
    }
    if (!(await planBelongsToClass(body.lesson_plan_id))) {
      return NextResponse.json(
        { error: "That teaching plan does not belong to this class" },
        { status: 403 }
      );
    }
    const status =
      body.status === "planned"
        ? "planned"
        : body.status === "skipped"
        ? "skipped"
        : "delivered";
    const results: Array<{
      week: number;
      session: number;
      data?: unknown;
      error?: string;
    }> = [];
    for (const target of targets) {
      const { data, error } = await db.rpc("record_class_lesson_delivery", {
        p_lesson_plan_id: body.lesson_plan_id,
        p_week_number: target.week,
        p_lesson_id: null,
        p_status: status,
        p_actor_id: user.id,
        p_notes: body.notes || null,
        p_class_session_id: null,
        p_session_number: target.session,
      });
      results.push({
        week: target.week,
        session: target.session,
        ...(error ? { error: error.message } : { data }),
      });
    }
    const failures = results.filter((result) => result.error);
    return NextResponse.json({
      data: {
        results,
        attempted_count: results.length,
        completed_count: results.length - failures.length,
        failed_count: failures.length,
        status,
      },
      ...(failures.length
        ? {
            warning: `${failures.length} teaching slot${
              failures.length === 1 ? "" : "s"
            } could not be updated. The workspace was refreshed to show the recorded state.`,
          }
        : {}),
    });
  }

  // Publish the class plan so week generators stop refusing it. Teachers used to
  // leave the workspace, open the full plan page, and hunt for a publish button.
  if (body.action === "publish_plan") {
    if (!(await planBelongsToClass(body.lesson_plan_id))) {
      return NextResponse.json(
        { error: "That teaching plan does not belong to this class" },
        { status: 403 }
      );
    }
    const { data, error } = await db
      .from("lesson_plans")
      .update({ status: "published", updated_at: new Date().toISOString() })
      .eq("id", body.lesson_plan_id)
      .eq("class_id", id)
      .select("id,status")
      .single();
    if (error)
      return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ data });
  }

  // Release a prepared week to students from the class workspace (same write
  // path as /api/teaching/pending-approval and /api/lesson-plans/.../release-week).
  if (body.action === "release_week") {
    if (!(await planBelongsToClass(body.lesson_plan_id))) {
      return NextResponse.json(
        { error: "That teaching plan does not belong to this class" },
        { status: 403 }
      );
    }
    const week = Number(body.week_number);
    if (!Number.isFinite(week) || week <= 0) {
      return NextResponse.json(
        { error: "week_number must be a positive number" },
        { status: 400 }
      );
    }
    const session = parseRequestSession(body as Record<string, unknown>);
    const { releasePreparedWeek } = await import(
      "@/lib/academic/release-week-content"
    );
    const result = await releasePreparedWeek({
      planId: String(body.lesson_plan_id),
      week,
      session,
    });
    if (result.error) {
      return NextResponse.json(
        {
          error: result.error,
          available_sessions: result.available_sessions,
        },
        { status: 400 }
      );
    }
    await logAudit(db, {
      action: "release_teaching_package",
      actorId: user.id,
      resourceType: "lesson_plan",
      resourceId: String(body.lesson_plan_id),
      newValue: `Shared Week ${week}, Class ${result.session ?? session ?? 1} with students`,
      newValues: {
        class_id: id,
        week_number: week,
        session_number: result.session ?? session ?? 1,
        lessons_released: result.lessons_released,
        assignments_released: result.assignments_released,
        slides_released: result.slides_released,
        flashcards_released: result.flashcards_released,
      },
    });
    return NextResponse.json({ data: result });
  }

  // Correction path: withdraw one complete teaching package without deleting
  // learner submissions, scores, attendance or delivery history.
  if (body.action === "hold_week") {
    if (!(await planBelongsToClass(body.lesson_plan_id))) {
      return NextResponse.json(
        { error: "That teaching plan does not belong to this class" },
        { status: 403 }
      );
    }
    const week = Number(body.week_number);
    if (!Number.isInteger(week) || week <= 0) {
      return NextResponse.json(
        { error: "week_number must be a positive whole number" },
        { status: 400 }
      );
    }
    const session = parseRequestSession(body as Record<string, unknown>);
    const { holdPreparedWeek } = await import(
      "@/lib/academic/release-week-content"
    );
    const result = await holdPreparedWeek({
      planId: String(body.lesson_plan_id),
      week,
      session,
    });
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    await logAudit(db, {
      action: "hold_teaching_package",
      actorId: user.id,
      resourceType: "lesson_plan",
      resourceId: String(body.lesson_plan_id),
      oldValue: `Visible to students: Week ${week}, Class ${result.session}`,
      newValue: `Held from students: Week ${week}, Class ${result.session}`,
      newValues: {
        class_id: id,
        week_number: week,
        session_number: result.session,
        lessons_held: result.lessons_held,
        assignments_held: result.assignments_held,
        slides_held: result.slides_held,
        flashcards_held: result.flashcards_held,
        learner_evidence_preserved: true,
      },
    });
    return NextResponse.json({ data: result });
  }

  // Release selected week+meeting targets. Each result is returned so partial
  // database failures are visible and the client can refresh authoritative state.
  if (body.action === "release_week_bulk") {
    const targets = parseTeachingTargets(body as Record<string, unknown>);
    if (targets.length === 0) {
      return NextResponse.json(
        { error: "Select at least one teaching slot to release" },
        { status: 400 }
      );
    }
    if (!(await planBelongsToClass(body.lesson_plan_id))) {
      return NextResponse.json(
        { error: "That teaching plan does not belong to this class" },
        { status: 403 }
      );
    }
    const { releasePreparedWeek } = await import(
      "@/lib/academic/release-week-content"
    );
    const results: Array<Awaited<ReturnType<typeof releasePreparedWeek>>> = [];
    const failures: Array<{
      week: number;
      session: number;
      error: string;
      available_sessions?: number[];
    }> = [];
    let totalLessons = 0;
    let totalAssignments = 0;
    let totalSlides = 0;
    let totalFlashcards = 0;

    for (const target of targets) {
      const res = await releasePreparedWeek({
        planId: String(body.lesson_plan_id),
        week: target.week,
        session: target.session,
      });
      if (res.error) {
        failures.push({
          week: target.week,
          session: target.session,
          error: res.error,
          ...(res.available_sessions
            ? { available_sessions: res.available_sessions }
            : {}),
        });
      }
      totalLessons += res.lessons_released ?? 0;
      totalAssignments += res.assignments_released ?? 0;
      totalSlides += res.slides_released ?? 0;
      totalFlashcards += res.flashcards_released ?? 0;
      results.push(res);
    }
    return NextResponse.json({
      data: {
        results,
        attempted_count: targets.length,
        completed_count: targets.length - failures.length,
        failed_count: failures.length,
        failures,
        total_lessons: totalLessons,
        total_assignments: totalAssignments,
        total_slides: totalSlides,
        total_flashcards: totalFlashcards,
      },
      ...(failures.length
        ? {
            warning: `${failures.length} selected teaching slot${
              failures.length === 1 ? "" : "s"
            } could not be fully released. The workspace was refreshed to show the current state.`,
          }
        : {}),
    });
  }

  if (body.action === "prepare_week") {
    if (!(await planBelongsToClass(body.lesson_plan_id))) {
      return NextResponse.json(
        { error: "That teaching plan does not belong to this class" },
        { status: 403 }
      );
    }
    const week = Number(body.week_number);
    if (!Number.isInteger(week) || week <= 0 || week > 53) {
      return NextResponse.json(
        { error: "week_number must be between 1 and 53" },
        { status: 400 }
      );
    }
    const session = parseRequestSession(body as Record<string, unknown>) ?? 1;
    const { data: planMeta } = await db
      .from("lesson_plans")
      .select("metadata")
      .eq("id", body.lesson_plan_id)
      .maybeSingle();
    const autoGenerate = parseAutoGenerateSettings(
      planMeta?.metadata?.auto_generate_settings
    );
    const { generateTrackedPlanWeek } = await import("@/lib/academic/tracked-week-generation");
    const {
      outcome: result,
      runId,
      alreadyRunning,
      effectiveTypes,
    } = await generateTrackedPlanWeek({
      db,
      planId: String(body.lesson_plan_id),
      classId: id,
      week,
      session,
      autoPublish: autoGenerate.auto_publish,
      cookie: req.headers.get("cookie") || undefined,
      source: "teacher",
      actorId: user.id,
    });
    return NextResponse.json({
      data: {
        ...result,
        generationRunId: runId,
        alreadyRunning,
        preparedTypes: effectiveTypes,
      },
    });
  }

  return NextResponse.json(
    { error: "Unknown teaching action" },
    { status: 400 }
  );
}
