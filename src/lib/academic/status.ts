/**
 * What state is each academic stage actually in, and if it is stuck, why?
 *
 * Everything here is derived from live rows — nothing is stored, so no status
 * column can drift out of step with the truth. These are pure functions: the
 * API route does the querying and hands the facts in, which keeps the rules
 * testable against real data.
 *
 * The delivery diagnosis deliberately mirrors resolveOfficialCurriculumDirection()
 * in src/lib/curriculum/official-direction.ts. When a teacher cannot start a
 * plan, this is what tells them precisely which upstream stage is missing
 * instead of leaving them at a database error.
 */

import type { StageId } from "./lanes";
import { directionRoute, routeCopy, type EnrollmentType } from "./pathways";
import { editionName, type EditionLike } from "./labels";
import {
  buildCertifyHref,
  buildCurriculumHref,
  buildDistributeHref,
  buildTimingHref,
} from "@/lib/curriculum/href";

export type StageState =
  | "done" // finished
  | "ready" // can be acted on now
  | "blocked" // cannot proceed until an earlier stage is fixed
  | "waiting"; // nothing to do here yet; an earlier stage has not started

export type StageStatus = {
  id: StageId;
  state: StageState;
  /** One short sentence naming the state. */
  headline: string;
  /** Why, in staff language. Always present when blocked. */
  detail?: string;
  /** The exact next move, when there is one. */
  actionLabel?: string;
  actionHref?: string;
};

// ── Lane A — the curriculum asset, per course ──────────────────────────────

export type AssetFacts = {
  courseId?: string | null;
  centralDraftId?: string | null;
  courseTitle?: string | null;
  programmeLinked: boolean;
  centralDraftCount: number;
  publishedRelease: (EditionLike & { id: string }) | null;
  /** Active school adoptions of this course. */
  adoptionCount: number;
  /** Offerings that must own an edition (online/special) for this course. */
  independentOfferingCount: number;
  /** Active own-edition directions for those offerings. */
  offeringDirectionCount: number;
  /** Delivery schedules (entry term/week) recorded for this course. */
  scheduleCount: number;
  /** Schools expected to teach this course through a school-pathway offering. */
  expectedSchoolCount?: number;
  /** Of those, how many still have no active adoption. */
  schoolsMissingAdoption?: number;
  /** Independent offerings still without their own edition. */
  offeringsMissingDirection?: number;
};

export function assetStatus(facts: AssetFacts): StageStatus[] {
  const author: StageStatus =
    facts.centralDraftCount > 0
      ? {
          id: "author",
          state: "done",
          headline: `Central draft ready (${facts.centralDraftCount}).`,
        }
      : {
          id: "author",
          state: "ready",
          headline: "No central draft yet.",
          detail:
            "Write or generate the curriculum for this course before it can be certified.",
          actionLabel: "Author curriculum",
          actionHref: buildCurriculumHref({ courseId: facts.courseId }),
        };

  const certify: StageStatus = facts.publishedRelease
    ? {
        id: "certify",
        state: "done",
        headline: `Official edition published — ${editionName(facts.publishedRelease)}.`,
      }
    : facts.centralDraftCount > 0
      ? {
          id: "certify",
          state: "ready",
          headline: "Draft is not yet an official edition.",
          detail:
            "Until it is certified, no class can start a teaching plan for this course.",
          actionLabel: "Certify this course",
          actionHref: buildCertifyHref({
            courseId: facts.courseId,
            curriculumId: facts.centralDraftId,
          }),
        }
      : {
          id: "certify",
          state: "waiting",
          headline: "Waiting for a central draft.",
          detail: "There is nothing to certify until the curriculum is written.",
        };

  // Coverage, not totals: every school expected to teach this course needs an
  // adoption, and every independent pathway needs its own edition. One adoption
  // used to be enough to call this done while other schools had nothing.
  const schoolsMissing = facts.schoolsMissingAdoption ?? 0;
  const offeringsMissing =
    facts.offeringsMissingDirection ??
    Math.max(0, facts.independentOfferingCount - facts.offeringDirectionCount);
  const gaps: string[] = [];
  if (schoolsMissing > 0) gaps.push(`${schoolsMissing} school(s)`);
  if (offeringsMissing > 0)
    gaps.push(`${offeringsMissing} online or special pathway(s)`);

  const distribute: StageStatus = !facts.publishedRelease
    ? {
        id: "distribute",
        state: "waiting",
        headline: "Waiting for an official edition.",
        detail: "Nothing can be distributed until the course is certified.",
      }
    : gaps.length > 0
      ? {
          id: "distribute",
          state: "ready",
          headline: `${gaps.join(" and ")} still need this edition.`,
          detail:
            offeringsMissing > 0
              ? "Online and special pathways never inherit a school adoption — each needs an edition assigned directly."
              : "Assign the official edition so every school teaching this course receives it.",
          actionLabel: "Distribute edition",
          actionHref: buildDistributeHref({
            courseId: facts.courseId,
            curriculumId: facts.centralDraftId,
          }),
        }
      : facts.adoptionCount === 0 && facts.offeringDirectionCount === 0
        ? {
            id: "distribute",
            state: "ready",
            headline: "Published, but not given to anyone yet.",
            detail: "Assign the official edition so schools can teach it.",
            actionLabel: "Distribute edition",
            actionHref: buildDistributeHref({
              courseId: facts.courseId,
              curriculumId: facts.centralDraftId,
            }),
          }
        : {
            id: "distribute",
            state: "done",
            headline: `Assigned to ${facts.adoptionCount} school(s) and ${facts.offeringDirectionCount} pathway(s).`,
          };

  const time: StageStatus = !facts.publishedRelease
    ? {
        id: "time",
        state: "waiting",
        headline: "Waiting for an official edition.",
      }
    : facts.scheduleCount > 0
      ? {
          id: "time",
          state: "done",
          headline: `Entry point set for ${facts.scheduleCount} pathway(s).`,
        }
      : {
          id: "time",
          state: "ready",
          headline: "Using the default entry point.",
          detail:
            "Set the real entry term and week if a school joins the curriculum part-way.",
          actionLabel: "Set timing",
          actionHref: buildTimingHref({
            courseId: facts.courseId,
            releaseId: facts.publishedRelease?.id,
          }),
        };

  return [author, certify, distribute, time];
}

