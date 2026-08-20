import type { SupabaseClient } from '@supabase/supabase-js';
import { liveAcademicSession, nextAcademicSession } from '@/lib/reports/academic-period';

/** Term label for a new curriculum enrollment row after class promotion. */
export function nextTermLabelForClassPromotion(): string {
  const next = nextAcademicSession(liveAcademicSession());
  return `${next.termLabel} ${next.periodLabel}`;
}

/**
 * When a learner moves up a school grade class, also advance their active
 * curriculum track if the programme course chain defines a next level.
 */
export async function advanceCurriculumTrackOnClassPromote(
  db: SupabaseClient,
  studentId: string,
  nextTermLabel: string = nextTermLabelForClassPromotion(),
): Promise<{ advanced: boolean; reason?: string }> {
  const { data: enrollment, error: loadErr } = await db
    .from('student_level_enrollments')
    .select('id, student_id, school_id, program_id, cohort_year, course_id, courses!course_id(next_course_id)')
    .eq('student_id', studentId)
    .eq('status', 'active')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (loadErr?.code === '42P01') return { advanced: false, reason: 'table_missing' };
  if (loadErr || !enrollment) return { advanced: false, reason: 'no_active_enrollment' };

  const nextCourseId: string | null = (enrollment as { courses?: { next_course_id?: string | null } | null }).courses
    ?.next_course_id ?? null;

  const { error: closeErr } = await db
    .from('student_level_enrollments')
    .update({
      status: 'promoted',
      promoted_to: nextCourseId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', enrollment.id);

  if (closeErr) return { advanced: false, reason: closeErr.message };

  if (!nextCourseId) return { advanced: true, reason: 'completed_track' };

  const { error: insertErr } = await db.from('student_level_enrollments').insert({
    student_id: enrollment.student_id,
    course_id: nextCourseId,
    school_id: enrollment.school_id,
    program_id: enrollment.program_id,
    cohort_year: enrollment.cohort_year,
    term_label: nextTermLabel,
    start_week: 1,
    status: 'active',
  });

  if (insertErr) return { advanced: false, reason: insertErr.message };
  return { advanced: true };
}
