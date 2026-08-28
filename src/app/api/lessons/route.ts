import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { normalizeLessonType } from "@/lib/lessons/lesson-type";
import { getTeacherSchoolIds } from "@/lib/auth-utils";
import { relinkTeachingWeekAssets } from "@/lib/academic/teaching-scope";
import { metadataWithLessonTeachingGuide } from "@/lib/lessons/teaching-guide";

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function requireStaff() {
  const supabase = await createServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;
  const { data: caller } = await adminClient()
    .from("portal_users")
    .select("role, id, school_id")
    .eq("id", user.id)
    .single();
  if (!caller || !["admin", "teacher", "school"].includes(caller.role))
    return null;
  return caller;
}

function canCreateLesson(role: string | undefined) {
  return role === "admin" || role === "teacher";
}

// GET /api/lessons — list lessons visible to current user
export async function GET(request: NextRequest) {
  try {
    const caller = await requireStaff();
    if (!caller)
      return NextResponse.json(
        { error: "Staff access required" },
        { status: 403 }
      );

    const url = new URL(request.url);
    const lessonPlanId = url.searchParams.get("lesson_plan_id");
    const courseId = url.searchParams.get("course_id");

    const admin = adminClient();
    if (lessonPlanId && caller.role !== "admin") {
      const { data: plan } = await admin
        .from("lesson_plans")
        .select("id, school_id, class_id")
        .eq("id", lessonPlanId)
        .maybeSingle();
      if (!plan) {
        return NextResponse.json({ error: "Class plan not found" }, { status: 404 });
      }

      if (caller.role === "school" && plan.school_id !== caller.school_id) {
        return NextResponse.json({ error: "Class plan is outside your school" }, { status: 403 });
      }

      if (caller.role === "teacher") {
        const { data: klass } = plan.class_id
          ? await admin
              .from("classes")
              .select("teacher_id")
              .eq("id", plan.class_id)
              .maybeSingle()
          : { data: null };
        if (!klass || klass.teacher_id !== caller.id) {
          return NextResponse.json(
            { error: "You can only view lessons for your assigned class plan" },
            { status: 403 }
          );
        }
      }
    }

    let query = admin
      .from("lessons")
      .select(
        `
        id, title, description, lesson_type, status, duration_minutes,
        session_date, video_url, created_by, created_at, metadata,
        school_id, class_id, lesson_plan_id, curriculum_week_number, session_number,
        courses ( id, title, programs ( name ) )
      `
      )
      .order("created_at", { ascending: false });

    if (lessonPlanId) {
      query = query.eq("lesson_plan_id", lessonPlanId) as any;
    }
    if (courseId) {
      query = query.eq("course_id", courseId) as any;
    }

    if (caller.role === "teacher" && !lessonPlanId) {
      query = query.eq("created_by", caller.id) as any;
    } else if (caller.role === "school") {
      if (!caller.school_id) {
        return NextResponse.json(
          {
            error:
              "School context required: account must be linked to a school.",
          },
          { status: 403 }
        );
      }
      query = query.eq("school_id", caller.school_id) as any;
    }
    // admin: no filter — all lessons visible

    const { data, error } = await query;
    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data: data ?? [] });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Unexpected error" },
      { status: 500 }
    );
  }
}

