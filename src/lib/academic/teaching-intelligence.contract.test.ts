import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("teaching intelligence stays on existing spines", () => {
  it("records delivery by week and meeting, including period-only plans", () => {
    const migration = read(
      "supabase/migrations/20260929000079_session_aware_teaching_delivery.sql"
    );
    expect(migration).toContain("session_number");
    expect(migration).toContain("offering_period_id");
    expect(migration).toContain("p_session_number");
    expect(migration).toContain(
      "v_plan.term_id is null and v_plan.offering_period_id is null"
    );
  });

  it("keeps generated week uniqueness session-aware", () => {
    const migration = read(
      "supabase/migrations/20260929000080_week_assets_keep_session_identity.sql"
    );
    expect(migration).toContain("uq_lessons_generated_any_writer_plan_week_session");
    expect(migration).toContain("uq_flashcard_decks_generated_plan_week_session");
    expect(migration).toContain("lessons_release_week_session_idx");
  });

  it("releases a week in one database transaction", () => {
    const migration = read(
      "supabase/migrations/20260929000081_release_week_atomically.sql"
    );
    const release = read("src/lib/academic/release-week-content.ts");
    expect(migration).toContain("release_prepared_week_atomic");
    expect(release).toContain("release_prepared_week_atomic");
  });

  it("keeps the class workspace as one teaching surface", () => {
    const workspace = read(
      "src/components/classes/ClassTeachingWorkspace.tsx"
    );
    const route = read(
      "src/app/api/classes/[id]/teaching-workspace/route.ts"
    );
    expect(workspace).toContain("buildTeachingWeekRows");
    expect(workspace).toContain("Generate lesson foundations");
    expect(workspace).toContain("Weekly Teaching Packages");
    expect(route).toContain("parseTeachingTargets");
    expect(route).toContain("p_session_number");
    expect(route).toContain("releasePreparedWeek");
  });
});
