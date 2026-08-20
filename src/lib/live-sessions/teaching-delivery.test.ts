import { describe, expect, it, vi } from "vitest";
import {
  parseLiveTeachingLink,
  recordCompletedLiveTeaching,
} from "./teaching-delivery";

describe("live teaching links", () => {
  it("reads the workspace link and preserves meeting identity", () => {
    expect(
      parseLiveTeachingLink(
        JSON.stringify({
          class_id: "class-1",
          course_id: "course-1",
          lesson_plan_id: "plan-1",
          lesson_id: "lesson-1",
          week: 4,
          session: 2,
        })
      )
    ).toEqual({
      classId: "class-1",
      courseId: "course-1",
      lessonPlanId: "plan-1",
      lessonId: "lesson-1",
      week: 4,
      session: 2,
    });
  });

  it("rejects free-form notes and incomplete links", () => {
    expect(parseLiveTeachingLink("revision class")).toBeNull();
    expect(
      parseLiveTeachingLink(JSON.stringify({ class_id: "class-1", week: 1 }))
    ).toBeNull();
  });
});

function fakeDb(attendance: Array<Record<string, unknown>>) {
  const rpc = vi.fn().mockResolvedValue({ data: { id: "delivery" }, error: null });
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn().mockResolvedValue({ data: attendance, error: null }),
  };
  return {
    db: {
      from: vi.fn(() => query),
      rpc,
    },
    rpc,
  };
}

describe("completed live session delivery automation", () => {
  const notes = JSON.stringify({
    class_id: "class-1",
    course_id: "course-1",
    lesson_plan_id: "plan-1",
    lesson_id: "lesson-1",
    week: 4,
    session: 2,
  });

  it("records delivery only when a learner attended", async () => {
    const fake = fakeDb([
      { portal_user_id: "teacher", portal_users: { role: "teacher" } },
      { portal_user_id: "student", portal_users: { role: "student" } },
    ]);
    const result = await recordCompletedLiveTeaching({
      db: fake.db as never,
      liveSessionId: "live-1",
      notes,
      actorId: "teacher",
    });

    expect(result.status).toBe("recorded");
    expect(fake.rpc).toHaveBeenCalledWith(
      "record_class_lesson_delivery",
      expect.objectContaining({
        p_lesson_plan_id: "plan-1",
        p_week_number: 4,
        p_session_number: 2,
        p_status: "delivered",
      })
    );
  });

  it("leaves the slot unresolved when only staff attended", async () => {
    const fake = fakeDb([
      { portal_user_id: "teacher", portal_users: { role: "teacher" } },
    ]);
    const result = await recordCompletedLiveTeaching({
      db: fake.db as never,
      liveSessionId: "live-1",
      notes,
      actorId: "teacher",
    });

    expect(result).toEqual({ status: "no_student_attendance" });
    expect(fake.rpc).not.toHaveBeenCalled();
  });
});
