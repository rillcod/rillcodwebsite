import { describe, expect, it } from "vitest";
import {
  copyableMeetingKeysFromSources,
  decideSweepTargets,
  describeGenerationSkip,
  meetingSeedKey,
  orderPlansForSweep,
  planMeetingsForSweep,
  shouldStampSweepRun,
  siblingLessonCanBeCopied,
  sweepMeetingCap,
  titlesAlreadyTaughtThisWeek,
} from "./generation-ops";
import { listPlanMeetings } from "./auto-generate-settings";
import { meetingContinuityInstruction } from "./session-identity";

describe("sweepMeetingCap", () => {
  it("keeps one meeting when this class still needs a fresh AI write", () => {
    expect(sweepMeetingCap({ configuredCap: 1, canCopy: false })).toBe(1);
    expect(sweepMeetingCap({ configuredCap: 0, canCopy: false })).toBe(1);
  });

  it("drains several copyable meetings in the same hour", () => {
    expect(sweepMeetingCap({ configuredCap: 1, canCopy: true })).toBe(4);
    expect(sweepMeetingCap({ configuredCap: 0, canCopy: true })).toBe(6);
  });
});

describe("describeGenerationSkip", () => {
  it("does not call leftover empty weeks already prepared", () => {
    expect(
      describeGenerationSkip({ code: "all_prepared", termHasStarted: true }),
    ).toMatch(/later weeks wait/i);
    expect(
      describeGenerationSkip({ code: "all_prepared", termHasStarted: false }),
    ).toMatch(/published plan/i);
  });
});

describe("shouldStampSweepRun", () => {
  it("stamps only work and all-prepared, never calendar waits", () => {
    expect(shouldStampSweepRun("worked")).toBe(true);
    expect(shouldStampSweepRun("all_prepared")).toBe(true);
    expect(shouldStampSweepRun("waiting_for_module")).toBe(false);
    expect(shouldStampSweepRun("host_calendar")).toBe(false);
  });
});

describe("orderPlansForSweep", () => {
  it("groups a curriculum so the first class writes and later ones can copy", () => {
    const ordered = orderPlansForSweep([
      { id: "b", releaseId: "rel", lastRunAt: 2, calendarReady: true },
      { id: "a", releaseId: "rel", lastRunAt: 1, calendarReady: true },
      { id: "blocked", releaseId: "rel", lastRunAt: 0, calendarReady: false },
    ]);
    expect(ordered.map((p) => p.id)).toEqual(["a", "b", "blocked"]);
  });
});

describe("planMeetingsForSweep", () => {
  it("expands a twice-a-week school into Class 1 then Class 2", () => {
    expect(
      planMeetingsForSweep({
        planWeeks: [{ week: 1, topic: "Loops" }, { week: 2, topic: "Lists" }],
        sessionsPerWeek: 2,
      }),
    ).toEqual([
      { week: 1, session: 1 },
      { week: 1, session: 2 },
      { week: 2, session: 1 },
      { week: 2, session: 2 },
    ]);
  });
});

describe("siblingLessonCanBeCopied", () => {
  it("copies only a usable lesson from another plan on the same release", () => {
    expect(
      siblingLessonCanBeCopied({
        releaseId: "rel",
        week: 2,
        session: 1,
        targetPlanId: "plan-b",
        candidates: [
          {
            id: "src",
            curriculum_release_id: "rel",
            curriculum_week_number: 2,
            session_number: 1,
            lesson_plan_id: "plan-a",
            metadata: {},
            description: "A full lesson the second class can copy.",
          },
        ],
      }),
    ).toBe(true);
    expect(
      siblingLessonCanBeCopied({
        releaseId: "rel",
        week: 2,
        session: 1,
        targetPlanId: "plan-b",
        candidates: [
          {
            id: "empty",
            curriculum_release_id: "rel",
            curriculum_week_number: 2,
            session_number: 1,
            lesson_plan_id: "plan-a",
            metadata: {},
            description: "",
            content_layout: [],
          },
        ],
      }),
    ).toBe(false);
  });

  it("never treats Class 2 as a source for Class 1", () => {
    expect(
      siblingLessonCanBeCopied({
        releaseId: "rel",
        week: 1,
        session: 1,
        targetPlanId: "plan-b",
        candidates: [
          {
            id: "class-2",
            curriculum_release_id: "rel",
            curriculum_week_number: 1,
            session_number: 2,
            lesson_plan_id: "plan-a",
            metadata: {},
            description: "Class 2 practice — must not seed Class 1.",
          },
        ],
      }),
    ).toBe(false);
  });
});

