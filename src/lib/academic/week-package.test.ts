import { describe, expect, it } from "vitest";
import {
  academicWeekNumber,
  assetMatchesMeeting,
  indexFirstByWeek,
  indexFirstByWeekSession,
  meetingKeysOf,
  existingMeetingAsset,
  shouldSkipExistingGeneratedAsset,
  keepPreparedMeetingContent,
  generatedLessonIsUsable,
  weekSessionLookupKey,
  weekPackagePrimaryAction,
  weekPackageStatus,
  buildWeekVisibility,
  weekVisibilitySummary,
  weekClassroomAction,
  lessonVisibility,
  flashcardVisibility,
} from "./week-package";

describe("academicWeekNumber", () => {
  it("prefers the canonical curriculum week column", () => {
    expect(
      academicWeekNumber({
        curriculum_week_number: 4,
        metadata: { week: 2 },
      })
    ).toBe(4);
  });

  it("keeps legacy generated content visible through metadata", () => {
    expect(academicWeekNumber({ metadata: { week_number: "7" } })).toBe(7);
  });

  it("rejects invalid week values", () => {
    expect(academicWeekNumber({ curriculum_week_number: 0 })).toBeNull();
    expect(academicWeekNumber({ metadata: { week: "later" } })).toBeNull();
  });
});

describe("indexFirstByWeek", () => {
  it("indexes canonical and legacy rows without replacing the first result", () => {
    const rows = [
      { id: "newest", curriculum_week_number: 2 },
      { id: "older", metadata: { week: 2 } },
      { id: "week-three", metadata: { week_number: 3 } },
    ];
    const index = indexFirstByWeek(rows);
    expect(index.get(2)?.id).toBe("newest");
    expect(index.get(3)?.id).toBe("week-three");
  });
});

describe("indexFirstByWeekSession", () => {
  it("keeps two sessions in the same calendar week distinct", () => {
    const rows = [
      {
        id: "s1",
        curriculum_week_number: 1,
        metadata: { session: 1 },
      },
      {
        id: "s2",
        curriculum_week_number: 1,
        metadata: { session: 2 },
      },
    ];
    const index = indexFirstByWeekSession(rows);
    expect(index.get(weekSessionLookupKey(1, 1))?.id).toBe("s1");
    expect(index.get(weekSessionLookupKey(1, 2))?.id).toBe("s2");
  });

  it("indexes a single-meeting school week as meeting 1", () => {
    const index = indexFirstByWeekSession([
      { id: "school", curriculum_week_number: 2 },
    ]);
    expect(index.get(weekSessionLookupKey(2, 1))?.id).toBe("school");
    expect(index.get(weekSessionLookupKey(2))?.id).toBe("school");
  });
});

describe("meetingKeysOf", () => {
  it("uses the curriculum week column, not a leftover syllabus week_number", () => {
    const keys = meetingKeysOf([
      {
        curriculum_week_number: 5,
        session_number: 1,
        metadata: { week_number: 1 },
      },
    ]);
    expect(keys.has(weekSessionLookupKey(5, 1))).toBe(true);
    expect(keys.has(weekSessionLookupKey(1, 1))).toBe(false);
  });
});

describe("intelligent skip for a class meeting", () => {
  it("finds the row for this meeting, not another week's leftover week_number", () => {
    const rows = [
      {
        id: "wrong-week",
        curriculum_week_number: 5,
        session_number: 1,
        metadata: { week_number: 1 },
      },
      { id: "this-week", curriculum_week_number: 1, session_number: 1 },
    ];
    expect(existingMeetingAsset(rows, 1, 1)?.id).toBe("this-week");
    expect(existingMeetingAsset(rows, 5, 1)?.id).toBe("wrong-week");
  });

  it("keeps a healthy row, rebuilds stale derived content, and never skips a regenerate", () => {
    expect(
      shouldSkipExistingGeneratedAsset({ content_stale_at: null }),
    ).toBe(true);
    expect(
      shouldSkipExistingGeneratedAsset({
        content_stale_at: "2026-08-20T00:00:00Z",
      }),
    ).toBe(false);
    expect(
      shouldSkipExistingGeneratedAsset({
        content_stale_at: "2026-08-20T00:00:00Z",
        metadata: { is_customized: true },
      }),
    ).toBe(true);
    expect(
      shouldSkipExistingGeneratedAsset(
        { content_stale_at: null },
        { regenerate: true },
      ),
    ).toBe(false);
  });

  it("is the skip door every generator uses for a named meeting", () => {
    const rows = [
      { id: "keep", curriculum_week_number: 2, session_number: 1 },
      {
        id: "stale",
        curriculum_week_number: 2,
        session_number: 2,
        content_stale_at: "2026-08-20T00:00:00Z",
      },
    ];
    expect(keepPreparedMeetingContent(rows, 2, 1)?.id).toBe("keep");
    expect(keepPreparedMeetingContent(rows, 2, 2)).toBeUndefined();
    expect(keepPreparedMeetingContent(rows, 9, 1)).toBeUndefined();
    expect(
      keepPreparedMeetingContent(rows, 2, 1, {
        usable: () => false,
      }),
    ).toBeUndefined();
    expect(
      keepPreparedMeetingContent(rows, 2, 1, { regenerate: true }),
    ).toBeUndefined();
  });
});

