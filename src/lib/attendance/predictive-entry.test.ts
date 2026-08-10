import { describe, expect, it } from "vitest";
import {
  buildSessionSuggestion,
  reusePreviousAttendanceStatuses,
  sortSessionsNewestFirst,
} from "./predictive-entry";

describe("predictive attendance entry", () => {
  it("reuses a valid recent session time without copying its topic", () => {
    const suggestion = buildSessionSuggestion(
      { start_time: "09:30:00", end_time: "10:45:00" },
      new Date(2026, 7, 10, 14, 8),
    );

    expect(suggestion).toEqual({
      session_date: "2026-08-10",
      start_time: "09:30",
      end_time: "10:45",
      topic: "",
      source: "recent-pattern",
    });
  });

  it("falls back to a rounded one-hour draft when no pattern exists", () => {
    const suggestion = buildSessionSuggestion(null, new Date(2026, 7, 10, 14, 8));

    expect(suggestion.start_time).toBe("14:00");
    expect(suggestion.end_time).toBe("15:00");
    expect(suggestion.source).toBe("current-time");
  });

  it("copies only recognised statuses and preserves current notes", () => {
    const current = {
      learnerA: { status: "present", notes: "Current medical note" },
      learnerB: { status: "late", notes: "" },
      learnerC: { status: "present", notes: "" },
    };
    const result = reusePreviousAttendanceStatuses(
      ["learnerA", "learnerB", "learnerC"],
      [
        { user_id: "learnerA", status: "absent" },
        { user_id: "learnerB", status: "invalid" },
      ],
      current,
    );

    expect(result.applied).toBe(1);
    expect(result.draft).toEqual({
      learnerA: { status: "absent", notes: "Current medical note" },
      learnerB: { status: "late", notes: "" },
      learnerC: { status: "present", notes: "" },
    });
    expect(current.learnerA.status).toBe("present");
  });

  it("keeps custom past sessions in chronological order without mutating state", () => {
    const sessions = [
      { id: "latest", session_date: "2026-08-10", start_time: "09:00" },
      { id: "oldest", session_date: "2026-08-01", start_time: "11:00" },
    ];

    const result = sortSessionsNewestFirst([
      ...sessions,
      { id: "middle", session_date: "2026-08-05", start_time: "10:00" },
    ]);

    expect(result.map((session) => session.id)).toEqual(["latest", "middle", "oldest"]);
    expect(sessions.map((session) => session.id)).toEqual(["latest", "oldest"]);
  });
});
