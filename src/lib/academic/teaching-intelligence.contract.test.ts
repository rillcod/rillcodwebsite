import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

const types = read("src/types/supabase.ts");
const deliveryMigration = read(
  "supabase/migrations/20260929000079_session_aware_teaching_delivery.sql"
);
const uniquenessMigration = read(
  "supabase/migrations/20260929000080_week_assets_keep_session_identity.sql"
);
const releaseMigration = read(
  "supabase/migrations/20260929000081_release_week_atomically.sql"
);
const releaseOneMeetingMigration = read(
  "supabase/migrations/20260929000082_release_one_meeting.sql"
);
const completePackageReleaseMigration = read(
  "supabase/migrations/20260929000088_release_complete_teaching_package.sql"
);
const guardedPackageReleaseMigration = read(
  "supabase/migrations/20260929000125_require_complete_teaching_package_release.sql"
);
const planActivationMigration = read(
  "supabase/migrations/20260929000126_activate_executable_automated_class_plans.sql"
);

describe("generated types match the teaching schema", () => {
  it("delivery rows carry a meeting and may sit on a period instead of a term", () => {
    const table = types.slice(
      types.indexOf("class_lesson_delivery: {"),
      types.indexOf("class_sessions: {")
    );
    expect(table).toContain("session_number: number");
    expect(table).toContain("offering_period_id: string | null");
    expect(table).toContain("academic_term_id: string | null");
  });

  it("week-package tables persist the meeting number", () => {
    for (const table of [
      "lessons: {",
      "assignments: {",
      "flashcard_decks: {",
      "lesson_materials: {",
    ]) {
      const start = types.indexOf(table);
      expect(start, table).toBeGreaterThan(-1);
      expect(types.slice(start, start + 1800)).toContain("session_number: number");
    }
  });

  it("RPCs use the new signatures, not the week-only originals", () => {
    expect(types).toContain("release_prepared_week_atomic");
    expect(types).toContain("p_session_number: number");
    const releaseRpc = types.slice(
      types.indexOf("release_prepared_week_atomic: {"),
      types.indexOf("replace_live_partnership_documents")
    );
    expect(releaseRpc).toContain("p_session_number: number");
    expect(releaseRpc).not.toContain("p_session_number?: number");
    const rpc = types.slice(
      types.indexOf("record_class_lesson_delivery: {"),
      types.indexOf("refresh_accountability_cache")
    );
    expect(rpc).toContain("p_session_number?: number");
    expect(rpc).toContain("p_week_number: number");
  });
});

