import { describe, expect, it } from "vitest";
import { canonicalPlanCurriculum } from "./official-direction";

describe("canonicalPlanCurriculum", () => {
  it("always prefers the immutable official release", () => {
    expect(
      canonicalPlanCurriculum({
        official_curriculum: { content: { title: "Protected" } },
        curriculum: { content: { title: "Mutable draft" } },
      })
    ).toEqual({ content: { title: "Protected" } });
  });

  it("keeps a legacy draft fallback for historical unpinned plans", () => {
    expect(
      canonicalPlanCurriculum({
        official_curriculum: null,
        curriculum: [{ content: { title: "Legacy" } }],
      })
    ).toEqual({ content: { title: "Legacy" } });
  });
});
