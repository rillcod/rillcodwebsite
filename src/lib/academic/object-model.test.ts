import { describe, expect, it } from "vitest";
import { ACADEMIC_OBJECTS, ACADEMIC_WORKFLOW } from "./object-model";

describe("canonical academic product model", () => {
  it("keeps curriculum, class plan, package and lesson distinct", () => {
    expect(ACADEMIC_OBJECTS.curriculum.label).toBe("Curriculum");
    expect(ACADEMIC_OBJECTS.classPlan.label).toBe("Class plan");
    expect(ACADEMIC_OBJECTS.teachingPackage.description).toContain(
      "lesson, slides, practice cards, assignment and project",
    );
    expect(ACADEMIC_OBJECTS.lesson.description).toContain(
      "It is not a class plan",
    );
  });

  it("presents one end-to-end Academic Office journey", () => {
    expect(ACADEMIC_WORKFLOW.map((step) => step.label)).toEqual([
      "Overview",
      "Curriculum",
      "Approve & assign",
      "Plan & teach",
      "Results",
    ]);
    expect(ACADEMIC_WORKFLOW.map((step) => step.step)).toEqual([0, 1, 2, 3, 4]);
  });
});
