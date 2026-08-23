import { describe, expect, it } from "vitest";
import {
  canSeeAssetLaneChrome,
  navigationStepsForRole,
  navigationStepsInLane,
  stagesInLane,
} from "./lanes";

describe("academic lane navigation", () => {
  it("keeps detailed business states but presents one truthful rollout step", () => {
    expect(stagesInLane("asset").map((stage) => stage.id)).toEqual([
      "author",
      "certify",
      "distribute",
      "time",
    ]);
    expect(navigationStepsInLane("asset")).toMatchObject([
      { step: 1, label: "Build", stageIds: ["author"] },
      { step: 2, label: "Rollout", stageIds: ["certify", "distribute", "time"] },
    ]);
  });

  it("lets a teacher read Build and never offers Rollout", () => {
    expect(navigationStepsForRole("asset", "teacher").map((s) => s.id)).toEqual([
      "build",
    ]);
    expect(canSeeAssetLaneChrome("teacher")).toBe(false);
    expect(canSeeAssetLaneChrome("school")).toBe(false);
    expect(canSeeAssetLaneChrome("admin")).toBe(true);
  });
});
