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
      { step: 1, label: "Write curriculum", stageIds: ["author"] },
      { step: 2, label: "Approve & assign", stageIds: ["certify", "distribute", "time"] },
    ]);
  });

  it("lets a teacher read the curriculum and never offers approval or assignment", () => {
    expect(navigationStepsForRole("asset", "teacher").map((s) => s.id)).toEqual([
      "build",
    ]);
    expect(canSeeAssetLaneChrome("teacher")).toBe(false);
    expect(canSeeAssetLaneChrome("school")).toBe(false);
    expect(canSeeAssetLaneChrome("admin")).toBe(true);
  });
});
