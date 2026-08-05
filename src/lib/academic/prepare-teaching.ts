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
  baseUrl: string;
  cookie?: string;
  cronSecret?: string;
} {
  const baseUrl = (
    request.nextUrl?.origin ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'http://localhost:3000'
  ).replace(/\/$/, '');
  const cookie = request.headers.get('cookie') ?? undefined;
  const cronSecret =
    process.env.CRON_SECRET || process.env.BILLING_CRON_SECRET || undefined;
  return { baseUrl, cookie, cronSecret };
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
        baseUrl: string;
        cookie?: string;
        cronSecret?: string;
        forceRebuild?: boolean;
        notifyAdminId?: string;
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
    // Soft DB lock via offering status when available
    const db = createAdminClient();
    const { data: page } = await db
      .from('special_program_pages')
      .select('academic_offering_id')
      .eq('id', input.pageId)
      .maybeSingle();
    const offeringId = page?.academic_offering_id
      ? String(page.academic_offering_id)
      : null;
    if (offeringId) {
      const { data: offering } = await db
        .from('academic_offerings')
        .select('settings')
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
    }

    const result = await launchSpecialProgramTeaching({
      pageId: input.pageId,
      createdBy: input.actorId,
      baseUrl: input.baseUrl,
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
}): void;
export function queuePrepareTeaching(input: {
  pathway: 'school';
  classId: string;
}): void;
export function queuePrepareTeaching(
  input:
    | {
        pathway: 'special';
        pageId: string;
        actorId: string;
        request: NextRequest;
        forceRebuild?: boolean;
      }
    | { pathway: 'school'; classId: string },
): void {
  if (input.pathway === 'school') {
    after(() => runClassAcademicReadiness(input.classId));
    return;
  }

  const ctx = launchContextFromRequest(input.request);
  after(async () => {
    try {
      const result = await prepareTeaching({
        pathway: 'special',
        pageId: input.pageId,
        actorId: input.actorId,
        ...ctx,
        forceRebuild: input.forceRebuild === true,
        notifyAdminId: input.actorId,
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
    } catch (err) {
      console.error('[prepare-teaching] failed', input.pageId, err);
    }
  });
}
