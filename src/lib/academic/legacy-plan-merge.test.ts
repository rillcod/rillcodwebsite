import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("historical class-plan merge", () => {
  it("uses one transactional adoption function and preserves learner evidence", () => {
    const migration = read(
      "supabase/migrations/20260929000127_adopt_legacy_plan_into_class.sql",
    );
    expect(migration).toContain("adopt_legacy_lesson_plan_into_class");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("TARGET_CLASS_PLAN_EXISTS");
    expect(migration).toContain("LEGACY_PLAN_HAS_LEARNER_EVIDENCE");
    expect(migration).toContain("assignment_submissions");
    expect(migration).toContain("exam_attempts");
    expect(migration).toContain("cbt_sessions");
    expect(migration).toContain("lesson_progress");
    expect(migration).toContain("status = 'draft'");
    expect(migration).not.toMatch(/delete\s+from\s+public\.(assignment_submissions|exam_attempts|cbt_sessions)/i);
  });

  it("exposes a single guarded API instead of the old silent class PATCH", () => {
    const route = read("src/app/api/lesson-plans/[id]/adopt-class/route.ts");
    const detail = read("src/app/dashboard/lesson-plans/[id]/page.tsx");
    expect(route).toContain('"adopt_legacy_lesson_plan_into_class"');
    expect(route).toContain("TARGET_CLASS_PLAN_EXISTS");
    expect(route).toContain("LEGACY_PLAN_HAS_LEARNER_EVIDENCE");
    expect(detail).toContain("adoptHistoricalPlan");
    expect(detail).toContain("/adopt-class");
    expect(detail).not.toMatch(
      /fetch\(`\/api\/lesson-plans\/\$\{id\}`[\s\S]{0,240}class_id/,
    );
    expect(detail).not.toContain("assignClass");
    expect(detail).not.toContain("cloneToClass");
    expect(detail).not.toContain("classPickerOpen");
    expect(detail).not.toContain("Copy to class");
    expect(detail).not.toContain("Assign to class");
    expect(detail).not.toContain('activeTab === "release"');
    expect(read("src/app/api/lesson-plans/[id]/route.ts")).toContain(
      "USE_ADOPT_CLASS_ENDPOINT",
    );
  });

  it("makes historical plans explicit in the overview", () => {
    const list = read("src/app/dashboard/lesson-plans/page.tsx");
    expect(list).toContain("Historical plan · needs a class");
    expect(list).toContain("Review & move to class →");
    expect(list).toContain("One plan connects an approved curriculum to one class, course and teaching period.");
  });
});
