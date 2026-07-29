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

/**
 * Everything below runs on the admin client, so scope has to be proven here
 * rather than left to row-level security. A teacher may only ask about a class
 * they are assigned to; a school may only ask about its own.
 */
async function canSeeClass(
  db: any,
  actor: Actor,
  classId: string
): Promise<boolean> {
  if (actor.role === "admin") return true;
  const { data: klass } = await db
    .from("classes")
    .select("id, school_id, teacher_id")
    .eq("id", classId)
    .maybeSingle();
  if (!klass) return false;
  if (actor.role === "school") return klass.school_id === actor.school_id;
  // Assigned class only. Allowing any class in the teacher's school would let
  // one teacher read another's academic status, and it disagrees with the
  // class scoping used elsewhere (see visibleClassIds in /api/academic-spine).
  if (actor.role === "teacher") return klass.teacher_id === actor.id;
  return false;
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
          .select("id, enrollment_type, school_id")
          .eq("programme_id", course.program_id)
          .eq("status", "active")
      : Promise.resolve({ data: [] }),
  ]);

  // Counting is not coverage. A single adoption made distribution look finished
  // while other eligible schools had nothing, so compare the actual sets: which
  // schools are expected to teach this course, and which offerings hold their
  // own direction.
  const independent = (offerings ?? []).filter((o: any) =>
    isIndependentPathway(o.enrollment_type)
  );
  const schoolOfferings = (offerings ?? []).filter(
    (o: any) => !isIndependentPathway(o.enrollment_type) && o.school_id
  );

  const [{ data: adoptionRows }, { data: directionRows }] = await Promise.all([
    db
      .from("academic_curriculum_adoptions")
      .select("school_id")
      .eq("course_id", courseId)
      .eq("status", "active"),
    db
      .from("academic_offering_curriculum_directions")
      .select("academic_offering_id")
      .eq("course_id", courseId)
      .eq("status", "active"),
  ]);

  const adoptedSchools = new Set(
    (adoptionRows ?? []).map((a: any) => a.school_id)
  );
  const directedOfferings = new Set(
    (directionRows ?? []).map((d: any) => d.academic_offering_id)
  );

  const expectedSchools = new Set(schoolOfferings.map((o: any) => o.school_id));
  const schoolsMissing = [...expectedSchools].filter(
    (id) => !adoptedSchools.has(id)
  ).length;
  const offeringsMissing = independent.filter(
    (o: any) => !directedOfferings.has(o.id)
  ).length;

  return {
    courseTitle: course.title,
    programmeLinked: !!course.program_id,
    centralDraftCount: centralDraftCount ?? 0,
    publishedRelease: release ?? null,
    adoptionCount: adoptionCount ?? 0,
    independentOfferingCount: independent.length,
    offeringDirectionCount: offeringDirectionCount ?? 0,
    scheduleCount: scheduleCount ?? 0,
    expectedSchoolCount: expectedSchools.size,
    schoolsMissingAdoption: schoolsMissing,
    offeringsMissingDirection: offeringsMissing,
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

  const [{ data: offeringDirection }, { data: adoptions }] = await Promise.all([
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
      : Promise.resolve({ data: [] }),
  ]);

  // Pick the adoption that actually governs this class's period. Taking the
  // newest by term alone reported a session mismatch whenever a school held
  // adoptions for more than one session.
  const candidates = (adoptions ?? []) as {
    release_id: string;
    academic_session: string | null;
    effective_term_number: number | null;
  }[];
  const sameSession = candidates.filter(
    (a) => !term?.academic_year || a.academic_session === term.academic_year
  );
  const applicable = (sameSession.length ? sameSession : candidates).find(
    (a) =>
      !term?.term_number ||
      !a.effective_term_number ||
      a.effective_term_number <= term.term_number
  );
  const adoption =
    applicable ?? (sameSession.length ? sameSession[0] : candidates[0]) ?? null;

  // Counts must describe this plan's course and term, not everything the class
  // has ever done, or delivery and evidence read as complete far too early.
  const [{ count: deliveredWeekCount }, { count: evidenceCount }, { count: publishedResults }] =
    await Promise.all([
      plan?.id
        ? db
            .from("curriculum_week_tracking")
            .select("id", { count: "exact", head: true })
            .eq("lesson_plan_id", plan.id)
            .eq("status", "completed")
        : Promise.resolve({ count: 0 }),
      (() => {
        let q = db
          .from("academic_assessment_evidence")
          .select("id", { count: "exact", head: true })
          .eq("class_id", classId)
          .eq("course_id", courseId);
        if (klass.term_id) q = q.eq("academic_term_id", klass.term_id);
        return q;
      })(),
      (() => {
        let q = db
          .from("student_progress_reports")
          .select("id", { count: "exact", head: true })
          .eq("class_id", classId)
          .eq("course_id", courseId)
          .eq("is_published", true);
        if (klass.term_id) q = q.eq("term_id", klass.term_id);
        return q;
      })(),
    ]);

  return deliveryStatus({
    direction: {
      enrollmentType: offering?.enrollment_type ?? "school",
      pinnedReleaseId: plan?.curriculum_release_id ?? null,
      publishedRelease: release ?? null,
      offeringDirection: offeringDirection ?? null,
      adoption,
      classSession: term?.academic_year ?? null,
      classTermNumber: term?.term_number ?? null,
    },
    planExists: !!plan,
    planHasRelease: !!plan?.curriculum_release_id,
    deliveredWeekCount: deliveredWeekCount ?? 0,
    plannedWeekCount: Number(plan?.plan_data?.weeks?.length ?? 0),
    evidenceCount: evidenceCount ?? 0,
    resultsPublished: (publishedResults ?? 0) > 0,
  });
}

