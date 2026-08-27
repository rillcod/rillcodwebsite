import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { decideGenerationRepairTypes } from "./generation-repair";

const planEditor = readFileSync(
  join(process.cwd(), "src/app/dashboard/lesson-plans/[id]/page.tsx"),
  "utf8"
);

const row = (extra: Record<string, unknown> = {}) => ({
  curriculum_week_number: 2,
  session_number: 1,
  metadata: {},
  ...extra,
});

describe("smart teaching-package repair", () => {
  it("runs only missing types and keeps completed work", () => {
    const decision = decideGenerationRepairTypes({
      week: 2,
      session: 1,
      requestedTypes: ["lessons", "slides", "flashcards", "assignments", "projects"],
      inventory: {
        lessons: [row()],
        slides: [row()],
        flashcards: [],
        assignments: [row({ assignment_type: "homework" }), row({ assignment_type: "project" })],
      },
    });
    expect(decision.typesToRun).toEqual(["flashcards"]);
    expect(decision.missingAssets).toEqual(["flashcards"]);
  });

  it("rebuilds an empty lesson shell instead of treating the week as done", () => {
    const decision = decideGenerationRepairTypes({
      week: 2,
      session: 1,
      requestedTypes: ["lessons", "slides", "flashcards", "assignments", "projects"],
      inventory: {
        lessons: [row({ description: "", content_layout: [] })],
        slides: [row()],
        flashcards: [row()],
        assignments: [row({ assignment_type: "homework" }), row({ assignment_type: "project" })],
      },
    });
    expect(decision.typesToRun).toEqual(["lessons"]);
    expect(decision.missingAssets).toEqual(["lesson"]);
  });

  it("rebuilds stale derived content but never customized stale content", () => {
    const base = {
      week: 2,
      session: 1,
      requestedTypes: ["slides", "flashcards"],
      inventory: {
        lessons: [row()],
        slides: [row({ content_stale_at: "2026-08-20T00:00:00Z" })],
        flashcards: [
          row({
            content_stale_at: "2026-08-20T00:00:00Z",
            metadata: { is_customized: true },
          }),
        ],
        assignments: [row({ assignment_type: "homework" }), row({ assignment_type: "project" })],
      },
    };
    const decision = decideGenerationRepairTypes(base);
    expect(decision.typesToRun).toEqual(["slides"]);
    expect(decision.staleAssets).toEqual(["slides"]);
  });

  it("does no work when the requested package is already complete", () => {
    const decision = decideGenerationRepairTypes({
      week: 2,
      session: 1,
      inventory: {
        lessons: [row()],
        slides: [row()],
        flashcards: [row()],
        assignments: [row({ assignment_type: "homework" }), row({ assignment_type: "project" })],
      },
    });
    expect(decision.typesToRun).toEqual([]);
  });

  it("keeps meetings separate", () => {
    const decision = decideGenerationRepairTypes({
      week: 2,
      session: 2,
      requestedTypes: ["lessons"],
      inventory: { lessons: [row({ session_number: 1 })] },
    });
    expect(decision.typesToRun).toEqual(["lessons", "slides", "flashcards"]);
  });

  it("guards the database and every tracked entry point against concurrent runs", () => {
    const migration = readFileSync(
      join(
        process.cwd(),
        "supabase/migrations/20260929000103_prevent_duplicate_teaching_generation_runs.sql"
      ),
      "utf8"
    );
    const tracked = readFileSync(
      join(process.cwd(), "src/lib/academic/tracked-week-generation.ts"),
      "utf8"
    );
    expect(migration).toContain("teaching_generation_one_running_per_meeting");
    expect(migration).toContain("where status = 'running'");
    expect(tracked).toContain('error.code === "23505"');
    expect(tracked).toContain("resolveGenerationRepairTypes");
    expect(tracked).toContain("alreadyRunning: true");
  });

  it("routes teacher bulk generation through the tracked per-meeting authority", () => {
    expect(planEditor).toContain("requestTrackedWeekGeneration({");
    expect(planEditor).toContain("types: [type]");
    expect(planEditor).toContain(
      "No duplicate AI run was started."
    );
    expect(planEditor).not.toContain("dry_run: false");
    expect(planEditor).not.toContain(
      "fetch(`/api/lesson-plans/${id}/generate-week`"
    );
  });
});
