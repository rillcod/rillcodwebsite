import { describe, expect, it } from "vitest";
import { navigationStepsInLane, stagesInLane } from "./lanes";

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
});
