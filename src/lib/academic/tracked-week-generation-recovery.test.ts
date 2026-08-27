import { beforeEach, describe, expect, it, vi } from "vitest";

const { generatePlanWeek, resolveGenerationRepairTypes } = vi.hoisted(() => ({
  generatePlanWeek: vi.fn(),
  resolveGenerationRepairTypes: vi.fn(),
}));

vi.mock("./week-generation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./week-generation")>()),
  generatePlanWeek,
}));

vi.mock("./generation-repair", () => ({
  resolveGenerationRepairTypes,
}));

import { generateTrackedPlanWeek } from "./tracked-week-generation";

function repair(typesToRun: string[]) {
  return {
    requestedTypes: typesToRun,
    typesToRun,
    missingAssets: [],
    staleAssets: [],
  };
}

function trackingDb() {
  const updates: Array<Record<string, unknown>> = [];
  const chain: any = {
    error: null,
    data: [],
    eq: () => chain,
    lt: () => Promise.resolve({ data: [], error: null }),
    select: () => chain,
    single: () => Promise.resolve({ data: { id: "run-1" }, error: null }),
  };
  return {
    updates,
    db: {
      from: () => ({
        ...chain,
        insert: () => chain,
        update: (value: Record<string, unknown>) => {
          updates.push(value);
          return chain;
        },
      }),
    },
  };
}

describe("tracked week generation recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retries only a transient type that durable inventory still says is missing", async () => {
    const { db, updates } = trackingDb();
    resolveGenerationRepairTypes
      .mockResolvedValueOnce(repair(["slides"]))
      .mockResolvedValueOnce(repair(["slides"]))
      .mockResolvedValueOnce(repair([]));
    generatePlanWeek
      .mockResolvedValueOnce({
        week: 3,
        generated: 0,
        skipped: 0,
        byType: {
          slides: { error: "Temporary provider problem", retryable: true },
        },
        failedTypes: ["slides"],
      })
      .mockResolvedValueOnce({
        week: 3,
        generated: 1,
        skipped: 0,
        byType: { slides: { generated: 1, skipped: 0 } },
        failedTypes: [],
      });

    const result = await generateTrackedPlanWeek({
      db,
      planId: "plan-1",
      classId: "class-1",
      week: 3,
      session: 2,
      types: ["slides"],
      source: "teacher",
    });

    expect(generatePlanWeek).toHaveBeenCalledTimes(2);
    expect(generatePlanWeek.mock.calls[1][0]).toMatchObject({
      types: ["slides"],
      week: 3,
      session: 2,
    });
    expect(result.outcome).toMatchObject({
      generated: 1,
      failedTypes: [],
      retriedTypes: ["slides"],
    });
    expect(result.outcome.recoveredTypes).toBeUndefined();
    expect(updates.at(-1)).toMatchObject({ status: "succeeded" });
  });

  it("trusts saved content after a lost response and does not pay for a retry", async () => {
    const { db } = trackingDb();
    resolveGenerationRepairTypes
      .mockResolvedValueOnce(repair(["flashcards"]))
      .mockResolvedValueOnce(repair([]));
    generatePlanWeek.mockResolvedValueOnce({
      week: 4,
      generated: 0,
      skipped: 0,
      byType: {
        flashcards: { error: "Connection interrupted", retryable: true },
      },
      failedTypes: ["flashcards"],
    });

    const result = await generateTrackedPlanWeek({
      db,
      planId: "plan-1",
      week: 4,
      session: 1,
      types: ["flashcards"],
      source: "teacher",
    });

    expect(generatePlanWeek).toHaveBeenCalledTimes(1);
    expect(result.outcome).toMatchObject({
      failedTypes: [],
      recoveredTypes: ["flashcards"],
    });
  });

  it("does not repeat a validation or policy refusal", async () => {
    const { db } = trackingDb();
    resolveGenerationRepairTypes
      .mockResolvedValueOnce(repair(["projects"]))
      .mockResolvedValueOnce(repair(["projects"]));
    generatePlanWeek.mockResolvedValueOnce({
      week: 5,
      generated: 0,
      skipped: 0,
      byType: {
        projects: { error: "Publish this plan first.", retryable: false },
      },
      failedTypes: ["projects"],
    });

    const result = await generateTrackedPlanWeek({
      db,
      planId: "plan-1",
      week: 5,
      types: ["projects"],
      source: "teacher",
    });

    expect(generatePlanWeek).toHaveBeenCalledTimes(1);
    expect(result.outcome.failedTypes).toEqual(["projects"]);
    expect(result.outcome.retriedTypes).toBeUndefined();
  });
});
