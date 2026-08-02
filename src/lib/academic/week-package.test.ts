import { describe, expect, it } from "vitest";
import {
  academicWeekNumber,
  indexFirstByWeek,
  weekPackagePrimaryAction,
  weekPackageStatus,
} from "./week-package";

describe("academicWeekNumber", () => {
  it("prefers the canonical curriculum week column", () => {
    expect(
      academicWeekNumber({
        curriculum_week_number: 4,
        metadata: { week: 2 },
      })
    ).toBe(4);
  });

  it("keeps legacy generated content visible through metadata", () => {
    expect(academicWeekNumber({ metadata: { week_number: "7" } })).toBe(7);
  });

  it("rejects invalid week values", () => {
    expect(academicWeekNumber({ curriculum_week_number: 0 })).toBeNull();
    expect(academicWeekNumber({ metadata: { week: "later" } })).toBeNull();
  });
});

describe("indexFirstByWeek", () => {
  it("indexes canonical and legacy rows without replacing the first result", () => {
    const rows = [
      { id: "newest", curriculum_week_number: 2 },
      { id: "older", metadata: { week: 2 } },
      { id: "week-three", metadata: { week_number: 3 } },
    ];
    const index = indexFirstByWeek(rows);
    expect(index.get(2)?.id).toBe("newest");
    expect(index.get(3)?.id).toBe("week-three");
  });
});

describe("weekPackageStatus", () => {
  const partial = {
    lesson: true,
    slides: false,
    flashcards: true,
    assignment: false,
    project: true,
  };

  it("shows exactly what is ready and missing", () => {
    expect(weekPackageStatus(partial)).toMatchObject({
      readyCount: 3,
      totalCount: 5,
      complete: false,
      missing: ["slides", "assignment"],
    });
    expect(weekPackagePrimaryAction(partial)).toBe("prepare");
  });

  it("moves a complete package to review", () => {
    expect(
      weekPackagePrimaryAction({ ...partial, slides: true, assignment: true })
    ).toBe("review");
  });
});
