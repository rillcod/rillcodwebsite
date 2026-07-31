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
