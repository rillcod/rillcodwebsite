import { describe, expect, it } from "vitest";
import {
  learnerMatchesLessonClass,
  slideDeckMayStream,
} from "./learner-content-access";

describe("slideDeckMayStream", () => {
  it("requires both a released lesson and a released deck for learners", () => {
    expect(
      slideDeckMayStream({ role: "student", lessonStatus: "active", isPublic: true })
    ).toBe(true);
    expect(
      slideDeckMayStream({ role: "student", lessonStatus: "draft", isPublic: true })
    ).toBe(false);
    expect(
      slideDeckMayStream({ role: "student", lessonStatus: "active", isPublic: false })
    ).toBe(false);
    expect(
      slideDeckMayStream({ role: "student", lessonStatus: "active", isPublic: null })
    ).toBe(false);
  });

  it("lets staff review held content without publishing it", () => {
    for (const role of ["admin", "teacher", "school"]) {
      expect(
        slideDeckMayStream({ role, lessonStatus: "draft", isPublic: false })
      ).toBe(true);
    }
  });
});

describe("learnerMatchesLessonClass", () => {
  it("keeps class-bound content inside its exact class", () => {
    expect(
      learnerMatchesLessonClass({
        role: "student",
        learnerClassId: "class-1",
        lessonClassId: "class-1",
      })
    ).toBe(true);
    expect(
      learnerMatchesLessonClass({
        role: "student",
        learnerClassId: "class-2",
        lessonClassId: "class-1",
      })
    ).toBe(false);
  });

  it("does not invent a class restriction for programme-wide content", () => {
    expect(
      learnerMatchesLessonClass({
        role: "student",
        learnerClassId: "class-2",
        lessonClassId: null,
      })
    ).toBe(true);
  });
});
