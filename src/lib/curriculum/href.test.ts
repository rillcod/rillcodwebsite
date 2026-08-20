import { describe, expect, it } from "vitest";
import {
  buildCertifyHref,
  buildClassTeachingHref,
  buildCurriculumHref,
  buildDistributeHref,
  buildFlashcardsHref,
  buildGradesHref,
  buildAttendanceHref,
  buildLessonNewHref,
  buildResultsHref,
  mergeAssetLaneHref,
  pickAssetLaneQuery,
} from "./href";

describe("curriculum href helpers", () => {
  it("builds canonical curriculum links", () => {
    expect(buildCurriculumHref({ courseId: "c1", programId: "p1" })).toBe(
      "/dashboard/academic/build?course=c1&program=p1"
    );
  });

  it("builds academic stage links with context", () => {
    expect(buildCertifyHref({ curriculumId: "cur1", courseId: "c1" })).toBe(
      "/dashboard/academic/rollout?curriculum_id=cur1&course_id=c1"
    );
    expect(buildDistributeHref({ courseId: "c1" })).toBe(
      "/dashboard/academic/rollout?course_id=c1"
    );
  });

  it("builds class teaching and delivery tool links", () => {
    expect(buildClassTeachingHref({ classId: "cl1", courseId: "c1" })).toBe(
      "/dashboard/classes/cl1?operation=teaching&course_id=c1"
    );
    const lessonHref = buildLessonNewHref({
      classId: "cl1",
      courseId: "c1",
      lessonPlanId: "lp1",
      curriculumId: "cur1",
      week: 4,
      topic: "Loops",
      plan: { objectives: ["Explain repetition"] },
    });
    const lessonUrl = new URL(lessonHref, "https://example.com");
    expect(lessonUrl.pathname).toBe("/dashboard/lessons/add");
    expect(lessonUrl.searchParams.get("class_id")).toBe("cl1");
    expect(lessonUrl.searchParams.get("lesson_plan_id")).toBe("lp1");
    expect(lessonUrl.searchParams.get("week")).toBe("4");
    expect(lessonUrl.searchParams.get("source")).toBe("curriculum");

    expect(
      buildFlashcardsHref({
        deckId: "d1",
        classId: "cl1",
        courseId: "c1",
        topic: "Week 1",
      })
    ).toContain("return_class_id=cl1");
    expect(buildGradesHref({ classId: "cl1", courseId: "c1" })).toBe(
      "/dashboard/grades?class_id=cl1&course_id=c1"
    );
    expect(
      buildAttendanceHref({
        classId: "cl1",
        week: 3,
        session: 1,
        topic: "Week 3: Loops",
      })
    ).toBe(
      "/dashboard/attendance?class_id=cl1&week=3&session=1&topic=Week+3%3A+Loops"
    );
    expect(
      buildAttendanceHref({
        classId: "cl1",
        week: 3,
        session: 2,
        sessionId: "sess-1",
        topic: "Week 3 · Class 2: Loops",
      })
    ).toBe(
      "/dashboard/attendance?class_id=cl1&week=3&session=2&session_id=sess-1&topic=Week+3+%C2%B7+Class+2%3A+Loops"
    );
    expect(buildResultsHref({ classId: "cl1", courseId: "c1" })).toBe(
      "/dashboard/academic/results?class_id=cl1&course_id=c1"
    );
  });

  it("preserves asset lane query across steps", () => {
    const query = pickAssetLaneQuery("curriculum_id=cur1&course_id=c1&noise=1");
    expect(query.toString()).toBe("curriculum_id=cur1&course_id=c1");
    expect(mergeAssetLaneHref("/dashboard/academic/rollout", query)).toBe(
      "/dashboard/academic/rollout?curriculum_id=cur1&course_id=c1"
    );
  });
});
