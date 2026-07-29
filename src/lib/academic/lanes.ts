/**
 * The academic system has two lanes, not one sequence.
 *
 *   Lane A (asset)    — course-scoped. The Academic Office builds and governs
 *                       the curriculum asset once, for every school.
 *   Lane B (delivery) — class-scoped. A teacher delivers that asset to one
 *                       class, in one term, for one course.
 *
 * They meet at exactly one junction: resolveOfficialCurriculumDirection()
 * attaching a published edition to a class-term teaching plan.
 *
 * This file is the single source of stage identity, order, wording and
 * destination. Nav, chrome, the Academic home and the guide all read from
 * here — no surface may define its own stage list.
 */

export type LaneId = "asset" | "delivery";
export type AcademicRole = "admin" | "teacher" | "school" | "student" | "parent";

export type StageId =
  | "catalogue"
  | "author"
  | "certify"
  | "distribute"
  | "time"
  | "plan"
  | "teach"
  | "cover"
  | "evidence"
  | "result";

export type Stage = {
  id: StageId;
  lane: LaneId;
  /** Position within its lane, 1-based. */
  step: number;
  label: string;
  /** What this stage achieves, in staff language. */
  purpose: string;
  href: string;
  /** Roles that may act on this stage. */
  actors: AcademicRole[];
  /** Roles that may see it read-only (never shown a write control). */
  observers: AcademicRole[];
  /** Plain sentence describing the finish line for this stage. */
  doneWhen: string;
};

export const LANES: Record<LaneId, { id: LaneId; label: string; scope: string; summary: string }> = {
  asset: {
    id: "asset",
    label: "Curriculum",
    scope: "course",
    summary:
      "The Academic Office builds one official curriculum and decides where it applies.",
  },
  delivery: {
    id: "delivery",
    label: "Delivery",
    scope: "class",
    summary:
      "A teacher turns the assigned official edition into real teaching for one class.",
  },
};

export const STAGES: Stage[] = [
  // ── Lane A — the curriculum asset (course-scoped) ────────────────────────
  {
    id: "catalogue",
    lane: "asset",
    step: 1,
    label: "Catalogue",
    purpose: "Keep programmes and their courses organised.",
    href: "/dashboard/programs",
    actors: ["admin"],
    observers: ["teacher", "school"],
    doneWhen: "The course exists inside a programme.",
  },
  {
    id: "author",
    lane: "asset",
    step: 2,
    label: "Author",
    purpose: "Write the central curriculum: terms, weeks and topics.",
    href: "/dashboard/curriculum",
    actors: ["admin"],
    observers: ["teacher", "school"],
    doneWhen: "A central draft exists for the course.",
  },
  {
    id: "certify",
    lane: "asset",
    step: 3,
    label: "Certify",
    purpose: "Check quality, then protect the draft as an official edition.",
    href: "/dashboard/academic/certify",
    actors: ["admin"],
    observers: [],
    doneWhen: "An official edition is published and can no longer change.",
  },
  {
    id: "distribute",
    lane: "asset",
    step: 4,
    label: "Distribute",
    purpose:
      "Give the official edition to schools, and to online or special pathways that need their own.",
    href: "/dashboard/academic/distribute",
    actors: ["admin"],
    observers: [],
    doneWhen: "Every pathway that teaches this course has an edition assigned.",
  },
  {
    id: "time",
    lane: "asset",
    step: 5,
    label: "Timing",
    purpose: "Set where each school or class really starts in the curriculum.",
    href: "/dashboard/academic/timing",
    actors: ["admin"],
    observers: [],
    doneWhen: "Each pathway has a real entry term and week.",
  },

  // ── Lane B — delivery to a class (class-scoped) ──────────────────────────
  {
    id: "plan",
    lane: "delivery",
    step: 1,
    label: "Plan",
    purpose: "Open the class term plan built from the assigned official edition.",
    href: "/dashboard/classes",
    actors: ["admin", "teacher"],
    observers: ["school"],
    doneWhen: "The class term plan is attached to its official edition.",
  },
  {
    id: "teach",
    lane: "delivery",
    step: 2,
    label: "Teach",
    purpose: "Run lessons, learning slides and flashcard practice, take attendance and adapt delivery for this class.",
    href: "/dashboard/classes",
    actors: ["admin", "teacher"],
    observers: ["school"],
    doneWhen: "Lessons are being delivered against the plan.",
  },
  {
    id: "cover",
    lane: "delivery",
    step: 3,
    label: "Coverage",
    purpose: "Record what was taught, missed or moved.",
    href: "/dashboard/learner-progress?view=delivery",
    actors: ["admin", "teacher"],
    observers: ["school"],
    doneWhen: "Delivered weeks are recorded for the term.",
  },
  {
    id: "evidence",
    lane: "delivery",
    step: 4,
    label: "Evidence",
    purpose: "Collect assignments, tests, projects and practical work as real evidence.",
    href: "/dashboard/grades",
    actors: ["admin", "teacher"],
    observers: ["school"],
    doneWhen: "Learner evidence exists for the term.",
  },
  {
    id: "result",
    lane: "delivery",
    step: 5,
    label: "Results",
    purpose: "Publish traceable results and support certificates.",
    href: "/dashboard/academic/results",
    actors: ["admin", "teacher"],
    observers: ["school"],
    doneWhen: "Results for the term are published.",
  },
];

const BY_ID = new Map(STAGES.map((stage) => [stage.id, stage]));

export function stage(id: StageId): Stage {
  const found = BY_ID.get(id);
  if (!found) throw new Error(`Unknown academic stage: ${id}`);
  return found;
}

export function stagesInLane(lane: LaneId): Stage[] {
  return STAGES.filter((s) => s.lane === lane).sort((a, b) => a.step - b.step);
}

/**
 * Stages a role may act on, in lane order. Observers are deliberately
 * excluded: a teacher must never be offered a publish or rollout control,
 * and this is the single place that rule is enforced.
 */
export function stepsForRole(role: AcademicRole | null | undefined): Stage[] {
  if (!role) return [];
  return STAGES.filter((s) => s.actors.includes(role));
}

/** Stages a role may see at all, acting or read-only. */
export function visibleForRole(role: AcademicRole | null | undefined): Stage[] {
  if (!role) return [];
  return STAGES.filter(
    (s) => s.actors.includes(role) || s.observers.includes(role)
  );
}

export function canAct(role: AcademicRole | null | undefined, id: StageId): boolean {
  if (!role) return false;
  return stage(id).actors.includes(role);
}

export function nextStage(id: StageId): Stage | null {
  const current = stage(id);
  return (
    stagesInLane(current.lane).find((s) => s.step === current.step + 1) ?? null
  );
}
