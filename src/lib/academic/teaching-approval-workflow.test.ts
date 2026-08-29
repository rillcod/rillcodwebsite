import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("central teaching approval workflow", () => {
  const page = read("src/app/dashboard/teaching/approvals/page.tsx");
  const route = read("src/app/api/teaching/pending-approval/route.ts");

  it("uses one safe confirmation surface for every release action", () => {
    expect(page).toContain("<ConfirmModal");
    expect(page).toContain("requestRelease(row)");
    expect(page).toContain("Share all ready");
    expect(page).not.toContain("window.confirm");
    expect(page).not.toMatch(/[^\w]confirm\(/);
  });

  it("uses links that resolve to the real learner tools", () => {
    expect(page).toContain("/dashboard/flashcards?deckId=${id}");
    expect(page).toContain("/dashboard/projects/${id}");
  });

  it("classifies regular and special pathways from the real term identity", () => {
    expect(route).toContain("school_id,term_id,academic_offering_id");
    expect(route).toContain("lessonVisibility");
    expect(route).toContain("assignmentVisibility");
    expect(route).toContain("flashcardVisibility");
    expect(route).toContain("slidesVisibility");
  });
});
