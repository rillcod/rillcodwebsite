import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

/**
 * Public Paystack verify URLs take a payment reference as a capability token.
 * The door test is that they share the existing IP limiter used by certificate
 * and report verify — a library test cannot see an unbounded GET.
 */
const VERIFY_ROUTES = [
  "src/app/api/payments/registration/verify/route.ts",
  "src/app/api/payments/registration/balance/verify/route.ts",
  "src/app/api/summer-school/verify/route.ts",
];

describe("public payment verify rate limit", () => {
  it("puts every public Paystack verify URL on the shared IP limiter", () => {
    for (const path of VERIFY_ROUTES) {
      const source = read(path);
      expect(source, path).toContain("checkCustomRateLimit");
      expect(source, path).toContain("paystack-verify:");
      expect(source, path).toContain("status: 429");
    }
  });
});
