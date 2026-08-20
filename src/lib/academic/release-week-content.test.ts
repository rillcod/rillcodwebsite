import { describe, expect, it } from "vitest";
import {
  matchesReleaseSession,
  resolveEffectiveReleaseSession,
} from "./release-week-content";
import { assetMeetingSession } from "./session-identity";

describe("asset meeting identity", () => {
  it("reads the session_number column first", () => {
    expect(
      assetMeetingSession({
        session_number: 2,
        metadata: { session: 9 },
        title: "Session 1: x",
      })
    ).toBe(2);
  });

  it("ignores Session N in titles", () => {
    expect(
      assetMeetingSession({ title: "Week 1 · Session 3: Flashcards" })
    ).toBe(1);
  });

  it("treats untagged school assets as Class 1", () => {
    expect(assetMeetingSession({ title: "Week 1 homework" })).toBe(1);
  });
});

describe("resolveEffectiveReleaseSession", () => {
  it("treats untagged school weeks as Class 1", () => {
    expect(
      resolveEffectiveReleaseSession(
        [{ title: "Lesson" }, { title: "Homework" }],
        null
      )
    ).toBe(1);
  });

  it("infers the only class meeting for 1-class special programmes", () => {
    expect(
      resolveEffectiveReleaseSession(
        [
          { metadata: { session: 1 } },
          { metadata: { session: 1 }, title: "Homework" },
        ],
        null
      )
    ).toBe(1);
  });

  it("refuses to guess when two class meetings are held", () => {
    expect(
      resolveEffectiveReleaseSession(
        [{ metadata: { session: 1 } }, { metadata: { session: 2 } }],
        null
      )
    ).toBeNull();
  });

  it("ignores Session N in titles when inferring scope", () => {
    expect(
      resolveEffectiveReleaseSession(
        [{ title: "Lesson · Session 2" }, { title: "Homework" }],
        null
      )
    ).toBe(1);
  });

  it("always honours an explicit session", () => {
    expect(
      resolveEffectiveReleaseSession(
        [{ metadata: { session: 1 } }, { metadata: { session: 2 } }],
        2
      )
    ).toBe(2);
  });
});

describe("ambiguous multi-meeting weeks", () => {
  function ambiguityCheck(rows: Array<{ metadata?: any; title?: string }>) {
    const session = resolveEffectiveReleaseSession(rows, null);
    if (session != null) return null;
    const stamped = [
      ...new Set(rows.map((r) => assetMeetingSession(r))),
    ].sort((a, b) => a - b);
    return stamped.length >= 2 ? stamped : null;
  }

  it("flags a week holding Class 1 and Class 2 with no session given", () => {
    expect(
      ambiguityCheck([
        { metadata: { session: 1 } },
        { metadata: { session: 2 } },
      ])
    ).toEqual([1, 2]);
  });

  it("does not flag school weeks or single-meeting weeks", () => {
    expect(ambiguityCheck([{ title: "Homework" }])).toBeNull();
    expect(ambiguityCheck([{ metadata: { session: 1 } }])).toBeNull();
  });
});

describe("matchesReleaseSession", () => {
  it("with explicit session only matches that class meeting", () => {
    expect(matchesReleaseSession({ metadata: { session: 1 } }, 1)).toBe(true);
    expect(matchesReleaseSession({ metadata: { session: 2 } }, 1)).toBe(false);
  });

  it("treats school assets as session 1", () => {
    expect(matchesReleaseSession({ title: "Homework" }, 1)).toBe(true);
    expect(matchesReleaseSession({ title: "Homework" }, 2)).toBe(false);
  });

  it("does not release every meeting when session is omitted", () => {
    expect(matchesReleaseSession({ title: "School homework" }, null)).toBe(
      false
    );
  });

  it("does not match a different meeting from a title", () => {
    expect(
      matchesReleaseSession({ title: "Week 1 · Session 2: Lab" }, 1)
    ).toBe(true);
  });
});
