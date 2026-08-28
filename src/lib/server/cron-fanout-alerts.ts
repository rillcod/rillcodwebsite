import { deliverNotificationsOnce } from '@/lib/notifications/deliver-once';
import { fanoutFailures } from '@/lib/server/cron-fanout';

/** Human label for a fan-out status token stored in app_settings. */
export function describeFanoutStatus(status: string): string {
  if (status === 'ok') return 'started successfully';
  if (status === 'no-secret') return 'cron secret missing on the server';
  if (status.startsWith('http_')) return `HTTP ${status.slice(5)} from the child route`;
  if (status.startsWith('unreachable')) {
    const detail = status.includes(':') ? status.split(':').slice(1).join(':') : 'could not connect';
    return `could not reach the child route (${detail})`;
  }
  return status;
}

export function formatFanoutFailureSummary(
  host: string,
  failed: Array<[string, string]>,
): { title: string; message: string } {
  const lines = failed.map(([job, status]) => `• ${job}: ${describeFanoutStatus(status)}`);
  return {
    title: `Fan-out from ${host} did not start ${failed.length} job${failed.length === 1 ? '' : 's'}`,
    message: [
      'These jobs are not on cron-job.org — they are started internally after another scheduled job finishes.',
      'cron-job.org may still show the host job as successful even when this happens.',
      '',
      ...lines,
      '',
      'Open Dashboard → Office → Settings → Operations Health and check the fan-out section.',
    ].join('\n').slice(0, 2000),
  };
}

type FanoutAlertDb = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: unknown) => {
        eq: (col: string, val: unknown) => Promise<{ data: Array<{ id: string }> | null }>;
      };
    };
  };
};

/** One inbox alert per host per hour per failing child set — not a cron-job.org email. */
export async function alertFanoutFailures(
  db: FanoutAlertDb,
  host: string,
  result: Record<string, string>,
): Promise<void> {
  const failed = fanoutFailures(result);
  if (!failed.length) return;

  try {
    const { data: admins } = await db
      .from('portal_users')
      .select('id')
      .eq('role', 'admin')
      .eq('is_active', true);
    if (!admins?.length) return;

    const hour = new Date().toISOString().slice(0, 13);
    const childKey = failed.map(([job]) => job).sort().join(',');
    const { title, message } = formatFanoutFailureSummary(host, failed);
    const now = new Date().toISOString();

    await deliverNotificationsOnce(
      db,
      admins.map((admin) => ({
        user_id: admin.id,
        title,
        message,
        type: 'warning' as const,
        action_url: '/dashboard/office?workspace=settings&section=health',
        is_read: false,
        created_at: now,
        updated_at: now,
      })),
      {
        sourceType: 'cron_fanout_failure',
        sourceId: host,
        version: `${hour}:${childKey}`,
      },
    );
  } catch (error) {
    console.error(`[cron-fanout] could not alert administrators for ${host}:`, error);
  }
}
