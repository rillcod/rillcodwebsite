import { describe, expect, it } from "vitest";
import {
  isDashboardPathBlockedForRole,
  isDashboardPathBlockedForSchool,
  isDashboardPathBlockedForStudent,
  isDashboardPathBlockedForTeacher,
} from "./route-access";

describe("central workspace route access", () => {
  it("keeps learner-only accounts out of staff academic workspaces", () => {
    expect(
      isDashboardPathBlockedForStudent("/dashboard/learner-progress")
    ).toBe(true);
    expect(isDashboardPathBlockedForStudent("/dashboard/learner-safety")).toBe(
      true
    );
    expect(
      isDashboardPathBlockedForStudent("/dashboard/platform-operations")
    ).toBe(true);
    expect(isDashboardPathBlockedForStudent("/dashboard/academic/build")).toBe(
      true
    );
    expect(isDashboardPathBlockedForStudent("/dashboard/lessons")).toBe(true);
    expect(
      isDashboardPathBlockedForStudent("/dashboard/lessons/abc/edit")
    ).toBe(true);
    expect(isDashboardPathBlockedForStudent("/dashboard/lessons/abc")).toBe(
      false
    );
    expect(isDashboardPathBlockedForStudent("/dashboard/learning")).toBe(false);
    expect(isDashboardPathBlockedForStudent("/dashboard/assignments")).toBe(
      false
    );
    expect(isDashboardPathBlockedForStudent("/dashboard/assignments/new")).toBe(
      true
    );
    expect(isDashboardPathBlockedForStudent("/dashboard/grading")).toBe(true);
    expect(isDashboardPathBlockedForStudent("/dashboard/settings")).toBe(true);
    expect(isDashboardPathBlockedForStudent("/dashboard/leaderboard")).toBe(
      true
    );
    expect(isDashboardPathBlockedForStudent("/dashboard/courses/abc")).toBe(
      true
    );
  });

  it("lets partner schools monitor learner progress but not platform or safety administration", () => {
    expect(isDashboardPathBlockedForSchool("/dashboard/learner-progress")).toBe(
      false
    );
    expect(isDashboardPathBlockedForSchool("/dashboard/learner-safety")).toBe(
      true
    );
    expect(
      isDashboardPathBlockedForSchool("/dashboard/platform-operations")
    ).toBe(true);
  });

  it("lets teachers use academic progress and safety but not platform administration", () => {
    expect(
      isDashboardPathBlockedForTeacher("/dashboard/learner-progress")
    ).toBe(false);
    expect(isDashboardPathBlockedForTeacher("/dashboard/learner-safety")).toBe(
      false
    );
    expect(
      isDashboardPathBlockedForTeacher("/dashboard/platform-operations")
    ).toBe(true);
    expect(isDashboardPathBlockedForTeacher("/dashboard/crm")).toBe(true);
    expect(isDashboardPathBlockedForTeacher("/dashboard/cases")).toBe(true);
    expect(isDashboardPathBlockedForTeacher("/dashboard/records")).toBe(true);
    expect(isDashboardPathBlockedForTeacher("/dashboard/classes")).toBe(false);
  });

  it("keeps the consolidated workspaces available to administrators", () => {
    expect(
      isDashboardPathBlockedForRole("/dashboard/learner-progress", "admin")
    ).toBe(false);
    expect(
      isDashboardPathBlockedForRole("/dashboard/learner-safety", "admin")
    ).toBe(false);
    expect(
      isDashboardPathBlockedForRole("/dashboard/platform-operations", "admin")
    ).toBe(false);
  });

  it("defaults unknown or missing dashboard roles to denied", () => {
    expect(isDashboardPathBlockedForRole("/dashboard", null)).toBe(true);
    expect(isDashboardPathBlockedForRole("/dashboard/classes", undefined)).toBe(true);
    expect(isDashboardPathBlockedForRole("/dashboard", "legacy-super-user")).toBe(true);
    expect(isDashboardPathBlockedForRole("/login", null)).toBe(false);
  });
});
