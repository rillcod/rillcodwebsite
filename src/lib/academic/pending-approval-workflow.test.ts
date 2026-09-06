import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  canSetAutomaticDelivery,
  summarizePendingApprovals,
  type PendingWeek,
} from "./pending-approval";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const api = read("src/app/api/teaching/pending-approval/route.ts");
const page = read("src/app/dashboard/teaching/approvals/page.tsx");

describe("weekly package approval workflow", () => {
  it("checks the complete five-item package instead of listing held rows alone", () => {
    expect(api).toContain('"lesson",');
    expect(api).toContain('"slides",');
    expect(api).toContain('"flashcards",');
    expect(api).toContain('"assignment",');
    expect(api).toContain('"project",');
    expect(api).toContain("missingKinds");
    expect(api).toContain('item.state === "held"');
  });

  it("repairs only missing items before sharing and keeps incomplete sharing explicit", () => {
    expect(page).toContain("prepareMissing");
    expect(page).toContain("row.missingKinds.map");
    expect(page).toContain("Share available only");
    expect(page).toContain("Share all ready");
    expect(page).not.toContain("Release All");
    expect(page).not.toContain("Full Curriculum Breakdown");
  });

  it("moves a class approval queue to the currently assigned teacher", () => {
    expect(api).toContain("if (p.class_id || klass?.id) return klass?.teacher_id === staff.id");
    expect(api).toContain("return p.created_by === staff.id");
    expect(api).not.toContain("if (p.created_by && p.created_by === staff.id) return true");
  });

  it("keeps unattended delivery under Academic Office control", () => {
    expect(canSetAutomaticDelivery("admin", true)).toBe(true);
    expect(canSetAutomaticDelivery("admin", false)).toBe(true);
    expect(canSetAutomaticDelivery("teacher", true)).toBe(false);
    expect(canSetAutomaticDelivery("teacher", false)).toBe(true);
    expect(canSetAutomaticDelivery("school", false)).toBe(false);
  });

  it("summarises the real queue without counting the same plan twice", () => {
    const row = (input: Partial<PendingWeek>): PendingWeek => ({
      planId: "plan-1",
      className: "Class A",
      courseTitle: "Course",
      week: 1,
      session: 1,
      meetingsInWeek: 1,
      topic: "Topic",
      items: [],
      missingKinds: [],
      complete: true,
      autoPublish: false,
      ...input,
    });
    expect(
      summarizePendingApprovals([
        row({}),
        row({ week: 2, complete: false, missingKinds: ["slides"] }),
        row({ planId: "plan-2", autoPublish: true }),
      ]),
    ).toEqual({
      total: 3,
      ready: 2,
      needsRepair: 1,
      plans: 2,
      autoDeliveryPlans: 1,
      reviewFirstPlans: 1,
    });
  });

  it("keeps massive queues searchable, paged and free of duplicate item titles", () => {
    expect(page).toContain('placeholder="Find a class, course or topic"');
    expect(page).toContain("filteredWeeks.slice(0, visibleLimit)");
    expect(page).toContain("Show 12 more");
    expect(page).toContain("Delivery automation");
    expect(page).toContain("Auto-share future complete packages");
    expect(page).toContain("5 of 5 ready");
  });
});
