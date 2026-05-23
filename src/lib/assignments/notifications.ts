import { createAdminClient } from '@/lib/supabase/admin';
import { sendPushNotification } from '@/lib/push';

/**
 * Trigger in-app and push notifications for all students in a class
 * when an assignment or project is released (set to active).
 */
export async function triggerAssignmentReleaseNotifications(
  assignmentId: string,
  callerId?: string
) {
  const db = createAdminClient();

  // 1. Fetch assignment details
  const { data: assignment, error: fetchErr } = await db
    .from('assignments')
    .select('id, title, assignment_type, class_id, metadata, school_id')
    .eq('id', assignmentId)
    .single();

  if (fetchErr || !assignment) {
    console.error('[assignment notification] Failed to fetch assignment details:', fetchErr?.message);
    return;
  }

  // Determine target class ID (checks column first, then metadata)
  const targetClassId = assignment.class_id || (assignment.metadata as any)?.target_class_id;
  if (!targetClassId) {
    console.log('[assignment notification] Assignment is not scoped to a specific class. Skipping notifications.');
    return;
  }

  // 2. Fetch all active students in the target class
  const { data: students, error: studentErr } = await db
    .from('portal_users')
    .select('id, full_name, email')
    .eq('role', 'student')
    .eq('class_id', targetClassId)
    .eq('is_active', true);

  if (studentErr) {
    console.error('[assignment notification] Failed to fetch target students:', studentErr.message);
    return;
  }

  if (!students || students.length === 0) {
    console.log('[assignment notification] No active students found in target class:', targetClassId);
    return;
  }

  const typeLabel = assignment.assignment_type === 'project' ? 'Project' : 'Assignment';
  const title = `New ${typeLabel} Released`;
  const message = `A new ${typeLabel.toLowerCase()} "${assignment.title}" has been released.`;
  const now = new Date().toISOString();

  // 3. Batch insert notifications (50 at a time)
  const notificationRows = students.map((s) => ({
    user_id: s.id,
    title,
    message,
    type: 'info',
    is_read: false,
    created_at: now,
    updated_at: now,
  }));

  for (let i = 0; i < notificationRows.length; i += 50) {
    const batch = notificationRows.slice(i, i + 50);
    const { error: insertErr } = await db.from('notifications').insert(batch);
    if (insertErr) {
      console.error('[assignment notification] Error batch-inserting notifications:', insertErr.message);
    }
  }

  // 4. Send push notifications to all recipients
  const pushPayload = {
    title,
    body: message,
    url: `/dashboard/assignments/${assignment.id}`,
  };

  Promise.allSettled(
    students.map((s) => sendPushNotification(s.id, pushPayload))
  ).catch((e) => {
    console.error('[assignment notification] Push notifications error:', e);
  });

  console.log(`[assignment notification] Successfully sent release notifications for "${assignment.title}" to ${students.length} students.`);
}
