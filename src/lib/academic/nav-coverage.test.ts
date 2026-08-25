import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { STAGES, stepsForRole } from "./lanes";

const NAV = readFileSync(
  join(process.cwd(), "src/components/layout/DashboardNavigation.tsx"),
  "utf8"
);

/**
 * The navigation is a consumer of the kernel, so every stage an admin is meant
 * to act on must actually be reachable from it. This caught a real gap: the
 * curriculum authoring page had no admin sidebar link at all.
 */
describe("navigation covers the academic lanes", () => {
  it("links every stage an admin acts on", () => {
    // Strip the query AND the anchor: certify/distribute/timing are sections of the
    // single rollout page, so the nav links the page and the stage deep-links the section.
    const missing = stepsForRole("admin")
      .map((stage) => stage.href.split("?")[0].split("#")[0])
      .filter((href, index, all) => all.indexOf(href) === index)
      .filter((href) => !NAV.includes(`"${href}"`));
    expect(missing).toEqual([]);
  });

  it("never sends a teacher to a governance stage", () => {
    const teacherHrefs = new Set(
      stepsForRole("teacher").map((s) => s.href.split("?")[0])
    );
    for (const id of ["certify", "distribute", "time"] as const) {
      const stage = STAGES.find((s) => s.id === id)!;
      expect(teacherHrefs.has(stage.href)).toBe(false);
    }
  });

  it("keeps Academic Office stepper rows out of the teacher sidebar", () => {
    const start = NAV.indexOf('case "teacher":');
    const end = NAV.indexOf('case "student":');
    const block = NAV.slice(start, end);
    expect(block).not.toContain("/dashboard/academic/rollout");
    expect(block).not.toContain("0 · Overview");
    expect(block).not.toContain("2 · Rollout");
    expect(block).not.toContain("Approve Teaching Plans");
    expect(block).not.toContain("Approve AI Drafts");
    expect(block).toContain('name: "My Classes"');
    expect(block).toContain('name: "Course outline"');
    expect(block).toContain('name: "Approvals"');
    expect(block).not.toContain("/dashboard/crm");
    expect(block).not.toContain("/dashboard/finance");
    expect(block).not.toContain("/dashboard/card-studio");
    expect(block).not.toContain("/dashboard/parent-claims");
    expect(block).not.toContain("/dashboard/cases");
    expect(block).not.toContain('href: "/dashboard/approvals"');
    expect(block).not.toContain("/dashboard/records");
    expect(block).not.toContain("/dashboard/school-reports");
  });

  it("keeps the student sidebar on the daily learner loop", () => {
    const start = NAV.indexOf('case "student":');
    const end = NAV.indexOf('case "school":');
    const block = NAV.slice(start, end);
    expect(block).toContain('name: "Learning Center"');
    expect(block).toContain('name: "Assignments"');
    expect(block).toContain('name: "CBT Exams"');
    expect(block).toContain('name: "Grades"');
    expect(block).toContain('name: "My Report Card"');
    expect(block).not.toContain("/dashboard/academic/build");
    expect(block).not.toContain("/dashboard/grading");
    expect(block).not.toContain("/dashboard/leaderboard");
    expect(block).not.toContain("/dashboard/lessons");
    expect(block).not.toContain('href: "/dashboard/settings"');
    expect(block).not.toContain("/dashboard/activity-hub");
    expect(block).not.toContain("/dashboard/study-groups");
    expect(block).not.toContain("/dashboard/path-progress");
  });

  it("keeps the renamed routes out of the navigation", () => {
    for (const legacy of [
      "/dashboard/academic-spine",
      "/dashboard/academic-direction",
      "/dashboard/curriculum/studio",
      "/dashboard/curriculum",
    ]) {
      expect(NAV.includes(`"${legacy}"`)).toBe(false);
    }
  });
});
