import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  assetStatus,
  deliveryStatus,
  nextAction,
  laneSummary,
  type AssetFacts,
} from "@/lib/academic/status";
import type { AcademicRole } from "@/lib/academic/lanes";
import { isIndependentPathway } from "@/lib/academic/pathways";

export const dynamic = "force-dynamic";

type Actor = { id: string; role: AcademicRole; school_id: string | null };

async function getActor(): Promise<Actor | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const admin = createAdminClient() as any;
  const { data } = await admin
    .from("portal_users")
    .select("id, role, school_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!data) return null;
  return data as Actor;
}

function one<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

const RELEASE_SELECT =
  "id, title, release_number, change_summary, published_at, academic_session, effective_term_number";

/** Lane A facts for one course. */
async function loadAssetFacts(db: any, courseId: string): Promise<AssetFacts | null> {
  const { data: course } = await db
    .from("courses")
    .select("id, title, program_id")
    .eq("id", courseId)
    .maybeSingle();
  if (!course) return null;

  const [
    { count: centralDraftCount },
    { data: release },
    { count: adoptionCount },
    { count: offeringDirectionCount },
    { count: scheduleCount },
    { data: offerings },
  ] = await Promise.all([
    db
      .from("course_curricula")
      .select("id", { count: "exact", head: true })
      .eq("course_id", courseId)
      .is("school_id", null),
    db
      .from("academic_curriculum_releases")
      .select(RELEASE_SELECT)
      .eq("course_id", courseId)
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from("academic_curriculum_adoptions")
      .select("id", { count: "exact", head: true })
      .eq("course_id", courseId)
      .eq("status", "active"),
    db
      .from("academic_offering_curriculum_directions")
      .select("id", { count: "exact", head: true })
      .eq("course_id", courseId)
      .eq("status", "active"),
    db
      .from("academic_curriculum_delivery_schedules")
      .select("id", { count: "exact", head: true })
      .eq("course_id", courseId)
      .eq("status", "active"),
    // Offerings that teach this course's programme and must own an edition.
    course.program_id
      ? db
          .from("academic_offerings")
          .select("id, enrollment_type")
          .eq("programme_id", course.program_id)
          .eq("status", "active")
      : Promise.resolve({ data: [] }),
  ]);

  const independentOfferingCount = (offerings ?? []).filter((o: any) =>
    isIndependentPathway(o.enrollment_type)
  ).length;

  return {
    courseTitle: course.title,
    programmeLinked: !!course.program_id,
    centralDraftCount: centralDraftCount ?? 0,
    publishedRelease: release ?? null,
    adoptionCount: adoptionCount ?? 0,
    independentOfferingCount,
    offeringDirectionCount: offeringDirectionCount ?? 0,
    scheduleCount: scheduleCount ?? 0,
  };
}

