import {
  buildWeekVisibility,
  indexFirstByWeekSession,
  weekClassroomAction,
  weekPackageStatus,
  weekSessionLookupKey,
  weekVisibilitySummary,
} from "./week-package";
import {
  planMeetingLookupKey,
  canonicalMeetingSession,
  parseRequestSession,
} from "./session-identity";
import {
  calendarRoleLabel,
  classifyCalendarWeek,
  recommendTeachingAction,
  type ProgrammeStanding,
  type WeekCalendarRole,
} from "./school-programme-standing";

type Row = Record<string, any>;

export type TeachingWeekRow = {
  weekMeta: Row;
  week: number;
  session: number;
  rowKey: string;
  term: number | null;
  lesson: Row | null;
  assignment: Row | null;
  project: Row | null;
  slideDeck: Row | null;
  flashcardDeck: Row | null;
  evaluation: Row | null;
  topic: string;
  objectives: string;
  activities: string;
  packageStatus: ReturnType<typeof weekPackageStatus>;
  visibility: ReturnType<typeof buildWeekVisibility>;
  visibilitySummary: ReturnType<typeof weekVisibilitySummary>;
  classroomAction: ReturnType<typeof weekClassroomAction>;
  delivery: Row | null;
  taught: boolean;
  provenance: {
    shared: boolean;
    customized: boolean;
    staleDerived: boolean;
  };
  evaluationStatus: "missing" | "held" | "live";
  calendarRole: WeekCalendarRole;
  calendarLabel: string | null;
  recommendedAction:
    | "prepare"
    | "refresh"
    | "release"
    | "teach"
    | "assess"
    | "review_assessment"
    | "none";
};

export type TeachingWorkspaceRowsInput = {
  planWeeks?: Row[] | null;
  lessons?: Row[] | null;
  assignments?: Row[] | null;
  projects?: Row[] | null;
  slideDecks?: Row[] | null;
  flashcardDecks?: Row[] | null;
  exams?: Row[] | null;
  deliveries?: Row[] | null;
  standing?: ProgrammeStanding;
  usesHostEvaluation?: boolean;
  examCapture?: "physical" | "cbt";
  testCapture?: "physical" | "cbt";
  termStart?: string | null;
  activities?: Parameters<typeof classifyCalendarWeek>[0]["activities"];
};

export type TeachingTarget = { week: number; session: number };

/**
 * Week+meeting targets for bulk release and delivery.
 * Body: `{ targets: [{ week_number, session }] }`. Session defaults to Class 1.
 */
export function parseTeachingTargets(
  body: Record<string, unknown>
): TeachingTarget[] {
  const rawTargets: Array<Record<string, unknown>> = Array.isArray(body.targets)
    ? body.targets
    : [];
  const unique = new Map<string, TeachingTarget>();
  for (const raw of rawTargets) {
    const week = Number(raw?.week_number);
    if (!Number.isInteger(week) || week <= 0 || week > 53) continue;
    const session =
      parseRequestSession((raw ?? {}) as Record<string, unknown>) ?? 1;
    unique.set(`${week}:s${session}`, { week, session });
  }
  return [...unique.values()];
}

/** Slots that still need a teacher decision — the workspace exception queue. */
export function teachingSlotNeedsAttention(
  row: Pick<TeachingWeekRow, "recommendedAction">
): boolean {
  return row.recommendedAction !== "none";
}

function textList(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(String).join("\n");
  return "";
}

function isCustomized(row: Row | null): boolean {
  return Boolean(
    row?.customized_at ||
      row?.metadata?.is_customized === true ||
      row?.metadata?.customized_at
  );
}

function isShared(row: Row | null): boolean {
  return Boolean(
    row?.shared_master_id ||
      row?.metadata?.copied_from_content_id ||
      row?.metadata?.shared_master_id
  );
}

/**
 * One server/client-neutral week-row assembler for the class workspace.
 * Every surface receives the same session identity, five-asset readiness,
 * visibility, delivery and provenance verdicts.
 */
