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
import { assetMeetingSession, parseRequestSession, teachingMeetingLabel } from "@/lib/academic/session-identity";
import { logAudit } from "@/lib/audit/log";
import {
  canSetAutomaticDelivery,
  pendingWeekKey,
  summarizePendingApprovals,
  type PendingWeek,
} from "@/lib/academic/pending-approval";
import { parseAutoGenerateSettings } from "@/lib/academic/auto-generate-settings";
import {
  assignmentVisibility,
  flashcardVisibility,
  lessonVisibility,
  slidesVisibility,
} from "@/lib/academic/week-package";

export const dynamic = "force-dynamic";

export type { PendingWeek } from "@/lib/academic/pending-approval";

/** Plans this staff member may approve — class teacher or creator, or admin. */
async function visiblePlans(
  db: any,
  staff: { id: string; role: string; school_id: string | null }
) {
  const { data: plans } = await db
    .from("lesson_plans")
    .select(
      "id,school_id,created_by,status,plan_data,course_id,class_id,academic_offering_id," +
        "metadata," +
        "courses(title),classes!lesson_plans_class_id_fkey(id,name,teacher_id,school_id,term_id,academic_offering_id,academic_offerings(id,title,enrollment_type,pathway))"
    )
    .eq("status", "published");

  if (staff.role === "admin") return plans ?? [];

  return (plans ?? []).filter((p: any) => {
    const klass = Array.isArray(p.classes) ? p.classes[0] : p.classes;
    // A class reassignment must also move the approval queue. Keep creator
    // ownership only for standalone plans that have not joined a class yet.
    if (p.class_id || klass?.id) return klass?.teacher_id === staff.id;
    return p.created_by === staff.id;
  });
}

