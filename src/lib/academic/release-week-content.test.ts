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
