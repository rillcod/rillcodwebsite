import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { assignmentReleaseNotificationKey } from './notifications';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

describe('assignment release notification identity', () => {
  const base = {
    assignmentId: 'assignment-1',
    releaseVersion: '2026-08-26T10:00:00.000Z',
    studentId: 'student-1',
  };

  it('is stable for a retry of the same release and learner', () => {
    expect(assignmentReleaseNotificationKey(base)).toBe(
      assignmentReleaseNotificationKey({ ...base }),
    );
  });

  it('is unique per learner', () => {
    expect(assignmentReleaseNotificationKey(base)).not.toBe(
      assignmentReleaseNotificationKey({ ...base, studentId: 'student-2' }),
    );
  });

  it('allows a deliberate later re-release to notify again', () => {
    expect(assignmentReleaseNotificationKey(base)).not.toBe(
      assignmentReleaseNotificationKey({
        ...base,
        releaseVersion: '2026-08-27T10:00:00.000Z',
      }),
    );
  });
});

describe('assignment release notification durability contract', () => {
  const helper = read('src/lib/assignments/notifications.ts');
  const release = read('src/lib/academic/release-week-content.ts');
  const createRoute = read('src/app/api/assignments/route.ts');
  const updateRoute = read('src/app/api/assignments/[id]/route.ts');
  const operations = read('src/app/api/admin/operations-health/route.ts');
  const migration = read(
    'supabase/migrations/20260929000120_make_assignment_release_notifications_idempotent.sql',
  );

  it('deduplicates inbox rows with a database-enforced key', () => {
    // The upsert moved to src/lib/notifications/deliver-once.ts so that every
    // caller needing idempotency shares one key format and one skip-on-retry
    // path. This assertion follows it there rather than pinning the behaviour
    // to the file it happened to be written in first.
    const shared = read('src/lib/notifications/deliver-once.ts');
    expect(shared).toContain("onConflict: 'idempotency_key', ignoreDuplicates: true");
    // And this caller must actually use it, not keep a private copy.
    expect(helper).toContain('deliverNotificationsOnce(');
    expect(helper).not.toContain("from('notifications')");

    expect(migration).toContain('add column if not exists idempotency_key text');
    expect(migration).toContain('create unique index if not exists notifications_idempotency_key_unique');
    expect(migration).not.toMatch(/notifications_idempotency_key_unique[\s\S]{0,120}where idempotency_key is not null/i);
  });

  it('records failures and exposes a recoverable result', () => {
    expect(helper).toContain("jobType: 'assignment_release'");
    expect(helper).toContain("status: 'failed'");
    expect(release).toContain('notification_recovery_id');
    expect(release).toContain('await Promise.all(');
  });

  it('awaits alerts in both direct assignment release routes', () => {
    expect(createRoute).toContain('notificationResult = await triggerAssignmentReleaseNotifications');
    expect(updateRoute).toContain('notificationResult = await triggerAssignmentReleaseNotifications');
    expect(createRoute).not.toContain('triggerAssignmentReleaseNotifications(data.id, caller.id).catch');
    expect(updateRoute).not.toContain('triggerAssignmentReleaseNotifications(id, caller.id).catch');
  });

  it('lets Operations retry the failed business event', () => {
    expect(operations).toContain("row.job_type === 'assignment_release'");
    expect(operations).toContain('await triggerAssignmentReleaseNotifications(assignmentId, actor.user.id)');
  });
});
