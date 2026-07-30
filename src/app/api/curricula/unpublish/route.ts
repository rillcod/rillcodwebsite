import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { unpublishCurriculumRelease } from "@/lib/curriculum/dependencies";

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
  POST /api/curricula/unpublish
  Explicitly unpublishes and retires an official curriculum edition.
  Payload: { curriculum_id: string }
 */
export async function POST(req: NextRequest) {
  const caller = await requireAdmin();
  if (!caller) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  if (!body.curriculum_id) {
    return NextResponse.json(
      { error: "curriculum_id is required" },
      { status: 400 }
    );
  }

  const admin = createAdminClient() as any;
  const result = await unpublishCurriculumRelease(admin, body.curriculum_id);

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error || "Unpublish failed" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    message: "Curriculum edition explicitly unpublished and retired",
    unpublishedCount: result.count,
  });
}
