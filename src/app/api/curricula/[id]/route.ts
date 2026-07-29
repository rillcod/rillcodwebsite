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

async function callerCanManageCurriculumSchool(
  admin: any,
  caller: { id: string; role: string; school_id: string | null },
  curriculumSchoolId: string | null
): Promise<boolean> {
  if (caller.role === "admin") return true;
  if (!curriculumSchoolId) return false;
  if (caller.school_id === curriculumSchoolId) return true;
  const { data: ts } = await admin
    .from("teacher_schools")
    .select("school_id")
    .eq("teacher_id", caller.id)
    .eq("school_id", curriculumSchoolId)
    .maybeSingle();
  return !!ts;
}

// GET /api/curricula/[id] — fetch a single curriculum
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const caller = await requireTeacher();
  if (!caller)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const admin = createAdminClient() as any;

  const { data: row, error: rowErr } = await admin
    .from("course_curricula")
    .select(
      "id, course_id, school_id, content, version, is_visible_to_school, created_at, updated_at"
    )
    .eq("id", id)
    .maybeSingle();
  if (rowErr)
    return NextResponse.json({ error: rowErr.message }, { status: 500 });
  if (!row)
    return NextResponse.json(
      { error: "Curriculum not found" },
      { status: 404 }
    );

  const ok = await callerCanManageCurriculumSchool(
    admin,
    caller,
    row.school_id ?? null
  );
  if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ data: row });
}

// PATCH /api/curricula/[id] — update is_visible_to_school and/or content
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const caller = await requireTeacher();
  if (!caller)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (caller.role !== "admin")
    return NextResponse.json(
      {
        error:
          "Only the Academic Office can change curriculum source material. Submit a teaching change proposal instead.",
      },
      { status: 403 }
    );

  const { id } = await context.params;
  const body = await req.json();

  const admin = createAdminClient() as any;
  const { data: row, error: rowErr } = await admin
    .from("course_curricula")
    .select("id, school_id, version")
    .eq("id", id)
    .maybeSingle();
  if (rowErr)
    return NextResponse.json({ error: rowErr.message }, { status: 500 });
  if (!row)
    return NextResponse.json(
      { error: "Curriculum not found" },
      { status: 404 }
    );
  const ok = await callerCanManageCurriculumSchool(
    admin,
    caller,
    row.school_id ?? null
  );
  if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const updatePayload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (typeof body.is_visible_to_school === "boolean") {
    updatePayload.is_visible_to_school = body.is_visible_to_school;
  }
  if (body.content !== undefined) {
    updatePayload.content = body.content;
    // Set version manually if passed, otherwise keep current version (no auto-bumping)
    updatePayload.version =
      typeof body.version === "number" ? body.version : row.version ?? 1;
  } else {
    // Support isolated version and description metadata updates
    let mergedContent: any = null;
    if (typeof body.description === "string") {
      const { data: currentRow } = await admin
        .from("course_curricula")
        .select("content")
        .eq("id", id)
        .single();
      const existingContent: any = currentRow?.content ?? {};
      mergedContent = { ...existingContent, description: body.description };
      updatePayload.content = mergedContent;
    }
    if (typeof body.version === "number") {
      updatePayload.version = body.version;
    }
  }

  if (body.term_start_dates && typeof body.term_start_dates === "object") {
    // Merge term start dates into existing content WITHOUT bumping version
    const { data: currentRow } = await admin
      .from("course_curricula")
      .select("content")
      .eq("id", id)
      .single();
    const existingContent: any = currentRow?.content ?? {};
    const updatedTerms = (existingContent.terms ?? []).map((t: any) => ({
      ...t,
      start_date:
        (body.term_start_dates as Record<string, string>)[String(t.term)] ??
        t.start_date,
    }));
    updatePayload.content = { ...existingContent, terms: updatedTerms };
  } else if (body.notification_settings !== undefined) {
    // Merge notification settings into existing content WITHOUT bumping version
    const { data: currentRow } = await admin
      .from("course_curricula")
      .select("content")
      .eq("id", id)
      .single();
    const existingContent: any = currentRow?.content ?? {};
    updatePayload.content = {
      ...existingContent,
      notification_settings: body.notification_settings,
    };
  } else if (body.program_start_term !== undefined) {
    const pst = Number(body.program_start_term);
    if (![1, 2, 3].includes(pst)) {
      return NextResponse.json(
        { error: "program_start_term must be 1, 2, or 3" },
        { status: 400 }
      );
    }
    const { data: currentRow } = await admin
      .from("course_curricula")
      .select("content")
      .eq("id", id)
      .single();
    const existingContent: any = currentRow?.content ?? {};
    const existingMeta = existingContent.metadata ?? {};
    updatePayload.content = {
      ...existingContent,
      metadata: { ...existingMeta, program_start_term: pst },
    };
  }

  if (Object.keys(updatePayload).length === 1) {
    return NextResponse.json(
      { error: "No valid fields to update" },
      { status: 400 }
    );
  }

  const { data, error } = await admin
    .from("course_curricula")
    .update(updatePayload)
    .eq("id", id)
    .select("id, is_visible_to_school, version, content")
    .single();

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

