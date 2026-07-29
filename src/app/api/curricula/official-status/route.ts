import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function requireTeacher() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const admin = createAdminClient() as any;
  const { data: profile } = await admin
    .from("portal_users")
    .select("id, role, school_id")
    .eq("id", user.id)
    .single();
  if (!profile || !["admin", "teacher"].includes(profile.role)) return null;
  return profile;
}

// GET /api/curricula/official-status?course_id=... — the published official
// edition for a course, plus (for school-attached staff) whether their
// school currently has it adopted. Powers the "Official Curriculum" status
// banner on the Curriculum Guide page.
export async function GET(req: NextRequest) {
  const caller = await requireTeacher();
  if (!caller)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const courseId = new URL(req.url).searchParams.get("course_id");
  if (!courseId)
    return NextResponse.json(
      { error: "course_id is required" },
      { status: 400 }
    );

  const admin = createAdminClient() as any;

  const { data: release } = await admin
    .from("academic_curriculum_releases")
    .select(
      "id, title, release_number, change_summary, published_at, academic_session, effective_term_number, audience_label, grade_key"
    )
    .eq("course_id", courseId)
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let adoption: any = null;
  if (caller.school_id) {
    const { data } = await admin
      .from("academic_curriculum_adoptions")
      .select("id, release_id, academic_session, effective_term_number")
      .eq("school_id", caller.school_id)
      .eq("course_id", courseId)
      .eq("status", "active")
      .order("effective_term_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    adoption = data ?? null;
  }

  return NextResponse.json({
    release: release ?? null,
    adoption,
    is_school_scoped: !!caller.school_id,
  });
}
