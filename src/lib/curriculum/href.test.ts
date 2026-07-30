import { describe, expect, it } from "vitest";
import {
  buildCertifyHref,
  buildCurriculumHref,
  buildDistributeHref,
  mergeAssetLaneHref,
  pickAssetLaneQuery,
} from "./href";

describe("curriculum href helpers", () => {
  it("builds canonical curriculum links", () => {
    expect(buildCurriculumHref({ courseId: "c1", programId: "p1" })).toBe(
      "/dashboard/curriculum?course=c1&program=p1"
    );
  });

  it("builds academic stage links with context", () => {
    expect(
      buildCertifyHref({ curriculumId: "cur1", courseId: "c1" })
    ).toBe("/dashboard/academic/certify?curriculum_id=cur1&course_id=c1");
    expect(buildDistributeHref({ courseId: "c1" })).toBe(
      "/dashboard/academic/distribute?course_id=c1"
    );
  });

  it("preserves asset lane query across steps", () => {
    const query = pickAssetLaneQuery(
      "curriculum_id=cur1&course_id=c1&noise=1"
    );
    expect(query.toString()).toBe("curriculum_id=cur1&course_id=c1");
    expect(
      mergeAssetLaneHref("/dashboard/academic/timing", query)
    ).toBe("/dashboard/academic/timing?curriculum_id=cur1&course_id=c1");
  });
});
