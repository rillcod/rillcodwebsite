/**
 * Persist and surface special-programme teaching prep results so admins
 * are not left guessing after publish / Prepare teaching.
 */
import type { LaunchTeachingResult } from '@/lib/special-programs/launch-teaching';

export type TeachingLaunchStatus = {
  status: 'running' | 'ok' | 'error';
  at: string;
  error?: string;
  detail?: string;
  built?: number;
  skipped?: number;
  failed?: number;
  weeks_started?: number;
  force_rebuild?: boolean;
};

type AnySupabase = any;

export async function writeTeachingLaunchStatus(
  db: AnySupabase,
  offeringId: string,
  status: TeachingLaunchStatus,
): Promise<void> {
  const { data: offering } = await db
    .from('academic_offerings')
    .select('settings')
    .eq('id', offeringId)
    .maybeSingle();
  const settings =
    offering?.settings && typeof offering.settings === 'object'
      ? { ...(offering.settings as Record<string, unknown>) }
      : {};
  await db
    .from('academic_offerings')
    .update({
      settings: { ...settings, teaching_launch: status },
      updated_at: new Date().toISOString(),
    })
    .eq('id', offeringId);
}

export async function readTeachingLaunchStatus(
  db: AnySupabase,
  offeringId: string | null | undefined,
): Promise<TeachingLaunchStatus | null> {
  if (!offeringId) return null;
  const { data } = await db
    .from('academic_offerings')
    .select('settings')
    .eq('id', offeringId)
    .maybeSingle();
  const raw = (data?.settings as Record<string, unknown> | null)?.teaching_launch;
  if (!raw || typeof raw !== 'object') return null;
  return raw as TeachingLaunchStatus;
}

/** Human summary for toasts and the builder status line. */
export function summariseLaunchResult(result: LaunchTeachingResult): string {
  if (result.error) {
    return [result.error, result.detail].filter(Boolean).join(' — ');
  }
  const built = result.bridge?.built ?? 0;
  const skipped = result.bridge?.skipped ?? 0;
  const failed = result.bridge?.failed ?? 0;
  const weeks = result.weeksStarted.length;
  const parts = [
    built ? `${built} module(s) prepared` : null,
    skipped ? `${skipped} already up to date` : null,
    failed ? `${failed} failed` : null,
    weeks ? `${weeks} week pack(s) started for review` : null,
  ].filter(Boolean);
  if (!parts.length) {
    return 'Teaching prep finished, but nothing new was created. Check that each module title matches a course on the linked programme.';
  }
  return `${parts.join(' · ')}. Review under Teaching Approvals.`;
}

export async function notifyAdminTeachingLaunch(
  db: AnySupabase,
  input: {
    adminId: string;
    pageTitle: string;
    pageId: string;
    result: LaunchTeachingResult;
  },
): Promise<void> {
  const ok = !input.result.error;
  const now = new Date().toISOString();
  await db.from('notifications').insert({
    user_id: input.adminId,
    title: ok
      ? `Teaching ready to review: ${input.pageTitle}`
      : `Teaching prep failed: ${input.pageTitle}`,
    message: summariseLaunchResult(input.result),
    type: ok ? 'info' : 'warning',
    action_url: ok
      ? '/dashboard/teaching/approvals'
      : `/dashboard/special-programs`,
    is_read: false,
    created_at: now,
    updated_at: now,
  });
}
