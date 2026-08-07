/**
 * Turn an adopted curriculum release into a class's teaching plan.
 *
 * A class cannot generate a week until it has a lesson_plans row: every
 * generate route stops at "This class has no teaching plan to generate from
 * yet." Adoption was only half the journey — 58 classes had adopted a
 * curriculum and 4 had a plan, so 54 classes could adopt, look ready, and still
 * refuse to generate anything.
 *
 * Only two things in the codebase ever created a plan: bridgeTrack, reachable
 * from the special-programme routes alone, and a side-effect of editing a
 * lesson. Nothing carried a school class from "curriculum adopted" to "plan
 * exists", so it was done by hand or not at all.
 *
 * This is the mapping half, kept pure so it can be tested without a database:
 * a release holds `content.terms[]`, each term holds the `weeks[]` a plan needs.
 */

export type ReleaseWeek = {
  week?: unknown;
  type?: unknown;
  [key: string]: unknown;
};

export type ReleaseTerm = {
  term?: unknown;
  title?: unknown;
  weeks?: ReleaseWeek[] | null;
};

export type ReleaseContent = {
  terms?: ReleaseTerm[] | null;
  /** Older releases stored the weeks flat, with no term grouping. */
  weeks?: ReleaseWeek[] | null;
};

export type PlanData = {
  weeks: ReleaseWeek[];
  source_term?: number;
  source_title?: string;
};

/** Term numbers as the curriculum writes them. */
export function termNumberFrom(termLabel: string | null | undefined): number | null {
  if (!termLabel) return null;
  const text = String(termLabel).trim().toLowerCase();
  if (!text) return null;

  if (text.includes('first') || /\b1st\b/.test(text) || /\bterm\s*1\b/.test(text) || /\bt1\b/.test(text)) return 1;
  if (text.includes('second') || /\b2nd\b/.test(text) || /\bterm\s*2\b/.test(text) || /\bt2\b/.test(text)) return 2;
  if (text.includes('third') || /\b3rd\b/.test(text) || /\bterm\s*3\b/.test(text) || /\bt3\b/.test(text)) return 3;
  if (text.includes('fourth') || /\b4th\b/.test(text) || /\bterm\s*4\b/.test(text) || /\bt4\b/.test(text)) return 4;

  const match = text.match(/\bterm\s*([1-4])\b/) || text.match(/\b([1-4])(?:st|nd|rd|th)?\s*term\b/);
  if (match?.[1]) return Number(match[1]);

  return null;
}


/**
 * The weeks a class should teach this term.
 *
 * Falls back deliberately rather than failing: a release that names no matching
 * term still has teaching in it, and refusing to build a plan would leave the
 * class exactly where it started — unable to generate. A plan built from the
 * first available term is a teacher's starting point; no plan is a dead end.
 */
export function planDataForTerm(
  content: ReleaseContent | null | undefined,
  termLabel: string | null | undefined,
): PlanData | null {
  if (!content || typeof content !== 'object') return null;

  const terms = Array.isArray(content.terms) ? content.terms : [];

  // A release with no term grouping at all — take its weeks as they are.
  if (terms.length === 0) {
    const flat = Array.isArray(content.weeks) ? content.weeks : [];
    return flat.length ? { weeks: flat } : null;
  }

  const hasWeeks = (t: ReleaseTerm | undefined) => Array.isArray(t?.weeks) && t.weeks!.length > 0;

  // The matching term only counts if it actually carries weeks. A term that
  // exists but is empty — Third Term written up but not yet filled in — would
  // otherwise win the match and produce a plan with nothing in it, which
  // generates exactly as much as no plan at all.
  const wanted = termNumberFrom(termLabel);
  const match = wanted !== null
    ? terms.find((t) => Number(t?.term) === wanted && hasWeeks(t))
    : undefined;

  const chosen = match ?? terms.find(hasWeeks);
  if (!chosen) return null;

  const weeks = Array.isArray(chosen.weeks) ? chosen.weeks : [];
  if (weeks.length === 0) return null;

  return {
    weeks,
    ...(Number.isFinite(Number(chosen.term)) ? { source_term: Number(chosen.term) } : {}),
    ...(typeof chosen.title === 'string' && chosen.title ? { source_title: chosen.title } : {}),
  };
}

export type PlanRow = {
  class_id: string;
  school_id: string;
  course_id: string;
  term_id: string | null;
  curriculum_release_id: string;
  plan_data: PlanData;
  status: 'published';
  version: number;
  sessions_per_week: number;
};

/**
 * The row to insert, shaped like the plans that already work.
 *
 * Published rather than draft on purpose: the generate routes refuse a draft
 * with "publish it and the whole week will generate", and a plan built from an
 * already-published curriculum release has nothing left to approve. Leaving it
 * draft would swap one blocking message for another.
 *
 * Returns null when a binding is missing — the routes check for a course and a
 * school, so writing a row without them creates something that looks ready and
 * still cannot generate.
 */
