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

export type LaneNavigationStep = {
  id: string;
  lane: LaneId;
  step: number;
  label: string;
  purpose: string;
  href: string;
  stageIds: StageId[];
};

export const LANES: Record<LaneId, { id: LaneId; label: string; scope: string; summary: string }> = {
  asset: {
    id: "asset",
    label: "Curriculum",
    scope: "course",
    summary: "Write it once. Certify it. Give it to schools and programmes.",
  },
  delivery: {
    id: "delivery",
    label: "In class",
    scope: "class",
    summary: "Turn that curriculum into real teaching for one class.",
  },
};

// Programmes and courses (/dashboard/programs) are deliberately NOT a stage here. They are setup:
// created once and then left alone, so numbering them ahead of Author implied a task to repeat for
// every curriculum, and made the build flow read as five steps when it is four. The page keeps its
// full function and its place in the sidebar — it simply is not a step in this lane.
export const STAGES: Stage[] = [
  // ── Lane A — the curriculum asset (course-scoped) ────────────────────────
  {
    id: "author",
    lane: "asset",
    step: 1,
    label: "Author",
    purpose: "Write the central curriculum: terms, weeks and topics.",
    href: "/dashboard/academic/build",
    actors: ["admin"],
    observers: ["teacher", "school"],
    doneWhen: "A central draft exists for the course.",
  },
  {
    id: "certify",
    lane: "asset",
    step: 2,
    label: "Certify",
    purpose: "Check quality, then protect the draft as an official edition.",
    href: "/dashboard/academic/rollout#review",
    actors: ["admin"],
    observers: [],
    doneWhen: "An official edition is published and can no longer change.",
  },
  {
    id: "distribute",
    lane: "asset",
    step: 3,
    label: "Distribute",
    purpose:
      "Give the official edition to schools, and to online or special pathways that need their own.",
    href: "/dashboard/academic/rollout#schools",
    actors: ["admin"],
    observers: [],
    doneWhen: "Every pathway that teaches this course has an edition assigned.",
  },
  {
    id: "time",
    lane: "asset",
    step: 4,
    label: "Timing",
    purpose: "Set where each school or class really starts in the curriculum.",
    href: "/dashboard/academic/rollout#timing",
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
    label: "Auto-fill",
    purpose: "Optional fill from class work. Type scores in Write, then Publish.",
    href: "/dashboard/academic/results",
    actors: ["admin", "teacher"],
    observers: ["school"],
    doneWhen: "Results for the term are published.",
  },
];

/**
 * The state engine keeps certify, distribute, and timing distinct because each
 * has a different finish line. They are not three separate user journeys:
 * publishing certifies and distributes in one transaction, while timing is an
 * optional exception inside the same rollout workspace.
 */
export const LANE_NAVIGATION: Record<LaneId, LaneNavigationStep[]> = {
  asset: [
    {
      id: "build",
      lane: "asset",
      step: 1,
      label: "Build",
      purpose: "Choose a course and write its week-by-week curriculum.",
      href: "/dashboard/academic/build",
      stageIds: ["author"],
    },
    {
      id: "rollout",
      lane: "asset",
      step: 2,
      label: "Rollout",
      purpose: "Review once, publish to schools, and manage timing exceptions.",
      href: "/dashboard/academic/rollout",
      stageIds: ["certify", "distribute", "time"],
    },
  ],
  delivery: [
    // Plan and Teach were two steps pointing at the same page. The stepper
    // showed them as separate destinations and neither could ever be "the
    // other one" — you open the class and do both there. They stay distinct
    // stages in STAGES, because their finish lines differ; they are one
    // navigation step, because there is one place to go.
    {
      id: "teach",
      lane: "delivery",
      step: 1,
      label: "Plan & teach",
      purpose:
        "Open the class, attach its term plan to the official edition, teach it and record coverage.",
      href: "/dashboard/classes",
      stageIds: ["plan", "teach", "cover"],
    },
    {
      id: "results",
      lane: "delivery",
      step: 2,
      label: "Auto-fill",
      purpose: "Optional fill from class work. Type scores in Write, then Publish.",
      href: "/dashboard/academic/results",
      stageIds: ["evidence", "result"],
    },
  ],
};

const BY_ID = new Map(STAGES.map((stage) => [stage.id, stage]));

export function findStage(id: string): Stage | null {
  return BY_ID.get(id as StageId) ?? null;
}

export function stage(id: StageId): Stage {
  const found = findStage(id);
  if (!found) throw new Error(`Unknown academic stage: ${id}`);
  return found;
}

export function stagesInLane(lane: LaneId): Stage[] {
  return STAGES.filter((s) => s.lane === lane).sort((a, b) => a.step - b.step);
}

export function navigationStepsInLane(lane: LaneId): LaneNavigationStep[] {
  return LANE_NAVIGATION[lane];
}

/**
 * Navigation steps a role may see in a lane. A step appears if the role is an
 * actor or observer on at least one of its stages. Teachers therefore see
 * Build (they may read the official weeks) and never Rollout.
 */
export function navigationStepsForRole(
  lane: LaneId,
  role: AcademicRole | null | undefined
): LaneNavigationStep[] {
  if (!role) return [];
  const visibleIds = new Set(visibleForRole(role).map((s) => s.id));
  return navigationStepsInLane(lane).filter((step) =>
    step.stageIds.some((id) => visibleIds.has(id))
  );
}

/**
 * The Overview / Build / Rollout strip is Academic Office work. Only a role
 * that acts on the curriculum asset lane should see it. Teachers and schools
 * may read official weeks, but they must never be offered that stepper.
 */
export function canSeeAssetLaneChrome(
  role: AcademicRole | null | undefined
): boolean {
  if (!role) return false;
  return stepsForRole(role).some((s) => s.lane === "asset");
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
