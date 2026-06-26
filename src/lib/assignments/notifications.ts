import { createAdminClient } from '@/lib/supabase/admin';
import { sendPushNotification } from '@/lib/push';

/**
 * Trigger in-app and push notifications for the students targeted by an
 * assignment when it is released (set to active).
 */
export async function triggerAssignmentReleaseNotifications(
  assignmentId: string,
  callerId?: string
) {
  const db = createAdminClient();

  // 1. Fetch assignment details
  const { data: assignment, error: fetchErr } = await db
    .from('assignments')
    .select('id, title, assignment_type, class_id, course_id, program_id, metadata, school_id, school_name')
    .eq('id', assignmentId)
    .single();

  if (fetchErr || !assignment) {
    console.error('[assignment notification] Failed to fetch assignment details:', fetchErr?.message);
    return;
  }

  const metadata = (assignment.metadata as any) || {};
  const students = await resolveTargetStudents(db, {
    id: assignment.id,
    class_id: assignment.class_id,
    course_id: assignment.course_id,
    program_id: assignment.program_id,
    school_id: assignment.school_id,
    school_name: assignment.school_name,
    metadata,
  });

  if (!students || students.length === 0) {
    console.log('[assignment notification] No active target students found for assignment:', assignmentId);
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
    const { data: course } = await db
      .from('courses')
      .select('program_id')
      .eq('id', assignment.course_id)
      .maybeSingle();
    programId = course?.program_id ?? null;
  }
  if (!programId) return students;

  const studentIds = students.map((student) => student.id).filter(Boolean);
  if (studentIds.length === 0) return [];

  const [{ data: enrollments }, { data: classes }] = await Promise.all([
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
    console.error('[assignment notification] Failed to fetch target students:', error.message);
    return [];
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
      console.error('[assignment notification] Failed to fetch class students:', error.message);
      return [];
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
      console.error('[assignment notification] Failed to fetch school students:', error.message);
      return [];
    }
    return data ?? [];
  }

  if (assignment.course_id) {
    const { data: course } = await db
      .from('courses')
      .select('program_id')
      .eq('id', assignment.course_id)
      .maybeSingle();

    if (!course?.program_id) return [];

    const { data: enrollments, error } = await db
      .from('enrollments')
      .select('user_id')
      .eq('program_id', course.program_id);

    if (error) {
      console.error('[assignment notification] Failed to fetch course enrollments:', error.message);
      return [];
    }

    return activeStudentsByIds(db, (enrollments ?? []).map((e: any) => e.user_id));
  }

  return [];
}
