import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { forceDeleteCurriculumDraft } from "@/lib/curriculum/force-delete-draft";

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

/**
  POST /api/curricula/bulk-delete
  Allows admins to delete selected curriculum IDs or reset all curricula for a course/platform.
  Payload:
  - { ids: string[] } -> deletes specified curriculum IDs
  - { course_id: string } -> deletes all curricula for a specific course
  - { reset_all: true, confirmation: "RESET" } -> purges all course_curricula rows
 */
export async function POST(req: NextRequest) {
  const caller = await requireAdmin();
  if (!caller) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const admin = createAdminClient() as any;

  try {
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

    if (targetIds.length === 0) {
      return NextResponse.json(
        { error: "No curriculum records found to delete." },
        { status: 400 }
      );
    }

    let deletedCount = 0;
    const errors: string[] = [];

    for (const id of targetIds) {
      const result = await forceDeleteCurriculumDraft(admin, id);
      if (result.ok) {
        deletedCount += 1;
      } else {
        errors.push(`ID ${id}: ${result.error}`);
      }
    }

    return NextResponse.json({
      success: true,
      deletedCount,
      totalRequested: targetIds.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to process bulk curriculum delete" },
      { status: 500 }
    );
  }
}
