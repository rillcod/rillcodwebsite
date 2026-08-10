export type AttendanceDraftEntry = {
  status: string;
  notes: string;
};

export type SessionPattern = {
  id?: string;
  session_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  created_at?: string | null;
};

const ALLOWED_ATTENDANCE_STATUSES = new Set([
  "present",
  "absent",
  "late",
  "excused",
]);

function localDateValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normaliseTime(value?: string | null): string {
  const match = value?.match(/^(\d{2}):(\d{2})/);
  if (!match) return "";
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return "";
  return `${match[1]}:${match[2]}`;
}

function suggestedCurrentTime(now: Date): { start_time: string; end_time: string } {
  const roundedMinutes = Math.floor(now.getMinutes() / 15) * 15;
  const startMinutes = now.getHours() * 60 + roundedMinutes;
  const endMinutes = Math.min(startMinutes + 60, 23 * 60 + 59);
  const format = (minutes: number) =>
    `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

  return { start_time: format(startMinutes), end_time: format(endMinutes) };
}

export function buildSessionSuggestion(
  latestSession: SessionPattern | null | undefined,
  now = new Date(),
) {
  const previousStart = normaliseTime(latestSession?.start_time);
  const previousEnd = normaliseTime(latestSession?.end_time);
  const fallback = suggestedCurrentTime(now);
  const hasPreviousPattern = Boolean(previousStart && previousEnd);

  return {
    session_date: localDateValue(now),
    start_time: hasPreviousPattern ? previousStart : fallback.start_time,
    end_time: hasPreviousPattern ? previousEnd : fallback.end_time,
    topic: "",
    source: hasPreviousPattern ? ("recent-pattern" as const) : ("current-time" as const),
  };
}

export function reusePreviousAttendanceStatuses(
  studentIds: string[],
  previousRecords: Array<{ user_id: string; status: string }>,
  currentDraft: Record<string, AttendanceDraftEntry>,
) {
  const previousByStudent = new Map(
    previousRecords
      .filter((record) => ALLOWED_ATTENDANCE_STATUSES.has(record.status))
      .map((record) => [record.user_id, record.status]),
  );
  let applied = 0;
  const draft: Record<string, AttendanceDraftEntry> = {};

  for (const studentId of studentIds) {
    const current = currentDraft[studentId] ?? { status: "present", notes: "" };
    const previousStatus = previousByStudent.get(studentId);
    if (previousStatus) applied += 1;
    draft[studentId] = {
      status: previousStatus ?? current.status,
      // Notes describe a specific session and must never be copied forward.
      notes: current.notes,
    };
  }

  return { draft, applied };
}

export function sortSessionsNewestFirst<T extends SessionPattern>(sessions: T[]): T[] {
  return [...sessions].sort((left, right) => {
    const leftKey = `${left.session_date ?? ""}T${normaliseTime(left.start_time)}|${left.created_at ?? ""}`;
    const rightKey = `${right.session_date ?? ""}T${normaliseTime(right.start_time)}|${right.created_at ?? ""}`;
    return rightKey.localeCompare(leftKey);
  });
}