// ── The junction — why can this class not resolve an official edition? ─────

export type DirectionFacts = {
  courseId?: string | null;
  enrollmentType: EnrollmentType | string | null | undefined;
  /** Release already pinned onto an existing plan. */
  pinnedReleaseId?: string | null;
  /** Any published edition for this course, newest first. */
  publishedRelease: (EditionLike & { id: string }) | null;
  /** Active own-edition direction for this class's offering, if any. */
  offeringDirection: { release_id: string } | null;
  /** Active school adoption for this school + course, if any. */
  adoption: {
    release_id: string;
    academic_session: string | null;
    effective_term_number: number | null;
  } | null;
  /** The academic session and term the class is actually teaching. */
  classSession: string | null;
  classTermNumber: number | null;
};

export type DirectionDiagnosis =
  | { resolved: true; releaseId: string }
  | {
      resolved: false;
      reason:
        | "not_certified"
        | "pathway_needs_own_edition"
        | "not_adopted"
        | "session_mismatch";
      headline: string;
      detail: string;
      actionLabel: string;
      actionHref: string;
    };

/**
 * Mirrors the resolver's precedence: a pinned edition wins; an independent
 * pathway may only use its own direction; otherwise the school's adoption
 * applies when its session and term line up with what the class is teaching.
 */
export function diagnoseDirection(facts: DirectionFacts): DirectionDiagnosis {
  if (facts.pinnedReleaseId) {
    return { resolved: true, releaseId: facts.pinnedReleaseId };
  }

  const independent = directionRoute(facts.enrollmentType) === "own_edition";
  const copy = routeCopy(facts.enrollmentType);

  if (independent) {
    if (facts.offeringDirection) {
      return { resolved: true, releaseId: facts.offeringDirection.release_id };
    }
    if (!facts.publishedRelease) {
      return {
        resolved: false,
        reason: "not_certified",
        headline: "This course has no official edition yet.",
        detail:
          "Certify the curriculum first, then assign an edition to this pathway.",
        actionLabel: "Certify this course",
        actionHref: buildCertifyHref({ courseId: facts.courseId }),
      };
    }
    return {
      resolved: false,
      reason: "pathway_needs_own_edition",
      headline: "This pathway needs its own official edition.",
      detail: copy.whenMissing,
      actionLabel: copy.action,
      actionHref: buildDistributeHref({ courseId: facts.courseId }),
    };
  }

  if (!facts.publishedRelease) {
    return {
      resolved: false,
      reason: "not_certified",
      headline: "This course has no official edition yet.",
      detail:
        "No class can start a teaching plan until the Academic Office certifies the curriculum.",
      actionLabel: "Certify this course",
      actionHref: buildCertifyHref({ courseId: facts.courseId }),
    };
  }

  if (!facts.adoption) {
    return {
      resolved: false,
      reason: "not_adopted",
      headline: "This school has not been given the official edition.",
      detail: copy.whenMissing,
      actionLabel: copy.action,
      actionHref: buildDistributeHref({ courseId: facts.courseId }),
    };
  }

  const sessionMatches =
    !facts.classSession ||
    !facts.adoption.academic_session ||
    facts.adoption.academic_session === facts.classSession;
  const termApplies =
    !facts.classTermNumber ||
    !facts.adoption.effective_term_number ||
    facts.adoption.effective_term_number <= facts.classTermNumber;

  if (!sessionMatches || !termApplies) {
    return {
      resolved: false,
      reason: "session_mismatch",
      headline: "The assigned edition is for a different academic period.",
      detail: !sessionMatches
        ? `This class teaches ${facts.classSession}, but the assigned edition is for ${facts.adoption.academic_session}.`
        : `The assigned edition starts in term ${facts.adoption.effective_term_number}, after this class's term ${facts.classTermNumber}.`,
      actionLabel: "Assign an edition for this period",
      actionHref: buildDistributeHref({ courseId: facts.courseId }),
    };
  }

  return { resolved: true, releaseId: facts.adoption.release_id };
}

