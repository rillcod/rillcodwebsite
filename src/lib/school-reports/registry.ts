import type { SupabaseClient } from '@supabase/supabase-js';
import { getTeacherSchoolIds } from '@/lib/auth-utils';
import type { SchoolPerformanceReportRow, SchoolReportStatus } from './types';

type AnyClient = SupabaseClient<any>;

export type ActiveSchoolReportBook = Pick<
  SchoolPerformanceReportRow,
  | 'id'
  | 'school_id'
  | 'title'
  | 'status'
  | 'academic_term_id'
  | 'academic_year'
  | 'term_label'
  | 'created_by'
  | 'published_at'
  | 'updated_at'
>;

/** Schools a teacher may manage reports for: assignment + class ownership. */
export async function getTeacherManageableSchoolIds(
  admin: AnyClient,
  teacherId: string,
  primarySchoolId: string | null,
): Promise<string[]> {
  const ids = new Set(await getTeacherSchoolIds(teacherId, primarySchoolId));
  const { data: ownedClasses } = await admin
    .from('classes')
    .select('school_id')
    .eq('teacher_id', teacherId)
    .limit(1000);
  for (const row of ownedClasses ?? []) {
    if (row.school_id) ids.add(row.school_id);
  }
  return [...ids];
}

/** One unified active book per school + academic term (draft or published). */
export async function findActiveSchoolReportBook(
  admin: AnyClient,
  schoolId: string,
  academicTermId: string,
): Promise<ActiveSchoolReportBook | null> {
  if (!schoolId || !academicTermId) return null;
  const { data, error } = await admin
    .from('school_performance_reports')
    .select('id,school_id,title,status,academic_term_id,academic_year,term_label,created_by,published_at,updated_at')
    .eq('school_id', schoolId)
    .eq('academic_term_id', academicTermId)
    .in('status', ['draft', 'published'] satisfies SchoolReportStatus[])
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as ActiveSchoolReportBook | null) ?? null;
}

export type OpenSchoolReportBookResult =
  | { action: 'created'; id: string }
  | { action: 'reused'; id: string; status: SchoolReportStatus; message: string };

/** Prevent duplicate books when multiple teachers share a school. */
export async function openSchoolReportBook(
  admin: AnyClient,
  input: {
    schoolId: string;
    academicTermId: string;
    create: () => Promise<string>;
  },
): Promise<OpenSchoolReportBookResult> {
  const existing = await findActiveSchoolReportBook(admin, input.schoolId, input.academicTermId);
  if (existing) {
    const message =
      existing.status === 'published'
        ? 'This school already has a published report book for this term. All teachers work from the same unified book.'
        : 'A draft report book already exists for this school and term. Opening the shared draft so work stays unified.';
    return { action: 'reused', id: existing.id, status: existing.status as SchoolReportStatus, message };
  }
  const id = await input.create();
  return { action: 'created', id };
}