describe("decideSweepTargets", () => {
  it("writes one AI meeting, then several when a sibling can be copied", () => {
    const meetings = listPlanMeetings([
      { week: 1, session: 1 },
      { week: 2, session: 1 },
      { week: 3, session: 1 },
    ]);
    expect(
      decideSweepTargets({
        meetings,
        eligibleWeeks: [1, 2, 3],
        completedKeys: [],
        configuredCap: 1,
        canCopy: false,
      }),
    ).toEqual([{ week: 1, session: 1 }]);
    expect(
      decideSweepTargets({
        meetings,
        eligibleWeeks: [1, 2, 3],
        completedKeys: [],
        configuredCap: 1,
        canCopy: true,
      }).map((m) => m.week),
    ).toEqual([1, 2, 3]);
  });

  it("prepares Class 2 after Class 1, and does not skip ahead", () => {
    const meetings = planMeetingsForSweep({
      planWeeks: [{ week: 1, topic: "A" }, { week: 2, topic: "B" }],
      sessionsPerWeek: 2,
    });
    expect(
      decideSweepTargets({
        meetings,
        eligibleWeeks: [1, 2],
        completedKeys: ["1:s1"],
        configuredCap: 1,
        canCopy: false,
      }),
    ).toEqual([{ week: 1, session: 2 }]);
  });

  it("stops a copy drain before an AI-only meeting", () => {
    const meetings = listPlanMeetings([
      { week: 1, session: 1 },
      { week: 1, session: 2 },
      { week: 2, session: 1 },
    ]);
    expect(
      decideSweepTargets({
        meetings,
        eligibleWeeks: [1, 2],
        completedKeys: [],
        configuredCap: 6,
        canCopy: true,
        copyableMeetingKeys: ["1:s1", "1:s2"],
      }),
    ).toEqual([
      { week: 1, session: 1 },
      { week: 1, session: 2 },
    ]);
  });
});

describe("copyableMeetingKeysFromSources", () => {
  it("lets Class 2 copy from a sibling or from this hour's seed", () => {
    expect(
      copyableMeetingKeysFromSources({
        meetings: [
          { week: 1, session: 1 },
          { week: 1, session: 2 },
        ],
        releaseId: "rel",
        targetPlanId: "plan-b",
        siblings: [
          {
            id: "src",
            curriculum_release_id: "rel",
            curriculum_week_number: 1,
            session_number: 2,
            lesson_plan_id: "plan-a",
            metadata: {},
            description: "Usable Class 2 package with enough teaching body text.",
          },
        ],
        writtenThisRun: ["rel:1:s1"],
      }),
    ).toEqual(["1:s1", "1:s2"]);
  });
});

describe("titlesAlreadyTaughtThisWeek", () => {
  it("feeds Class 2 the titles Class 1 already taught", () => {
    expect(
      titlesAlreadyTaughtThisWeek({
        week: 1,
        session: 2,
        lessons: [
          {
            curriculum_week_number: 1,
            session_number: 1,
            title: "Loops with Chioma",
            description: "A full Class 1 body that meets the usable quality floor",
          },
          {
            curriculum_week_number: 1,
            session_number: 2,
            title: "Should ignore same meeting",
            description:
              "Another meeting body long enough to count as a prepared lesson",
          },
        ],
      }),
    ).toEqual(["Loops with Chioma"]);
  });
});

describe("meetingContinuityInstruction", () => {
  it("keeps Class 2 unique from Class 1", () => {
    expect(
      meetingContinuityInstruction({
        week: 3,
        session: 2,
        meetingsThisWeek: 2,
        alreadyTaughtThisWeek: ["Variables"],
      }),
    ).toMatch(/do not reuse/i);
    expect(
      meetingContinuityInstruction({
        week: 3,
        session: 1,
        meetingsThisWeek: 1,
      }),
    ).toBe("");
  });
});

describe("meetingSeedKey", () => {
  it("keeps Class 1 and Class 2 as separate seeds", () => {
    expect(meetingSeedKey("rel", 1, 1)).toBe("rel:1:s1");
    expect(meetingSeedKey("rel", 1, 2)).toBe("rel:1:s2");
    expect(meetingSeedKey(null, 1, 1)).toBeNull();
  });
});
