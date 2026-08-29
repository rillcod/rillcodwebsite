import { describe, expect, it, vi } from "vitest";
import { ensureGenerationPlanReady } from "./generation-plan-state";

function database(error: { message: string } | null = null) {
  const eq = vi.fn().mockResolvedValue({ error });
  const update = vi.fn(() => ({ eq }));
  return { db: { from: vi.fn(() => ({ update })) }, update, eq };
}

describe("generation plan state", () => {
  it("activates a draft with teaching weeks without publishing child content", async () => {
    const store = database();
    const plan = { id: "plan-1", status: "draft", plan_data: { weeks: [{ week: 1 }] } };
    await expect(ensureGenerationPlanReady(store.db, plan, "2026-08-29T00:00:00.000Z"))
      .resolves.toEqual({ ready: true, activated: true });
    expect(store.update).toHaveBeenCalledWith({
      status: "published",
      updated_at: "2026-08-29T00:00:00.000Z",
    });
    expect(plan.status).toBe("published");
  });

  it("does not write an already-active plan", async () => {
    const store = database();
    await expect(
      ensureGenerationPlanReady(store.db, {
        id: "plan-1",
        status: "published",
        plan_data: { weeks: [{ week: 1 }] },
      }),
    ).resolves.toEqual({ ready: true, activated: false });
    expect(store.update).not.toHaveBeenCalled();
  });

  it("keeps empty and archived plans out of generation", async () => {
    const store = database();
    const empty = await ensureGenerationPlanReady(store.db, {
      id: "plan-1",
      status: "draft",
      plan_data: { weeks: [] },
    });
    const archived = await ensureGenerationPlanReady(store.db, {
      id: "plan-2",
      status: "archived",
      plan_data: { weeks: [{ week: 1 }] },
    });
    expect(empty.ready).toBe(false);
    expect(archived.ready).toBe(false);
    expect(store.update).not.toHaveBeenCalled();
  });
});
