import { normalizeMeetingSession } from "@/lib/academic/session-identity";

type DbClient = {
  from: (table: string) => any;
  rpc: (name: string, args: Record<string, unknown>) => Promise<{
    data: unknown;
    error: { message: string } | null;
  }>;
};

export type LiveTeachingLink = {
  classId: string;
  courseId: string;
  lessonPlanId: string;
  lessonId: string | null;
  week: number;
  session: number;
};

export function parseLiveTeachingLink(notes: unknown): LiveTeachingLink | null {
  if (typeof notes !== "string" || !notes.trim()) return null;
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(notes) as Record<string, unknown>;
  } catch {
    return null;
  }

  const classId =
    typeof parsed.class_id === "string" ? parsed.class_id.trim() : "";
  const courseId =
    typeof parsed.course_id === "string" ? parsed.course_id.trim() : "";
  const lessonPlanId =
    typeof parsed.lesson_plan_id === "string"
      ? parsed.lesson_plan_id.trim()
      : "";
  const lessonId =
    typeof parsed.lesson_id === "string" && parsed.lesson_id.trim()
      ? parsed.lesson_id.trim()
      : null;
  const week = Number(parsed.week);
  if (
    !classId ||
    !courseId ||
    !lessonPlanId ||
    !Number.isInteger(week) ||
    week < 1 ||
    week > 53
  ) {
    return null;
  }

  return {
    classId,
    courseId,
    lessonPlanId,
    lessonId,
    week,
    session: normalizeMeetingSession(parsed.session) ?? 1,
  };
}

export type LiveDeliveryAutomationResult =
  | { status: "not_linked" }
  | { status: "no_student_attendance" }
  | { status: "recorded"; delivery: unknown }
  | { status: "failed"; error: string };

/**
 * Completion alone is not proof that teaching happened. Record delivery only
 * for a workspace-linked session that has at least one learner attendance row.
 */
export async function recordCompletedLiveTeaching(input: {
  db: DbClient;
  liveSessionId: string;
  notes: unknown;
  actorId: string;
}): Promise<LiveDeliveryAutomationResult> {
  const link = parseLiveTeachingLink(input.notes);
  if (!link) return { status: "not_linked" };

  const { data: attendance, error: attendanceError } = await input.db
    .from("live_session_attendance")
    .select(
      "portal_user_id,portal_users!live_session_attendance_portal_user_id_fkey(role)"
    )
    .eq("session_id", input.liveSessionId);
  if (attendanceError) {
    return { status: "failed", error: attendanceError.message };
  }

  const hasStudent = (attendance ?? []).some((row: any) => {
    const person = Array.isArray(row.portal_users)
      ? row.portal_users[0]
      : row.portal_users;
    return person?.role === "student";
  });
  if (!hasStudent) return { status: "no_student_attendance" };

  const { data, error } = await input.db.rpc("record_class_lesson_delivery", {
    p_lesson_plan_id: link.lessonPlanId,
    p_week_number: link.week,
    p_lesson_id: link.lessonId,
    p_status: "delivered",
    p_actor_id: input.actorId,
    p_notes: `Automatically recorded from completed live session ${input.liveSessionId}`,
    p_class_session_id: null,
    p_session_number: link.session,
  });
  if (error) return { status: "failed", error: error.message };
  return { status: "recorded", delivery: data };
}
