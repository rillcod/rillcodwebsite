import { describe, expect, it } from "vitest";
import { classCoverageFromRows } from "./class-coverage";

describe("class curriculum coverage", () => {
  it("prefers delivery rows over legacy week tracking", () => {
    // A class on the current Teaching flow has delivery rows and usually no
    // tracking rows. Reading tracking first left its bar empty forever.
    expect(
      classCoverageFromRows(
        [
          { week_number: 1, status: "delivered" },
          { week_number: 2, status: "planned" },
        ],
        [{ status: "delivered" }, { status: "delivered" }, { status: "delivered" }]
      )
    ).toEqual({ delivered: 1, planned: 2 });
  });

  it("falls back to week tracking when nothing has been delivered", () => {
    expect(
      classCoverageFromRows([], [{ status: "delivered" }, { status: "planned" }])
    ).toEqual({ delivered: 1, planned: 2 });
  });

  it("counts a week once however many rows it has", () => {
    // Marking a week taught twice must not make the class look twice as far on.
    expect(
      classCoverageFromRows(
        [
          { week_number: 3, status: "planned" },
          { week_number: 3, status: "delivered" },
          { week_number: 3, status: "planned" },
        ],
        []
      )
    ).toEqual({ delivered: 1, planned: 1 });
  });

  it("lets delivered win regardless of row order", () => {
    const first = classCoverageFromRows(
      [
        { week_number: 1, status: "delivered" },
        { week_number: 1, status: "planned" },
      ],
      []
    );
    const reversed = classCoverageFromRows(
      [
        { week_number: 1, status: "planned" },
        { week_number: 1, status: "delivered" },
      ],
      []
    );
    expect(first).toEqual({ delivered: 1, planned: 1 });
    expect(reversed).toEqual(first);
  });

  it("ignores rows with an unusable week number", () => {
    expect(
      classCoverageFromRows(
        [
          { week_number: Number.NaN, status: "delivered" },
          { week_number: 2, status: "delivered" },
        ],
        []
      )
    ).toEqual({ delivered: 1, planned: 1 });
  });

  it("reports nothing rather than dividing by zero when both sources are empty", () => {
    expect(classCoverageFromRows([], [])).toEqual({ delivered: 0, planned: 0 });
    expect(classCoverageFromRows(null, undefined)).toEqual({
      delivered: 0,
      planned: 0,
    });
  });
});
