import { describe, expect, it } from "vitest";
import { preparedWeekPackageFromWorkspace } from "./prepared-week-package";

describe("preparedWeekPackageFromWorkspace", () => {
  it("returns assets from the requested class meeting, not the first week match", () => {
    const data = {
      plan: { id: "plan-1" },
      lessons: [
        { id: "lesson-1", title: "Class 1", curriculum_week_number: 3, session_number: 1 },
        { id: "lesson-2", title: "Class 2", curriculum_week_number: 3, session_number: 2 },
      ],
      slide_decks: [
        { id: "slides-1", curriculum_week_number: 3, session_number: 1 },
        { id: "slides-2", curriculum_week_number: 3, session_number: 2 },
      ],
      flashcard_decks: [
        { id: "cards-1", curriculum_week_number: 3, session_number: 1 },
        { id: "cards-2", curriculum_week_number: 3, session_number: 2 },
      ],
      assignments: [
        { id: "homework-1", curriculum_week_number: 3, session_number: 1 },
        { id: "homework-2", curriculum_week_number: 3, session_number: 2 },
      ],
      projects: [
        { id: "project-1", curriculum_week_number: 3, session_number: 1 },
        { id: "project-2", curriculum_week_number: 3, session_number: 2 },
      ],
    };

    expect(
      preparedWeekPackageFromWorkspace({
        data,
        planId: "plan-1",
        week: 3,
        session: 2,
      })
    ).toMatchObject({
      lessonId: "lesson-2",
      slideDeckId: "slides-2",
      deckId: "cards-2",
      assignmentId: "homework-2",
      projectId: "project-2",
    });
  });

  it("uses metadata only as a compatibility fallback and defaults old rows to Class 1", () => {
    const data = {
      plan: { id: "plan-1" },
      lessons: [
        { id: "legacy", metadata: { week_number: 4 } },
        { id: "class-2", metadata: { week_number: 4, session: 2 } },
      ],
    };

    expect(
      preparedWeekPackageFromWorkspace({ data, planId: "plan-1", week: 4, session: 1 })
        ?.lessonId
    ).toBe("legacy");
    expect(
      preparedWeekPackageFromWorkspace({ data, planId: "plan-1", week: 4, session: 2 })
        ?.lessonId
    ).toBe("class-2");
  });

  it("rejects a response for another teaching plan", () => {
    expect(
      preparedWeekPackageFromWorkspace({
        data: { plan: { id: "plan-2" }, lessons: [] },
        planId: "plan-1",
        week: 1,
        session: 1,
      })
    ).toBeNull();
  });

  it("returns an empty package when the meeting exists but has no assets yet", () => {
    expect(
      preparedWeekPackageFromWorkspace({
        data: { plan: { id: "plan-1" }, lessons: [] },
        planId: "plan-1",
        week: 1,
        session: 1,
      })
    ).toEqual({});
  });
});
