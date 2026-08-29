import { describe, expect, it, vi } from "vitest";
import { readSupabaseWithTransientRetry } from "./read-retry";

describe("Supabase read retry", () => {
  it("replays a temporary gateway failure and keeps the successful data", async () => {
    const read = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: { code: "503", message: "Service unavailable" } })
      .mockResolvedValueOnce({ data: [{ id: "lesson-1" }], error: null });
    const wait = vi.fn().mockResolvedValue(undefined);

    const result = await readSupabaseWithTransientRetry(read, { wait });

    expect(result).toEqual({
      data: [{ id: "lesson-1" }],
      error: null,
      attempts: 2,
    });
    expect(read).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledOnce();
  });

  it("does not retry a real database contract error", async () => {
    const error = { code: "42703", message: "column does not exist" };
    const read = vi.fn().mockResolvedValue({ data: null, error });
    const wait = vi.fn().mockResolvedValue(undefined);

    expect(await readSupabaseWithTransientRetry(read, { wait })).toEqual({
      data: null,
      error,
      attempts: 1,
    });
    expect(read).toHaveBeenCalledOnce();
    expect(wait).not.toHaveBeenCalled();
  });

  it("retries a thrown network failure without disguising a persistent one", async () => {
    const read = vi.fn().mockRejectedValue(new Error("fetch failed"));
    const wait = vi.fn().mockResolvedValue(undefined);

    const result = await readSupabaseWithTransientRetry(read, { wait });

    expect(result).toMatchObject({
      data: null,
      error: { message: "fetch failed" },
      attempts: 2,
    });
    expect(read).toHaveBeenCalledTimes(2);
  });
});