export async function GET(req: NextRequest) {
  const sessionClient = await createServerClient();
  const staff = await requireStaffUser(sessionClient);
  if (!staff) return NextResponse.json({ error: "Staff access required" }, { status: 403 });

  const db = createAdminClient();
  const plans = await visiblePlans(db, staff);
  if (!plans.length) return NextResponse.json({ data: [] });

  const planIds = plans.map((p: any) => p.id);

  const [{ data: lessons }, { data: assignments }, { data: slides }, { data: decks }] = await Promise.all([
    db.from("lessons").select("id,title,status,lesson_plan_id,curriculum_week_number,session_number,metadata")
      .in("lesson_plan_id", planIds),
    db.from("assignments").select("id,title,is_active,assignment_type,lesson_plan_id,curriculum_week_number,session_number,metadata")
      .in("lesson_plan_id", planIds),
    (db as any).from("lesson_materials").select("id,title,lesson_id,is_public,lesson_plan_id,curriculum_week_number,session_number")
      .in("lesson_plan_id", planIds).eq("file_type", "slide-deck"),
    (db as any).from("flashcard_decks").select("id,title,is_public,lesson_plan_id,curriculum_week_number,session_number")
      .in("lesson_plan_id", planIds),
  ]);

  const byWeek = new Map<string, PendingWeek>();
  const planById = new Map(plans.map((p: any) => [p.id, p]));
  const lessonById = new Map((lessons ?? []).map((lesson: any) => [lesson.id, lesson]));

  const bucket = (planId: string, week: number, session: number): PendingWeek => {
    const sessionNum = assetMeetingSession({ session_number: session });
    const key = pendingWeekKey({ planId, week, session: sessionNum });
    let row = byWeek.get(key);
    if (!row) {
      const plan: any = planById.get(planId);
      const weeks: any[] = Array.isArray(plan?.plan_data?.weeks) ? plan.plan_data.weeks : [];
      const meta = weeks.find((w) => {
        if (Number(w.week) !== week) return false;
        return assetMeetingSession(w) === sessionNum;
      }) ?? weeks.find((w) => Number(w.week) === week);
      const klass = Array.isArray(plan?.classes) ? plan.classes[0] : plan?.classes;
      const offering = klass?.academic_offerings || null;
      const enrollmentType = offering?.enrollment_type ?? (klass?.term_id ? 'school' : 'special');
      const isSpecial = Boolean(
        (enrollmentType && enrollmentType !== 'school') ||
        offering?.special_program_page_id ||
        (!klass?.term_id && (klass?.academic_offering_id || plan?.academic_offering_id))
      );
      const meetingsInWeek = weeks.filter((w) => Number(w.week) === week).length || 1;
      row = {
        planId,
        classId: klass?.id ?? null,
        className: klass?.name ?? null,
        courseTitle: plan?.courses?.title ?? null,
        week,
        session: sessionNum,
        meetingsInWeek,
        enrollmentType,
        isSpecial,
        topic: meta?.topic
          ? String(meta.topic)
          : teachingMeetingLabel(week, sessionNum, meetingsInWeek),
        objectives: meta?.objectives || meta?.learning_objectives || null,
        activities: meta?.student_activities || meta?.activities || null,
        classwork: meta?.classwork?.title || (typeof meta?.classwork === 'string' ? meta.classwork : null) || meta?.guided_practice || null,
        assignmentBrief: meta?.assignment?.brief || meta?.assignment?.title || (typeof meta?.assignment === 'string' ? meta.assignment : null) || null,
        items: [],
        missingKinds: [],
        complete: false,
        autoPublish: parseAutoGenerateSettings(
          plan?.metadata?.auto_generate_settings,
        ).auto_publish,
      };
      byWeek.set(key, row);
    }
    return row;
  };

  for (const l of lessons ?? []) {
    const week = Number((l as any).curriculum_week_number);
    if (!Number.isFinite(week)) continue;
    const session = assetMeetingSession(l as any);
    const row = bucket(
      (l as any).lesson_plan_id,
      week,
      session,
    );
    row.items.push({
      kind: "lesson",
      id: (l as any).id,
      title: (l as any).title,
      state: lessonVisibility(l as any) === "live" ? "live" : "held",
    });
  }
  for (const a of assignments ?? []) {
    const week = Number((a as any).curriculum_week_number);
    if (!Number.isFinite(week)) continue;
    const session = assetMeetingSession(a as any);
    const row = bucket(
      (a as any).lesson_plan_id,
      week,
      session,
    );
    row.items.push({
      kind: (a as any).assignment_type === "project" ? "project" : "assignment",
      id: (a as any).id,
      title: (a as any).title,
      state: assignmentVisibility(a as any) === "live" ? "live" : "held",
    });
  }
  for (const d of decks ?? []) {
    const week = Number((d as any).curriculum_week_number);
    if (!Number.isFinite(week)) continue;
    const session = assetMeetingSession(d as any);
    const row = bucket(
      (d as any).lesson_plan_id,
      week,
      session,
    );
    row.items.push({
      kind: "flashcards",
      id: (d as any).id,
      title: (d as any).title,
      state: flashcardVisibility(d as any) === "live" ? "live" : "held",
    });
  }
  for (const slide of slides ?? []) {
    const week = Number((slide as any).curriculum_week_number);
    if (!Number.isFinite(week)) continue;
    const session = assetMeetingSession(slide as any);
    const row = bucket((slide as any).lesson_plan_id, week, session);
    row.items.push({
      kind: "slides",
      // The slide viewer lives on the lesson detail page.
      id: (slide as any).lesson_id ?? (slide as any).id,
      title: (slide as any).title,
      state:
        slidesVisibility(slide as any, lessonById.get((slide as any).lesson_id)) === "live"
          ? "live"
          : "held",
    });
  }

  for (const row of byWeek.values()) {
    const count = [...byWeek.values()].filter(
      (other) => other.planId === row.planId && other.week === row.week,
    ).length;
    row.meetingsInWeek = Math.max(row.meetingsInWeek || 1, count);
  }

  const expectedKinds = [
    "lesson",
    "slides",
    "flashcards",
    "assignment",
    "project",
  ] as const;
  const data = [...byWeek.values()]
    .filter((row) => row.items.some((item) => item.state === "held"))
    .map((row) => {
      const present = new Set(row.items.map((item) => item.kind));
      const missingKinds = expectedKinds.filter((kind) => !present.has(kind));
      return {
        ...row,
        missingKinds: [...missingKinds],
        complete: missingKinds.length === 0,
      };
    })
    .sort(
    (a, b) =>
      (a.className ?? "").localeCompare(b.className ?? "") ||
      a.week - b.week ||
      (a.session ?? 1) - (b.session ?? 1) ||
      a.topic.localeCompare(b.topic)
    );
  if (new URL(req.url).searchParams.get("summary") === "1") {
    return NextResponse.json({ data: summarizePendingApprovals(data) });
  }
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  const sessionClient = await createServerClient();
  const staff = await requireStaffUser(sessionClient);
  if (!staff) return NextResponse.json({ error: "Staff access required" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const db = createAdminClient();
  const plans = await visiblePlans(db, staff);
  const visiblePlanIds = new Set((plans ?? []).map((p: any) => String(p.id)));

  if (body.action === "set_auto_delivery") {
    const autoPublish = body.auto_publish === true;
    if (!canSetAutomaticDelivery(staff.role, autoPublish)) {
      return NextResponse.json(
        { error: "Only the Academic Office can turn on automatic learner delivery." },
        { status: 403 },
      );
    }
    const requestedIds = Array.isArray(body.plan_ids)
      ? [...new Set(body.plan_ids.map(String).filter(Boolean))]
      : [];
    const targets = (plans ?? []).filter((plan: any) =>
      requestedIds.includes(String(plan.id)),
    );
    if (!targets.length || targets.some((plan: any) => !visiblePlanIds.has(String(plan.id)))) {
      return NextResponse.json(
        { error: "Choose at least one class plan in your teaching scope." },
        { status: 400 },
      );
    }

    const failures: Array<{ planId: string; error: string }> = [];
    let updated = 0;
    for (const plan of targets) {
      const metadata =
        plan.metadata && typeof plan.metadata === "object" ? plan.metadata : {};
      const current = parseAutoGenerateSettings(
        metadata.auto_generate_settings,
      );
      const { error } = await db
        .from("lesson_plans")
        .update({
          metadata: {
            ...metadata,
            auto_generate_settings: {
              ...current,
              auto_publish: autoPublish,
            },
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", plan.id);
      if (error) failures.push({ planId: String(plan.id), error: error.message });
      else updated += 1;
    }

    await logAudit(db as any, {
      action: autoPublish
        ? "enable_automatic_teaching_delivery"
        : "require_teaching_package_review",
      actorId: staff.id,
      resourceType: "lesson_plan",
      resourceId: targets.length === 1 ? String(targets[0].id) : null,
      newValue: autoPublish
        ? `Automatic delivery enabled for ${updated} class plan(s)`
        : `Teacher review required for ${updated} class plan(s)`,
      newValues: {
        requested: targets.length,
        updated,
        failed: failures.length,
        auto_publish: autoPublish,
        plan_ids: targets.map((plan: any) => String(plan.id)),
      },
    });
    return NextResponse.json(
      { data: { requested: targets.length, updated, failures, auto_publish: autoPublish } },
      { status: failures.length ? 207 : 200 },
    );
  }

  const singlePlanId = String(body.planId ?? "");
  const singleWeek = Number(body.week);
  const batchInput: unknown[] | null = Array.isArray(body.releases)
    ? body.releases
    : null;
  const singleSession = parseRequestSession(body);
  type ReleaseTarget = { planId: string; week: number; session: number | null };
  const targets: ReleaseTarget[] = batchInput?.length
    ? batchInput
        .map((row): ReleaseTarget => {
          const entry = (row ?? {}) as Record<string, unknown>;
          return {
            planId: String(entry.planId ?? ""),
            week: Number(entry.week),
            session: parseRequestSession(entry),
          };
        })
        .filter(
          (row): row is ReleaseTarget =>
            Boolean(row.planId) && Number.isFinite(row.week)
        )
    : singlePlanId && Number.isFinite(singleWeek)
      ? [{ planId: singlePlanId, week: singleWeek, session: singleSession }]
      : [];
  if (!targets.length) {
    return NextResponse.json(
      { error: "Provide planId/week or releases[] with planId/week entries" },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();
  const results = [];

  for (const target of targets) {
    if (!visiblePlanIds.has(target.planId)) {
      results.push({
        planId: target.planId,
        week: target.week,
        session: target.session,
        lessons_released: 0,
        assignments_released: 0,
        slides_released: 0,
        flashcards_released: 0,
        error: "Forbidden",
      });
      continue;
    }

    results.push(
      await releasePreparedWeek({
        planId: target.planId,
        week: target.week,
        session: target.session,
        now,
      }),
    );
  }

  const failures = results.filter((r) => r.error);
  const notificationWarnings = results.filter((r) => r.warning);
  await logAudit(db as any, {
    action: failures.length ? "release_prepared_teaching_content_partial" : "release_prepared_teaching_content",
    actorId: staff.id,
    resourceType: "lesson_plan_week",
    resourceId: targets.length === 1 ? targets[0].planId : null,
    newValue: `Released ${results.length - failures.length} of ${results.length} prepared teaching week(s)`,
    newValues: {
      requested: results.length,
      released: results.length - failures.length,
      failed: failures.length,
      targets: results.map((result) => ({
        plan_id: result.planId,
        week: result.week,
        session: result.session,
        error: result.error ?? null,
      })),
    },
  });
  return NextResponse.json(
    {
      data: {
        count: results.length,
        released: results.filter((r) => !r.error).length,
        failed: failures.length,
        results,
      },
      ...(notificationWarnings.length > 0
        ? {
            warning: "The work is visible to students, but one or more alerts were not sent. An administrator can resend them from Office.",
          }
        : {}),
    },
    { status: failures.length ? 207 : 200 }
  );
}
