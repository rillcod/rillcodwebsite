import { describe, expect, it } from "vitest";
import { AUDIT_CATEGORIES, ACCOUNTABLE_CATEGORIES, categoryForAction } from "./categories";

describe("audit categories", () => {
  it("files each academic decision under the right heading", () => {
    expect(categoryForAction("curriculum.certified")?.id).toBe("curriculum");
    expect(categoryForAction("curriculum.adopted_by_school")?.id).toBe("curriculum");
    expect(categoryForAction("class.reclassified")?.id).toBe("classes");
    expect(categoryForAction("certificate.issued")?.id).toBe("certificates");
    expect(categoryForAction("result.published")?.id).toBe("results");
    expect(categoryForAction("result.recalculated")?.id).toBe("results");
  });

  it("keeps the high-volume look-ups away from the decisions", () => {
    // 95% of the trail was one parent event; it must not sit under decisions.
    expect(categoryForAction("parent_student_linked")?.id).toBe("parents");
    expect(categoryForAction("result_check_verified")?.id).toBe("checks");
    expect(ACCOUNTABLE_CATEGORIES.map((c) => c.id)).not.toContain("parents");
    expect(ACCOUNTABLE_CATEGORIES.map((c) => c.id)).not.toContain("checks");
  });

  it("distinguishes a published result from a look-up of one", () => {
    expect(categoryForAction("result.published")?.id).toBe("results");
    expect(categoryForAction("result_check_verified")?.id).toBe("checks");
  });

  it("still recognises the older event names", () => {
    expect(categoryForAction("publish_progress_report")?.id).toBe("results");
    expect(categoryForAction("create_class")?.id).toBe("classes");
    expect(categoryForAction("students.delete")?.id).toBe("students");
    expect(categoryForAction("delete_user")?.id).toBe("accounts");
  });

  it("returns nothing rather than guessing for an unknown event", () => {
    expect(categoryForAction("something_new_entirely")).toBeNull();
    expect(categoryForAction(null)).toBeNull();
    expect(categoryForAction("")).toBeNull();
  });

  it("gives every category a plain-language purpose", () => {
    for (const category of AUDIT_CATEGORIES) {
      expect(category.purpose.length).toBeGreaterThan(20);
      expect(category.label).not.toMatch(/_|\./);
    }
  });
});