describe("old week-only schema is retired", () => {
  it("drops the term-locked delivery uniqueness and seven-argument RPC", () => {
    expect(deliveryMigration).toContain(
      "drop constraint if exists class_lesson_delivery_lesson_plan_id_week_number_lesson_id_key"
    );
    expect(deliveryMigration).toContain(
      "drop index if exists public.class_lesson_delivery_week_placeholder_unique"
    );
    expect(deliveryMigration).toContain(
      "drop function if exists public.record_class_lesson_delivery("
    );
    expect(deliveryMigration).toContain(
      "uuid, integer, uuid, text, uuid, text, uuid"
    );
    expect(deliveryMigration).toContain("class_lesson_delivery_week_session_unique");
    expect(deliveryMigration).toContain(
      "alter column academic_term_id drop not null"
    );
  });

  it("replaces plan-week uniqueness with plan-week-session uniqueness", () => {
    expect(uniquenessMigration).toContain(
      "drop index if exists public.uq_lessons_generated_any_writer_plan_week"
    );
    expect(uniquenessMigration).toContain(
      "drop index if exists public.uq_assignments_generated_plan_week_type"
    );
    expect(uniquenessMigration).toContain(
      "drop index if exists public.uq_flashcard_decks_generated_plan_week"
    );
    expect(uniquenessMigration).toContain(
      "uq_lessons_generated_any_writer_plan_week_session"
    );
    expect(uniquenessMigration).toContain(
      "uq_flashcard_decks_generated_plan_week_session"
    );
  });

  it("releases one named class meeting, never the whole calendar week", () => {
    expect(releaseMigration).toContain("release_prepared_week_atomic");
    expect(releaseOneMeetingMigration).toContain(
      "and session_number = p_session_number"
    );
    expect(releaseOneMeetingMigration).not.toContain(
      "p_session_number is null"
    );
    expect(read("src/lib/academic/release-week-content.ts")).toContain(
      "release_prepared_week_atomic"
    );
    expect(read("src/lib/academic/release-week-content.ts")).toContain(
      "p_session_number: canonicalMeetingSession(session)"
    );
  });

  it("releases slides in the same transaction as the rest of the package", () => {
    expect(completePackageReleaseMigration).toContain(
      "update public.lesson_materials"
    );
    expect(completePackageReleaseMigration).toContain(
      "'slides_released', v_slides"
    );
    expect(completePackageReleaseMigration).toContain(
      "and session_number = p_session_number"
    );
    expect(completePackageReleaseMigration).toContain(
      "Lessons, slides, assignments, projects and flashcards"
    );
  });

  it("refuses partial package release and repairs old partial visibility", () => {
    expect(guardedPackageReleaseMigration).toContain(
      "Complete this teaching package before sharing it"
    );
    expect(guardedPackageReleaseMigration).toContain(
      "partial_teaching_package_slots"
    );
    expect(guardedPackageReleaseMigration).toContain(
      "and not (lesson_live and slides_live and cards_live and assignment_live and project_live)"
    );
    expect(guardedPackageReleaseMigration).not.toContain(
      "assignment_submissions"
    );
  });

  it("activates old executable plans without publishing learner content", () => {
    expect(planActivationMigration).toContain("update public.lesson_plans");
    expect(planActivationMigration).toContain("status = 'published'");
    expect(planActivationMigration).toContain("auto_generate_settings,enabled");
    expect(planActivationMigration).not.toContain("update public.lessons");
    expect(planActivationMigration).not.toContain("update public.assignments");
  });

  it("week prep confirms saved work through the class workspace, by meeting", () => {
    const generator = read("src/components/ai/WeekAIGenerator.tsx");
    const workspaceRoute = read(
      "src/app/api/classes/[id]/teaching-workspace/route.ts"
    );
    expect(generator).toContain("preparedWeekPackageFromWorkspace");
    expect(generator).toContain("teaching-workspace");
    expect(workspaceRoute).toContain("is_public");
    expect(read("src/lib/academic/prepared-week-package.ts")).toContain(
      "weekSessionLookupKey"
    );
    expect(read("src/lib/academic/generation-repair.ts")).toContain(
      "assetMatchesMeeting"
    );
    expect(read("src/lib/academic/generation-repair.ts")).toContain(
      "keepPreparedMeetingContent"
    );
    expect(read("src/lib/academic/week-package.ts")).toContain(
      "export function assetMatchesMeeting"
    );
    expect(read("src/lib/academic/week-package.ts")).toContain(
      "export function keepPreparedMeetingContent"
    );
    expect(read("src/lib/academic/generation-ops.ts")).toContain(
      "export function sweepMeetingCap"
    );
    expect(read("src/lib/academic/generation-ops.ts")).toContain(
      "export function planMeetingsForSweep"
    );
    expect(read("src/lib/academic/generation-ops.ts")).toContain(
      "export function orderPlansForSweep"
    );
    expect(read("src/app/api/cron/auto-generate-content/route.ts")).toContain(
      "decideSweepTargets"
    );
    expect(read("src/app/api/cron/auto-generate-content/route.ts")).toContain(
      "planMeetingsForSweep"
    );
    expect(read("src/app/api/cron/auto-generate-content/route.ts")).toContain(
      "writtenThisRun"
    );
    expect(read("src/app/api/cron/auto-generate-content/route.ts")).toContain(
      "ensureGenerationPlanReady"
    );
    expect(read("src/app/api/cron/auto-generate-content/route.ts")).toContain(
      ".in('status', ['draft', 'published'])"
    );
    expect(read("src/app/api/lesson-plans/[id]/generate-week/route.ts")).toContain(
      "ensureGenerationPlanReady"
    );
    expect(read("src/lib/academic/bootstrap-class-week.ts")).toContain(
      "ensureGenerationPlanReady"
    );
    expect(read("src/lib/academic/pending-approval.ts")).toContain(
      "meetingsInWeek"
    );
    expect(read("src/lib/academic/pending-approval.ts")).toContain(
      "weekReadyReviewPath"
    );
    expect(read("src/app/dashboard/teaching/approvals/page.tsx")).toContain(
      "approval-"
    );
    expect(read("src/components/lesson-plans/ThisWeekPanel.tsx")).toContain(
      "teachingMeetingLabel"
    );
  });
});

