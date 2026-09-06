import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  normalizeProgrammeDeliveryType,
  programmeDeliveryOption,
} from "./programme-delivery";

describe("programme teaching style", () => {
  it("normalises database input without borrowing the school result pathway", () => {
    expect(normalizeProgrammeDeliveryType("optional")).toBe("optional");
    expect(normalizeProgrammeDeliveryType("compulsory")).toBe("compulsory");
    expect(normalizeProgrammeDeliveryType("school-papers")).toBe("compulsory");
  });

  it("uses distinct customer language for programme delivery", () => {
    expect(programmeDeliveryOption("compulsory").label).toBe("Core programme");
    expect(programmeDeliveryOption("optional").label).toBe("Elective programme");
  });

  it("normalises creates and updates through the same authority", () => {
    const createRoute = readFileSync("src/app/api/programs/route.ts", "utf8");
    const updateRoute = readFileSync("src/app/api/programs/[id]/route.ts", "utf8");
    expect(createRoute).toContain("normalizeProgrammeDeliveryType(delivery_type)");
    expect(updateRoute).toContain("normalizeProgrammeDeliveryType(allowed.delivery_type)");
  });
});
