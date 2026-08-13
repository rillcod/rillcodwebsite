/**
 * One teaching-preparation boundary for special programmes and regular schools.
 *
 * Special: page → offering → cohort → bridge → Week 1 · Class 1 (held).
 * School: class → teacher/course/period/direction → teaching plan.
 *
 * Callers (publish, Prepare, featured, payment, cron) queue or await this —
 * they do not re-implement launch gates or queue helpers.
 */
import { after } from 'next/server';
import type { NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { runClassAcademicReadiness } from '@/lib/academic/prepare-class-readiness';
import { launchSpecialProgramTeaching } from '@/lib/special-programs/launch-teaching';
import type { LaunchTeachingResult } from '@/lib/special-programs/launch-teaching';
import type { TeachingReadiness } from '@/lib/special-programs/teaching-readiness';
import { buildTeachingReadiness } from '@/lib/special-programs/teaching-readiness';
import {
  loadOfferingClasses,
  pickPrimaryCohort,
  syncOfferingLinks,
} from '@/lib/special-programs/ensure-cohort-class';

export type PreparePathway = 'special' | 'school';

export type PrepareTeachingResult =
  | ({
      pathway: 'special';
      ok: boolean;
      blocked?: boolean;
      blockers?: string[];
    } & LaunchTeachingResult)
  | {
      pathway: 'school';
      ok: boolean;
      classId: string;
      error?: string;
    };

/** Steps a person must settle before special teaching can start. */
export const SPECIAL_PREP_BLOCKER_STEPS = [
  'programme',
  'school',
  'published',
] as const;

export function specialPrepBlockers(
  readiness:
    | Pick<TeachingReadiness, 'can_prepare' | 'steps' | 'missing'>
    | null
    | undefined,
): string[] {
  if (!readiness) return [];
  if (readiness.can_prepare) return [];
  const fromSteps = (readiness.steps || [])
    .filter(
      (s) =>
        !s.ok &&
        (SPECIAL_PREP_BLOCKER_STEPS as readonly string[]).includes(s.id),
    )
    .map((s) => s.label);
  return fromSteps.length ? fromSteps : readiness.missing;
}

export function formatSpecialPrepBlock(
  readiness:
    | Pick<TeachingReadiness, 'can_prepare' | 'steps' | 'missing'>
    | null
    | undefined,
  opts?: { published?: boolean },
): string {
  const detail = specialPrepBlockers(readiness).join(', ') || 'readiness incomplete';
  if (opts?.published) {
    return `Published, but teaching was not started — finish: ${detail}, then press Prepare teaching.`;
  }
  return `Finish teaching readiness first: ${detail}.`;
}

export function launchContextFromRequest(request: NextRequest): {
  cookie?: string;
  cronSecret?: string;
} {
  const cookie = request.headers.get('cookie') ?? undefined;
  const cronSecret =
    process.env.CRON_SECRET || process.env.BILLING_CRON_SECRET || undefined;
  return { cookie, cronSecret };
}

/**
 * Run teaching preparation after the response, without letting it fail the caller.
 *
 * Two things this has to survive. `runClassAcademicReadiness` rethrows so the
 * awaited path can report `ok: false` — queued callers must not inherit that, or a
 * failed prep becomes an unhandled rejection on the payment success path. And
 * `after()` needs a request scope: preparation is reached from webhooks and routes
 * (which have one) and from cron repair sweeps (which do not), where calling it
 * throws. Preparation is a best-effort follow-up the nightly sweep retries, so it
 * must never be able to fail the thing that triggered it.
 */
function runInBackground(label: string, work: () => Promise<void>): void {
  const guarded = async () => {
    try {
      await work();
    } catch (err) {
      console.error(`${label} preparation gave up`, err);
    }
  };
  try {
    after(guarded);
  } catch {
    void guarded();
  }
}

/** In-process lock so publish + Prepare cannot run the same page twice. */
const runningKeys = new Set<string>();

function lockKey(pathway: PreparePathway, id: string): string {
  return `${pathway}:${id}`;
}

export async function prepareTeaching(
  input:
    | {
        pathway: 'special';
        pageId: string;
        actorId: string;
        cookie?: string;
        cronSecret?: string;
        forceRebuild?: boolean;
        notifyAdminId?: string;
        /** School chosen on create/save — stamp the offering if the trigger raced. */
        schoolId?: string | null;
      }
    | {
        pathway: 'school';
        classId: string;
      },
): Promise<PrepareTeachingResult> {
  if (input.pathway === 'school') {
    try {
      await runClassAcademicReadiness(input.classId);
      return { pathway: 'school', ok: true, classId: input.classId };
    } catch (err: any) {
      return {
        pathway: 'school',
        ok: false,
        classId: input.classId,
        error: err?.message || 'School teaching preparation failed',
      };
    }
  }

  const key = lockKey('special', input.pageId);
  if (runningKeys.has(key)) {
    return {
      pathway: 'special',
      pageId: input.pageId,
      offeringId: null,
      bridge: null,
      weeksStarted: [],
      ok: false,
      blocked: true,
      error: 'Teaching preparation is already running for this programme.',
    };
  }

  runningKeys.add(key);
  try {
    const db = createAdminClient();

    // Create+publish races the offering-link trigger. Wait briefly so readiness
    // does not false-block on a missing offering or school stamp.
    let offeringId: string | null = null;
    for (let attempt = 0; attempt < 4 && !offeringId; attempt += 1) {
      const { data: page } = await db
        .from('special_program_pages')
        .select('academic_offering_id')
        .eq('id', input.pageId)
        .maybeSingle();
      offeringId = page?.academic_offering_id
        ? String(page.academic_offering_id)
        : null;
      if (!offeringId) {
        const { data: byPage } = await db
          .from('academic_offerings')
          .select('id')
          .eq('special_program_page_id', input.pageId)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        offeringId = byPage?.id ? String(byPage.id) : null;
      }
      if (!offeringId) {
        await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
      }
    }

    if (offeringId) {
      const { data: offering } = await db
        .from('academic_offerings')
        .select('settings,school_id')
        .eq('id', offeringId)
        .maybeSingle();
      const settings = (offering?.settings ?? {}) as Record<string, unknown>;
      const launch = settings.teaching_launch as { status?: string; at?: string } | undefined;
      if (launch?.status === 'running' && launch.at) {
        const age = Date.now() - new Date(launch.at).getTime();
        if (Number.isFinite(age) && age < 10 * 60 * 1000) {
          return {
            pathway: 'special',
            pageId: input.pageId,
            offeringId,
            bridge: null,
            weeksStarted: [],
            ok: false,
            blocked: true,
            error: 'Teaching preparation is already running for this programme.',
          };
        }
      }

      const hintedSchool = input.schoolId ? String(input.schoolId) : null;
      if (hintedSchool && !offering?.school_id) {
        await syncOfferingLinks(db, {
          pageId: input.pageId,
          offeringId,
          schoolId: hintedSchool,
        });
      }
    }

    const { data: pageRow } = await db
      .from('special_program_pages')
      .select('program_id,is_published,starts_on,academic_offering_id')
      .eq('id', input.pageId)
      .maybeSingle();
    const pageOfferingId = pageRow?.academic_offering_id
      ? String(pageRow.academic_offering_id)
      : offeringId;
    let schoolId: string | null = input.schoolId ? String(input.schoolId) : null;
    if (pageOfferingId) {
      const { data: offeringRow } = await db
        .from('academic_offerings')
        .select('school_id')
        .eq('id', pageOfferingId)
        .maybeSingle();
      if (offeringRow?.school_id) schoolId = String(offeringRow.school_id);
    }
    const cohortClass = pageOfferingId
      ? pickPrimaryCohort(await loadOfferingClasses(db, pageOfferingId))
      : null;
    const readiness = buildTeachingReadiness({
      programId: pageRow?.program_id ? String(pageRow.program_id) : null,
      schoolId,
      isPublished: Boolean(pageRow?.is_published),
      startsOn: pageRow?.starts_on ? String(pageRow.starts_on) : null,
      cohortClass,
    });
    if (!readiness.can_prepare) {
      const detail = formatSpecialPrepBlock(readiness);
      return {
        pathway: 'special',
        pageId: input.pageId,
        offeringId: pageOfferingId,
        bridge: null,
        weeksStarted: [],
        ok: false,
        blocked: true,
        error: detail,
        detail,
      };
    }

    const result = await launchSpecialProgramTeaching({
      pageId: input.pageId,
      createdBy: input.actorId,
      cookie: input.cookie,
      cronSecret: input.cronSecret,
      forceRebuild: input.forceRebuild === true,
      notifyAdminId: input.notifyAdminId,
    });
    return {
      pathway: 'special',
      ok: !result.error,
      ...result,
    };
  } finally {
    runningKeys.delete(key);
  }
}

/** Fire-and-forget prepare after the HTTP response (publish / featured). */
export function queuePrepareTeaching(input: {
  pathway: 'special';
  pageId: string;
  actorId: string;
  request: NextRequest;
  forceRebuild?: boolean;
  schoolId?: string | null;
}): void;
export function queuePrepareTeaching(input: {
  pathway: 'school';
  classId: string | null | undefined;
}): void;
export function queuePrepareTeaching(
  input:
    | {
        pathway: 'special';
        pageId: string;
        actorId: string;
        request: NextRequest;
        forceRebuild?: boolean;
        schoolId?: string | null;
      }
    | { pathway: 'school'; classId: string | null | undefined },
): void {
  if (input.pathway === 'school') {
    const classId = input.classId;
    if (!classId) return;
    runInBackground(`[prepare-teaching] school ${classId}`, () =>
      runClassAcademicReadiness(classId),
    );
    return;
  }

  const ctx = launchContextFromRequest(input.request);
  runInBackground(`[prepare-teaching] special ${input.pageId}`, async () => {
    const result = await prepareTeaching({
      pathway: 'special',
      pageId: input.pageId,
      actorId: input.actorId,
      ...ctx,
      forceRebuild: input.forceRebuild === true,
      notifyAdminId: input.actorId,
      schoolId: input.schoolId,
    });
    if (result.pathway === 'special' && result.error) {
      console.error(
        '[prepare-teaching]',
        input.pageId,
        result.error,
        result.detail,
      );
    } else if (result.pathway === 'special') {
      console.info(
        '[prepare-teaching]',
        input.pageId,
        `bridge built=${result.bridge?.built} skipped=${result.bridge?.skipped} weeks=${result.weeksStarted.length}`,
      );
    }
  });
}
