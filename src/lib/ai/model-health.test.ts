import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  healthiestFirst,
  isDemoted,
  recordModelFailure,
  recordModelSuccess,
  resetModelHealth,
  demotedModels,
} from "./model-health";

const id = (value: string) => value;

beforeEach(() => resetModelHealth());
afterEach(() => vi.useRealTimers());

describe("learning which models actually work", () => {
  it("demotes a model that ran out of quota", () => {
    // The case that prompted this: gemini-3.6-flash is listed, is current, and
    // returns 429 on the free tier — so ranking on the catalogue alone put a
    // model that always refuses at the front of every generation.
    recordModelFailure("vendor/exhausted", 429);

    expect(healthiestFirst(["vendor/exhausted", "vendor/fine"], id)).toEqual([
      "vendor/fine",
      "vendor/exhausted",
    ]);
  });

  it("keeps a demoted model in the queue rather than dropping it", () => {
    // Quotas reset and outages end. Removing it could empty the queue entirely.
    recordModelFailure("only/model", 429);

    expect(healthiestFirst(["only/model"], id)).toEqual(["only/model"]);
  });

  it("preserves order within the healthy and resting groups", () => {
    recordModelFailure("b", 500);
    recordModelFailure("d", 500);

    expect(healthiestFirst(["a", "b", "c", "d"], id)).toEqual([
      "a",
      "c",
      "b",
      "d",
    ]);
  });

  it("forgets a quota refusal once the cooldown lapses", () => {
    vi.useFakeTimers();
    recordModelFailure("vendor/model", 429);
    expect(isDemoted("vendor/model")).toBe(true);

    vi.advanceTimersByTime(31 * 60 * 1000);
    expect(isDemoted("vendor/model")).toBe(false);
  });

  it("rests a retired model far longer than an exhausted one", () => {
    vi.useFakeTimers();
    recordModelFailure("gone/model", 404);
    recordModelFailure("busy/model", 429);

    vi.advanceTimersByTime(31 * 60 * 1000);
    expect(isDemoted("busy/model")).toBe(false);
    expect(isDemoted("gone/model")).toBe(true);
  });

  it("does not let a later, shorter refusal promote a retired model", () => {
    vi.useFakeTimers();
    recordModelFailure("gone/model", 404); // six hours
    recordModelFailure("gone/model", 429); // half an hour

    vi.advanceTimersByTime(31 * 60 * 1000);
    expect(isDemoted("gone/model")).toBe(true);
  });

  it("clears the demotion as soon as the model answers again", () => {
    recordModelFailure("vendor/model", 429);
    recordModelSuccess("vendor/model");

    expect(isDemoted("vendor/model")).toBe(false);
  });

  it("reports what is resting, so this stays visible rather than merely working", () => {
    recordModelFailure("gone/model", 404);

    const resting = demotedModels();
    expect(resting).toHaveLength(1);
    expect(resting[0]).toMatchObject({ id: "gone/model", reason: "missing" });
  });
});
