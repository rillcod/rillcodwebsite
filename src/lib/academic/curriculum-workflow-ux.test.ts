import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const builder = read("src/app/dashboard/academic/build/page.tsx");
const classWorkspace = read("src/components/classes/ClassTeachingWorkspace.tsx");

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
});