// POST /api/lessons — create a lesson (bypasses RLS)
export async function POST(request: NextRequest) {
  try {
    const caller = await requireStaff();
    if (!caller)
      return NextResponse.json(
        { error: "Staff access required" },
        { status: 403 }
      );
    if (!canCreateLesson(caller.role)) {
      return NextResponse.json(
        { error: "Only admin and teacher can create lessons" },
        { status: 403 }
      );
    }

    const body = await request.json();
    if (!body.lesson_plan_id) {
      return NextResponse.json(
        {
          error:
            "Choose a class plan before creating a lesson. Lessons are prepared inside the class teaching flow.",
          code: "CLASS_PLAN_REQUIRED",
          action_href: "/dashboard/classes",
        },
        { status: 409 }
      );
    }
    const allowed = [
      "title",
      "description",
      "content",
      "lesson_type",
      "status",
      "duration_minutes",
      "order_index",
      "video_url",
      "course_id",
      "session_date",
      "content_layout",
      "lesson_notes",
      "metadata",
      "curriculum_week_number",
      "session_number",
    ];
    const payload: Record<string, unknown> = { created_by: caller.id };
    for (const f of allowed) {
      if (f in body) payload[f] = body[f] ?? null;
    }

    // Resolve school_id — teacher must post to an assigned school
    let resolvedSchoolId: string | null = null;
    if (caller.role === "admin") {
      resolvedSchoolId =
        typeof body.school_id === "string" ? body.school_id : null;
    } else if (caller.role === "teacher") {
      const requestedSchoolId: string | null =
        typeof body.school_id === "string" ? body.school_id : null;
      const scopedIds = await getTeacherSchoolIds(caller.id, caller.school_id);
      if (requestedSchoolId) {
        if (!scopedIds.includes(requestedSchoolId)) {
          return NextResponse.json(
            {
              error:
                "You are not assigned to the school you selected for this lesson.",
            },
            { status: 403 }
          );
        }
        resolvedSchoolId = requestedSchoolId;
      } else {
        resolvedSchoolId = caller.school_id ?? scopedIds[0] ?? null;
      }
    }

    // Verify course_id belongs to the resolved school/caller's boundary
    if (body.course_id) {
      const { data: course } = await adminClient()
        .from("courses")
        .select("school_id")
        .eq("id", body.course_id)
        .maybeSingle();

      if (!course) {
        return NextResponse.json(
          { error: "Selected course not found" },
          { status: 400 }
        );
      }

      if (course.school_id) {
        if (caller.role === "teacher") {
          const scopedIds = await getTeacherSchoolIds(
            caller.id,
            caller.school_id
          );
          if (!scopedIds.includes(course.school_id)) {
            return NextResponse.json(
              { error: "You are not assigned to the school of this course." },
              { status: 403 }
            );
          }
        }
        resolvedSchoolId = course.school_id;
      }
    }

    // Canonical class workflow: a lesson may only inherit scope from its plan.
    if (body.lesson_plan_id) {
      const { data: plan } = await adminClient()
        .from("lesson_plans")
        .select(
          "id, class_id, course_id, term_id, offering_period_id, school_id, status"
        )
        .eq("id", body.lesson_plan_id)
        .maybeSingle();
      if (!plan || plan.status === "archived") {
        return NextResponse.json(
          { error: "Active lesson plan not found" },
          { status: 400 }
        );
      }
      if (
        !plan.class_id ||
        !plan.course_id ||
        (!plan.term_id && !plan.offering_period_id)
      ) {
        return NextResponse.json(
          {
            error:
              "Lesson plan is not linked to a class, course and teaching period",
          },
          { status: 400 }
        );
      }
      if (caller.role === "teacher") {
        const { data: klass } = await adminClient()
          .from("classes")
          .select("teacher_id")
          .eq("id", plan.class_id)
          .maybeSingle();
        if (!klass || klass.teacher_id !== caller.id) {
          return NextResponse.json(
            { error: "You can only add lessons to your assigned class plan" },
            { status: 403 }
          );
        }
      }
      payload.lesson_plan_id = plan.id;
      payload.class_id = plan.class_id;
      payload.academic_term_id = plan.term_id;
      payload.course_id = plan.course_id;
      resolvedSchoolId = plan.school_id;
      payload.metadata = {
        ...(typeof body.metadata === "object" && body.metadata
          ? body.metadata
          : {}),
      };
    }
    const guideInput = body.teaching_guide ?? body.lesson_plan;
    if (guideInput && typeof guideInput === "object") {
      payload.metadata = metadataWithLessonTeachingGuide(
        payload.metadata,
        guideInput
      );
    }
    payload.school_id = resolvedSchoolId;
    if (typeof payload.lesson_type === "string") {
      payload.lesson_type = normalizeLessonType(payload.lesson_type, "lesson");
    }
    payload.created_at = new Date().toISOString();

    const { data, error } = await adminClient()
      .from("lessons")
      .insert(payload)
      .select()
      .single();

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });

    if (data.lesson_plan_id && data.curriculum_week_number) {
      await relinkTeachingWeekAssets(adminClient(), {
        lessonPlanId: data.lesson_plan_id,
        curriculumWeekNumber: data.curriculum_week_number,
        lessonId: data.id,
        session: data.session_number,
      });
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Unexpected error" },
      { status: 500 }
    );
  }
}