describe("generators and workspace stay on that schema", () => {
  it("every week generator writes session_number", () => {
    const generators = [
      "src/app/api/lesson-plans/[id]/generate-lessons/route.ts",
      "src/app/api/lesson-plans/[id]/generate-slides/route.ts",
      "src/app/api/lesson-plans/[id]/generate-flashcards/route.ts",
      "src/app/api/lesson-plans/[id]/generate-assignments/route.ts",
      "src/app/api/lesson-plans/[id]/generate-projects/route.ts",
    ];
    for (const path of generators) {
      expect(read(path), path).toContain("session_number");
      expect(read(path), path).toContain("reuseWeekContent");
      expect(read(path), path).toContain("keepPreparedMeetingContent");
    }
    expect(
      read("src/app/api/lesson-plans/[id]/generate-lessons/route.ts"),
    ).toContain("generatedLessonIsUsable");
    expect(
      read("src/app/api/lesson-plans/[id]/generate-lessons/route.ts"),
    ).toContain("extractTeachingPlanWeeks");
    expect(
      read("src/app/api/lesson-plans/[id]/generate-lessons/route.ts"),
    ).toContain("titlesAlreadyTaughtThisWeek");
    for (const path of [
      "src/app/api/lesson-plans/[id]/generate-lessons/route.ts",
      "src/app/api/lesson-plans/[id]/generate-assignments/route.ts",
      "src/app/api/lesson-plans/[id]/generate-projects/route.ts",
    ]) {
      expect(read(path), path).toContain("weekAlreadyGeneratedStatus");
      expect(read(path), path).toContain("weekCopiedFromClassStatus");
      expect(read(path), path).toContain("extractTeachingPlanWeeks");
    }
  });

  it("flashcards use the shared AI policy, not a side-door model call", () => {
    const flashcards = read(
      "src/app/api/lesson-plans/[id]/generate-flashcards/route.ts"
    );
    expect(flashcards).toContain('generateAIContent');
    expect(flashcards).not.toContain("geminiGenerateText");
  });

  it("the class workspace still owns the week list and session-aware actions", () => {
    const workspace = read("src/components/classes/ClassTeachingWorkspace.tsx");
    const route = read("src/app/api/classes/[id]/teaching-workspace/route.ts");
    const identity = read("src/lib/academic/session-identity.ts");
    const coverage = read("src/lib/academic/class-coverage.ts");
    const parser = read("src/lib/academic/teaching-workspace.ts");
    expect(workspace).toContain("WEEK_CONTENT_ORIGIN_LABEL");
    expect(workspace).toContain("generated here, copied from");
    expect(parser).toContain("export function weekContentOrigin");
    expect(workspace).toContain("Teaching sessions");
    expect(workspace).toContain("Prepare · review · share here");
    expect(workspace).toContain("Let assistant fill ${resumeWeek.packageStatus.missing.length} missing item");
    expect(workspace).toContain("completed items are kept and will not be generated again");
    expect(workspace).toContain("types: WEEK_CONTENT_TYPES");
    expect(workspace).toContain("teachingMeetingLabel");
    expect(workspace).toContain("Take attendance");
    expect(workspace).toContain("buildAttendanceHref");
    expect(workspace).toContain("pickTimetableSessionForMeeting");
    expect(workspace).toContain("class_session_id");
    expect(workspace).not.toContain("curriculum_week_tracking");
    expect(workspace).not.toContain("week_numbers");
    expect(route).toContain("parseTeachingTargets");
    expect(route).toContain("p_session_number");
    expect(route).toContain("releasePreparedWeek");
    expect(route).toContain("timetable_sessions");
    expect(route).toContain("programme_policy");
    expect(route).toContain("teaching_generation_runs");
    expect(route).toContain("preparation_status");
    // Customization belongs to lessons/assignments metadata. Selecting a
    // top-level customized_at column makes Supabase reject the whole workspace.
    expect(route).not.toContain(",customized_at");
    expect(route).not.toContain("curriculum_week_tracking");
    expect(parser).not.toContain("week_numbers");
    expect(identity).toContain("online timetable");
    expect(coverage).not.toContain("curriculum_week_tracking");
  });

  it("completed live classes record delivery through the same RPC", () => {
    const live = read("src/app/api/live-sessions/[id]/route.ts");
    expect(live).toContain("recordCompletedLiveTeaching");
  });

  it("records the database guard against duplicate weekly packages", () => {
    const cleanup = read(
      "supabase/migrations/20260929000089_consolidate_weekly_teaching_packages.sql"
    );
    expect(cleanup).toContain("_lesson_duplicate_map");
    expect(cleanup).toContain("lessons_plan_week_session_unique");
    expect(cleanup).toContain("lesson_materials_plan_week_session_slides_unique");
    expect(cleanup).toContain("flashcard_decks_plan_week_session_unique");
    expect(cleanup).toContain("assignments_plan_week_session_type_unique");
    expect(cleanup).toContain("update public.lesson_progress");
    expect(cleanup).not.toContain("delete from public.lesson_progress");
    expect(cleanup).not.toContain("delete from public.assignment_submissions");
    expect(cleanup).not.toContain("delete from public.cbt_sessions");
  });
});
