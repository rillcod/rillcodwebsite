import type { SupabaseClient } from '@supabase/supabase-js';
import { recordSource, type DataSourceStatus } from '../source-query';
import type { LoaderResult } from './types';
import { fetchAllReportRows } from '../paginated-query';
import { formatPersonDisplayName } from '../display-labels';

type AnyClient = SupabaseClient<any>;

export type AssignedTeacherRow = {
  id: string;
  name: string;
  source: 'teacher_schools' | 'class_owner' | 'both';
  classCount: number;
  classNames: string[];
};

export type SchoolStaffLoadResult = LoaderResult<{
  assignedTeachers: AssignedTeacherRow[];
  schoolAccountIds: Set<string>;
  activeTeacherIds: Set<string>;
  teacherNameById: Map<string, string>;
}>;

/** Teachers assigned to this school via teacher_schools or class ownership. */
export async function loadSchoolReportStaff(
  admin: AnyClient,
  schoolId: string,
  classOwnerIds: string[],
  classesByTeacher: Map<string, string[]>,
  checkedAt: string,
): Promise<SchoolStaffLoadResult> {
  const [teacherSchoolResult, schoolAccountResult] = await Promise.all([
    fetchAllReportRows((from, to) => admin.from('teacher_schools').select('teacher_id').eq('school_id', schoolId).range(from, to)),
    fetchAllReportRows((from, to) => admin
      .from('portal_users')
      .select('id,role')
      .eq('school_id', schoolId)
      .eq('role', 'school')
      .eq('is_active', true)
      .or('is_deleted.is.null,is_deleted.eq.false')
      .range(from, to)),
  ]);
  const teacherSchoolRows = teacherSchoolResult.data;
  const schoolAccounts = schoolAccountResult.data;

  const assignedViaSchool = new Set(
    ((teacherSchoolRows ?? []) as Array<{ teacher_id: string }>).map((row) => row.teacher_id).filter(Boolean),
  );
  const relevantTeacherIds = Array.from(new Set([...assignedViaSchool, ...classOwnerIds]));

  let teacherProfiles: Array<{ id: string; full_name: string | null; is_active: boolean; is_deleted: boolean }> = [];
  if (relevantTeacherIds.length) {
    const { data, error } = await fetchAllReportRows((from, to) => admin
      .from('portal_users')
      .select('id,full_name,role,is_active,is_deleted')
      .in('id', relevantTeacherIds)
      .eq('role', 'teacher')
      .range(from, to));
    teacherProfiles = ((data ?? []) as typeof teacherProfiles).filter((row) => row.is_active && !row.is_deleted);
    if (error) {
      return {
        data: {
          assignedTeachers: [],
          schoolAccountIds: new Set(((schoolAccounts ?? []) as Array<{ id: string }>).map((row) => row.id)),
          activeTeacherIds: new Set(),
          teacherNameById: new Map(),
        },
        dataSources: [
          recordSource('staff', { error, rows: [], checkedAt }),
        ],
      };
    }
  }

  const teacherNameById = new Map(
    teacherProfiles.map((row) => [row.id, formatPersonDisplayName(row.full_name, 'Teacher')]),
  );

  const assignedTeachers = teacherProfiles
    .map((row) => {
      const viaAssignment = assignedViaSchool.has(row.id);
      const viaOwnership = classOwnerIds.includes(row.id);
      const ownedNames = classesByTeacher.get(row.id) ?? [];
      return {
        id: row.id,
        name: teacherNameById.get(row.id) || 'Teacher',
        source: (viaAssignment && viaOwnership
          ? 'both'
          : viaAssignment
            ? 'teacher_schools'
            : 'class_owner') as AssignedTeacherRow['source'],
        classCount: ownedNames.length,
        classNames: ownedNames.sort((a, b) => a.localeCompare(b)),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const schoolAccountIds = new Set(((schoolAccounts ?? []) as Array<{ id: string }>).map((row) => row.id));
  const activeTeacherIds = new Set(assignedTeachers.map((row) => row.id));

  return {
    data: {
      assignedTeachers,
      schoolAccountIds,
      activeTeacherIds,
      teacherNameById,
    },
    dataSources: [recordSource('staff', { rows: assignedTeachers, checkedAt })],
  };
}