/**
 * Coverage across every central course — how much of the curriculum asset is
 * actually certified. This is what the Academic home leads with.
 */
/**
 * Coverage across the whole catalogue. Counting only courses that already have
 * a draft hid the worst cases entirely: a course nobody has written a
 * curriculum for cannot be certified, so it is exactly the one that needs
 * naming.
 */
async function loadOverview(db: any) {
  const [{ data: courses }, { data: drafts }, { data: releases }, { data: issues }] =
    await Promise.all([
      db.from("courses").select("id, title, is_active, programs(name)"),
      db.from("course_curricula").select("course_id").is("school_id", null),
      db
        .from("academic_curriculum_releases")
        .select("course_id")
        .eq("status", "published"),
      db.from("academic_lesson_plan_source_issues").select("lesson_plan_id, issue"),
    ]);

  const drafted = new Set((drafts ?? []).map((d: any) => d.course_id));
  const certified = new Set((releases ?? []).map((r: any) => r.course_id));

  const all = (courses ?? [])
    .filter((c: any) => c.is_active !== false)
    .map((c: any) => ({
      courseId: c.id,
      title: c.title ?? "Course",
      programme: one<any>(c.programs)?.name ?? null,
      hasDraft: drafted.has(c.id),
      certified: certified.has(c.id),
    }));

  // Two different problems, kept apart: a written draft is one action from
  // being teachable, a course with no curriculum is a much longer road.
  const readyToCertify = all.filter((c: any) => !c.certified && c.hasDraft);
  const awaitingCurriculum = all.filter((c: any) => !c.certified && !c.hasDraft);

  return {
    central_courses: all.length,
    certified_courses: all.filter((c: any) => c.certified).length,
    ready_to_certify: readyToCertify,
    awaiting_curriculum_count: awaitingCurriculum.length,
    awaiting_curriculum_sample: awaitingCurriculum.slice(0, 6),
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
    if (!(await canSeeClass(db, actor, classId))) {
      return NextResponse.json(
        { error: "This class is outside your academic scope" },
        { status: 403 }
      );
    }
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
