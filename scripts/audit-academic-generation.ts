/**
 * Read-only production audit for the curriculum → class-plan → weekly-content engine.
 * It never writes, repairs, archives or prints customer identifiers.
 *
 *   npm run audit:academic-generation
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { decideGenerationRepairTypes } from "../src/lib/academic/generation-repair";

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
    "id,class_id,course_id,term_id,offering_period_id,status,plan_data,created_at,updated_at"
  );
  const [lessons, assignments, slides, flashcards] = await Promise.all([
    all("lessons", "lesson_plan_id,curriculum_week_number,session_number,metadata"),
    all("assignments", "lesson_plan_id,assignment_type,curriculum_week_number,session_number,metadata"),
    all("lesson_materials", "lesson_plan_id,file_type,curriculum_week_number,session_number,content_stale_at,metadata"),
    all("flashcard_decks", "lesson_plan_id,curriculum_week_number,session_number,content_stale_at,metadata"),
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
