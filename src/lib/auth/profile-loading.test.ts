import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PROFILE_FETCH_ATTEMPT_TIMEOUTS_MS,
  shouldRetryProfileResponse,
} from "./profile-loading";

describe("profile loading recovery", () => {
  it("keeps the complete retry window below twenty seconds before pauses", () => {
    expect(PROFILE_FETCH_ATTEMPT_TIMEOUTS_MS).toEqual([8_000, 6_000, 4_000]);
    expect(PROFILE_FETCH_ATTEMPT_TIMEOUTS_MS.reduce((sum, ms) => sum + ms, 0))
      .toBeLessThanOrEqual(18_000);
  });

  it("retries temporary auth propagation and server failures", () => {
    expect(shouldRetryProfileResponse(401, 0)).toBe(true);
    expect(shouldRetryProfileResponse(502, 1)).toBe(true);
    expect(shouldRetryProfileResponse(503, 2)).toBe(false);
  });

  it("does not repeat an authoritative client refusal", () => {
    expect(shouldRetryProfileResponse(403, 0)).toBe(false);
    expect(shouldRetryProfileResponse(404, 0)).toBe(false);
  });

  it("is the retry policy the signed-in app actually uses", () => {
    const auth = readFileSync(
      join(process.cwd(), "src/contexts/auth-context.tsx"),
      "utf8",
    );
    expect(auth).toContain("PROFILE_FETCH_ATTEMPT_TIMEOUTS_MS");
    expect(auth).toContain("shouldRetryProfileResponse");
  });
});
