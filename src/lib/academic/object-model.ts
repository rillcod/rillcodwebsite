/**
 * User-facing academic vocabulary.
 *
 * The database keeps its historical `lesson_plans` table name, but the
 * product must not expose that implementation detail as a second kind of
 * plan. These are the four objects a person should meet in the interface.
 */
export const ACADEMIC_OBJECTS = {
  curriculum: {
    label: "Curriculum",
    description: "The approved teaching direction for a course.",
  },
  classPlan: {
    label: "Class plan",
    description:
      "The curriculum arranged for one class, course and teaching period.",
  },
  teachingPackage: {
    label: "Teaching package",
    description:
      "One week or session containing the lesson, slides, practice cards, assignment and project.",
  },
  lesson: {
    label: "Lesson",
    description:
      "The teacher's lesson guide inside a teaching package. It is not a class plan.",
  },
} as const;

export const ACADEMIC_WORKFLOW = [
  {
    id: "overview",
    step: 0,
    label: "Overview",
    shortLabel: "Overview",
    href: "/dashboard/academic",
    purpose: "See the next action.",
  },
  {
    id: "curriculum",
    step: 1,
    label: "Curriculum",
    shortLabel: "Curriculum",
    href: "/dashboard/academic/build",
    purpose: "Write the course weeks and topics.",
  },
  {
    id: "approval",
    step: 2,
    label: "Approve & assign",
    shortLabel: "Approve",
    href: "/dashboard/academic/rollout",
    purpose: "Approve one version and assign it to the right schools.",
  },
  {
    id: "teaching",
    step: 3,
    label: "Plan & teach",
    shortLabel: "Teach",
    href: "/dashboard/classes",
    purpose: "Prepare each class package, share it and record delivery.",
  },
  {
    id: "results",
    step: 4,
    label: "Results",
    shortLabel: "Results",
    href: "/dashboard/academic/results",
    purpose: "Review evidence and publish learner results.",
  },
] as const;

export type AcademicWorkflowId = (typeof ACADEMIC_WORKFLOW)[number]["id"];
