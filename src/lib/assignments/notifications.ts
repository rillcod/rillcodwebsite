import { createAdminClient } from '@/lib/supabase/admin';
import { sendPushNotification } from '@/lib/push';
import { recordDeadLetter } from '@/lib/operations/dead-letter';

export type AssignmentReleaseNotificationResult = {
  status: 'sent' | 'already_notified' | 'no_recipients' | 'failed';
  recipients: number;
  notificationsCreated: number;
  pushSent: number;
  deadLetterId?: string | null;
  error?: string;
};

export function assignmentReleaseNotificationKey(input: {
  assignmentId: string;
  releaseVersion: string;
  studentId: string;
}) {
  return `assignment-release:${input.assignmentId}:${input.releaseVersion}:${input.studentId}`;
}

/**
 * Trigger in-app and push notifications for the students targeted by an
 * assignment when it is released (set to active).
 */
export async function triggerAssignmentReleaseNotifications(
  assignmentId: string,
  callerId?: string
): Promise<AssignmentReleaseNotificationResult> {
  const db = createAdminClient();

  const { data: assignment, error: fetchErr } = await db
    .from('assignments')
    .select('id, title, assignment_type, class_id, course_id, program_id, metadata, school_id, school_name, updated_at')
    .eq('id', assignmentId)
    .single();

  if (fetchErr || !assignment) {
    const error = fetchErr?.message || 'Assignment not found';
    const deadLetterId = await recordDeadLetter({
      source: 'assignment_release',
      jobType: 'assignment_release',
      originalJobId: `assignment-release:${assignmentId}:lookup`,
      payload: { assignmentId, callerId: callerId ?? null },
      error,
    });
    return {
      status: 'failed', recipients: 0, notificationsCreated: 0, pushSent: 0,
      deadLetterId, error,
    };
  }

  const metadata = (assignment.metadata as any) || {};
  const typeLabel = assignment.assignment_type === 'project' ? 'Project' : 'Assignment';
  const title = `New ${typeLabel} Released`;
  const message = `A new ${typeLabel.toLowerCase()} "${assignment.title}" has been released.`;
  const now = new Date().toISOString();
  const releaseVersion = assignment.updated_at || now;
  const deadLetterJobId = `assignment-release:${assignment.id}:${releaseVersion}`;

  try {
    const students = await resolveTargetStudents(db, {
      id: assignment.id,
      class_id: assignment.class_id,
      course_id: assignment.course_id,
      program_id: assignment.program_id,
      school_id: assignment.school_id,
      school_name: assignment.school_name,
      metadata,
    });

    if (students.length === 0) {
      return {
        status: 'no_recipients', recipients: 0, notificationsCreated: 0, pushSent: 0,
      };
    }

    const notificationRows = students.map((student) => ({
      user_id: student.id,
      title,
      message,
      type: 'info',
      is_read: false,
      action_url: `/dashboard/assignments/${assignment.id}`,
      notification_channel: 'in_app',
      delivery_status: 'sent',
      sent_at: now,
      source_type: 'assignment_release',
      source_id: assignment.id,
      idempotency_key: assignmentReleaseNotificationKey({
        assignmentId: assignment.id,
        releaseVersion,
        studentId: student.id,
      }),
      created_at: now,
      updated_at: now,
    }));

    const insertedUserIds: string[] = [];
    for (let i = 0; i < notificationRows.length; i += 50) {
      const batch = notificationRows.slice(i, i + 50);
      const { data: inserted, error: insertErr } = await (db as any)
        .from('notifications')
        .upsert(batch, { onConflict: 'idempotency_key', ignoreDuplicates: true })
        .select('user_id');
      if (insertErr) throw insertErr;
      for (const row of inserted ?? []) {
        if (typeof row.user_id === 'string') insertedUserIds.push(row.user_id);
      }
    }

    const pushResults = await Promise.allSettled(
      insertedUserIds.map((userId) => sendPushNotification(userId, {
        title,
        body: message,
        url: `/dashboard/assignments/${assignment.id}`,
      }))
    );
    const pushSent = pushResults.reduce((total, result) => (
      result.status === 'fulfilled' ? total + result.value.sent : total
    ), 0);

    return {
      status: insertedUserIds.length > 0 ? 'sent' : 'already_notified',
      recipients: students.length,
      notificationsCreated: insertedUserIds.length,
      pushSent,
    };
  } catch (cause) {
    const error = cause instanceof Error ? cause.message : String(cause);
    const deadLetterId = await recordDeadLetter({
      source: 'assignment_release',
      jobType: 'assignment_release',
      originalJobId: deadLetterJobId,
      payload: { assignmentId, callerId: callerId ?? null },
      error,
    });
    console.error('[assignment notification] Release notification requires recovery:', error);
    return {
      status: 'failed', recipients: 0, notificationsCreated: 0, pushSent: 0,
      deadLetterId, error,
    };
  }
}

