import { describe, expect, it } from "vitest";
import { resolveOfficialCurriculumDirection } from "./official-direction";

function fakeDb(responses: Record<string, unknown[]>) {
  const calls: string[] = [];
  return {
    calls,
    from(table: string) {
      calls.push(table);
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        lte: () => chain,
        order: () => chain,
        limit: () => chain,
        maybeSingle: async () => ({ data: responses[table]?.shift() ?? null }),
      };
      return chain;
    },
  };
}

const release = {
  id: "release-1",
  course_id: "course-1",
  source_curriculum_id: "draft-1",
  title: "Protected direction",
  content: { terms: [] },
  academic_session: "2025/2026",
  effective_term_number: 3,
  grade_key: "basic_1",
  audience_label: "Basic 1",
  source_metadata: {},
  status: "published",
};

describe("resolveOfficialCurriculumDirection", () => {
  it("keeps the release already pinned to an existing plan", async () => {
    const db = fakeDb({ academic_curriculum_releases: [release] });
    await expect(
      resolveOfficialCurriculumDirection(db, {
        schoolId: "school-1",
        offeringId: "offering-1",
        courseId: "course-1",
        pinnedReleaseId: "release-1",
      })
    ).resolves.toEqual(release);
    expect(db.calls).toEqual(["academic_curriculum_releases"]);
  });

  it("uses the pathway-specific direction before a school adoption", async () => {
    const db = fakeDb({
      academic_offerings: [{ enrollment_type: "special" }],
      academic_offering_curriculum_directions: [{ release }],
    });
    await expect(
      resolveOfficialCurriculumDirection(db, {
        schoolId: "school-1",
        offeringId: "offering-1",
        courseId: "course-1",
      })
    ).resolves.toEqual(release);
    expect(db.calls).toEqual([
      "academic_offerings",
      "academic_offering_curriculum_directions",
    ]);
  });

  it("does not let Online or Special pathways borrow Regular School direction", async () => {
    const db = fakeDb({
      academic_offerings: [{ enrollment_type: "online" }],
      academic_offering_curriculum_directions: [null],
      academic_curriculum_adoptions: [{ release }],
    });
    await expect(
      resolveOfficialCurriculumDirection(db, {
        schoolId: "school-1",
        offeringId: "online-1",
        courseId: "course-1",
      })
    ).resolves.toBeNull();
    expect(db.calls).not.toContain("academic_curriculum_adoptions");
  });

  it("uses the school adoption for a Regular School pathway", async () => {
    const db = fakeDb({
      academic_offerings: [{ enrollment_type: "school" }],
      academic_curriculum_adoptions: [{ release }],
    });
    await expect(
      resolveOfficialCurriculumDirection(db, {
        schoolId: "school-1",
        offeringId: "regular-1",
        courseId: "course-1",
      })
    ).resolves.toEqual(release);
  });
});
