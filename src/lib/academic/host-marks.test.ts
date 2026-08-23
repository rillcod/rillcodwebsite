import { describe, expect, it } from "vitest";
import {
  formatHostMark,
  hostAssessmentMetricFields,
  hostMarksFromCbtSessions,
  hostPapersComplete,
  hostPapersFromMetrics,
  hostSchoolScoreboard,
  hostSchoolTotal,
  markFromEarned,
  mergeHostPaperExamIds,
  mergeHostPaperMarks,
  mergeHostSchoolMetrics,
  parseHallMarkInput,
  pickHostPaperExamIds,
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

  it("does not treat three placeholder rows as complete papers", () => {
    expect(hostPapersComplete({ first_test: null, second_test: null, examination: null })).toBe(false);
    expect(hostPapersComplete({
      first_test: markFromEarned(14, 20),
      second_test: markFromEarned(16, 20),
      examination: markFromEarned(50, 60),
    })).toBe(true);
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

  it("keeps stored hall marks when optional evidence is saved without papers", () => {
    const stored = {
      score_authority: "host_school",
      ...hostAssessmentMetricFields({
        first_test: markFromEarned(15, 20),
        second_test: markFromEarned(18, 20),
        examination: markFromEarned(57, 60),
      }),
      classwork_score: 40,
    };
    const merged = mergeHostSchoolMetrics(stored, {
      score_authority: "host_school",
      classwork_score: 88,
      assessment_score: null,
      first_test_earned: null,
      first_test_max: null,
      second_test_earned: null,
      examination_earned: null,
      host_total_earned: null,
    });
    expect(merged.classwork_score).toBe(88);
    expect(hostSchoolScoreboard(merged)?.total).toEqual({ earned: 90, max: 100, percent: 90 });
    expect(hostPapersFromMetrics(merged)).toEqual({
      first_test: markFromEarned(15, 20),
      second_test: markFromEarned(18, 20),
      examination: markFromEarned(57, 60),
    });
  });

  it("adopts a real incoming paper without clearing the other two", () => {
    const stored = hostAssessmentMetricFields({
      first_test: markFromEarned(10, 20),
      second_test: markFromEarned(12, 20),
      examination: markFromEarned(40, 60),
    });
    const incoming = hostAssessmentMetricFields({
      first_test: markFromEarned(18, 20),
      second_test: null,
      examination: null,
    });
    expect(mergeHostPaperMarks(hostPapersFromMetrics(stored), hostPapersFromMetrics(incoming))).toEqual({
      first_test: markFromEarned(18, 20),
      second_test: markFromEarned(12, 20),
      examination: markFromEarned(40, 60),
    });
  });

  it("does not invent host papers on an optional Rillcod report", () => {
    const merged = mergeHostSchoolMetrics(
      { classwork_score: 70 },
      { score_authority: "rillcod", classwork_score: 80 },
    );
    expect(merged).toEqual({ score_authority: "rillcod", classwork_score: 80 });
    expect(merged.first_test_earned).toBeUndefined();
  });

  it("picks the class and course paper over a leftover course-only exam", () => {
    const ids = pickHostPaperExamIds(
      [
        {
          id: "old-first",
          metadata: { host_assessment: "first_test" },
          course_id: "course-1",
          created_at: "2026-01-01T00:00:00.000Z",
        },
        {
          id: "class-first",
          metadata: { host_assessment: "first_test" },
          class_id: "class-1",
          course_id: "course-1",
          created_at: "2026-01-02T00:00:00.000Z",
        },
        {
          id: "exam-1",
          title: "Coding Examination",
          class_id: "class-1",
          course_id: "course-1",
          created_at: "2026-01-03T00:00:00.000Z",
        },
      ],
      { classId: "class-1", courseId: "course-1" },
    );
    expect(ids).toEqual({
      first_test: "class-first",
      second_test: null,
      examination: "exam-1",
    });
  });

  it("fills a missing paper id from session fallback without replacing a class paper", () => {
    expect(
      mergeHostPaperExamIds(
        { first_test: "class-first", second_test: null, examination: null },
        { first_test: "session-first", second_test: "session-second", examination: null },
      ),
    ).toEqual({
      first_test: "class-first",
      second_test: "session-second",
      examination: null,
    });
  });

  it("recomputes an edited result instead of trusting a stale stored total", () => {
    const board = hostSchoolScoreboard({
      score_authority: "host_school",
      first_test_earned: 10,
      first_test_max: 20,
      second_test_earned: 15,
      second_test_max: 20,
      examination_earned: 45,
      examination_max: 60,
      host_total_earned: 95,
      host_total_max: 100,
    });
    expect(board?.total).toEqual({ earned: 70, max: 100, percent: 70 });
  });
});