type TargetAssignment = {
  id: string;
  class_id: string | null;
  course_id: string | null;
  program_id: string | null;
  school_id: string | null;
  school_name: string | null;
  metadata: Record<string, any>;
};

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

async function filterStudentsByAssignmentProgram(
  db: ReturnType<typeof createAdminClient>,
  assignment: TargetAssignment,
  students: any[],
) {
  let programId = assignment.program_id;
  if (!programId && assignment.course_id) {
    const { data: course, error } = await db
      .from('courses')
      .select('program_id')
      .eq('id', assignment.course_id)
      .maybeSingle();
    if (error) throw error;
    programId = course?.program_id ?? null;
  }
  if (!programId) return students;

  const studentIds = students.map((student) => student.id).filter(Boolean);
  if (studentIds.length === 0) return [];

  const [enrollmentResult, classResult] = await Promise.all([
    db
      .from('enrollments')
      .select('user_id')
      .eq('program_id', programId)
      .in('status', ['active', 'enrolled', 'approved'])
      .in('user_id', studentIds),
    db
      .from('classes')
      .select('id')
      .eq('program_id', programId)
      .in('id', students.map((student) => student.class_id).filter(Boolean)),
  ]);
  if (enrollmentResult.error) throw enrollmentResult.error;
  if (classResult.error) throw classResult.error;
  const enrollments = enrollmentResult.data;
  const classes = classResult.data;

  const eligibleUserIds = new Set((enrollments ?? []).map((row: any) => row.user_id));
  const eligibleClassIds = new Set((classes ?? []).map((row: any) => row.id));
  return students.filter((student) => (
    eligibleUserIds.has(student.id)
    || (student.class_id && eligibleClassIds.has(student.class_id))
  ));
}

async function activeStudentsByIds(db: ReturnType<typeof createAdminClient>, ids: string[]) {
  const uniqueIds = [...new Set(ids)].filter(Boolean);
  if (uniqueIds.length === 0) return [];

  const { data, error } = await db
    .from('portal_users')
    .select('id, full_name, email')
    .eq('role', 'student')
    .eq('is_active', true)
    .in('id', uniqueIds);

  if (error) {
    throw error;
  }
  return data ?? [];
}

async function resolveTargetStudents(db: ReturnType<typeof createAdminClient>, assignment: TargetAssignment) {
  if (assignment.metadata.work_mode === 'specific') {
    return activeStudentsByIds(db, stringList(assignment.metadata.target_student_ids));
  }

  if (assignment.metadata.work_mode === 'group') {
    const groups = Array.isArray(assignment.metadata.groups) ? assignment.metadata.groups : [];
    const ids = groups.flatMap((group: any) => stringList(group?.studentIds));
    return activeStudentsByIds(db, ids);
  }

  const targetClassId = assignment.class_id || assignment.metadata.target_class_id;
  if (targetClassId) {
    const { data, error } = await db
      .from('portal_users')
      .select('id, full_name, email, class_id')
      .eq('role', 'student')
      .eq('class_id', targetClassId)
      .eq('is_active', true);
    if (error) {
      throw error;
    }
    return filterStudentsByAssignmentProgram(db, assignment, data ?? []);
  }

  if (assignment.school_id || assignment.school_name) {
    let query = db
      .from('portal_users')
      .select('id, full_name, email')
      .eq('role', 'student')
      .eq('is_active', true);

    const filters: string[] = [];
    if (assignment.school_id) filters.push(`school_id.eq.${assignment.school_id}`);
    if (assignment.school_name) filters.push(`school_name.eq.${JSON.stringify(assignment.school_name)}`);
    query = (query as any).or(filters.join(','));

    const { data, error } = await query;
    if (error) {
      throw error;
    }
    return data ?? [];
  }

  if (assignment.course_id) {
    const { data: course, error: courseError } = await db
      .from('courses')
      .select('program_id')
      .eq('id', assignment.course_id)
      .maybeSingle();
    if (courseError) throw courseError;

    if (!course?.program_id) return [];

    const { data: enrollments, error } = await db
      .from('enrollments')
      .select('user_id')
      .eq('program_id', course.program_id);

    if (error) {
      throw error;
    }

    return activeStudentsByIds(db, (enrollments ?? []).map((e: any) => e.user_id));
  }

  return [];
}
