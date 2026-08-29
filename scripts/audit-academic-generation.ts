/**
 * Read-only production audit for the curriculum → class-plan → weekly-content engine.
 * It never writes, repairs, archives or prints customer identifiers.
 *
 *   npm run audit:academic-generation
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { decideGenerationRepairTypes } from "../src/lib/academic/generation-repair";
import { parseAutoGenerateSettings } from "../src/lib/academic/auto-generate-settings";
import { expandPlanWeeksForMeetings } from "../src/lib/academic/school-programme-standing";
import { buildTeachingWeekRows } from "../src/lib/academic/teaching-workspace";

config({ path: ".env.local" });
config({ path: ".env" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required."
  );
}
const db = createClient(url, key, { auth: { persistSession: false } }) as any;

async function all(table: string, select: string): Promise<any[]> {
  const rows: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from(table)
      .select(select)
      .range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data ?? []));
    if ((data ?? []).length < 1000) return rows;
  }
}

function countBy(rows: any[], field: string): Record<string, number> {
  return rows.reduce((out, row) => {
    const key = String(row?.[field] ?? "unset");
    out[key] = (out[key] ?? 0) + 1;
    return out;
  }, {} as Record<string, number>);
}

async function main() {
  const plans = await all(
    "lesson_plans",
    "id,class_id,course_id,term_id,offering_period_id,status,plan_data,metadata,sessions_per_week,created_at,updated_at"
  );
  const [lessons, assignments, slides, flashcards, deliveries] = await Promise.all([
    all("lessons", "lesson_plan_id,curriculum_week_number,session_number,status,metadata"),
    all("assignments", "lesson_plan_id,assignment_type,curriculum_week_number,session_number,is_active,metadata"),
    all("lesson_materials", "lesson_plan_id,file_type,curriculum_week_number,session_number,is_public,content_stale_at,metadata"),
    all("flashcard_decks", "lesson_plan_id,curriculum_week_number,session_number,is_public,content_stale_at,metadata"),
    all("class_lesson_delivery", "lesson_plan_id,week_number,session_number,status"),
  ]);
  const contentPlanIds = new Set(
    [...lessons, ...assignments, ...slides, ...flashcards]
      .map((row) => row.lesson_plan_id ?? row.metadata?.lesson_plan_id)
      .filter(Boolean)
  );
  const active = plans.filter((plan) => plan.status !== "archived");
  const identities = new Map<string, number>();
  for (const plan of active) {
    if (!plan.class_id || !plan.course_id) continue;
    const period = plan.term_id
      ? `term:${plan.term_id}`
      : `period:${plan.offering_period_id ?? "none"}`;
    const identity = `${plan.class_id}:${plan.course_id}:${period}`;
    identities.set(identity, (identities.get(identity) ?? 0) + 1);
  }
  const duplicateActiveIdentities = [...identities.values()].filter(
    (count) => count > 1
  );
  const activeDrafts = active.filter((plan) => plan.status === "draft");
  const emptyDrafts = activeDrafts.filter(
    (plan) =>
      (!Array.isArray(plan.plan_data?.weeks) || plan.plan_data.weeks.length === 0) &&
      !contentPlanIds.has(plan.id)
  );
  const oldEmptyDrafts = emptyDrafts.filter((plan) => {
    const changed = Date.parse(plan.updated_at ?? plan.created_at ?? "");
    return Number.isFinite(changed) && Date.now() - changed > 30 * 86_400_000;
  });

  let runs: any[] = [];
  let runsAvailable = true;
  try {
    runs = await all(
      "teaching_generation_runs",
      "lesson_plan_id,curriculum_week_number,session_number,status,requested_types,failed_types,generated_count,skipped_count,started_at,completed_at"
    );
  } catch (error) {
    runsAvailable = false;
    console.warn(
      `Generation history unavailable: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  const runningKeys = new Map<string, number>();
  for (const run of runs.filter((row) => row.status === "running")) {
    const identity = `${run.lesson_plan_id}:${run.curriculum_week_number}:${run.session_number}`;
    runningKeys.set(identity, (runningKeys.get(identity) ?? 0) + 1);
  }
  const rowsByPlan = (rows: any[]) => {
    const index = new Map<string, any[]>();
    for (const row of rows) {
      const planId = row.lesson_plan_id ?? row.metadata?.lesson_plan_id;
      if (!planId) continue;
      const values = index.get(String(planId)) ?? [];
      values.push(row);
      index.set(String(planId), values);
    }
    return index;
  };
  const lessonRows = rowsByPlan(lessons);
  const slideRows = rowsByPlan(
    slides.filter((row) => row.file_type === "slide-deck")
  );
  const flashcardRows = rowsByPlan(flashcards);
  const assignmentRows = rowsByPlan(assignments);
  const deliveryRows = rowsByPlan(deliveries);

  // A generation run proves an attempt; the teacher and learner experience is
  // proven by the durable package inventory, visibility and delivery rows.
  let plannedMeetings = 0;
  let meetingsWithContent = 0;
  let completeMeetings = 0;
  let fullyVisibleMeetings = 0;
  let partlyVisibleMeetings = 0;
  let heldCompleteMeetings = 0;
  let taughtMeetings = 0;
  const activePlanIds = new Set(active.map((plan) => String(plan.id)));
  for (const plan of active) {
    const planWeeks = expandPlanWeeksForMeetings(
      Array.isArray(plan.plan_data?.weeks) ? plan.plan_data.weeks : [],
      Number(plan.sessions_per_week) || 1,
    );
    const planAssignments = assignmentRows.get(String(plan.id)) ?? [];
    const rows = buildTeachingWeekRows({
      planWeeks,
      lessons: lessonRows.get(String(plan.id)) ?? [],
      assignments: planAssignments.filter(
        (row) => String(row.assignment_type ?? "").toLowerCase() !== "project",
      ),
      projects: planAssignments.filter(
        (row) => String(row.assignment_type ?? "").toLowerCase() === "project",
      ),
      slideDecks: slideRows.get(String(plan.id)) ?? [],
      flashcardDecks: flashcardRows.get(String(plan.id)) ?? [],
      deliveries: deliveryRows.get(String(plan.id)) ?? [],
    });
    plannedMeetings += rows.length;
    for (const row of rows) {
      if (row.packageStatus.readyCount > 0) meetingsWithContent += 1;
      if (row.packageStatus.complete) completeMeetings += 1;
      if (row.visibilitySummary.fullyLive) fullyVisibleMeetings += 1;
      if (
        row.visibilitySummary.liveCount > 0 &&
        !row.visibilitySummary.fullyLive
      ) {
        partlyVisibleMeetings += 1;
      }
      if (row.packageStatus.complete && row.visibilitySummary.needsRelease) {
        heldCompleteMeetings += 1;
      }
      if (row.taught) taughtMeetings += 1;
    }
  }

  const activeAssets = {
    lessons: lessons.filter((row) => activePlanIds.has(String(row.lesson_plan_id))),
    assignments: assignments.filter(
      (row) =>
        activePlanIds.has(String(row.lesson_plan_id)) &&
        String(row.assignment_type ?? "").toLowerCase() !== "project",
    ),
    projects: assignments.filter(
      (row) =>
        activePlanIds.has(String(row.lesson_plan_id)) &&
        String(row.assignment_type ?? "").toLowerCase() === "project",
    ),
    slides: slides.filter(
      (row) =>
        activePlanIds.has(String(row.lesson_plan_id)) &&
        row.file_type === "slide-deck",
    ),
    flashcards: flashcards.filter((row) =>
      activePlanIds.has(String(row.lesson_plan_id)),
    ),
  };
  const visibleAssets = {
    lessons: activeAssets.lessons.filter((row) =>
      ["active", "published", "scheduled"].includes(String(row.status)),
    ).length,
    assignments: activeAssets.assignments.filter((row) => row.is_active === true).length,
    projects: activeAssets.projects.filter((row) => row.is_active === true).length,
    slides: activeAssets.slides.filter((row) => row.is_public === true).length,
    flashcards: activeAssets.flashcards.filter((row) => row.is_public === true).length,
  };
  const autoGeneration = active.map((plan) =>
    parseAutoGenerateSettings(plan.metadata?.auto_generate_settings),
  );
  const latestByMeeting = new Map<string, any>();
  for (const run of runs) {
    const identity = `${run.lesson_plan_id}:${run.curriculum_week_number}:${run.session_number}`;
    const current = latestByMeeting.get(identity);
    if (
      !current ||
      Date.parse(run.started_at ?? "") > Date.parse(current.started_at ?? "")
    ) {
      latestByMeeting.set(identity, run);
    }
  }
  let currentIncompleteMeetings = 0;
  let historicalPartialNowComplete = 0;
  const missingByType: Record<string, number> = {};
  const inspectRun = (run: any) =>
    decideGenerationRepairTypes({
      requestedTypes:
        Array.isArray(run.failed_types) && run.failed_types.length > 0
          ? run.failed_types
          : run.requested_types,
      week: Number(run.curriculum_week_number) || 1,
      session: Number(run.session_number) || 1,
      inventory: {
        lessons: lessonRows.get(String(run.lesson_plan_id)) ?? [],
        slides: slideRows.get(String(run.lesson_plan_id)) ?? [],
        flashcards: flashcardRows.get(String(run.lesson_plan_id)) ?? [],
        assignments: assignmentRows.get(String(run.lesson_plan_id)) ?? [],
      },
    });
  for (const run of latestByMeeting.values()) {
    const decision = inspectRun(run);
    if (decision.typesToRun.length === 0) continue;
    currentIncompleteMeetings += 1;
    for (const type of decision.typesToRun) {
      missingByType[type] = (missingByType[type] ?? 0) + 1;
    }
  }
  for (const run of runs.filter((row) => row.status === "partial")) {
    if (inspectRun(run).typesToRun.length === 0) historicalPartialNowComplete += 1;
  }

  console.log("\nAcademic generation audit (read-only)");
  console.log(`Lesson plans: ${plans.length}`);
  console.log(`Active plans: ${active.length}`);
  console.log(`Active class-linked plans: ${active.filter((plan) => plan.class_id).length}`);
  console.log(`Active standalone plans: ${active.filter((plan) => !plan.class_id).length}`);
  console.log(`Plan status: ${JSON.stringify(countBy(plans, "status"))}`);
  console.log(`Empty active drafts: ${emptyDrafts.length}`);
  console.log(`Empty active drafts older than 30 days: ${oldEmptyDrafts.length}`);
  console.log(
    `Duplicate active class/course/period identities: ${duplicateActiveIdentities.length}`
  );
  console.log(
    `Largest duplicate identity: ${Math.max(1, ...duplicateActiveIdentities)}`
  );
  console.log(
    `Automatic generation enabled: ${autoGeneration.filter((row) => row.enabled).length}/${active.length}`
  );
  console.log(
    `Automatic learner release enabled: ${autoGeneration.filter((row) => row.auto_publish).length}/${active.length}`
  );
  console.log(`Planned teaching sessions (future included): ${plannedMeetings}`);
  console.log(`Teaching sessions with any prepared content: ${meetingsWithContent}`);
  console.log(`Teaching sessions with complete five-item packages: ${completeMeetings}`);
  console.log(`Complete packages held for teacher review: ${heldCompleteMeetings}`);
  console.log(`Complete packages visible to learners: ${fullyVisibleMeetings}`);
  console.log(`Partly visible packages requiring cleanup: ${partlyVisibleMeetings}`);
  console.log(`Teaching sessions recorded as taught: ${taughtMeetings}`);
  console.log(
    `Prepared assets on active plans: ${JSON.stringify({
      lessons: activeAssets.lessons.length,
      slides: activeAssets.slides.length,
      flashcards: activeAssets.flashcards.length,
      assignments: activeAssets.assignments.length,
      projects: activeAssets.projects.length,
    })}`
  );
  console.log(`Learner-visible assets on active plans: ${JSON.stringify(visibleAssets)}`);
  console.log(`Generation history available: ${runsAvailable ? "yes" : "no"}`);
  if (runsAvailable) {
    console.log(`Generation runs: ${runs.length}`);
    console.log(`Run status: ${JSON.stringify(countBy(runs, "status"))}`);
    console.log(
      `Meetings with more than one running generator: ${[
        ...runningKeys.values(),
      ].filter((count) => count > 1).length}`
    );
    console.log(`Current tracked meetings missing requested content: ${currentIncompleteMeetings}`);
    console.log(`Missing requested content by type: ${JSON.stringify(missingByType)}`);
    console.log(`Historical partial runs now complete: ${historicalPartialNowComplete}`);
  }
  console.log("");

  if (duplicateActiveIdentities.length > 0) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
