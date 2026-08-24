import { describe, expect, it } from "vitest";
import {
  attendanceRate,
  countsAsAttended,
  isExcluded,
  measuredAttendancePercentage,
} from "./policy";

describe("attendance policy", () => {
  it("credits a late arrival as attended", () => {
    expect(countsAsAttended("late")).toBe(true);
    expect(countsAsAttended("present")).toBe(true);
    expect(countsAsAttended("absent")).toBe(false);
  });

  it("treats an excused absence as neither attended nor missed", () => {
    expect(countsAsAttended("excused")).toBe(false);
    expect(isExcluded("excused")).toBe(true);
  });

  it("removes excused sessions from the denominator", () => {
    // Eight held, one excused: measured against seven, not eight.
    const rate = attendanceRate(
      ["present", "present", "present", "present", "present", "present", "absent", "excused"],
      8
    );
    expect(rate.counted).toBe(7);
    expect(rate.attended).toBe(6);
    expect(rate.percentage).toBeCloseTo(85.71, 1);
  });

  it("gives the same answer whether a learner was late or on time", () => {
    const onTime = attendanceRate(["present", "present", "absent"], 3);
    const late = attendanceRate(["present", "late", "absent"], 3);
    expect(late.percentage).toBe(onTime.percentage);
  });

  it("measures against sessions held, not only sessions recorded", () => {
    // Two records for a class that met four times: the two silent ones count
    // against the learner rather than vanishing.
    const rate = attendanceRate(["present", "present"], 4);
    expect(rate.counted).toBe(4);
    expect(rate.percentage).toBe(50);
  });

  it("reports zero rather than dividing by nothing", () => {
    expect(attendanceRate([], 0).percentage).toBe(0);
    expect(attendanceRate(["excused"], 1).percentage).toBe(0);
  });

  it("ignores unknown statuses instead of crediting them", () => {
    expect(countsAsAttended("holiday")).toBe(false);
    expect(countsAsAttended(null)).toBe(false);
    expect(countsAsAttended(undefined)).toBe(false);
  });

  it("never exposes a percentage above 100 for duplicate historical records", () => {
    expect(attendanceRate(["present", "present"], 1).percentage).toBe(100);
  });

  it("distinguishes no measurable attendance from zero attendance", () => {
    expect(measuredAttendancePercentage(["excused"])).toBeNull();
    expect(measuredAttendancePercentage(["absent"])).toBe(0);
  });
});
