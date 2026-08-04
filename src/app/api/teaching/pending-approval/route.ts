/**
 * The teacher's review queue for automatically generated weeks.
 *
 * The nightly job prepares a week and leaves it unpublished — a draft lesson,
 * an inactive assignment and project, slides sitting against the lesson. Before
 * this route there was nowhere to see that: the content existed, nobody was
 * told which parts were waiting, and approving meant opening each item and
 * publishing it by hand. A queue nobody can see is the same as no queue.
 *
 * GET  — every week with content awaiting approval, in the caller's scope.
 * POST — release one week: publish its lesson, activate its assignment/project.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaffUser, canAccessLessonScope } from "@/app/api/lesson-plans/authz";
import { getTeacherSchoolIds } from "@/lib/auth-utils";

export const dynamic = "force-dynamic";

type PendingItem = { kind: "lesson" | "slides" | "assignment" | "project"; id: string; title: string };

export type PendingWeek = {
  planId: string;
  className: string | null;
  courseTitle: string | null;
  week: number;
  topic: string;
  items: PendingItem[];
};

/** Scopes a set of plans to what this caller may act on. */
async function visiblePlans(db: any, staff: { id: string; role: string; school_id: string | null }) {
  const { data: plans } = await db
    .from("lesson_plans")
    .select(
      "id,school_id,created_by,status,plan_data,course_id,class_id," +
        "courses(title),classes!lesson_plans_class_id_fkey(name,teacher_id)"
    )
    .eq("status", "published");

  const teacherSchoolIds =
    staff.role === "teacher" ? await getTeacherSchoolIds(staff.id, staff.school_id) : [];

  return (plans ?? []).filter((p: any) =>
    canAccessLessonScope(
      staff,
      { school_id: p.school_id ?? null, created_by: p.created_by ?? null },
      teacherSchoolIds
    )
  );
}