describe("generatedLessonIsUsable", () => {
  it("keeps identity-only rows so skip checks that did not load the body still work", () => {
    expect(
      generatedLessonIsUsable({ id: "l", curriculum_week_number: 1 }),
    ).toBe(true);
  });

  it("rejects a title-only shell the teacher would see as an empty week", () => {
    expect(
      generatedLessonIsUsable({
        id: "empty",
        title: "Week 1",
        description: "",
        lesson_notes: "",
        content: "",
        content_layout: [],
      }),
    ).toBe(false);
  });

  it("accepts a lesson whose body lives in notes or layout", () => {
    expect(
      generatedLessonIsUsable({
        description: "Students write a Scratch sprite that moves on the stage.",
        content_layout: [],
      }),
    ).toBe(true);
    expect(
      generatedLessonIsUsable({
        content_layout: [{ title: "Warm up", content: "Move the sprite." }],
      }),
    ).toBe(true);
  });
});

describe("assetMatchesMeeting", () => {
  it("uses the same week + class-meeting identity as the workspace index", () => {
    const class2 = {
      id: "s2",
      curriculum_week_number: 3,
      session_number: 2,
    };
    expect(assetMatchesMeeting(class2, 3, 2)).toBe(true);
    expect(assetMatchesMeeting(class2, 3, 1)).toBe(false);
    expect(assetMatchesMeeting({ metadata: { week_number: 3 } }, 3, 1)).toBe(
      true
    );
  });
});

describe("weekPackageStatus", () => {
  const partial = {
    lesson: true,
    slides: false,
    flashcards: true,
    assignment: false,
    project: true,
  };

  it("shows exactly what is ready and missing", () => {
    expect(weekPackageStatus(partial)).toMatchObject({
      readyCount: 3,
      totalCount: 5,
      complete: false,
      missing: ["slides", "assignment"],
    });
    expect(weekPackagePrimaryAction(partial)).toBe("prepare");
  });

  it("moves a complete package to review", () => {
    expect(
      weekPackagePrimaryAction({ ...partial, slides: true, assignment: true })
    ).toBe("review");
  });
});

describe("visibility", () => {
  it("treats draft lessons and inactive homework as held", () => {
    expect(lessonVisibility({ status: "draft" })).toBe("held");
    expect(lessonVisibility({ status: "active" })).toBe("live");
    expect(flashcardVisibility({ is_public: false })).toBe("held");
    expect(flashcardVisibility({ is_public: true })).toBe("live");
    expect(flashcardVisibility({ is_public: null })).toBe("live");
  });

  it("needs release when assets exist but students cannot see them", () => {
    const visibility = buildWeekVisibility({
      lesson: { status: "draft" },
      slides: { id: "s1" },
      flashcards: { is_public: false },
      assignment: { is_active: false },
      project: { is_active: false },
    });
    const summary = weekVisibilitySummary(visibility);
    expect(summary.needsRelease).toBe(true);
    expect(summary.fullyLive).toBe(false);
    expect(summary.heldCount).toBe(5);
  });

  it("keeps a private slide deck held even when its lesson is live", () => {
    const visibility = buildWeekVisibility({
      lesson: { status: "active" },
      slides: { is_public: false },
    });
    expect(visibility.lesson).toBe("live");
    expect(visibility.slides).toBe("held");
  });

  it("orders classroom actions prepare → release → teach → done", () => {
    const presence = {
      lesson: true,
      slides: true,
      flashcards: true,
      assignment: true,
      project: true,
    };
    const held = buildWeekVisibility({
      lesson: { status: "draft" },
      slides: {},
      flashcards: { is_public: false },
      assignment: { is_active: false },
      project: { is_active: false },
    });
    expect(weekClassroomAction({ presence, visibility: held })).toBe("release");

    const live = buildWeekVisibility({
      lesson: { status: "active" },
      slides: {},
      flashcards: { is_public: true },
      assignment: { is_active: true },
      project: { is_active: true },
    });
    expect(weekClassroomAction({ presence, visibility: live })).toBe("teach");
    expect(
      weekClassroomAction({ presence, visibility: live, taught: true })
    ).toBe("done");
  });
});
