import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  requestTrackedWeekGeneration,
  WeekGenerationRequestError,
} from "./week-generation-client";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

describe("week generation connection recovery", () => {
  it("recovers a running durable claim instead of starting another request", async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(
        json({ status: "running", generated: 0, skipped: 0 })
      );

    const result = await requestTrackedWeekGeneration({
      planId: "plan-1",
      week: 4,
      session: 2,
      fetcher,
      waitFor: async () => undefined,
    });

    expect(result.alreadyRunning).toBe(true);
    expect(result.connectionRecovered).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(String(fetcher.mock.calls[1][0])).toContain("week=4&session=2");
    expect(String(fetcher.mock.calls[1][0])).toContain("after=");
  });

  it("waits briefly when the run claim has not appeared yet", async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(json({ status: "idle", complete: false }))
      .mockResolvedValueOnce(
        json({
          status: "succeeded",
          complete: true,
          generated: 5,
          skipped: 0,
          byType: { lessons: { generated: 1, skipped: 0 } },
        })
      );

    const result = await requestTrackedWeekGeneration({
      planId: "plan-1",
      week: 4,
      fetcher,
      waitFor: async () => undefined,
    });

    expect(result.success).toBe(true);
    expect(result.generated).toBe(5);
    expect(result.connectionRecovered).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("does not hide an authoritative API refusal", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(
      json({ error: "Publish this plan before preparing it." }, 409)
    );

    await expect(
      requestTrackedWeekGeneration({
        planId: "plan-1",
        week: 4,
        fetcher,
      })
    ).rejects.toEqual(
      expect.objectContaining<Partial<WeekGenerationRequestError>>({
        message: "Publish this plan before preparing it.",
        status: 409,
      })
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("returns one professional message when status cannot be recovered", async () => {
    const fetcher = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(
      requestTrackedWeekGeneration({
        planId: "plan-1",
        week: 4,
        fetcher,
        waitFor: async () => undefined,
        recoveryAttempts: 2,
      })
    ).rejects.toThrow(
      "The connection was interrupted. Preparation may still be running, and saved items are safe. Refresh this week before retrying."
    );
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("keeps every teacher-facing generator on the recovery-aware client", () => {
    const surfaces = [
      "src/components/ai/WeekAIGenerator.tsx",
      "src/components/classes/ClassTeachingWorkspace.tsx",
      "src/components/lesson-plans/ThisWeekPanel.tsx",
      "src/app/dashboard/teaching/approvals/page.tsx",
      "src/app/dashboard/lesson-plans/[id]/page.tsx",
    ];
    for (const surface of surfaces) {
      const source = readFileSync(join(process.cwd(), surface), "utf8");
      expect(source, surface).toContain("requestTrackedWeekGeneration");
      expect(source, surface).not.toMatch(
        /fetch\([^\n]*\/generate-week/
      );
    }
  });

  it("exposes a read-only, request-windowed durable status handshake", () => {
    const route = readFileSync(
      join(
        process.cwd(),
        "src/app/api/lesson-plans/[id]/generate-week/route.ts"
      ),
      "utf8"
    );
    expect(route).toContain("export async function GET");
    expect(route).toContain("resolveGenerationRepairTypes");
    expect(route).toContain("runQuery.gte('started_at', after)");
    expect(route).toContain("requestedTypes: run?.requested_types");
    expect(route).toContain("const durableStatus");
  });
});
