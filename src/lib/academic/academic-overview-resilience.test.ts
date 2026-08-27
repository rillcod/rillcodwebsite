import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const overview = readFileSync(
  join(process.cwd(), "src/app/dashboard/academic/page.tsx"),
  "utf8",
);
const accessGuard = readFileSync(
  join(process.cwd(), "src/components/layout/DashboardAccessGuard.tsx"),
  "utf8",
);
const loadingScreen = readFileSync(
  join(process.cwd(), "src/components/dashboard/DashboardLoadingScreen.tsx"),
  "utf8",
);

describe("academic overview loading resilience", () => {
  it("bounds required loading and lets the optional admin summary fail independently", () => {
    expect(overview).toContain("fetchWithTimeoutOrThrow(");
    expect(overview).toContain('"/api/academic/status"');
    expect(overview).toContain(").catch(() => null)");
    expect(overview).toContain("loadRequestRef");
  });

  it("gives the customer plain progress, failure and retry feedback", () => {
    expect(overview).toContain("Opening your academic work…");
    expect(overview).toContain('role="alert"');
    expect(overview).toContain('"Try again"');
    expect(overview).not.toContain("Unable to open the academic view");
  });

  it("keeps role-specific pages hidden until the account is known and offers recovery", () => {
    expect(accessGuard).toContain("Opening your workspace…");
    expect(accessGuard).toContain("Try account again");
    expect(accessGuard).toContain("retryProfile");
    expect(accessGuard).toContain('secondaryHref="/login?clear=1"');
    expect(loadingScreen).toContain('role="status"');
    expect(loadingScreen).toContain("{message}");
  });
});