// DELETE /api/curricula/[id] — cascade delete: syllabus + tracking + linked lesson plans
export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const caller = await requireTeacher();
  if (!caller)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (caller.role !== "admin")
    return NextResponse.json(
      {
        error:
          "Only the Academic Office can change curriculum source material. Submit a teaching change proposal instead.",
      },
      { status: 403 }
    );

  const { id } = await context.params;
  const admin = createAdminClient() as any;

  const { data: row, error: rowErr } = await admin
    .from("course_curricula")
    .select("id, school_id")
    .eq("id", id)
    .maybeSingle();
  if (rowErr)
    return NextResponse.json({ error: rowErr.message }, { status: 500 });
  if (!row)
    return NextResponse.json(
      { error: "Curriculum not found" },
      { status: 404 }
    );

  const ok = await callerCanManageCurriculumSchool(
    admin,
    caller,
    row.school_id ?? null
  );
  if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [
    { count: releaseCount },
    { count: planCount },
    { count: trackingCount },
  ] = await Promise.all([
    admin
      .from("academic_curriculum_releases")
      .select("id", { count: "exact", head: true })
      .eq("source_curriculum_id", id),
    admin
      .from("lesson_plans")
      .select("id", { count: "exact", head: true })
      .eq("curriculum_version_id", id),
    admin
      .from("curriculum_week_tracking")
      .select("id", { count: "exact", head: true })
      .eq("curriculum_id", id),
  ]);
  if (
    (releaseCount ?? 0) > 0 ||
    (planCount ?? 0) > 0 ||
    (trackingCount ?? 0) > 0
  ) {
    // Naming what holds it is the difference between a refusal a person can
    // act on and one that just looks like the button is broken.
    const { data: holdingPlans } = await admin
      .from("lesson_plans")
      .select("id, status, classes!lesson_plans_class_id_fkey(name)")
      .eq("curriculum_version_id", id)
      .limit(5);
    const classNames = (holdingPlans ?? [])
      .map((p: any) => {
        const klass = Array.isArray(p.classes) ? p.classes[0] : p.classes;
        return klass?.name ?? "an unnamed class";
      })
      .filter((v: string, i: number, all: string[]) => all.indexOf(v) === i);

    const reasons: string[] = [];
    if ((releaseCount ?? 0) > 0) {
      reasons.push(
        `${releaseCount} official edition${releaseCount === 1 ? " has" : "s have"} been published from it`
      );
    }
    if ((planCount ?? 0) > 0) {
      reasons.push(
        `${planCount} teaching plan${planCount === 1 ? "" : "s"} still use${planCount === 1 ? "s" : ""} it${
          classNames.length ? ` (${classNames.join(", ")})` : ""
        }`
      );
    }
    if ((trackingCount ?? 0) > 0) {
      reasons.push(
        `${trackingCount} delivered week${trackingCount === 1 ? " is" : "s are"} recorded against it`
      );
    }

    const onlyDraftPlans =
      (releaseCount ?? 0) === 0 &&
      (trackingCount ?? 0) === 0 &&
      (holdingPlans ?? []).length > 0 &&
      (holdingPlans ?? []).every((p: any) => p.status === "draft");

    return NextResponse.json(
      {
        error: `Cannot delete: ${reasons.join("; ")}.${
          onlyDraftPlans
            ? " Those plans are still drafts, so you can delete them from the class first, then delete this curriculum."
            : " Publish a replacement edition or archive future use instead."
        }`,
        official_release_count: releaseCount ?? 0,
        linked_plan_count: planCount ?? 0,
        delivery_record_count: trackingCount ?? 0,
        holding_classes: classNames,
        only_draft_plans: onlyDraftPlans,
      },
      { status: 409 }
    );
  }
  const { error } = await admin.from("course_curricula").delete().eq("id", id);
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, deleted: { curriculum: id } });
}
