import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerClient } from "@/lib/supabase/server";
import {
  forceDeleteCurriculumDraft,
  inspectCurriculumDebris,
  purgeCurriculumDebris,
} from "@/lib/curriculum/force-delete-draft";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const admin = createAdminClient() as any;
  const { data: profile } = await admin
    .from("portal_users")
    .select("id, role")
    .eq("id", user.id)
    .single();
  if (!profile || profile.role !== "admin") return null;
  return profile;
}

function teachingSummary(teaching: any) {
  const c = teaching?.counts ?? {};
  return {
    lesson_plans: c.lesson_plans ?? 0,
    lessons: c.lessons ?? 0,
    assignments: c.assignments ?? 0,
    flashcards: c.flashcards ?? 0,
    exams: c.exams ?? 0,
    cbt_exams: c.cbt_exams ?? 0,
    total:
      (c.lesson_plans ?? 0) +
      (c.lessons ?? 0) +
      (c.assignments ?? 0) +
      (c.flashcards ?? 0) +
      (c.exams ?? 0) +
      (c.cbt_exams ?? 0),
  };
}

/**
  POST /api/curricula/bulk-delete
  Payload:
  - { ids: string[] }
  - { course_id: string }
  - { reset_all: true, confirmation: "RESET" } — wipe curricula + all debris
  - { inspect_debris: true } — orphan releases + teaching orphans
  - { purge_debris: true, confirmation: "PURGE" } — purge orphans
 */
export async function POST(req: NextRequest) {
  const caller = await requireAdmin();
  if (!caller) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const admin = createAdminClient() as any;

  try {
    if (body.inspect_debris === true) {
      const debris = await inspectCurriculumDebris(admin);
      const teaching = teachingSummary(debris.teaching);
      return NextResponse.json({
        success: true,
        debris,
        summary: {
          orphan_releases: debris.orphan_releases.length,
          delivery_schedules: debris.delivery_schedules,
          adoptions: debris.adoptions,
          offering_directions: debris.offering_directions,
          week_tracking_on_orphans: debris.week_tracking_on_orphans,
          teaching,
        },
      });
    }

    if (body.purge_debris === true) {
      if (body.confirmation !== "PURGE") {
        return NextResponse.json(
          {
            error:
              "Confirmation code 'PURGE' is required to remove orphan curriculum and teaching debris.",
          },
          { status: 400 }
        );
      }
      const result = await purgeCurriculumDebris(admin);
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 500 });
      }
      return NextResponse.json({
        success: true,
        purged_releases: result.purged_releases,
        teaching_purged: result.teaching,
      });
    }

    let targetIds: string[] = [];

    if (Array.isArray(body.ids) && body.ids.length > 0) {
      targetIds = body.ids;
    } else if (body.course_id) {
      const { data: rows } = await admin
        .from("course_curricula")
        .select("id")
        .eq("course_id", body.course_id);
      targetIds = (rows ?? []).map((r: any) => r.id);
    } else if (body.reset_all === true) {
      if (body.confirmation !== "RESET") {
        return NextResponse.json(
          { error: "Confirmation code 'RESET' is required to wipe all curriculum data." },
          { status: 400 }
        );
      }
      const { data: rows } = await admin.from("course_curricula").select("id");
      targetIds = (rows ?? []).map((r: any) => r.id);
    }

    if (targetIds.length === 0 && body.reset_all !== true) {
      return NextResponse.json(
        { error: "No curriculum records found to delete." },
        { status: 400 }
      );
    }

    let deletedCount = 0;
    const errors: Array<{ id: string; error: string }> = [];

    for (const id of targetIds) {
      const result = await forceDeleteCurriculumDraft(admin, id);
      if (result.ok) {
        deletedCount += 1;
      } else {
        errors.push({ id, error: result.error });
      }
    }

    let debrisPurged = 0;
    let teachingPurged: any = null;
    let debrisError: string | undefined;
    if (body.reset_all === true) {
      const debrisResult = await purgeCurriculumDebris(admin);
      if (debrisResult.ok) {
        debrisPurged = debrisResult.purged_releases;
        teachingPurged = debrisResult.teaching;
      } else {
        debrisError = debrisResult.error;
        errors.push({ id: "orphan-debris", error: debrisResult.error });
      }
    }

    const remaining = await inspectCurriculumDebris(admin);
    const failed = errors.length > 0;

    return NextResponse.json(
      {
        success: !failed,
        deletedCount,
        totalRequested: targetIds.length,
        debris_purged: debrisPurged,
        teaching_purged: teachingPurged,
        debris_remaining: {
          orphan_releases: remaining.orphan_releases.length,
          delivery_schedules: remaining.delivery_schedules,
          adoptions: remaining.adoptions,
          offering_directions: remaining.offering_directions,
          week_tracking_on_orphans: remaining.week_tracking_on_orphans,
          teaching: teachingSummary(remaining.teaching),
          items: remaining.orphan_releases,
        },
        errors: failed ? errors : undefined,
        ...(debrisError ? { debris_error: debrisError } : {}),
      },
      { status: failed ? 207 : 200 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to process bulk curriculum delete" },
      { status: 500 }
    );
  }
}
