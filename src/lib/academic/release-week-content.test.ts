import { describe, expect, it } from "vitest";
import {
  matchesReleaseSession,
  releaseAssetSession,
  resolveEffectiveReleaseSession,
} from "./release-week-content";

describe("releaseAssetSession", () => {
  it("reads metadata.session first", () => {
    expect(
      releaseAssetSession({ metadata: { session: 2 }, title: "Session 1: x" }),
    ).toBe(2);
  });

  it("falls back to Session N in the title", () => {
    expect(releaseAssetSession({ title: "Week 1 · Session 3: Flashcards" })).toBe(
      3,
    );
  });

  it("returns 0 when unscoped (school)", () => {
    expect(releaseAssetSession({ title: "Week 1 homework" })).toBe(0);
  });
});

describe("resolveEffectiveReleaseSession", () => {
  it("keeps school weeks unscoped when nothing is stamped", () => {
    expect(
      resolveEffectiveReleaseSession(
        [{ title: "Lesson" }, { title: "Homework" }],
        null,
      ),
    ).toBeNull();
  });

  it("infers the only class meeting for 1-class special programmes", () => {
    expect(
      resolveEffectiveReleaseSession(
        [
          { metadata: { session: 1 } },
          { metadata: { session: 1 }, title: "Homework" },
        ],
        null,
      ),
    ).toBe(1);
  });

  it("refuses to guess when two class meetings are held", () => {
    expect(
      resolveEffectiveReleaseSession(
        [{ metadata: { session: 1 } }, { metadata: { session: 2 } }],
        null,
      ),
    ).toBeNull();
  });

  it("always honours an explicit session", () => {
    expect(
      resolveEffectiveReleaseSession(
        [{ metadata: { session: 1 } }, { metadata: { session: 2 } }],
        2,
      ),
    ).toBe(2);
  });
});

describe("ambiguous multi-meeting weeks", () => {
  /**
   * Mirrors the guard in releasePreparedWeek: two stamped meetings and nothing
   * unscoped means a release with no session would touch nothing, so the caller
   * must be told rather than shown a successful no-op.
   */
  function ambiguityCheck(rows: Array<{ metadata?: any; title?: string }>) {
    const session = resolveEffectiveReleaseSession(rows, null);
    if (session != null) return null;
    const stamped = [
      ...new Set(rows.map((r) => releaseAssetSession(r)).filter((s) => s > 0)),
    ].sort((a, b) => a - b);
    const hasUnscoped = rows.some((r) => releaseAssetSession(r) < 1);
    return stamped.length >= 2 && !hasUnscoped ? stamped : null;
  }

  it("flags a week holding Class 1 and Class 2 with no session given", () => {
    expect(
      ambiguityCheck([
        { metadata: { session: 1 } },
        { metadata: { session: 2 } },
      ]),
    ).toEqual([1, 2]);
  });

  it("does not flag school weeks or single-meeting weeks", () => {
    expect(ambiguityCheck([{ title: "Homework" }])).toBeNull();
    expect(ambiguityCheck([{ metadata: { session: 1 } }])).toBeNull();
  });

  it("does not flag when unscoped school assets are also held", () => {
    expect(
      ambiguityCheck([
        { metadata: { session: 1 } },
        { metadata: { session: 2 } },
        { title: "School homework" },
      ]),
    ).toBeNull();
  });
});

describe("matchesReleaseSession", () => {
  it("with explicit session only matches that class meeting", () => {
    expect(matchesReleaseSession({ metadata: { session: 1 } }, 1)).toBe(true);
    expect(matchesReleaseSession({ metadata: { session: 2 } }, 1)).toBe(false);
  });

  it("treats school/unscoped assets as session 1 for back-compat", () => {
    expect(matchesReleaseSession({ title: "Homework" }, 1)).toBe(true);
    expect(matchesReleaseSession({ title: "Homework" }, 2)).toBe(false);
  });

  it("without session releases school assets only — never Class 2+", () => {
    expect(matchesReleaseSession({ title: "School homework" }, null)).toBe(true);
    expect(matchesReleaseSession({ metadata: { session: 1 } }, null)).toBe(false);
    expect(matchesReleaseSession({ metadata: { session: 2 } }, null)).toBe(false);
  });
});
