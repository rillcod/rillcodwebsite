import { describe, expect, it } from "vitest";
import {
  assetStatus,
  deliveryStatus,
  diagnoseDirection,
  nextAction,
  type AssetFacts,
  type DirectionFacts,
} from "./status";
import { findStage, stepsForRole, stagesInLane, STAGES } from "./lanes";

const RELEASE = {
  id: "release-1",
  title: "Generative Art · 2026/2027 · Basic 1",
  release_number: 1,
  academic_session: "2026/2027",
  effective_term_number: 1,
};

function directionFacts(overrides: Partial<DirectionFacts> = {}): DirectionFacts {
  return {
    enrollmentType: "school",
    pinnedReleaseId: null,
    publishedRelease: RELEASE,
    offeringDirection: null,
    adoption: {
      release_id: "release-1",
      academic_session: "2026/2027",
      effective_term_number: 1,
    },
    classSession: "2026/2027",
    classTermNumber: 1,
    ...overrides,
  };
}

describe("diagnoseDirection", () => {
  it("resolves a regular school class from its adoption", () => {
    expect(diagnoseDirection(directionFacts())).toEqual({
      resolved: true,
      releaseId: "release-1",
    });
  });

  it("keeps an already pinned edition regardless of later assignment changes", () => {
    const result = diagnoseDirection(
      directionFacts({ pinnedReleaseId: "pinned-9", adoption: null, publishedRelease: null })
    );
    expect(result).toEqual({ resolved: true, releaseId: "pinned-9" });
  });

  // The three plans stuck in the live repair queue, reproduced exactly.

  it("names an uncertified course as the blocker (stuck plans 1 and 2)", () => {
    const result = diagnoseDirection(
      directionFacts({ publishedRelease: null, adoption: null })
    );
    expect(result.resolved).toBe(false);
    if (result.resolved) return;
    expect(result.reason).toBe("not_certified");
    expect(result.actionHref).toBe("/dashboard/academic/rollout");
  });

  it("never lets a special pathway borrow the school's adoption (stuck plan 3)", () => {
    const result = diagnoseDirection(
      directionFacts({
        enrollmentType: "special",
        offeringDirection: null,
        // The school genuinely has an active adoption for this same course.
        adoption: {
          release_id: "release-1",
          academic_session: "2026/2027",
          effective_term_number: 1,
        },
      })
    );
    expect(result.resolved).toBe(false);
    if (result.resolved) return;
    expect(result.reason).toBe("pathway_needs_own_edition");
  });

  it("catches the session mismatch behind the third stuck plan", () => {
    const result = diagnoseDirection(
      directionFacts({ classSession: "2025/2026", classTermNumber: 1 })
    );
    expect(result.resolved).toBe(false);
    if (result.resolved) return;
    expect(result.reason).toBe("session_mismatch");
    expect(result.detail).toContain("2025/2026");
    expect(result.detail).toContain("2026/2027");
  });

  it("does not apply an edition that starts in a later term", () => {
    const result = diagnoseDirection(
      directionFacts({
        classTermNumber: 1,
        adoption: {
          release_id: "release-1",
          academic_session: "2026/2027",
          effective_term_number: 3,
        },
      })
    );
    expect(result.resolved).toBe(false);
    if (result.resolved) return;
    expect(result.reason).toBe("session_mismatch");
  });

  it("resolves an independent pathway from its own edition", () => {
    const result = diagnoseDirection(
      directionFacts({
        enrollmentType: "online",
        offeringDirection: { release_id: "own-edition" },
        adoption: null,
      })
    );
    expect(result).toEqual({ resolved: true, releaseId: "own-edition" });
  });

  it("reports a published-but-unassigned course as not adopted", () => {
    const result = diagnoseDirection(directionFacts({ adoption: null }));
    expect(result.resolved).toBe(false);
    if (result.resolved) return;
    expect(result.reason).toBe("not_adopted");
  });
});

function assetFacts(overrides: Partial<AssetFacts> = {}): AssetFacts {
  return {
    programmeLinked: true,
    centralDraftCount: 1,
    publishedRelease: RELEASE,
    adoptionCount: 29,
    independentOfferingCount: 0,
    offeringDirectionCount: 0,
    scheduleCount: 1,
    ...overrides,
  };
}

