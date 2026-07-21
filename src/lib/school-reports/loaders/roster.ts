import type { SupabaseClient } from '@supabase/supabase-js';
import { recordSource, type DataSourceStatus } from '../source-query';
import type { LoaderResult } from './types';

type AnyClient = SupabaseClient<any>;

export type SchoolRosterRow = {
  id: string;
  full_name: string | null;
  class_id: string | null;
  section_class: string | null;
  grade: string | null;
  class_arm: string | null;
};

export type SchoolClassRow = {
  id: string;
  name: string | null;
  teacher_id: string | null;
};

export type SchoolRosterLoadResult = LoaderResult<{
  studentRows: SchoolRosterRow[];
  classRows: SchoolClassRow[];
  classNameById: Map<string, string>;
  classTeacherIdById: Map<string, string | null>;
  classOwnerIds: string[];
}> & {
  studentIds: string[];
  classIds: string[];
};

/** Load active learners and classes for a school report snapshot. */
export async function loadSchoolReportRoster(
  admin: AnyClient,
  schoolId: string,
  checkedAt: string,
): Promise<SchoolRosterLoadResult> {
  const [{ data: students, error: studentError }, { data: classes, error: classError }] = await Promise.all([
    admin
      .from('portal_users')
      .select('id,full_name,class_id,section_class,grade,class_arm')
      .eq('role', 'student')
      .eq('school_id', schoolId)
      .eq('is_active', true)
      .or('is_deleted.is.null,is_deleted.eq.false')
      .limit(5000),
    admin.from('classes').select('id,name,teacher_id').eq('school_id', schoolId).limit(1000),
  ]);

  if (studentError) throw new Error(`Student data is unavailable: ${studentError.message}`);

  const dataSources: DataSourceStatus[] = [
    recordSource('students', { rows: students ?? [], cap: 5000, required: true, checkedAt }),
    recordSource('classes', { error: classError, rows: classes ?? [], cap: 1000, checkedAt }),
  ];

  const studentRows = (students ?? []) as SchoolRosterRow[];
  const classRows = (classes ?? []) as SchoolClassRow[];
  const classNameById = new Map(classRows.map((row) => [row.id, row.name || 'Unnamed class']));
  const classTeacherIdById = new Map(classRows.map((row) => [row.id, row.teacher_id || null]));
  const classOwnerIds = Array.from(new Set(classRows.map((row) => row.teacher_id).filter(Boolean))) as string[];

  return {
    data: {
      studentRows,
      classRows,
      classNameById,
      classTeacherIdById,
      classOwnerIds,
    },
    dataSources,
    studentIds: studentRows.map((row) => row.id),
    classIds: classRows.map((row) => row.id),
  };
}
