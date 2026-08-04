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
};

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
                ? "One course is written and ready to certify."
                : `${facts.readyToCertifyCount} courses are written and ready to certify.`,
            detail: "Certification locks the edition classes will teach from.",
            actionLabel: "Certify",
            actionHref: buildCertifyHref({
              courseId: facts.readyToCertifyCourseId,
            }),
          }
        : facts.certifiedCourses > 0 &&
            facts.certifiedCourses >= facts.centralCourses
          ? {
              id: "certify",
              state: "done",
              headline: `All ${facts.certifiedCourses} courses are certified.`,
              actionLabel: "Open certify",
              actionHref: "/dashboard/academic/rollout",
            }
          : {
              id: "certify",
              state: "waiting",
              headline: "Nothing ready to certify yet.",
              detail: "Write a curriculum first.",
            };

  const distribute: StageStatus =
    facts.certifiedCourses === 0
      ? {
          id: "distribute",
          state: "waiting",
          headline: "Waiting for a certified course.",
        }
      : facts.assignedDirections === 0
        ? {
            id: "distribute",
            state: "ready",
            headline: "Certified editions are not assigned to schools yet.",
            detail: "Schools and special programmes each need their own assignment.",
            actionLabel: "Assign editions",
            actionHref: buildDistributeHref(),
          }
        : {
            id: "distribute",
            state: "done",
            headline:
              facts.assignedDirections === 1
                ? "One school or pathway has its edition."
                : `${facts.assignedDirections} schools or pathways have their edition.`,
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
          headline: "Confirm where each school or class starts.",
          actionLabel: "Set timing",
          actionHref: buildTimingHref(),
        };

  return [author, certify, distribute, time];
}

export function overviewDeliveryStages(facts: OverviewFacts): StageStatus[] {
  const plan: StageStatus =
    facts.certifiedCourses === 0
      ? {
          id: "plan",
          state: "blocked",
          headline: "No certified curriculum yet.",
          detail: "Finish writing and certifying first.",
          actionLabel: "Back to curriculum",
          actionHref: "/dashboard/academic",
        }
      : facts.stuckPlans > 0
        ? {
            id: "plan",
            state: "blocked",
            headline:
              facts.stuckPlans === 1
                ? "One class plan is not on a certified edition."
                : `${facts.stuckPlans} class plans are not on a certified edition.`,
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

  const teach: StageStatus =
    plan.state === "blocked"
      ? { id: "teach", state: "waiting", headline: "Waiting for class plans." }
      : {
          id: "teach",
          state: "ready",
          headline: "Teach from each class — lessons, slides, practice.",
          actionLabel: "Open classes",
          actionHref: "/dashboard/classes",
        };

  const cover: StageStatus =
    plan.state === "blocked"
      ? { id: "cover", state: "waiting", headline: "Waiting for teaching." }
      : {
          id: "cover",
          state: "ready",
          headline: "Mark weeks taught so progress stays honest.",
          actionLabel: "Record coverage",
          actionHref: "/dashboard/learner-progress?view=delivery",
        };

  const evidence: StageStatus =
    plan.state === "blocked"
      ? { id: "evidence", state: "waiting", headline: "Waiting for teaching." }
      : {
          id: "evidence",
          state: "ready",
          headline: "Collect homework, tests and projects.",
          actionLabel: "Open grades",
          actionHref: "/dashboard/grades",
        };

  const result: StageStatus =
    plan.state === "blocked"
      ? { id: "result", state: "waiting", headline: "Waiting for evidence." }
      : {
          id: "result",
          state: "ready",
          headline: "Prepare results, then share with parents.",
          actionLabel: "Open results",
          actionHref: "/dashboard/academic/results",
        };

  return [plan, teach, cover, evidence, result];
}
