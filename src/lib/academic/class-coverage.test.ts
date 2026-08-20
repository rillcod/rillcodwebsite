import { describe, expect, it } from "vitest";
import { classCoverageFromRows } from "./class-coverage";

describe("class curriculum coverage", () => {
  it("counts taught meetings from delivery rows", () => {
    expect(
      classCoverageFromRows([
        { week_number: 1, session_number: 1, status: "delivered" },
        { week_number: 2, session_number: 1, status: "planned" },
      ])
    ).toEqual({ delivered: 1, planned: 2 });
  });

  it("treats an omitted session as Class 1", () => {
    expect(
      classCoverageFromRows([
        { week_number: 1, status: "delivered" },
        { week_number: 1, session_number: 1, status: "planned" },
      ])
    ).toEqual({ delivered: 1, planned: 1 });
  });

  it("counts a meeting once however many rows it has", () => {
    expect(
      classCoverageFromRows([
        { week_number: 3, status: "planned" },
        { week_number: 3, status: "delivered" },
        { week_number: 3, status: "planned" },
      ])
    ).toEqual({ delivered: 1, planned: 1 });
  });

  it("counts separate meetings in the same week", () => {
    expect(
      classCoverageFromRows([
        { week_number: 3, session_number: 1, status: "delivered" },
        { week_number: 3, session_number: 2, status: "planned" },
      ])
    ).toEqual({ delivered: 1, planned: 2 });
  });

  it("lets delivered win regardless of row order", () => {
    const first = classCoverageFromRows([
      { week_number: 1, status: "delivered" },
      { week_number: 1, status: "planned" },
    ]);
    const reversed = classCoverageFromRows([
      { week_number: 1, status: "planned" },
      { week_number: 1, status: "delivered" },
    ]);
    expect(first).toEqual({ delivered: 1, planned: 1 });
    expect(reversed).toEqual(first);
  });

  it("ignores rows with an unusable week number", () => {
    expect(
      classCoverageFromRows([
        { week_number: Number.NaN, status: "delivered" },
        { week_number: 2, status: "delivered" },
      ])
    ).toEqual({ delivered: 1, planned: 1 });
  });

  it("reports nothing rather than dividing by zero when empty", () => {
    expect(classCoverageFromRows([])).toEqual({ delivered: 0, planned: 0 });
    expect(classCoverageFromRows(null)).toEqual({
      delivered: 0,
      planned: 0,
    });
  });
});
