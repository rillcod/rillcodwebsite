import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

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
});