describe("assetStatus", () => {
  it("only emits stages registered in the curriculum lane", () => {
    expect(assetStatus(assetFacts()).map((stage) => stage.id)).toEqual(
      stagesInLane("asset").map((stage) => stage.id)
    );
  });

  it("reports a fully distributed course as done end to end", () => {
    const statuses = assetStatus(assetFacts());
    expect(statuses.every((s) => s.state === "done")).toBe(true);
    expect(nextAction(statuses)).toBeNull();
  });

  it("points an uncertified draft at the certify stage", () => {
    const statuses = assetStatus(
      assetFacts({ publishedRelease: null, adoptionCount: 0, scheduleCount: 0 })
    );
    const next = nextAction(statuses);
    expect(next?.id).toBe("certify");
    expect(next?.actionHref).toBe("/dashboard/academic/rollout");
  });

  it("does not ask to certify when there is nothing written yet", () => {
    const statuses = assetStatus(
      assetFacts({ centralDraftCount: 0, publishedRelease: null, adoptionCount: 0 })
    );
    expect(statuses.find((s) => s.id === "certify")?.state).toBe("waiting");
    expect(nextAction(statuses)?.id).toBe("author");
  });

  it("flags independent pathways that still need their own edition", () => {
    const statuses = assetStatus(
      assetFacts({ independentOfferingCount: 2, offeringDirectionCount: 0 })
    );
    const distribute = statuses.find((s) => s.id === "distribute");
    expect(distribute?.state).toBe("ready");
    expect(distribute?.headline).toContain("2 online or special");
  });
});

describe("deliveryStatus", () => {
  it("blocks every later stage while the plan cannot resolve an edition", () => {
    const statuses = deliveryStatus({
      direction: directionFacts({ publishedRelease: null, adoption: null }),
      planExists: false,
      planHasRelease: false,
      deliveredWeekCount: 0,
      plannedWeekCount: 0,
      evidenceCount: 0,
      resultsPublished: false,
    });
    expect(statuses.find((s) => s.id === "plan")?.state).toBe("blocked");
    expect(statuses.find((s) => s.id === "teach")?.state).toBe("waiting");
    expect(nextAction(statuses)?.id).toBe("plan");
  });

  it("surfaces the blocker even when stale evidence makes a later stage look ready", () => {
    // Reproduces a live class: the plan could not resolve an edition, yet old
    // evidence rows existed, so results appeared actionable.
    const statuses = deliveryStatus({
      direction: directionFacts({ enrollmentType: "special", adoption: null }),
      planExists: false,
      planHasRelease: false,
      deliveredWeekCount: 0,
      plannedWeekCount: 0,
      evidenceCount: 55,
      resultsPublished: false,
    });
    expect(statuses.find((s) => s.id === "plan")?.state).toBe("blocked");
    expect(statuses.find((s) => s.id === "result")?.state).toBe("waiting");
    expect(nextAction(statuses)?.id).toBe("plan");
  });

  it("moves on to coverage once teaching has started", () => {
    const statuses = deliveryStatus({
      direction: directionFacts(),
      planExists: true,
      planHasRelease: true,
      deliveredWeekCount: 3,
      plannedWeekCount: 12,
      evidenceCount: 0,
      resultsPublished: false,
    });
    expect(statuses.find((s) => s.id === "plan")?.state).toBe("done");
    expect(nextAction(statuses)?.id).toBe("evidence");
  });
});

describe("lanes", () => {
  it("treats stale runtime stage ids as unknown without throwing", () => {
    expect(findStage("catalogue")).toBeNull();
  });

  it("never offers a teacher a curriculum-governance stage", () => {
    const ids = stepsForRole("teacher").map((s) => s.id);
    expect(ids).not.toContain("certify");
    expect(ids).not.toContain("distribute");
    expect(ids).not.toContain("time");
    expect(ids).toContain("plan");
  });

  it("gives an admin both lanes", () => {
    const lanes = new Set(stepsForRole("admin").map((s) => s.lane));
    expect(lanes).toEqual(new Set(["asset", "delivery"]));
  });

  it("numbers each lane from 1 with no gaps or duplicates", () => {
    for (const lane of ["asset", "delivery"] as const) {
      const steps = stagesInLane(lane).map((s) => s.step);
      expect(steps).toEqual(steps.map((_, index) => index + 1));
    }
  });

  it("keeps stage ids and hrefs unique", () => {
    expect(new Set(STAGES.map((s) => s.id)).size).toBe(STAGES.length);
  });
});