export function buildPlanRow(input: {
  classId: string;
  schoolId: string | null | undefined;
  courseId: string | null | undefined;
  termId: string | null | undefined;
  releaseId: string;
  planData: PlanData;
  sessionsPerWeek?: number;
}): PlanRow | null {
  if (!input.classId || !input.schoolId || !input.courseId || !input.releaseId) return null;
  if (!input.planData || !Array.isArray(input.planData.weeks) || input.planData.weeks.length === 0) return null;

  return {
    class_id: input.classId,
    school_id: input.schoolId,
    course_id: input.courseId,
    term_id: input.termId ?? null,
    curriculum_release_id: input.releaseId,
    plan_data: input.planData,
    status: 'published',
    version: 2,
    sessions_per_week: input.sessionsPerWeek && input.sessionsPerWeek > 0 ? input.sessionsPerWeek : 1,
  };
}

export type FineTunedWeek = ReleaseWeek & {

  is_customized?: boolean;
  customized_at?: string;
  original_topic?: string;
};

/**
 * Intelligently merge an existing class plan with an updated curriculum release.
 *
 * Preserves all weeks that teachers have fine-tuned or customized (is_customized === true),
 * while updating non-customized weeks to match the latest master release content.
 */
export function mergePlanWithRelease(input: {
  existingPlanData: PlanData | null | undefined;
  releaseContent: ReleaseContent | null | undefined;
  termLabel: string | null | undefined;
}): PlanData | null {
  const freshData = planDataForTerm(input.releaseContent, input.termLabel);
  if (!freshData) return input.existingPlanData ?? null;
  if (!input.existingPlanData || !Array.isArray(input.existingPlanData.weeks)) {
    return freshData;
  }

  const existingWeeksMap = new Map<number, FineTunedWeek>();
  for (const w of input.existingPlanData.weeks as FineTunedWeek[]) {
    const num = Number(w.week);
    if (Number.isFinite(num) && num > 0) {
      existingWeeksMap.set(num, w);
    }
  }

  const mergedWeeks: FineTunedWeek[] = freshData.weeks.map((freshWeek) => {
    const num = Number(freshWeek.week);
    const existing = existingWeeksMap.get(num);
    if (existing && existing.is_customized) {
      return existing;
    }
    return freshWeek;
  });

  const maxFreshWeek = Math.max(...freshData.weeks.map((w) => Number(w.week) || 0), 0);
  for (const [num, existingWeek] of existingWeeksMap.entries()) {
    if (num > maxFreshWeek && existingWeek.is_customized) {
      mergedWeeks.push(existingWeek);
    }
  }

  mergedWeeks.sort((a, b) => (Number(a.week) || 0) - (Number(b.week) || 0));

  return {
    ...freshData,
    weeks: mergedWeeks,
  };
}

/**
 * Mark and update a specific week in a plan as fine-tuned by a teacher/school.
 */
export function customisePlanWeek(
  planData: PlanData,
  weekNumber: number,
  updates: Partial<ReleaseWeek>,
): PlanData {
  const weeks = Array.isArray(planData.weeks) ? [...planData.weeks] : [];
  const idx = weeks.findIndex((w) => Number(w.week) === weekNumber);

  if (idx >= 0) {
    const target = weeks[idx] as FineTunedWeek;
    weeks[idx] = {
      ...target,
      ...updates,
      week: weekNumber,
      is_customized: true,
      customized_at: new Date().toISOString(),
      original_topic: target.original_topic ?? String(target.topic ?? ''),
    };
  }

  return {
    ...planData,
    weeks,
  };
}

/**
 * Write path: Syncs adopted curriculum releases into class lesson_plans rows.
 *
 * Plugs directly into the central academic readiness automation pipeline
 * (runAcademicReadinessAutomation), ensuring class teacher assignment, official
 * direction resolution, RPC safety, auto-generate settings, and teacher notifications
 * are preserved without regression.
 */
export async function instantiatePlansFromAdoptions(
  dbClient?: any,
  options?: { classIds?: string[]; courseId?: string; offeringId?: string; limit?: number; forceRefresh?: boolean },
): Promise<{
  scanned: number;
  created: number;
  skipped: number;
  errors: Array<{ classId: string; className: string; error: string }>;
}> {
  const { createAdminClient } = await import('@/lib/supabase/admin');
  const { runAcademicReadinessAutomation } = await import('@/lib/academic/readiness-automation');

  const db = dbClient ?? createAdminClient();

  const report = {
    scanned: 0,
    created: 0,
    skipped: 0,
    errors: [] as Array<{ classId: string; className: string; error: string }>,
  };

  try {
    const automationReport = await runAcademicReadinessAutomation(db, {
      classIds: options?.classIds,
      courseId: options?.courseId,
      offeringId: options?.offeringId,
      limit: options?.limit,
    });

    report.scanned = automationReport.scanned;
    report.created = automationReport.plansCreated + automationReport.plansRefreshed;
    report.skipped = Math.max(0, automationReport.scanned - report.created - automationReport.issues.length);

    for (const issue of automationReport.issues) {
      report.errors.push({
        classId: issue.classId,
        className: issue.className,
        error: `[${issue.code}] ${issue.message}`,
      });
    }
  } catch (error: any) {
    throw new Error(`Central academic plan sync failed: ${error.message ?? String(error)}`);
  }

  return report;
}




