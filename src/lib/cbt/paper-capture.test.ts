import { describe, expect, it } from "vitest";
import {
  clampPaperPercent,
  isPaperCaptureAnswers,
  paperCaptureSessionFields,
  paperCaptureStatus,
  sessionAllowsPaperOverwrite,
  withPersistedHostMax,
} from "./paper-capture";

describe("paper capture", () => {
  it("treats hall marks as overwriteable and CBT answers as locked", () => {
    expect(isPaperCaptureAnswers({ capture: "paper" })).toBe(true);
    expect(sessionAllowsPaperOverwrite({ answers: { capture: "paper" } })).toBe(true);
    expect(sessionAllowsPaperOverwrite({ answers: {} })).toBe(true);
    expect(sessionAllowsPaperOverwrite({ answers: { q1: "A" } })).toBe(false);
    expect(clampPaperPercent(72.4)).toBe(72);
    expect(paperCaptureStatus(70, 70)).toBe("passed");
    expect(paperCaptureStatus(69, 70)).toBe("failed");
    expect(paperCaptureSessionFields({
      examId: "e1",
      userId: "u1",
      score: 81,
      passingScore: 50,
    }).answers).toEqual({ capture: "paper" });
  });

  it("stamps a new host_max onto exam metadata only when it changes", () => {
    expect(withPersistedHostMax({ host_assessment: "first_test", host_max: 20 }, 20)).toBeNull();
    expect(withPersistedHostMax({ host_assessment: "first_test", host_max: 20 }, 30)).toEqual({
      host_assessment: "first_test",
      host_max: 30,
    });
    expect(withPersistedHostMax(null, 40)).toEqual({ host_max: 40 });
  });
});
