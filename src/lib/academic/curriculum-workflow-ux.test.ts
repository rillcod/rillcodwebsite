import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const builder = read("src/app/dashboard/academic/build/page.tsx");
const classWorkspace = read("src/components/classes/ClassTeachingWorkspace.tsx");
const classPlanList = read("src/app/dashboard/lesson-plans/page.tsx");
const classPlanRoute = read("src/app/api/lesson-plans/route.ts");

describe("curriculum to class-plan workflow UX", () => {
  it("returns staff to the exact saved curriculum location", () => {
    expect(builder).toContain('searchParams.get("year")');
    expect(builder).toContain('searchParams.get("term")');
    expect(builder).toContain('searchParams.get("week")');
    expect(builder).toContain("restoredCurriculumLocation");
    expect(builder).toContain("window.history.replaceState");
    expect(builder).toContain("activeWeek: activeWeek?.week ?? null");
  });

  it("separates a curriculum suggestion from school assessment policy", () => {
    expect(builder).toContain("Flexible — adapt for this class");
    expect(builder).toContain("Required — follow exactly");
    expect(builder).toContain("It does not create another curriculum");
    expect(builder).toContain("change the school&apos;s result pathway");
  });

  it("makes the class plan the home of the complete weekly package", () => {
    for (const item of [
      'label="Lesson"',
      'label="Slides"',
      'label="Practice cards"',
      'label="Assignment"',
      'label="Project"',
    ]) {
      expect(classWorkspace).toContain(item);
    }
    expect(classWorkspace).toContain("Prepare this week");
    expect(classWorkspace).toContain("Share with students?");
  });

  it("presents the legacy lesson-plan list as class planning", () => {
    expect(classPlanList).toContain("Class Plans");
    expect(classPlanList).toContain("New Class Plan");
    expect(classPlanList).toContain(
      "The class plan expands the approved curriculum into weekly teaching packages."
    );
    expect(classPlanList).not.toContain("New Lesson Plan");
  });

  it("creates one plan through the database identity authority", () => {
    expect(classPlanRoute).toContain('"ensure_class_teaching_plan"');
    expect(classPlanRoute).toContain("p_academic_term_id: canonicalTermId");
    expect(classPlanRoute).toContain("p_offering_period_id: canonicalTermId");
    expect(classPlanRoute).toContain("if (!ensuredPlan.created)");
    expect(classPlanRoute).toContain("existing_id: ensuredPlan.plan_id");
  });
});
