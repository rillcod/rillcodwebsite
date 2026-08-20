import { describe, expect, it } from "vitest";
import {
  buildTeachingWeekRows,
  parseTeachingTargets,
  teachingSlotNeedsAttention,
} from "./teaching-workspace";

describe("teaching workspace week rows", () => {
  it("keeps meetings in one calendar week independent", () => {
    const rows = buildTeachingWeekRows({
      planWeeks: [
        { week: 1, session: 1, topic: "Foundations" },
        { week: 1, session: 2, topic: "Practice" },
      ],
      lessons: [
        {
          id: "lesson-1",
          title: "Foundations",
          curriculum_week_number: 1,
          status: "active",
          metadata: { session: 1 },
        },
        {
          id: "lesson-2",
          title: "Practice",
          curriculum_week_number: 1,
          status: "draft",
          metadata: { session: 2 },
        },
      ],
      deliveries: [
        {
          week_number: 1,
          session_number: 1,
          status: "delivered",
        },
        {
          week_number: 1,
          session_number: 2,
          status: "planned",
        },
      ],
    });

    expect(rows.map((row) => row.rowKey)).toEqual(["1:s1", "1:s2"]);
    expect(rows[0].lesson?.id).toBe("lesson-1");
    expect(rows[0].taught).toBe(true);
    expect(rows[1].lesson?.id).toBe("lesson-2");
    expect(rows[1].taught).toBe(false);
  });

  it("returns one shared readiness, visibility and provenance verdict", () => {
    const [row] = buildTeachingWeekRows({
      planWeeks: [{ week: 2, topic: "Robotics" }],
      lessons: [
        {
          id: "lesson",
          curriculum_week_number: 2,
          status: "active",
          shared_master_id: "master",
        },
      ],
      assignments: [
        {
          curriculum_week_number: 2,
          is_active: true,
          metadata: { is_customized: true },
        },
      ],
      projects: [{ curriculum_week_number: 2, is_active: false }],
      slideDecks: [
        {
          curriculum_week_number: 2,
          content_stale_at: "2026-08-20T08:00:00Z",
        },
      ],
      flashcardDecks: [
        { curriculum_week_number: 2, is_public: false },
      ],
      exams: [{ curriculum_week_number: 2, is_active: false }],
    });

    expect(row.packageStatus.complete).toBe(true);
    expect(row.visibilitySummary.held).toEqual([
      "flashcards",
      "project",
    ]);
    expect(row.provenance).toEqual({
      shared: true,
      customized: true,
      staleDerived: true,
    });
    expect(row.evaluationStatus).toBe("held");
    expect(row.recommendedAction).toBe("refresh");
    expect(teachingSlotNeedsAttention(row)).toBe(true);
  });

  it("does not treat a held CBT as an incomplete teaching package", () => {
    const [row] = buildTeachingWeekRows({
      planWeeks: [{ week: 1, topic: "Ready week" }],
      lessons: [{ id: "l", curriculum_week_number: 1, status: "active" }],
      assignments: [{ curriculum_week_number: 1, is_active: true }],
      projects: [{ curriculum_week_number: 1, is_active: true }],
      slideDecks: [{ curriculum_week_number: 1 }],
      flashcardDecks: [{ curriculum_week_number: 1, is_public: true }],
      exams: [{ curriculum_week_number: 1, is_active: false }],
      deliveries: [{ week_number: 1, status: "delivered" }],
    });
    expect(row.packageStatus.complete).toBe(true);
    expect(row.evaluationStatus).toBe("held");
    expect(row.recommendedAction).toBe("review_assessment");
  });
});

describe("parseTeachingTargets", () => {
  it("keeps week and meeting together", () => {
    expect(
      parseTeachingTargets({
        targets: [
          { week_number: 1, session: 1 },
          { week_number: 1, session: 2 },
        ],
      })
    ).toEqual([
      { week: 1, session: 1 },
      { week: 1, session: 2 },
    ]);
  });

  it("accepts the older week_numbers list as unscoped meetings", () => {
    expect(parseTeachingTargets({ week_numbers: [2, 2, 3] })).toEqual([
      { week: 2, session: null },
      { week: 3, session: null },
    ]);
  });

  it("drops unusable weeks", () => {
    expect(
      parseTeachingTargets({
        targets: [{ week_number: 0 }, { week_number: 99 }, { week_number: 4 }],
      })
    ).toEqual([{ week: 4, session: null }]);
  });
});
