/**
 * End-to-end check of the automatic academic pathway, for both a regular
 * school term and a special programme delivery period.
 *
 * Nothing live is touched. Every row this creates is prefixed ZZ-E2E and is
 * removed again at the end unless --keep is passed. Existing reports are never
 * read for writing, and no manual result is recalculated: the calculator
 * refuses manual reports by design, and this script only ever creates its own
 * reports with calculation_mode='automatic'.
 *
 *   npx tsx scripts/e2e-academic-pathways.ts          run and clean up
 *   npx tsx scripts/e2e-academic-pathways.ts --keep   leave the data in place
 */
import dotenv from "dotenv";
import path from "node:path";
import { randomUUID } from "node:crypto";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import { createClient } from "@supabase/supabase-js";

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
) as any;

const TAG = "ZZ-E2E";
const keep = process.argv.includes("--keep");
const made: { table: string; id: string }[] = [];
let failures = 0;

function ok(label: string, condition: boolean, detail = "") {
  console.log(`  ${condition ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!condition) failures += 1;
}

async function insert(table: string, row: Record<string, unknown>) {
  const { data, error } = await db.from(table).insert(row).select().single();
  if (error) throw new Error(`${table}: ${error.message}`);
  made.push({ table, id: data.id });
  return data;
}

const authIds: string[] = [];

/**
 * Evidence and results reference auth.users, so a learner needs a real
 * account rather than a bare portal_users row. Created through the admin API
 * exactly as a real sign-up would be, and deleted again at the end.
 */
async function makeAccount(email: string, fullName: string) {
  const { data, error } = await db.auth.admin.createUser({
    email,
    password: `${TAG}-${randomUUID().slice(0, 12)}`,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error) throw new Error(`auth.createUser: ${error.message}`);
  authIds.push(data.user.id);
  return data.user.id;
}

/**
 * Signing up already creates the portal_users row through a trigger, so the
 * profile is completed by update rather than a second insert.
 */
async function completeProfile(id: string, fields: Record<string, unknown>) {
  const { data, error } = await db
    .from("portal_users")
    .update(fields)
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(`portal_users: ${error.message}`);
  return data;
}

/** A syllabus the quality engine will accept: real topics, no placeholders. */
function syllabus() {
  const week = (n: number, topic: string) => ({
    week: n,
    topic,
    subtopics: [`${topic} in practice`, `${topic} for Nigerian classrooms`],
    lesson_plan: {
      objectives: [`Explain ${topic.toLowerCase()}`, `Apply ${topic.toLowerCase()} to a task`],
      student_activities: [`Build a small ${topic.toLowerCase()} example`],
      teacher_activities: [`Demonstrate ${topic.toLowerCase()} step by step`],
      duration_minutes: 60,
    },
  });
  return {
    course_title: `${TAG} Pathway Course`,
    metadata: { format: "school", program_start_term: 1 },
    terms: [
      {
        year: 1,
        term: 1,
        title: "First Term",
        weeks: [
          week(1, "Sequencing"),
          week(2, "Loops"),
          week(3, "Conditions"),
          week(4, "Variables"),
        ],
      },
    ],
  };
}

async function main() {
  console.log(`\n=== ${TAG} academic pathway check ===\n`);

  const { data: school } = await db.from("schools").select("id,name").limit(1).single();
  const { data: admin } = await db
    .from("portal_users")
    .select("id")
    .eq("role", "admin")
    .limit(1)
    .single();
  const { data: term } = await db
    .from("academic_terms")
    .select("id,academic_year,term_number,term_label,start_date,end_date")
    .order("is_current", { ascending: false })
    .limit(1)
    .single();
  console.log(`host school: ${school.name} | term: ${term.academic_year} T${term.term_number}\n`);

  // A class must be owned by an active teacher of its school, so the check
  // brings its own rather than borrowing a real member of staff.
  const teacherEmail = `${TAG.toLowerCase()}.teacher.${Date.now()}@example.invalid`;
  const teacherAuthId = await makeAccount(teacherEmail, `${TAG} teacher`);
  const teacher = await completeProfile(teacherAuthId, {
    full_name: `${TAG} teacher`,
    role: "teacher",
    school_id: school.id,
    is_active: true,
  });
  await insert("teacher_schools", {
    teacher_id: teacher.id,
    school_id: school.id,
  });

  // ── Lane A: catalogue -> author -> certify -> distribute ─────────────────
  const programme = await insert("programs", {
    name: `${TAG} Pathway Programme`,
    description: "Temporary programme for the automatic-result check.",
    is_active: true,
  });
  const course = await insert("courses", {
    program_id: programme.id,
    title: `${TAG} Pathway Course`,
    description: "Temporary course for the automatic-result check.",
    is_active: true,
  });
  const draft = await insert("course_curricula", {
    course_id: course.id,
    school_id: null,
    version: 1,
    content: syllabus(),
    created_by: admin.id,
  });

  const contentHash = randomUUID().replace(/-/g, "");
  const release = await insert("academic_curriculum_releases", {
    course_id: course.id,
    source_curriculum_id: draft.id,
    release_number: 1,
    title: `${TAG} Pathway Course · ${term.academic_year} · Basic 1`,
    change_summary: "Initial edition for the pathway check.",
    content: syllabus(),
    content_hash: contentHash,
    source_metadata: { name: "Rillcod Academic Office", framework: "Rillcod Standard" },
    status: "published",
    published_by: admin.id,
    academic_session: term.academic_year,
    effective_term_number: term.term_number,
    audience_label: "Basic 1",
  });
  console.log("Lane A — curriculum");
  ok("central draft authored", !!draft.id);
  ok("official edition certified", release.status === "published");

  // ── School pathway: offering, adoption, class, learner ───────────────────
  const schoolOffering = await insert("academic_offerings", {
    title: `${TAG} School Pathway`,
    pathway: "school_term",
    programme_id: programme.id,
    school_id: school.id,
    calendar_mode: "school_calendar",
    result_destination: "school_report",
    status: "active",
    enrollment_type: "school",
    awards_certificate: true,
  });
  // Every real offering carries a period, school ones included — the term is
  // expressed as a period so results have one context to hang on.
  const schoolPeriod = await insert("academic_offering_periods", {
    offering_id: schoolOffering.id,
    label: `${TAG} ${term.term_label} ${term.academic_year}`,
    sequence_number: 1,
    starts_on: term.start_date,
    ends_on: term.end_date,
    status: "active",
  });
  await insert("academic_curriculum_adoptions", {
    school_id: school.id,
    course_id: course.id,
    release_id: release.id,
    status: "active",
    adopted_by: admin.id,
  });
  ok("edition distributed to the school", true);

  // ── Special pathway: offering with its own period and own edition ────────
  const specialOffering = await insert("academic_offerings", {
    title: `${TAG} Special Pathway`,
    pathway: "bootcamp",
    programme_id: programme.id,
    school_id: school.id,
    calendar_mode: "fixed_dates",
    result_destination: "standalone",
    status: "active",
    enrollment_type: "special",
    starts_on: "2026-07-08",
    ends_on: "2026-08-16",
    awards_certificate: true,
  });
  const period = await insert("academic_offering_periods", {
    offering_id: specialOffering.id,
    label: `${TAG} Summer Bootcamp — 8 July to 16 August`,
    sequence_number: 1,
    starts_on: "2026-07-08",
    ends_on: "2026-08-16",
    status: "active",
  });
  await insert("academic_offering_curriculum_directions", {
    academic_offering_id: specialOffering.id,
    course_id: course.id,
    release_id: release.id,
    status: "active",
    assigned_by: admin.id,
  });
  ok("special pathway given its own edition", true);

  const results: Record<string, any> = {};

  for (const lane of [
    { name: "school", offering: schoolOffering, periodId: schoolPeriod.id as string | null, termId: term.id },
    { name: "special", offering: specialOffering, periodId: period.id, termId: null },
  ]) {
    console.log(`\nLane B — delivery (${lane.name} pathway)`);

    const klass = await insert("classes", {
      name: `${TAG} ${lane.name} class`,
      school_id: school.id,
      program_id: programme.id,
      term_id: lane.termId,
      academic_offering_id: lane.offering.id,
      offering_period_id: lane.periodId,
      current_course_id: course.id,
      teacher_id: teacher.id,
    });

    const learnerEmail = `${TAG.toLowerCase()}.${lane.name}.${Date.now()}@example.invalid`;
    const learnerAuthId = await makeAccount(learnerEmail, `${TAG} ${lane.name} learner`);
    const learner = await completeProfile(learnerAuthId, {
      full_name: `${TAG} ${lane.name} learner`,
      role: "student",
      school_id: school.id,
      class_id: klass.id,
      // The pathway decides the learner's enrollment type; a class cannot be
      // assigned without one.
      enrollment_type: lane.name === "special" ? "special" : "school",
      is_active: true,
    });

    // Plan, through the same function the API uses.
    const { data: planResult, error: planErr } = await db.rpc("ensure_class_teaching_plan", {
      p_class_id: klass.id,
      p_course_id: course.id,
      p_curriculum_version_id: draft.id,
      p_actor_id: teacher.id,
      p_academic_term_id: lane.termId,
      p_offering_period_id: lane.periodId,
      p_sessions_per_week: 2,
    });
    ok("term plan created", !planErr && !!planResult?.plan_id, planErr?.message ?? `scheduled by ${planResult?.scheduled_by}`);
    if (planErr) continue;
    made.push({ table: "lesson_plans", id: planResult.plan_id });

    const { data: plan } = await db
      .from("lesson_plans")
      .select("id,curriculum_release_id,offering_period_id,term_id")
      .eq("id", planResult.plan_id)
      .single();
    ok("plan locked to the official edition", plan.curriculum_release_id === release.id);
    ok(
      lane.name === "special" ? "plan keyed on the delivery period" : "plan keyed on the academic term",
      lane.name === "special" ? !!plan.offering_period_id : !!plan.term_id
    );

    // Evidence: one homework, one project, one exam, and attendance.
    const homework = await insert("assignments", {
      title: `${TAG} homework`,
      course_id: course.id,
      school_id: school.id,
      class_id: klass.id,
      assignment_type: "homework",
      max_points: 100,
      is_active: true,
    });
    const project = await insert("assignments", {
      title: `${TAG} project`,
      course_id: course.id,
      school_id: school.id,
      class_id: klass.id,
      assignment_type: "project",
      max_points: 100,
      is_active: true,
    });
    const exam = await insert("cbt_exams", {
      title: `${TAG} examination`,
      course_id: course.id,
      school_id: school.id,
      class_id: klass.id,
      metadata: { exam_type: "examination" },
      is_active: true,
      created_by: admin.id,
      duration_minutes: 45,
      total_questions: 10,
      passing_score: 50,
    });

    const evidenceBase = {
      student_id: learner.id,
      school_id: school.id,
      class_id: klass.id,
      course_id: course.id,
      academic_term_id: lane.termId,
      curriculum_release_id: release.id,
      lesson_plan_id: plan.id,
      academic_offering_id: lane.offering.id,
      offering_period_id: lane.periodId ?? null,
      evidence_status: "graded",
      graded_by: admin.id,
      maximum_score: 100,
    };
    // Full marks everywhere, so a perfect learner must reach 100.
    for (const [type, assessment] of [
      ["assignment_submission", homework.id],
      ["assignment_submission", project.id],
      ["cbt_session", exam.id],
    ] as const) {
      await insert("academic_assessment_evidence", {
        ...evidenceBase,
        evidence_type: type,
        assessment_id: assessment,
        source_id: randomUUID(),
        raw_score: 100,
        percentage: 100,
      });
    }

    // Four sessions: three present, one late — late must count as attended.
    for (let i = 0; i < 4; i += 1) {
      const session = await insert("class_sessions", {
        class_id: klass.id,
        term_id: lane.termId,
        session_date: `2026-07-${String(10 + i).padStart(2, "0")}`,
        title: `${TAG} session ${i + 1}`,
        status: "completed",
      });
      await insert("attendance", {
        session_id: session.id,
        // user_id is the portal learner; student_id belongs to the pre-portal
        // students table and is not what the calculator reads.
        user_id: learner.id,
        term_id: lane.termId,
        status: i === 3 ? "late" : "present",
        recorded_by: admin.id,
      });
    }

    // The report the calculator will work on — automatic, never manual.
    const report = await insert("student_progress_reports", {
      student_id: learner.id,
      student_name: learner.full_name,
      teacher_id: teacher.id,
      school_id: school.id,
      class_id: klass.id,
      course_id: course.id,
      course_name: course.title,
      term_id: lane.termId,
      report_term: term.term_label,
      report_period: term.academic_year,
      curriculum_release_id: release.id,
      academic_offering_id: lane.offering.id,
      offering_period_id: lane.periodId ?? null,
      calculation_mode: "automatic",
      is_published: false,
    });

    const { data: calc, error: calcErr } = await db.rpc("recalculate_academic_result", {
      p_report_id: report.id,
      p_actor_id: admin.id,
    });
    ok("automatic result calculated", !calcErr, calcErr?.message ?? "");
    if (calcErr) continue;

    results[lane.name] = calc;
    console.log(`        score ${calc.overall_score} | applied weight ${calc.applied_weight} | not assessed ${JSON.stringify(calc.not_assessed_components)}`);
    ok(
      "full marks reach 100, not a capped score",
      Number(calc.overall_score) === 100,
      `got ${calc.overall_score}`
    );

    const { data: comps } = await db
      .from("academic_result_components")
      .select("component_key,raw_score,evidence_count,source_summary")
      .eq("progress_report_id", report.id);
    const byKey = Object.fromEntries((comps ?? []).map((c: any) => [c.component_key, c]));
    ok("homework counted as assignments", Number(byKey.assignments?.raw_score) === 100);
    ok("project counted as practical", Number(byKey.practical?.raw_score) === 100);
    ok("examination counted as theory", Number(byKey.theory?.raw_score) === 100);
    ok(
      "late counted as attended",
      Number(byKey.attendance?.raw_score) === 100,
      `attendance ${byKey.attendance?.raw_score}`
    );

    // Certificate: eligibility must be an outcome, never an exception.
    const { data: cert, error: certErr } = await db.rpc("issue_verified_academic_certificate", {
      p_student_id: learner.id,
      p_course_id: course.id,
      p_actor_id: admin.id,
      p_class_id: klass.id,
    });
    ok("certificate check returns instead of raising", !certErr, certErr?.message ?? `status ${cert?.status}`);
    if (cert?.id) made.push({ table: "certificates", id: cert.id });

    // A genuinely failing learner must still be publishable. The score is
    // lowered by lowering the evidence and recalculating, not by overwriting
    // the total, so the result stays consistent with what was recorded.
    await db
      .from("academic_assessment_evidence")
      .update({ raw_score: 12, percentage: 12 })
      .eq("student_id", learner.id);
    const { data: failCalc } = await db.rpc("recalculate_academic_result", {
      p_report_id: report.id,
      p_actor_id: admin.id,
    });
    const { error: pubErr } = await db
      .from("student_progress_reports")
      .update({ is_published: true, academic_qa_status: "ready" })
      .eq("id", report.id);
    ok(
      "failing learner does not block publication",
      !pubErr,
      pubErr?.message ?? `published at ${failCalc?.overall_score}`
    );

    const { data: after } = await db
      .from("student_progress_reports")
      .select("calculation_snapshot")
      .eq("id", report.id)
      .single();
    const outcome = after?.calculation_snapshot?.certificate;
    ok(
      "certificate outcome recorded rather than thrown",
      !!outcome,
      outcome ? `status ${outcome.status}` : "no outcome recorded"
    );
  }

  console.log(`\n=== ${failures === 0 ? "all checks passed" : `${failures} check(s) failed`} ===`);

  if (keep) {
    console.log(`\nLeaving ${made.length} ${TAG} rows in place (--keep).`);
    return;
  }
  await cleanup();
}

/**
 * Accounts go first: a class cannot be removed while an active learner still
 * points at it, and deleting the account takes its profile with it. The rest
 * unwinds newest first so foreign keys are satisfied.
 */
async function cleanup() {
  if (made.length === 0 && authIds.length === 0) return;
  console.log(`
cleaning up ${made.length} rows and ${authIds.length} accounts…`);
  // An active learner must hold a class, so release the link and deactivate
  // before anything is removed, or the class refuses to go.
  for (const id of authIds) {
    await db.from("portal_users").update({ class_id: null, is_active: false }).eq("id", id);
  }
  for (const id of authIds) {
    const { error } = await db.auth.admin.deleteUser(id);
    if (error) console.log(`  could not remove account ${id.slice(0, 8)}: ${error.message}`);
    await db.from("portal_users").delete().eq("id", id);
  }
  for (const { table, id } of [...made].reverse()) {
    if (table === "portal_users") continue; // removed with the account
    const { error } = await db.from(table).delete().eq("id", id);
    if (error) console.log(`  could not remove ${table} ${id.slice(0, 8)}: ${error.message}`);
  }
  console.log("cleanup done.");
}

main()
  .then(() => process.exit(failures === 0 ? 0 : 1))
  .catch(async (e) => {
    console.error("\nharness error:", e.message);
    // Leave nothing behind on a failed run either.
    if (!keep) await cleanup().catch(() => {});
    process.exit(1);
  });
