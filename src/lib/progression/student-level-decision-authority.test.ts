import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(process.cwd());
const route = readFileSync(join(root, "src/app/api/student-level-enrollments/[id]/route.ts"), "utf8");
const migration = readFileSync(join(root, "supabase/migrations/20260929000098_atomic_curriculum_level_decisions.sql"), "utf8");
const auditRoute = readFileSync(join(root, "src/app/api/progression/audit/route.ts"), "utf8");

describe("curriculum-level decision authority", () => {
  it("uses one atomic database transition instead of close-then-insert writes", () => {
    expect(route).toContain("process_student_level_decision");
    expect(route).not.toContain(".from('student_level_enrollments')\n      .update");
    expect(migration).toContain("for update");
    expect(migration).toContain("student_level_decision_audit");
  });

  it("validates teacher scope without locking out reviewed manual decisions", () => {
    expect(migration).toContain("teacher_schools");
    expect(migration).toContain("c.teacher_id = p_actor_id");
    expect(migration).not.toContain("raise exception 'Promotion score");
  });

  it("does not require a next term for complete or withdraw", () => {
    expect(route).toContain("['promote', 'repeat'].includes(decision)");
    expect(migration).toContain("p_decision in ('promote', 'repeat')");
  });

  it("publishes curriculum decisions into the human academic history", () => {
    expect(auditRoute).toContain("student_level_decision_audit");
    expect(auditRoute).toContain("student_name");
    expect(auditRoute).toContain("school_name");
    expect(auditRoute).toContain("course_title");
  });
});
