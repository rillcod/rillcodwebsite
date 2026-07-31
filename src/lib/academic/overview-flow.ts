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
 * System-wide Curriculum lane status for the Academic Overview.
 * Order is enforced: write before certify, certify before distribute.
 */
export function overviewAssetStages(facts: OverviewFacts): StageStatus[] {
  const catalogue: StageStatus = {
    id: "catalogue",
    state: "done",
    headline: "Programmes and courses are in the catalogue.",
    actionLabel: "Open programmes",
    actionHref: "/dashboard/programs",
  };

  const author: StageStatus =
    facts.awaitingCurriculumCount > 0
      ? {
          id: "author",
          state: "ready",
          headline: `${facts.awaitingCurriculumCount} course${
            facts.awaitingCurriculumCount === 1 ? "" : "s"
          } still need a curriculum written.`,
          detail:
            "Start here. Nothing can be certified or taught until the curriculum exists.",
          actionLabel: "Write curriculum",
          actionHref: buildCurriculumHref({
            courseId: facts.awaitingCurriculumCourseId,
          }),
        }
      : {
          id: "author",
          state: "done",
          headline: "Every active course has a curriculum draft.",
          actionLabel: "Open builder",
          actionHref: "/dashboard/academic/build",
        };

  const certify: StageStatus =
    facts.awaitingCurriculumCount > 0 && facts.readyToCertifyCount === 0
      ? {
          id: "certify",
          state: "waiting",
          headline: "Waiting for curricula to be written.",
          detail: "Certify opens only after a course has a draft.",
        }
      : facts.readyToCertifyCount > 0
        ? {
            id: "certify",
            state: "ready",
            headline: `${facts.readyToCertifyCount} course${
              facts.readyToCertifyCount === 1 ? " is" : "s are"
            } written and waiting to be certified.`,
            detail:
              "Until certified, no class can start a teaching plan for these courses.",
            actionLabel: "Certify a course",
            actionHref: buildCertifyHref({
              courseId: facts.readyToCertifyCourseId,
            }),
          }
        : facts.certifiedCourses > 0 &&
            facts.certifiedCourses >= facts.centralCourses
          ? {
              id: "certify",
              state: "done",
              headline: `All ${facts.certifiedCourses} courses have an official edition.`,
              actionLabel: "Open certify",
              actionHref: "/dashboard/academic/rollout",
            }
          : {
              id: "certify",
              state: "waiting",
              headline: "No courses are ready to certify yet.",
              detail: "Write a curriculum first, then return here.",
            };

  const distribute: StageStatus =
    facts.certifiedCourses === 0
      ? {
          id: "distribute",
          state: "waiting",
          headline: "Waiting for an official edition.",
          detail: "Distribute opens after at least one course is certified.",
        }
      : facts.assignedDirections === 0
        ? {
            id: "distribute",
            state: "ready",
            headline: "Editions exist but are not assigned to schools yet.",
            actionLabel: "Distribute edition",
            actionHref: buildDistributeHref(),
          }
        : {
            id: "distribute",
            state: "done",
            headline: `${facts.assignedDirections} school or pathway assignment${
              facts.assignedDirections === 1 ? "" : "s"
            } active.`,
            actionLabel: "Review assignments",
            actionHref: "/dashboard/academic/rollout",
          };

  const time: StageStatus =
    facts.certifiedCourses === 0 || facts.assignedDirections === 0
      ? {
          id: "time",
          state: "waiting",
          headline: "Waiting for school assignment.",
          detail: "Set timing after an edition is assigned to schools.",
        }
      : {
          id: "time",
          state: "ready",
          headline: "Confirm each school's real entry term and week.",
          actionLabel: "Set timing",
          actionHref: buildTimingHref(),
        };

  return [catalogue, author, certify, distribute, time];
}

export function overviewDeliveryStages(facts: OverviewFacts): StageStatus[] {
  const plan: StageStatus =
    facts.certifiedCourses === 0
      ? {
          id: "plan",
          state: "blocked",
          headline: "No official edition exists yet.",
          detail: "Finish the Curriculum lane first, starting with writing.",
          actionLabel: "Back to Overview flow",
          actionHref: "/dashboard/academic",
        }
      : facts.stuckPlans > 0
        ? {
            id: "plan",
            state: "blocked",
            headline: `${facts.stuckPlans} class plan(s) are not on an official edition.`,
            actionLabel: "Review assignments",
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
              headline: "Class teaching plans are in place.",
              actionLabel: "Open classes",
              actionHref: "/dashboard/classes",
            };

  const teach: StageStatus =
    plan.state === "blocked"
      ? { id: "teach", state: "waiting", headline: "Waiting for class plans." }
      : {
          id: "teach",
          state: "ready",
          headline: "Teach from each class: lessons, slides, flashcards.",
          actionLabel: "Open classes",
          actionHref: "/dashboard/classes",
        };

  const cover: StageStatus =
    plan.state === "blocked"
      ? { id: "cover", state: "waiting", headline: "Waiting for delivery." }
      : {
          id: "cover",
          state: "ready",
          headline: "Mark weeks taught so coverage stays accurate.",
          actionLabel: "Record coverage",
          actionHref: "/dashboard/learner-progress?view=delivery",
        };

  const evidence: StageStatus =
    plan.state === "blocked"
      ? { id: "evidence", state: "waiting", headline: "Waiting for teaching." }
      : {
          id: "evidence",
          state: "ready",
          headline: "Collect assignments, CBT and projects as evidence.",
          actionLabel: "Open grades",
          actionHref: "/dashboard/grades",
        };

  const result: StageStatus =
    plan.state === "blocked"
      ? { id: "result", state: "waiting", headline: "Waiting for evidence." }
      : {
          id: "result",
          state: "ready",
          headline: "Prepare results, then publish for the parent portal.",
          actionLabel: "Open results",
          actionHref: "/dashboard/academic/results",
        };

  return [plan, teach, cover, evidence, result];
}
