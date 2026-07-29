import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  curriculumContentHash,
  validateSourceMetadata,
} from "@/lib/curriculum/governance";
import {
  applyCurriculumRollout,
  requireGovernanceActor,
} from "@/lib/curriculum/governance-server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const actor = await requireGovernanceActor();
  if (!actor)
    return NextResponse.json(
      { error: "Staff access required." },
      { status: 401 }
    );
  const db: any = createAdminClient();
  const courseId = new URL(req.url).searchParams.get("course_id");
  let query = db
    .from("academic_curriculum_releases")
    .select(
      "id, course_id, source_curriculum_id, release_number, title, change_summary, content_hash, source_metadata, status, published_at, published_by, courses(title, programs(name))"
    )
    .order("published_at", { ascending: false });
  if (courseId) query = query.eq("course_id", courseId);
  const { data: releases, error } = await query;
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  let curricula: unknown[] = [];
  if (actor.role === "admin") {
    const result = await db
      .from("course_curricula")
      .select(
        "id, course_id, version, content, updated_at, courses(title, programs(name))"
      )
      .is("school_id", null)
      .order("updated_at", { ascending: false });
    curricula = result.data ?? [];
  }
  const [{ count: pending }, { count: adoptions }] = await Promise.all([
    db
      .from("academic_curriculum_proposals")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    db
      .from("academic_curriculum_adoptions")
      .select("id", { count: "exact", head: true })
      .eq("status", "active"),
  ]);
  return NextResponse.json({
    data: releases ?? [],
    curricula,
    summary: {
      pending_proposals: pending ?? 0,
      active_adoptions: adoptions ?? 0,
    },
  });
}

export async function POST(req: NextRequest) {
  const actor = await requireGovernanceActor();
  if (!actor)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (actor.role !== "admin") {
    return NextResponse.json(
      {
        error:
          "Only the academic administrator can publish official curriculum releases.",
      },
      { status: 403 }
    );
  }
  const body = await req.json().catch(() => ({}));
  const curriculumId =
    typeof body.curriculum_id === "string" ? body.curriculum_id : "";
  const changeSummary =
    typeof body.change_summary === "string" ? body.change_summary.trim() : "";
  if (!curriculumId || !changeSummary) {
    return NextResponse.json(
      { error: "curriculum_id and change_summary are required." },
      { status: 400 }
    );
  }
  const sourceCheck = validateSourceMetadata(body.source_metadata);
  if (!sourceCheck.ok)
    return NextResponse.json({ error: sourceCheck.error }, { status: 400 });

  const db: any = createAdminClient();
  const { data: curriculum } = await db
    .from("course_curricula")
    .select("id, course_id, school_id, content, courses(title)")
    .eq("id", curriculumId)
    .maybeSingle();
  if (!curriculum)
    return NextResponse.json(
      { error: "Curriculum not found." },
      { status: 404 }
    );
  if (curriculum.school_id) {
    return NextResponse.json(
      {
        error:
          "Official releases must be published from the central platform curriculum, not a school copy.",
      },
      { status: 409 }
    );
  }
  const content = curriculum.content ?? {};
  if (!Array.isArray(content?.terms) || content.terms.length === 0) {
    return NextResponse.json(
      {
        error:
          "The curriculum must contain at least one term before publication.",
      },
      { status: 400 }
    );
  }
  const contentHash = curriculumContentHash(content);
  const { data: duplicate } = await db
    .from("academic_curriculum_releases")
    .select("id, release_number")
    .eq("course_id", curriculum.course_id)
    .eq("content_hash", contentHash)
    .maybeSingle();
  if (duplicate) {
    return NextResponse.json(
      {
        error: `This exact curriculum is already published as release ${duplicate.release_number}.`,
        existing_id: duplicate.id,
      },
      { status: 409 }
    );
  }
  const { data: latest } = await db
    .from("academic_curriculum_releases")
    .select("release_number")
    .eq("course_id", curriculum.course_id)
    .order("release_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  const releaseNumber = Number(latest?.release_number ?? 0) + 1;
  const course = Array.isArray(curriculum.courses)
    ? curriculum.courses[0]
    : curriculum.courses;
  const { data: release, error } = await db
    .from("academic_curriculum_releases")
    .insert({
      course_id: curriculum.course_id,
      source_curriculum_id: curriculum.id,
      release_number: releaseNumber,
      title: `${course?.title ?? "Curriculum"} · Release ${releaseNumber}`,
      change_summary: changeSummary.slice(0, 2000),
      content,
      content_hash: contentHash,
      source_metadata: sourceCheck.source,
      status: "published",
      published_by: actor.id,
    })
    .select("*")
    .single();
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  const rollout = await applyCurriculumRollout({
    releaseId: release.id,
    schoolIds: Array.isArray(body.school_ids) ? body.school_ids : undefined,
    actorId: actor.id,
  });
  return NextResponse.json({ data: release, rollout }, { status: 201 });
}
