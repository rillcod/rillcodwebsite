import type { SupabaseClient } from '@supabase/supabase-js';
import { TEEN_PROGRAMME } from '@/lib/classes/programme-transition';

/**
 * When a learner graduates Young → Teen, seed their curriculum at the Teen entry course
 * (lowest level_order) instead of advancing the Young track.
 */
export async function ensureTeenProgrammeEnrollment(
  db: SupabaseClient,
  studentId: string,
  teenProgramId: string,
  schoolId: string | null,
  nextTermLabel: string,
): Promise<{ enrolled: boolean; reason?: string }> {
  const { data: existing, error: existErr } = await db
    .from('student_level_enrollments')
    .select('id')
    .eq('student_id', studentId)
    .eq('program_id', teenProgramId)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();

  if (existErr?.code === '42P01') return { enrolled: false, reason: 'table_missing' };
  if (existErr) return { enrolled: false, reason: existErr.message };
  if (existing) return { enrolled: true, reason: 'already_on_teen_track' };

  const { data: entryCourse, error: courseErr } = await db
    .from('courses')
    .select('id')
    .eq('program_id', teenProgramId)
    .eq('is_active', true)
    .order('level_order', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (courseErr) return { enrolled: false, reason: courseErr.message };
  if (!entryCourse?.id) {
    return { enrolled: false, reason: `no_active_${TEEN_PROGRAMME.replace(/\s+/g, '_').toLowerCase()}_course` };
  }

  const { error: insertErr } = await db.from('student_level_enrollments').insert({
    student_id: studentId,
    course_id: entryCourse.id,
    school_id: schoolId,
    program_id: teenProgramId,
    term_label: nextTermLabel,
    start_week: 1,
    status: 'active',
  });

  if (insertErr) return { enrolled: false, reason: insertErr.message };
  return { enrolled: true };
}

/** Suspend the previous Young programme portal enrollment after a bridge move. */
export async function suspendProgrammeEnrollment(
  db: SupabaseClient,
  studentId: string,
  programId: string,
): Promise<void> {
  await db
    .from('enrollments')
    .update({ status: 'suspended', updated_at: new Date().toISOString() })
    .eq('user_id', studentId)
    .eq('program_id', programId)
    .eq('status', 'active');
}
