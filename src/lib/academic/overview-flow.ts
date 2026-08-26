import {
  buildCertifyHref,
  buildCurriculumHref,
  buildDistributeHref,
  buildTimingHref,
} from "@/lib/curriculum/href";
import type { StageStatus } from "@/lib/academic/status";

export type OverviewFacts = {
  centralCourses: number;
  certifiedCourses: number;
  readyToCertifyCount: number;
  readyToCertifyCourseId?: string | null;
  awaitingCurriculumCount: number;
  awaitingCurriculumCourseId?: string | null;
  assignedDirections: number;
  stuckPlans: number;
  classesWithPlans: number;
  classesTotal: number;
  classesWithDeliveryStarted: number;
  deliveredLessons: number;
  assessments: number;
  linkedAssessments: number;
  evidenceRecords: number;
  linkedEvidence: number;
  legacyEvidenceRecords: number;
  progressReports: number;
  readyReports: number;
  publishedReports: number;
};

/**
 * Choose the one item the Academic Office should put first.
 *
 * A live-class or saved-marks problem is more urgent than filling another
 * course in the catalogue. Once active work is healthy, the next classroom
 * action wins for schools that already have classes; a school with no classes
 * is guided through curriculum setup first.
 */
export function nextOverviewAction(input: {
  assetStages: StageStatus[];
  deliveryStages: StageStatus[];
  hasActiveClasses: boolean;
}): StageStatus | null {
  const blocked = [...input.deliveryStages, ...input.assetStages].find(
    (stage) => stage.state === "blocked",
  );
  if (blocked) return blocked;

  const firstReady = (stages: StageStatus[]) =>
    stages.find((stage) => stage.state === "ready" && stage.actionHref);

  if (input.hasActiveClasses) {
    return firstReady(input.deliveryStages) ?? firstReady(input.assetStages) ?? null;
  }
  return firstReady(input.assetStages) ?? firstReady(input.deliveryStages) ?? null;
}

/**
 * Curriculum lane status for the Academic overview.
 * Plain sentences only — no process jargon stacked on top of the stage name.
 */
export function overviewAssetStages(facts: OverviewFacts): StageStatus[] {
  const author: StageStatus =
    facts.awaitingCurriculumCount > 0
      ? {
          id: "author",
          state: "ready",
          headline:
            facts.awaitingCurriculumCount === 1
              ? "One course still needs its curriculum written."
              : `${facts.awaitingCurriculumCount} courses still need a curriculum written.`,
          detail: "Teaching cannot start until the weeks and topics exist.",
          actionLabel: "Write curriculum",
          actionHref: buildCurriculumHref({
            courseId: facts.awaitingCurriculumCourseId,
          }),
        }
      : {
          id: "author",
          state: "done",
          headline: "Every active course has a curriculum.",
          actionLabel: "Open builder",
          actionHref: "/dashboard/academic/build",
        };

  const certify: StageStatus =
    facts.awaitingCurriculumCount > 0 && facts.readyToCertifyCount === 0
      ? {
          id: "certify",
          state: "waiting",
          headline: "Waiting on a written curriculum.",
        }
      : facts.readyToCertifyCount > 0
        ? {
            id: "certify",
            state: "ready",
            headline:
              facts.readyToCertifyCount === 1
              ? "One course is written and ready for approval."
              : `${facts.readyToCertifyCount} courses are written and ready for approval.`,
            detail: "Approval makes this the version that classes will use.",
            actionLabel: "Review and approve",
            actionHref: buildCertifyHref({
              courseId: facts.readyToCertifyCourseId,
            }),
          }
        : facts.certifiedCourses > 0 &&
            facts.certifiedCourses >= facts.centralCourses
          ? {
              id: "certify",
              state: "done",
              headline: `All ${facts.certifiedCourses} courses are approved.`,
              actionLabel: "Review approved courses",
              actionHref: "/dashboard/academic/rollout",
            }
          : {
              id: "certify",
              state: "waiting",
            headline: "Nothing ready for approval yet.",
              detail: "Write a curriculum first.",
            };

  const distribute: StageStatus =
    facts.certifiedCourses === 0
      ? {
          id: "distribute",
          state: "waiting",
          headline: "Waiting for an approved course.",
        }
      : facts.assignedDirections === 0
        ? {
            id: "distribute",
            state: "ready",
          headline: "Approved curricula are not assigned to schools yet.",
          detail: "Assign the same approved curriculum wherever the course is taught.",
          actionLabel: "Assign curricula",
            actionHref: buildDistributeHref(),
          }
        : {
            id: "distribute",
            state: "done",
            headline:
              facts.assignedDirections === 1
                ? "One school or programme has its curriculum."
                : `${facts.assignedDirections} schools or programmes have their curriculum.`,
            actionLabel: "Review assignments",
            actionHref: "/dashboard/academic/rollout",
          };

  const time: StageStatus =
    facts.certifiedCourses === 0 || facts.assignedDirections === 0
      ? {
          id: "time",
          state: "waiting",
          headline: "Waiting for school assignment.",
        }
      : {
          id: "time",
          state: "ready",
          headline: "Confirm the term and week where each school starts.",
          actionLabel: "Set start points",
          actionHref: buildTimingHref(),
        };

  return [author, certify, distribute, time];
}

