import { describe, expect, it } from "vitest";
import { assetStatus, nextAction, type AssetFacts } from "./status";

const RELEASE = {
  id: "release-1",
  title: "Robotics · 2026/2027 · Basic 1",
  release_number: 1,
  academic_session: "2026/2027",
  effective_term_number: 1,
};

function facts(overrides: Partial<AssetFacts> = {}): AssetFacts {
  return {
    programmeLinked: true,
    centralDraftCount: 1,
    publishedRelease: RELEASE,
    adoptionCount: 1,
    independentOfferingCount: 0,
    offeringDirectionCount: 0,
    scheduleCount: 1,
    expectedSchoolCount: 1,
    schoolsMissingAdoption: 0,
    offeringsMissingDirection: 0,
    ...overrides,
  };
}

/**
 * Distribution used to be judged on totals, so a single adoption made a course
 * look fully distributed while other eligible schools had received nothing.
 * These cover the difference between "some exist" and "everyone has one".
 */
describe("distribution coverage", () => {
  it("is done only when every expected school and pathway is covered", () => {
    const distribute = assetStatus(facts()).find((s) => s.id === "distribute");
    expect(distribute?.state).toBe("done");
  });

  it("is not done when one school has an adoption but others do not", () => {
    const distribute = assetStatus(
      facts({ adoptionCount: 1, expectedSchoolCount: 4, schoolsMissingAdoption: 3 })
    ).find((s) => s.id === "distribute");
    expect(distribute?.state).toBe("ready");
    expect(distribute?.headline).toContain("3 school(s)");
  });

  it("names both gaps when schools and pathways are outstanding", () => {
    const distribute = assetStatus(
      facts({
        schoolsMissingAdoption: 2,
        independentOfferingCount: 3,
        offeringDirectionCount: 1,
        offeringsMissingDirection: 2,
      })
    ).find((s) => s.id === "distribute");
    expect(distribute?.state).toBe("ready");
    expect(distribute?.headline).toContain("2 school(s)");
    expect(distribute?.headline).toContain("2 online or special pathway(s)");
  });

  it("still flags an uncovered pathway when every school is adopted", () => {
    const distribute = assetStatus(
      facts({
        schoolsMissingAdoption: 0,
        independentOfferingCount: 1,
        offeringDirectionCount: 0,
        offeringsMissingDirection: 1,
      })
    ).find((s) => s.id === "distribute");
    expect(distribute?.state).toBe("ready");
    expect(distribute?.detail).toContain("never inherit a school adoption");
  });

  it("falls back to the count difference when coverage facts are absent", () => {
    const distribute = assetStatus(
      facts({
        expectedSchoolCount: undefined,
        schoolsMissingAdoption: undefined,
        offeringsMissingDirection: undefined,
        independentOfferingCount: 2,
        offeringDirectionCount: 0,
      })
    ).find((s) => s.id === "distribute");
    expect(distribute?.state).toBe("ready");
    expect(distribute?.headline).toContain("2 online or special pathway(s)");
  });

  it("waits rather than reporting gaps before the course is certified", () => {
    const statuses = assetStatus(
      facts({ publishedRelease: null, schoolsMissingAdoption: 5 })
    );
    expect(statuses.find((s) => s.id === "distribute")?.state).toBe("waiting");
    expect(nextAction(statuses)?.id).toBe("certify");
  });
});