/** Lane B facts for one class + course. */
async function loadDeliveryStatus(db: any, classId: string, courseId: string) {
  const { data: klass } = await db
    .from("classes")
    .select(
      "id, school_id, academic_offering_id, term_id, academic_terms(academic_year, term_number)"
    )
    .eq("id", classId)
    .maybeSingle();
  if (!klass) return null;

  const term = one<any>(klass.academic_terms);

  const [{ data: offering }, { data: plan }, { data: release }] = await Promise.all([
    klass.academic_offering_id
      ? db
          .from("academic_offerings")
          .select("id, enrollment_type, pathway")
          .eq("id", klass.academic_offering_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    db
      .from("lesson_plans")
      .select("id, curriculum_release_id, plan_data")
      .eq("class_id", classId)
      .eq("course_id", courseId)
      .eq("term_id", klass.term_id)
      .neq("status", "archived")
      .maybeSingle(),
    db
      .from("academic_curriculum_releases")
      .select(RELEASE_SELECT)
      .eq("course_id", courseId)
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const [{ data: offeringDirection }, { data: adoption }] = await Promise.all([
    klass.academic_offering_id
      ? db
          .from("academic_offering_curriculum_directions")
          .select("release_id")
          .eq("academic_offering_id", klass.academic_offering_id)
          .eq("course_id", courseId)
          .eq("status", "active")
          .maybeSingle()
      : Promise.resolve({ data: null }),
    klass.school_id
      ? db
          .from("academic_curriculum_adoptions")
          .select("release_id, academic_session, effective_term_number")
          .eq("school_id", klass.school_id)
          .eq("course_id", courseId)
          .eq("status", "active")
          .order("effective_term_number", { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const [{ count: deliveredWeekCount }, { count: evidenceCount }] = await Promise.all([
    db
      .from("curriculum_week_tracking")
      .select("id", { count: "exact", head: true })
      .eq("class_id", classId)
      .eq("status", "completed"),
    db
      .from("academic_assessment_evidence")
      .select("id", { count: "exact", head: true })
      .eq("class_id", classId),
  ]);

  return deliveryStatus({
    direction: {
      enrollmentType: offering?.enrollment_type ?? "school",
      pinnedReleaseId: plan?.curriculum_release_id ?? null,
      publishedRelease: release ?? null,
      offeringDirection: offeringDirection ?? null,
      adoption: adoption ?? null,
      classSession: term?.academic_year ?? null,
      classTermNumber: term?.term_number ?? null,
    },
    planExists: !!plan,
    planHasRelease: !!plan?.curriculum_release_id,
    deliveredWeekCount: deliveredWeekCount ?? 0,
    plannedWeekCount: Number(plan?.plan_data?.weeks?.length ?? 0),
    evidenceCount: evidenceCount ?? 0,
    resultsPublished: false,
  });
}

/**
 * Coverage across every central course — how much of the curriculum asset is
 * actually certified. This is what the Academic home leads with.
 */
async function loadOverview(db: any) {
  const [{ data: drafts }, { data: releases }, { data: issues }] = await Promise.all([
    db
      .from("course_curricula")
      .select("course_id, courses(title, programs(name))")
      .is("school_id", null),
    db
      .from("academic_curriculum_releases")
      .select("course_id")
      .eq("status", "published"),
    db.from("academic_lesson_plan_source_issues").select("lesson_plan_id, issue"),
  ]);

  const certified = new Set((releases ?? []).map((r: any) => r.course_id));
  const seen = new Map<string, { courseId: string; title: string; programme: string | null }>();
  for (const draft of drafts ?? []) {
    if (seen.has(draft.course_id)) continue;
    const course = one<any>(draft.courses);
    seen.set(draft.course_id, {
      courseId: draft.course_id,
      title: course?.title ?? "Course",
      programme: one<any>(course?.programs)?.name ?? null,
    });
  }

  const all = [...seen.values()];
  return {
    central_courses: all.length,
    certified_courses: all.filter((c) => certified.has(c.courseId)).length,
    awaiting_certification: all.filter((c) => !certified.has(c.courseId)),
    stuck_plans: (issues ?? []).length,
  };
}

export async function GET(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const courseId = url.searchParams.get("course_id");
  const classId = url.searchParams.get("class_id");
  const db = createAdminClient() as any;

  // Lane B — a specific class and course.
  if (classId && courseId) {
    const statuses = await loadDeliveryStatus(db, classId, courseId);
    if (!statuses)
      return NextResponse.json({ error: "Class not found" }, { status: 404 });
    return NextResponse.json({
      lane: "delivery",
      stages: statuses,
      next: nextAction(statuses),
      summary: laneSummary(statuses),
    });
  }

  // Lane A — a specific course.
  if (courseId) {
    const facts = await loadAssetFacts(db, courseId);
    if (!facts)
      return NextResponse.json({ error: "Course not found" }, { status: 404 });
    const statuses = assetStatus(facts);
    return NextResponse.json({
      lane: "asset",
      course: { id: courseId, title: facts.courseTitle },
      stages: statuses,
      next: nextAction(statuses),
      summary: laneSummary(statuses),
    });
  }

  // No scope — the system-wide picture for the Academic home.
  if (actor.role !== "admin") {
    return NextResponse.json({
      lane: "overview",
      role: actor.role,
      overview: null,
      message:
        "Open a class to see what to teach next. The Academic Office manages curriculum certification.",
    });
  }
  return NextResponse.json({
    lane: "overview",
    role: actor.role,
    overview: await loadOverview(db),
  });
}
