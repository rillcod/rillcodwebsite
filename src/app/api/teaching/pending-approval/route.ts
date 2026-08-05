/**
 * The teacher's review queue for automatically generated weeks.
 *
 * Prep comes from the central pipeline (auto-generate-content / generate-week /
 * WeekAIGenerator → generatePlanWeek). Release always goes through
 * releasePreparedWeek — never a parallel update path.
 *
 * Scope: Regular School and Special/Online pathways alike. A teacher sees
 * plans for classes they teach (classes.teacher_id) or created, not only
 * school_id matches — special programmes often share a school shell.
 *
 * GET  — every week with content awaiting approval, in the caller's scope.
 * POST — release one week through the shared release helper.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaffUser } from "@/app/api/lesson-plans/authz";
import { releasePreparedWeek } from "@/lib/academic/release-week-content";

export const dynamic = "force-dynamic";

type PendingItem = {
  kind: "lesson" | "slides" | "assignment" | "project" | "flashcards";
  id: string;
  title: string;
};

export type PendingWeek = {
  planId: string;
  className: string | null;
  courseTitle: string | null;
  week: number;
  topic: string;
  items: PendingItem[];
};

/** Plans this staff member may approve — class teacher or creator, or admin. */
async function visiblePlans(
  db: any,
  staff: { id: string; role: string; school_id: string | null }
) {
  const { data: plans } = await db
    .from("lesson_plans")
    .select(
      "id,school_id,created_by,status,plan_data,course_id,class_id," +
        "courses(title),classes!lesson_plans_class_id_fkey(id,name,teacher_id,school_id)"
    )
    .eq("status", "published");

  if (staff.role === "admin") return plans ?? [];

  return (plans ?? []).filter((p: any) => {
    if (p.created_by && p.created_by === staff.id) return true;
    const klass = Array.isArray(p.classes) ? p.classes[0] : p.classes;
    if (klass?.teacher_id && klass.teacher_id === staff.id) return true;
    return false;
  });
}

