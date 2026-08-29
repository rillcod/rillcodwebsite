import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const builder = read("src/app/dashboard/academic/build/page.tsx");
const classWorkspace = read("src/components/classes/ClassTeachingWorkspace.tsx");
const classPlanList = read("src/app/dashboard/lesson-plans/page.tsx");
const classPlanRoute = read("src/app/api/lesson-plans/route.ts");
const rollout = read("src/app/dashboard/academic/rollout/page.tsx");
const planSyncRoute = read("src/app/api/admin/academics/sync-plans/route.ts");
const learnerWorkspace = read("src/app/dashboard/learning/page.tsx");

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
    expect(classWorkspace).toContain("Let assistant fill");
    expect(classWorkspace).toContain("Share this complete package?");
    expect(classWorkspace).toContain("View full teaching order");
    expect(classWorkspace).toContain("Ready for review");
    expect(classWorkspace).toContain("<ConfirmModal");
    expect(classWorkspace).not.toContain("nextActionInView");
    expect(classWorkspace).toContain("learning items still needed");
    expect(classWorkspace).toContain("Ready for class");
    expect(classWorkspace).not.toContain("IntersectionObserver");
    expect(classWorkspace).not.toContain("var(--app-bottom-nav-height)");
    expect(classWorkspace).toContain("Next teacher action");
    expect(classWorkspace).not.toContain("From approved curriculum to the classroom");
    expect(classWorkspace).not.toContain("Curriculum → sessions");
    expect(classWorkspace).toContain("will become visible together");
  });

  it("shows learners the same connected package after the teacher shares it", () => {
    expect(learnerWorkspace).toContain("Your Week ${thisWeekNumber} class package");
    expect(learnerWorkspace).toContain("lesson, slides, practice cards, assignment and project stay connected");
    expect(learnerWorkspace).toContain("Open complete package");
    expect(learnerWorkspace).toContain("Earlier shared weeks");
    expect(learnerWorkspace).not.toContain("ðŸ");
    expect(learnerWorkspace).not.toContain("â€”");
  });

  it("presents the legacy lesson-plan list as class planning", () => {
    expect(classPlanList).toContain("Class plans");
    expect(classPlanList).toContain("Start class plan");
    expect(classPlanList).toContain(
      "One plan connects an approved curriculum to one class, course and teaching period."
    );
    expect(classPlanList).not.toContain("New Lesson Plan");
    expect(classPlanList).toContain("buildClassTeachingHref");
    expect(classPlanList).toContain("Open my classes");
    expect(classPlanList).toContain("This class already has one plan. Opening it now.");
    expect(classPlanRoute).toContain("expandPlanWeeksForMeetings");
  });

  it("creates one plan through the database identity authority", () => {
    expect(classPlanRoute).toContain('"ensure_class_teaching_plan"');
    expect(classPlanRoute).toContain("p_academic_term_id: canonicalTermId");
    expect(classPlanRoute).toContain("p_offering_period_id: canonicalTermId");
    expect(classPlanRoute).toContain("if (!ensuredPlan.created)");
    expect(classPlanRoute).toContain("existing_id: ensuredPlan.plan_id");
  });

  it("gives each school an honest future-edition choice", () => {
    expect(rollout).toContain('role="switch"');
    expect(rollout).toContain('Future editions update automatically');
    expect(rollout).toContain('Future editions need approval');
    expect(rollout).toContain('Existing plans, lessons, submissions and scores never change here.');
    expect(planSyncRoute).not.toContain('force_refresh');
  });
});
