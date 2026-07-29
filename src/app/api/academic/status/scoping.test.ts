import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROUTE = readFileSync(
  join(process.cwd(), "src/app/api/academic/status/route.ts"),
  "utf8"
);

/**
 * The scoping rules live in query builders rather than pure functions, so they
 * cannot be exercised without a database. These assert the route keeps the
 * filters that a review found missing — each one previously let the endpoint
 * overstate readiness or read across a boundary.
 */
describe("status route query scoping", () => {
  it("counts delivered weeks against the plan, not the whole class", () => {
    const block = ROUTE.slice(
      ROUTE.indexOf("curriculum_week_tracking"),
      ROUTE.indexOf("curriculum_week_tracking") + 320
    );
    expect(block).toContain("lesson_plan_id");
    expect(block).not.toMatch(/\.eq\("class_id"/);
  });

  it("scopes assessment evidence to this course and term", () => {
    const block = ROUTE.slice(
      ROUTE.indexOf("academic_assessment_evidence"),
      ROUTE.indexOf("academic_assessment_evidence") + 420
    );
    expect(block).toContain('eq("course_id"');
    expect(block).toContain('eq("academic_term_id"');
  });

  it("reads published results rather than assuming none", () => {
    expect(ROUTE).toContain("student_progress_reports");
    expect(ROUTE).toContain('eq("is_published", true)');
    expect(ROUTE).toContain("resultsPublished: (publishedResults ?? 0) > 0");
    expect(ROUTE).not.toContain("resultsPublished: false");
  });

  it("chooses the adoption governing the class period, not merely the newest", () => {
    expect(ROUTE).toContain("sameSession");
    expect(ROUTE).toContain("effective_term_number <= term.term_number");
  });

  it("limits a teacher to the class they are assigned to", () => {
    const guard = ROUTE.slice(
      ROUTE.indexOf("async function canSeeClass"),
      ROUTE.indexOf("async function canSeeClass") + 900
    );
    expect(guard).toContain('actor.role === "teacher"');
    expect(guard).toContain("klass.teacher_id === actor.id");
    // School-wide fallback would expose another teacher's class.
    expect(guard).not.toContain("getTeacherSchoolIds");
  });

  it("refuses a class-scoped request that fails the access check", () => {
    expect(ROUTE).toContain("canSeeClass(db, actor, classId)");
    expect(ROUTE).toContain("outside your academic scope");
    expect(ROUTE).toContain("status: 403");
  });

  it("draws catalogue coverage from courses, so an unwritten one still appears", () => {
    const overview = ROUTE.slice(ROUTE.indexOf("async function loadOverview"));
    expect(overview).toContain('from("courses")');
    expect(overview).toContain("awaiting_curriculum_count");
    expect(overview).toContain("ready_to_certify");
  });

  it("compares adoptions and directions against what is actually expected", () => {
    expect(ROUTE).toContain("expectedSchools");
    expect(ROUTE).toContain("schoolsMissingAdoption");
    expect(ROUTE).toContain("offeringsMissingDirection");
  });
});