export async function GET() {
  const sessionClient = await createServerClient();
  const staff = await requireStaffUser(sessionClient);
  if (!staff) return NextResponse.json({ error: "Staff access required" }, { status: 403 });

  const db = createAdminClient();
  const plans = await visiblePlans(db, staff);
  if (!plans.length) return NextResponse.json({ data: [] });

  const planIds = plans.map((p: any) => p.id);

  const [{ data: lessons }, { data: assignments }, { data: decks }] = await Promise.all([
    db.from("lessons").select("id,title,status,lesson_plan_id,curriculum_week_number,metadata")
      .in("lesson_plan_id", planIds).eq("status", "draft"),
    db.from("assignments").select("id,title,is_active,assignment_type,lesson_plan_id,curriculum_week_number,metadata")
      .in("lesson_plan_id", planIds).eq("is_active", false),
    (db as any).from("flashcard_decks").select("id,title,is_public,lesson_plan_id,curriculum_week_number")
      .in("lesson_plan_id", planIds).eq("is_public", false),
  ]);

  const lessonIds = (lessons ?? []).map((l: any) => l.id);
  const { data: materials } = lessonIds.length
    ? await db.from("lesson_materials").select("id,title,lesson_id").in("lesson_id", lessonIds).eq("file_type", "slide-deck")
    : { data: [] as any[] };
  const slidesByLesson = new Map((materials ?? []).map((m: any) => [m.lesson_id, m]));

  const byWeek = new Map<string, PendingWeek>();
  const planById = new Map(plans.map((p: any) => [p.id, p]));

  const bucket = (planId: string, week: number, session?: number | null): PendingWeek => {
    const sessionPart =
      session != null && Number.isFinite(session) && session > 0
        ? `:s${Math.floor(session)}`
        : "";
    const key = `${planId}:${week}${sessionPart}`;
    let row = byWeek.get(key);
    if (!row) {
      const plan: any = planById.get(planId);
      const weeks: any[] = Array.isArray(plan?.plan_data?.weeks) ? plan.plan_data.weeks : [];
      const meta = weeks.find((w) => {
        if (Number(w.week) !== week) return false;
        if (session == null || session < 1) return true;
        return Number(w.session ?? w.session_number ?? 0) === session;
      }) ?? weeks.find((w) => Number(w.week) === week);
      const klass = Array.isArray(plan?.classes) ? plan.classes[0] : plan?.classes;
      const sessionLabel =
        session != null && session > 0 ? ` · Class ${Math.floor(session)}` : "";
      row = {
        planId,
        className: klass?.name ?? null,
        courseTitle: plan?.courses?.title ?? null,
        week,
        topic: meta?.topic
          ? String(meta.topic)
          : `Week ${week}${sessionLabel}`,
        items: [],
      };
      byWeek.set(key, row);
    }
    return row;
  };

  for (const l of lessons ?? []) {
    const week = Number((l as any).curriculum_week_number);
    if (!Number.isFinite(week)) continue;
    // Prefer one card per class meeting when lessons carry session metadata.
    const meta = (l as any).metadata as Record<string, unknown> | null;
    const session = Number(meta?.session ?? meta?.session_number ?? 0);
    const row = bucket(
      (l as any).lesson_plan_id,
      week,
      Number.isFinite(session) && session > 0 ? session : null,
    );
    row.items.push({ kind: "lesson", id: (l as any).id, title: (l as any).title });
    const deck = slidesByLesson.get((l as any).id);
    if (deck) row.items.push({ kind: "slides", id: (l as any).id, title: deck.title });
  }
  for (const a of assignments ?? []) {
    const week = Number((a as any).curriculum_week_number);
    if (!Number.isFinite(week)) continue;
    const meta = (a as any).metadata as Record<string, unknown> | null;
    const session = Number(meta?.session ?? meta?.session_number ?? 0);
    const row = bucket(
      (a as any).lesson_plan_id,
      week,
      Number.isFinite(session) && session > 0 ? session : null,
    );
    row.items.push({
      kind: (a as any).assignment_type === "project" ? "project" : "assignment",
      id: (a as any).id,
      title: (a as any).title,
    });
  }
  for (const d of decks ?? []) {
    const week = Number((d as any).curriculum_week_number);
    if (!Number.isFinite(week)) continue;
    // Flashcards often lack session metadata — attach to matching lesson week card
    // when possible via title "Week N · Session M", else whole week.
    const title = String((d as any).title || "");
    const sessionMatch = title.match(/Session\s+(\d+)/i);
    const session = sessionMatch ? Number(sessionMatch[1]) : 0;
    const row = bucket(
      (d as any).lesson_plan_id,
      week,
      Number.isFinite(session) && session > 0 ? session : null,
    );
    row.items.push({
      kind: "flashcards",
      id: (d as any).id,
      title: (d as any).title,
    });
  }

  const data = [...byWeek.values()].sort(
    (a, b) =>
      (a.className ?? "").localeCompare(b.className ?? "") ||
      a.week - b.week ||
      a.topic.localeCompare(b.topic)
  );
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  const sessionClient = await createServerClient();
  const staff = await requireStaffUser(sessionClient);
  if (!staff) return NextResponse.json({ error: "Staff access required" }, { status: 403 });

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
  const plans = await visiblePlans(db, staff);
  const visiblePlanIds = new Set((plans ?? []).map((p: any) => String(p.id)));
  const now = new Date().toISOString();
  const results = [];

  for (const target of targets) {
    if (!visiblePlanIds.has(target.planId)) {
      results.push({
        planId: target.planId,
        week: target.week,
        lessons_released: 0,
        assignments_released: 0,
        flashcards_released: 0,
        error: "Forbidden",
      });
      continue;
    }

    results.push(await releasePreparedWeek({ planId: target.planId, week: target.week, now }));
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
