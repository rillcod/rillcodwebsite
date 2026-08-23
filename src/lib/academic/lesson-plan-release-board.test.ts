import { describe, expect, it } from "vitest";
import { buildLessonPlanReleaseBoard } from "./lesson-plan-release-board";

describe("lesson plan release board", () => {
  it("keeps the five package assets in their correct columns", () => {
    const [row] = buildLessonPlanReleaseBoard({
      planWeeks: [{ week: 2, session: 1, topic: "Robotics" }],
      lessons: [{ curriculum_week_number: 2, session_number: 1, status: "active" }],
      slideDecks: [{ curriculum_week_number: 2, session_number: 1, is_public: true }],
      flashcardDecks: [{ curriculum_week_number: 2, session_number: 1, is_public: false }],
      assignments: [{ curriculum_week_number: 2, session_number: 1, is_active: true }],
      projects: [{ curriculum_week_number: 2, session_number: 1, is_active: false }],
    });

    expect(row).toMatchObject({
      prepared_count: 5,
      lessons_published: 1,
      assignments_active: 1,
      projects_active: 0,
      slides_public: 1,
      flashcards_public: 0,
      release_status: "partial",
      held_assets: ["flashcards", "project"],
    });
  });

  it("does not merge separate class meetings in one week", () => {
    const rows = buildLessonPlanReleaseBoard({
      planWeeks: [
        { week: 1, session: 1, syllabus_ref: { year_number: 1, term_number: 2 } },
        { week: 1, session: 2, syllabus_ref: { year_number: 1, term_number: 2 } },
      ],
      lessons: [
        { curriculum_week_number: 1, session_number: 1, status: "active" },
        { curriculum_week_number: 1, session_number: 2, status: "draft" },
      ],
    });

    expect(rows.map((row) => row.key)).toEqual(["y1t2w1s1", "y1t2w1s2"]);
    expect(rows.map((row) => row.lessons_published)).toEqual([1, 0]);
  });

  it("does not merge the same week number across different terms", () => {
    const rows = buildLessonPlanReleaseBoard({
      planWeeks: [
        { week: 1, syllabus_ref: { year_number: 1, term_number: 1 } },
        { week: 1, syllabus_ref: { year_number: 1, term_number: 2 } },
      ],
      lessons: [
        {
          curriculum_week_number: 1,
          status: "active",
          metadata: { week_number: 1, year_number: 1, term_number: 2 },
        },
      ],
    });

    expect(rows.map((row) => row.key)).toEqual(["y1t1w1s1", "y1t2w1s1"]);
    expect(rows.map((row) => row.lessons_total)).toEqual([0, 1]);
  });

  it("holds a private slide deck even when its lesson is live", () => {
    const [row] = buildLessonPlanReleaseBoard({
      planWeeks: [{ week: 1 }],
      lessons: [{ curriculum_week_number: 1, status: "active" }],
      slideDecks: [{ curriculum_week_number: 1, is_public: false }],
    });

    expect(row.slides_public).toBe(0);
    expect(row.held_assets).toContain("slides");
  });
});
