import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("Next development origin", () => {
  it("allows the loopback hostname used by desktop and mobile UI checks", () => {
    const config = readFileSync(join(process.cwd(), "next.config.ts"), "utf8");
    expect(config).toContain("allowedDevOrigins: ['127.0.0.1']");
  });
});