export function overviewDeliveryStages(facts: OverviewFacts): StageStatus[] {
  const plan: StageStatus =
    facts.classesTotal === 0
      ? {
          id: "plan",
          state: "ready",
          headline: "No active classes are ready for teaching yet.",
          detail: "Create or restore a class before preparing teaching plans.",
          actionLabel: "Open classes",
          actionHref: "/dashboard/classes",
        }
      : facts.certifiedCourses === 0
      ? {
          id: "plan",
          state: "blocked",
          headline: "No approved curriculum yet.",
          detail: "Finish writing and approval first.",
          actionLabel: "Back to curriculum",
          actionHref: "/dashboard/academic",
        }
      : facts.stuckPlans > 0
        ? {
            id: "plan",
            state: "blocked",
            headline:
              facts.stuckPlans === 1
                ? "One class plan is not linked to an approved curriculum."
                : `${facts.stuckPlans} class plans are not linked to an approved curriculum.`,
            actionLabel: "Fix assignments",
            actionHref: "/dashboard/academic/rollout",
          }
        : facts.classesWithPlans < facts.classesTotal
          ? {
              id: "plan",
              state: "ready",
              headline: `${facts.classesWithPlans} of ${facts.classesTotal} classes have a teaching plan.`,
              actionLabel: "Open classes",
              actionHref: "/dashboard/classes",
            }
          : {
              id: "plan",
              state: "done",
              headline: "Every class has a teaching plan.",
              actionLabel: "Open classes",
              actionHref: "/dashboard/classes",
            };

  const plansReady = facts.classesWithPlans > 0;
  const teach: StageStatus =
    plan.state === "blocked" || !plansReady
      ? { id: "teach", state: "waiting", headline: "Waiting for class plans." }
      : facts.classesWithDeliveryStarted < facts.classesWithPlans
        ? {
            id: "teach",
            state: "ready",
            headline: `${facts.classesWithDeliveryStarted} of ${facts.classesWithPlans} planned classes have started delivery.`,
            detail: "Open the next class and continue from its recommended teaching meeting.",
            actionLabel: "Continue teaching",
            actionHref: "/dashboard/classes",
          }
      : {
          id: "teach",
          state: "done",
          headline: "Every planned class has started teaching.",
          actionLabel: "Open classes",
          actionHref: "/dashboard/classes",
        };

  const cover: StageStatus =
    !plansReady
      ? { id: "cover", state: "waiting", headline: "Waiting for teaching." }
      : facts.deliveredLessons === 0
        ? {
            id: "cover",
            state: "ready",
            headline: "No completed lesson has been recorded yet.",
            detail: "After teaching, mark the meeting complete so coverage and reports stay accurate.",
            actionLabel: "Record delivery",
            actionHref: "/dashboard/learner-progress?view=delivery",
          }
      : {
          id: "cover",
          state: "done",
          headline: `${facts.deliveredLessons} completed lesson${facts.deliveredLessons === 1 ? " is" : "s are"} recorded.`,
          actionLabel: "Record progress",
          actionHref: "/dashboard/learner-progress?view=delivery",
        };

  let evidence: StageStatus;
  if (facts.deliveredLessons === 0) {
    evidence = { id: "evidence", state: "waiting", headline: "Waiting for delivered teaching." };
  } else if (facts.assessments === 0) {
    evidence = {
      id: "evidence",
      state: "ready",
      headline: "No assessment is ready for this teaching yet.",
      detail: "Create class work, a project, CBT or a written assessment from the class plan.",
      actionLabel: "Open grading",
      actionHref: "/dashboard/grades",
    };
  } else if (facts.linkedAssessments < facts.assessments) {
    const missing = facts.assessments - facts.linkedAssessments;
    evidence = {
      id: "evidence",
      state: "blocked",
      headline: `${missing} assessment${missing === 1 ? " is" : "s are"} not connected to the right class plan.`,
      detail: "The work and scores are safe, but they will not be used in results until the class, term and plan are confirmed.",
      actionLabel: "Connect assessments",
      actionHref: "/dashboard/academic#academic-exceptions",
    };
  } else if (facts.evidenceRecords === 0) {
    evidence = {
      id: "evidence",
      state: "ready",
      headline: "Assessments are ready, but no learner work has been graded yet.",
      actionLabel: "Review grading",
      actionHref: "/dashboard/grades",
    };
  } else if (
    facts.legacyEvidenceRecords > 0 ||
    facts.linkedEvidence < facts.evidenceRecords
  ) {
    const missing = facts.legacyEvidenceRecords
      + Math.max(0, facts.evidenceRecords - facts.linkedEvidence);
    evidence = {
      id: "evidence",
      state: "blocked",
      headline: `${missing} saved mark${missing === 1 ? " is" : "s are"} not connected to the right class and term.`,
      detail: "The marks are safe, but Auto-fill will not use them until an administrator confirms where they belong.",
      actionLabel: "Connect saved marks",
      actionHref: "/dashboard/academic#academic-exceptions",
    };
  } else {
    evidence = {
      id: "evidence",
      state: "done",
      headline: `${facts.linkedEvidence} graded evidence record${facts.linkedEvidence === 1 ? " is" : "s are"} traceable to teaching.`,
      actionLabel: "Review grading",
      actionHref: "/dashboard/grades",
    };
  }

  let result: StageStatus;
  if (facts.linkedEvidence === 0 || evidence.state === "blocked") {
    result = { id: "result", state: "waiting", headline: "Waiting for verified learner evidence." };
  } else if (facts.progressReports === 0) {
    result = {
      id: "result",
      state: "ready",
      headline: "Verified marks are ready for result preparation.",
      actionLabel: "Prepare results",
      actionHref: "/dashboard/academic/results",
    };
  } else if (facts.readyReports < facts.progressReports) {
    const needingReview = facts.progressReports - facts.readyReports;
    result = {
      id: "result",
      state: "ready",
      headline: `${needingReview} result${needingReview === 1 ? " needs" : "s need"} review before publication.`,
      actionLabel: "Review results",
      actionHref: "/dashboard/academic/results",
    };
  } else if (facts.publishedReports < facts.readyReports) {
    const readyToPublish = facts.readyReports - facts.publishedReports;
    result = {
      id: "result",
      state: "ready",
      headline: `${readyToPublish} checked result${readyToPublish === 1 ? " is" : "s are"} ready to publish.`,
      actionLabel: "Publish results",
      actionHref: "/dashboard/academic/results",
    };
  } else {
    result = {
      id: "result",
      state: "done",
      headline: `${facts.publishedReports} checked result${facts.publishedReports === 1 ? " is" : "s are"} published.`,
      actionLabel: "Open results",
      actionHref: "/dashboard/academic/results",
    };
  }

  return [plan, teach, cover, evidence, result];
}