export async function GET(req: NextRequest) {
  const sessionClient = await createServerClient();
  const staff = await requireStaffUser(sessionClient);
  if (!staff) return NextResponse.json({ error: "Staff access required" }, { status: 403 });

  const db = createAdminClient();
  const plans = await visiblePlans(db, staff);
  if (!plans.length) return NextResponse.json({ data: [] });

  const planIds = plans.map((p: any) => p.id);

  // Unreleased content only. A published lesson or an active assignment has
  // already been approved — showing it again would train teachers to ignore the queue.
  const [{ data: lessons }, { data: assignments }] = await Promise.all([
    db.from("lessons").select("id,title,status,lesson_plan_id,curriculum_week_number")
      .in("lesson_plan_id", planIds).eq("status", "draft"),
    db.from("assignments").select("id,title,is_active,assignment_type,lesson_plan_id,curriculum_week_number")
      .in("lesson_plan_id", planIds).eq("is_active", false),
  ]);

  const lessonIds = (lessons ?? []).map((l: any) => l.id);
  const { data: materials } = lessonIds.length
    ? await db.from("lesson_materials").select("id,title,lesson_id").in("lesson_id", lessonIds).eq("file_type", "slide-deck")
    : { data: [] as any[] };
  const slidesByLesson = new Map((materials ?? []).map((m: any) => [m.lesson_id, m]));

  const byWeek = new Map<string, PendingWeek>();
  const planById = new Map(plans.map((p: any) => [p.id, p]));

  const bucket = (planId: string, week: number): PendingWeek => {
    const key = `${planId}:${week}`;
    let row = byWeek.get(key);
    if (!row) {
      const plan: any = planById.get(planId);
      const weeks: any[] = Array.isArray(plan?.plan_data?.weeks) ? plan.plan_data.weeks : [];
      const meta = weeks.find((w) => Number(w.week) === week);
      row = {
        planId,
        className: plan?.classes?.name ?? null,
        courseTitle: plan?.courses?.title ?? null,
        week,
        topic: meta?.topic ?? `Week ${week}`,
        items: [],
      };
      byWeek.set(key, row);
    }
    return row;
  };

  for (const l of lessons ?? []) {
    const week = Number((l as any).curriculum_week_number);
    if (!Number.isFinite(week)) continue;
    const row = bucket((l as any).lesson_plan_id, week);
    row.items.push({ kind: "lesson", id: (l as any).id, title: (l as any).title });
    const deck = slidesByLesson.get((l as any).id);
    if (deck) row.items.push({ kind: "slides", id: deck.id, title: deck.title });
  }
  for (const a of assignments ?? []) {
    const week = Number((a as any).curriculum_week_number);
    if (!Number.isFinite(week)) continue;
    const row = bucket((a as any).lesson_plan_id, week);
    row.items.push({
      kind: (a as any).assignment_type === "project" ? "project" : "assignment",
      id: (a as any).id,
      title: (a as any).title,
    });
  }

  const data = [...byWeek.values()].sort(
    (a, b) => (a.className ?? "").localeCompare(b.className ?? "") || a.week - b.week
  );
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  const sessionClient = await createServerClient();
  const staff = await requireStaffUser(sessionClient);
  if (!staff) return NextResponse.json({ error: "Staff access required" }, { status: 403 });

  // Cast the JSON body up front — req.json() is `any`, and chaining .map/.filter
  // on an `any[]` reintroduces implicit-any params that fail the production build.
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const singlePlanId = String(body.planId ?? "");
  const singleWeek = Number(body.week);
  const batchInput: unknown[] | null = Array.isArray(body.releases)
    ? body.releases
    : null;
  type ReleaseTarget = { planId: string; week: number };
  const targets: ReleaseTarget[] = batchInput?.length
    ? batchInput
        .map((row): ReleaseTarget => {
          const entry = (row ?? {}) as Record<string, unknown>;
          return {
            planId: String(entry.planId ?? ""),
            week: Number(entry.week),
          };
        })
        .filter(
          (row): row is ReleaseTarget =>
            Boolean(row.planId) && Number.isFinite(row.week)
        )
    : singlePlanId && Number.isFinite(singleWeek)
      ? [{ planId: singlePlanId, week: singleWeek }]
      : [];
  if (!targets.length) {
    return NextResponse.json(
      { error: "Provide planId/week or releases[] with planId/week entries" },
      { status: 400 }
    );
  }

  const db = createAdminClient();
  // Re-checked here rather than trusted from the list call: the queue is a view,
  // this is a write.
  const plans = await visiblePlans(db, staff);
  const visiblePlanIds = new Set((plans ?? []).map((p: any) => String(p.id)));
  const now = new Date().toISOString();
  const results: Array<{
    planId: string;
    week: number;
    lessons_released: number;
    assignments_released: number;
    error?: string;
  }> = [];

  for (const target of targets) {
    if (!visiblePlanIds.has(target.planId)) {
      results.push({
        planId: target.planId,
        week: target.week,
        lessons_released: 0,
        assignments_released: 0,
        error: "Forbidden",
      });
      continue;
    }

    const { data: released, error: lessonError } = await db
      .from("lessons")
      .update({ status: "active", updated_at: now })
      .eq("lesson_plan_id", target.planId)
      .eq("curriculum_week_number", target.week)
      .eq("status", "draft")
      .select("id");

    if (lessonError) {
      results.push({
        planId: target.planId,
        week: target.week,
        lessons_released: 0,
        assignments_released: 0,
        error: lessonError.message,
      });
      continue;
    }

    const { data: activated, error: assignmentError } = await db
      .from("assignments")
      .update({ is_active: true, updated_at: now })
      .eq("lesson_plan_id", target.planId)
      .eq("curriculum_week_number", target.week)
      .eq("is_active", false)
      .select("id");

    results.push({
      planId: target.planId,
      week: target.week,
      lessons_released: released?.length ?? 0,
      assignments_released: assignmentError ? 0 : activated?.length ?? 0,
      ...(assignmentError ? { error: assignmentError.message } : {}),
    });
  }

  const failures = results.filter((r) => r.error);
  return NextResponse.json(
    {
      data: {
        count: results.length,
        released: results.filter((r) => !r.error).length,
        failed: failures.length,
        results,
      },
    },
    { status: failures.length ? 207 : 200 }
  );
}