export function buildTeachingWeekRows(
  input: TeachingWorkspaceRowsInput
): TeachingWeekRow[] {
  const lessons = input.lessons ?? [];
  const planWeeks: Row[] =
    input.planWeeks?.length
      ? input.planWeeks
      : lessons.map((lesson, index) => ({
          week: Number(lesson.curriculum_week_number) || index + 1,
          topic: lesson.title,
        }));

  const lessonsBySlot = indexFirstByWeekSession(lessons);
  const assignmentsBySlot = indexFirstByWeekSession(input.assignments);
  const projectsBySlot = indexFirstByWeekSession(input.projects);
  const slidesBySlot = indexFirstByWeekSession(input.slideDecks);
  const flashcardsBySlot = indexFirstByWeekSession(input.flashcardDecks);
  const examsBySlot = indexFirstByWeekSession(input.exams);
  const deliveryBySlot = new Map<string, Row>();

  for (const delivery of input.deliveries ?? []) {
    const week = Number(delivery.week_number);
    if (!Number.isInteger(week) || week <= 0) continue;
    const session = canonicalMeetingSession(delivery.session_number);
    const key = planMeetingLookupKey(week, session);
    const existing = deliveryBySlot.get(key);
    if (!existing || delivery.status === "delivered") {
      deliveryBySlot.set(key, delivery);
    }
  }

  return planWeeks.map((weekMeta, index) => {
    const week = Number(
      weekMeta.week || weekMeta.curriculum_week_number || index + 1
    );
    const session = canonicalMeetingSession(
      weekMeta.session ?? weekMeta.session_number
    );
    const rowKey = weekSessionLookupKey(week, session);
    const lesson = lessonsBySlot.get(rowKey) ?? null;
    const assignment = assignmentsBySlot.get(rowKey) ?? null;
    const project = projectsBySlot.get(rowKey) ?? null;
    const slideDeck =
      slidesBySlot.get(rowKey) ??
      (lesson
        ? (input.slideDecks ?? []).find((row) => row.lesson_id === lesson.id) ??
          null
        : null);
    const flashcardDeck =
      flashcardsBySlot.get(rowKey) ??
      (lesson
        ? (input.flashcardDecks ?? []).find(
            (row) => row.lesson_id === lesson.id
          ) ?? null
        : null);
    const evaluation =
      examsBySlot.get(rowKey) ??
      (lesson
        ? (input.exams ?? []).find((row) => row.lesson_id === lesson.id) ?? null
        : null);
    const delivery =
      deliveryBySlot.get(planMeetingLookupKey(week, session)) ?? null;
    const taught = delivery?.status === "delivered";
    const presence = {
      lesson: Boolean(lesson),
      slides: Boolean(slideDeck),
      flashcards: Boolean(flashcardDeck),
      assignment: Boolean(assignment),
      project: Boolean(project),
    };
    const visibility = buildWeekVisibility({
      lesson,
      slides: slideDeck,
      flashcards: flashcardDeck,
      assignment,
      project,
    });
    const rows = [lesson, assignment, project, slideDeck, flashcardDeck];

    const packageStatus = weekPackageStatus(presence);
    const visibilitySummary = weekVisibilitySummary(visibility);
    const provenance = {
      shared: rows.some(isShared),
      customized: rows.some(isCustomized),
      staleDerived: Boolean(
        slideDeck?.content_stale_at || flashcardDeck?.content_stale_at
      ),
    };
    const evaluationStatus = !evaluation
      ? "missing"
      : evaluation.is_active === true
        ? "live"
        : "held";
    const calendarRole = classifyCalendarWeek({
      standing: input.standing ?? "optional",
      termStart: input.termStart,
      weekNumber: week,
      activities: input.activities,
    });
    const baseAction = provenance.staleDerived
      ? "refresh"
      : !packageStatus.complete
        ? "prepare"
        : visibilitySummary.needsRelease
          ? "release"
          : !taught
            ? "teach"
            : evaluationStatus === "missing"
              ? "assess"
              : evaluationStatus === "held"
                ? "review_assessment"
                : "none";
    const recommendedAction = recommendTeachingAction({
      base: baseAction,
      calendarRole,
      usesHostEvaluation: Boolean(input.usesHostEvaluation),
      examCapture: input.examCapture,
      testCapture: input.testCapture,
    });

    return {
      weekMeta,
      week,
      session,
      rowKey,
      term: Number(weekMeta.official_position?.programme_term) || null,
      lesson,
      assignment,
      project,
      slideDeck,
      flashcardDeck,
      evaluation,
      topic:
        String(weekMeta.topic || lesson?.title || "").trim() ||
        `Week ${week}${session ? ` · Class ${session}` : ""}`,
      objectives: textList(weekMeta.objectives),
      activities: textList(weekMeta.activities),
      packageStatus,
      visibility,
      visibilitySummary,
      classroomAction: weekClassroomAction({ presence, visibility, taught }),
      delivery,
      taught,
      provenance,
      evaluationStatus,
      calendarRole,
      calendarLabel: calendarRoleLabel(calendarRole),
      recommendedAction,
    };
  });
}
