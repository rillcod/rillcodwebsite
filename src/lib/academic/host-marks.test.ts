import { describe, expect, it } from "vitest";
import {
  formatHostMark,
  hostAssessmentMetricFields,
  hostMarksFromCbtSessions,
  hostSchoolScoreboard,
  hostSchoolTotal,
  markFromEarned,
  parseHallMarkInput,
} from "./host-marks";

describe("host school marks", () => {
  it("adds First Test, Second Test and Examination to the school's own 100", () => {
    const papers = {
      first_test: markFromEarned(15, 20),
      second_test: markFromEarned(18, 20),
      examination: markFromEarned(57, 60),
    };
    expect(hostSchoolTotal(papers)).toEqual({ earned: 90, max: 100, percent: 90 });
    expect(formatHostMark(papers.first_test)).toBe("15/20");
    expect(formatHostMark(papers.examination)).toBe("57/60");
  });

  it("does not average percentages, so 75% + 90% + 95% is not the parent total", () => {
    const papers = hostMarksFromCbtSessions([
      {
        score: 75,
        status: "passed",
        answers: { capture: "paper", earned: 15, max: 20 },
        cbt_exams: { metadata: { host_assessment: "first_test", host_max: 20 } },
      },
      {
        score: 90,
        status: "passed",
        answers: { capture: "paper", earned: 18, max: 20 },
        cbt_exams: { metadata: { host_assessment: "second_test", host_max: 20 } },
      },
      {
        score: 95,
        status: "passed",
        answers: { capture: "paper", earned: 57, max: 60 },
        cbt_exams: { metadata: { host_assessment: "examination", host_max: 60 } },
      },
    ]);
    expect(hostSchoolTotal(papers)?.percent).toBe(90);
    expect(hostSchoolTotal(papers)?.percent).not.toBe(87);
  });

  it("treats hall entry 15 on a /20 paper as 15/20, not 15%", () => {
    expect(parseHallMarkInput({ score: 15 }, 20)).toEqual({
      earned: 15,
      max: 20,
      percent: 75,
    });
    expect(parseHallMarkInput({ earned: 57 }, 60)).toEqual({
      earned: 57,
      max: 60,
      percent: 95,
    });
  });

  it("shows parents the school papers without mixing assignments into them", () => {
    const metrics = {
      score_authority: "host_school",
      ...hostAssessmentMetricFields({
        first_test: markFromEarned(15, 20),
        second_test: markFromEarned(18, 20),
        examination: markFromEarned(57, 60),
      }),
      classwork_score: 80,
      assessment_score: 83,
    };
    const board = hostSchoolScoreboard(metrics);
    expect(board?.total).toEqual({ earned: 90, max: 100, percent: 90 });
    expect(board?.complete).toBe(true);
    expect(board?.papers.map((row) => formatHostMark(row.mark))).toEqual([
      "15/20",
      "18/20",
      "57/60",
    ]);
  });

  it("adds teacher-set paper totals, not a locked 20 + 20 + 60", () => {
    const papers = {
      first_test: markFromEarned(24, 30),
      second_test: markFromEarned(21, 30),
      examination: markFromEarned(32, 40),
    };
    expect(hostSchoolTotal(papers)).toEqual({ earned: 77, max: 100, percent: 77 });
    expect(formatHostMark(papers.first_test)).toBe("24/30");
  });

  it("is complete when all three papers are on the record, even if maxima are not 100", () => {
    const metrics = {
      score_authority: "host_school",
      ...hostAssessmentMetricFields({
        first_test: markFromEarned(12, 25),
        second_test: markFromEarned(18, 25),
        examination: markFromEarned(40, 50),
      }),
    };
    const board = hostSchoolScoreboard(metrics);
    expect(board?.total).toEqual({ earned: 70, max: 100, percent: 70 });
    expect(board?.complete).toBe(true);
  });

  it("uses the paper’s own max from hall capture, not a default /20", () => {
    const papers = hostMarksFromCbtSessions([
      {
        score: 80,
        status: "passed",
        answers: { capture: "paper", earned: 24, max: 30 },
        cbt_exams: { metadata: { host_assessment: "first_test", host_max: 30 } },
      },
    ]);
    expect(papers.first_test).toEqual({ earned: 24, max: 30, percent: 80 });
  });
});