// ── Lane B — delivery, per class + term + course ───────────────────────────

export type DeliveryFacts = {
  direction: DirectionFacts;
  planExists: boolean;
  planHasRelease: boolean;
  deliveredWeekCount: number;
  plannedWeekCount: number;
  evidenceCount: number;
  resultsPublished: boolean;
};

export function deliveryStatus(facts: DeliveryFacts): StageStatus[] {
  const diagnosis = diagnoseDirection(facts.direction);

  const plan: StageStatus = !diagnosis.resolved
    ? {
        id: "plan",
        state: "blocked",
        headline: diagnosis.headline,
        detail: diagnosis.detail,
        actionLabel: diagnosis.actionLabel,
        actionHref: diagnosis.actionHref,
      }
    : facts.planExists && facts.planHasRelease
      ? { id: "plan", state: "done", headline: "Term plan is on the official edition." }
      : facts.planExists
        ? {
            id: "plan",
            state: "ready",
            headline: "Term plan is not attached to an official edition.",
            detail:
              "Open the class and sync the plan so it follows the protected edition.",
            actionLabel: "Open class",
            actionHref: "/dashboard/classes",
          }
        : {
            id: "plan",
            state: "ready",
            headline: "No term plan yet.",
            detail: "Start the plan inside the class; it inherits the official edition.",
            actionLabel: "Open class",
            actionHref: "/dashboard/classes",
          };

  const blockedByPlan = plan.state === "blocked" || !facts.planExists;

  const teach: StageStatus = blockedByPlan
    ? { id: "teach", state: "waiting", headline: "Waiting for the term plan." }
    : facts.deliveredWeekCount > 0
      ? {
          id: "teach",
          state: "done",
          headline: `Teaching under way — ${facts.deliveredWeekCount} of ${facts.plannedWeekCount || "?"} weeks delivered.`,
        }
      : {
          id: "teach",
          state: "ready",
          headline: "Plan is ready to teach.",
          actionLabel: "Open class",
          actionHref: "/dashboard/classes",
        };

  const cover: StageStatus = blockedByPlan
    ? { id: "cover", state: "waiting", headline: "Waiting for the term plan." }
    : facts.deliveredWeekCount > 0
      ? {
          id: "cover",
          state: "done",
          headline: `${facts.deliveredWeekCount} week(s) recorded as delivered.`,
        }
      : {
          id: "cover",
          state: "ready",
          headline: "No delivered weeks recorded yet.",
          detail: "Mark weeks as taught so coverage and reports stay accurate.",
          actionLabel: "Record coverage",
          actionHref: "/dashboard/learner-progress?view=delivery",
        };

  const evidence: StageStatus = blockedByPlan
    ? { id: "evidence", state: "waiting", headline: "Waiting for the term plan." }
    : facts.evidenceCount > 0
      ? {
          id: "evidence",
          state: "done",
          headline: `${facts.evidenceCount} piece(s) of learner evidence collected.`,
        }
      : {
          id: "evidence",
          state: "ready",
          headline: "No learner evidence yet.",
          actionLabel: "Open gradebook",
          actionHref: "/dashboard/grades",
        };

  const result: StageStatus = facts.resultsPublished
    ? { id: "result", state: "done", headline: "Results published for this term." }
    : blockedByPlan
      ? { id: "result", state: "waiting", headline: "Waiting for the term plan." }
      : facts.evidenceCount > 0
        ? {
            id: "result",
            state: "ready",
            headline: "Evidence is in — results are not published yet.",
            actionLabel: "Open Auto-fill",
            actionHref: "/dashboard/academic/results",
          }
        : { id: "result", state: "waiting", headline: "Waiting for learner evidence." };

  return [plan, teach, cover, evidence, result];
}

// ── Picking the one next action ────────────────────────────────────────────

/**
 * The single honest next move.
 *
 * A blocked stage wins over anything merely ready: it is a gate, and work
 * further down the lane cannot legitimately finish while it stands. Live data
 * proved why — a class whose plan could not resolve an edition still had old
 * evidence attached, so preferring "ready" pointed staff at publishing results
 * for a term that had no official curriculum behind it.
 */
export function nextAction(statuses: StageStatus[]): StageStatus | null {
  return (
    statuses.find((s) => s.state === "blocked") ??
    statuses.find((s) => s.state === "ready" && s.actionHref) ??
    null
  );
}

export function laneSummary(statuses: StageStatus[]): {
  done: number;
  total: number;
  blocked: number;
} {
  return {
    done: statuses.filter((s) => s.state === "done").length,
    total: statuses.length,
    blocked: statuses.filter((s) => s.state === "blocked").length,
  };
}
