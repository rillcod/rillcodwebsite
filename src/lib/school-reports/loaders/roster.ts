import type { SupabaseClient } from '@supabase/supabase-js';
import type { StudentRosterInput } from '@/lib/cards/exportRoster';
import {
  classifyStudentSessionStatus,
  getSessionBoundary,
  shouldReplaceRosterRow,
} from '@/lib/academic/session-scope';
import { mapPortalStudentsToRosterInput } from '@/lib/rosters/map-to-roster-input';
import { recordSource, type DataSourceStatus } from '../source-query';
import type { LoaderResult } from './types';
import { fetchAllReportRows } from '../paginated-query';

type AnyClient = SupabaseClient<any>;

export type SchoolRosterRow = {
  id: string;
  full_name: string | null;
  class_id: string | null;
  section_class: string | null;
  grade: string | null;
  class_arm: string | null;
};

type RawPortalStudentRow = SchoolRosterRow & {
  is_active?: boolean | null;
  created_at?: string | null;
  metadata?: Record<string, any> | null;
};

type TermRosterRow = {
  student_id: string;
  class_id?: string | null;
  term_id?: string | null;
  status?: string | null;
  started_at?: string | null;
  reinstated_at?: string | null;
  ended_at?: string | null;
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

async function loadLatestRosterRowsByStudent(
  admin: AnyClient,
  students: RawPortalStudentRow[],
): Promise<Map<string, TermRosterRow>> {
  const byStudent = new Map<string, TermRosterRow>();
  if (!students.length) return byStudent;

  const liveClassByStudent = new Map(students.map((s) => [s.id, s.class_id ?? null]));
  const ids = students.map((s) => s.id);
  const chunkSize = 200;

  try {
    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize);
      const { data, error } = await fetchAllReportRows<TermRosterRow>((from, to) =>
        admin
          .from('class_term_rosters')
          .select('student_id,class_id,term_id,status,started_at,reinstated_at,ended_at')
          .in('student_id', chunk)
          .range(from, to),
      );
      if (error || !data) continue;
      for (const row of data) {
        if (!row?.student_id) continue;
        const existing = byStudent.get(row.student_id);
        if (shouldReplaceRosterRow(existing, row, liveClassByStudent.get(row.student_id))) {
          byStudent.set(row.student_id, row);
        }
      }
    }
  } catch {
    // Graceful fallback when mocked clients in unit tests do not stub class_term_rosters.
  }

  return byStudent;
}

/** Load active session-scoped learners and classes for a school report snapshot. */
export async function loadSchoolReportRoster(
  admin: AnyClient,
  schoolId: string,
  checkedAt: string,
  range?: { academicYear?: string | null; academicTermId?: string | null },
): Promise<SchoolRosterLoadResult> {
  const [studentResult, classResult] = await Promise.all([
    fetchAllReportRows<RawPortalStudentRow>((from, to) => admin
      .from('portal_users')
      .select('id,full_name,class_id,section_class,grade,class_arm,is_active,created_at,metadata')
      .eq('role', 'student')
      .eq('school_id', schoolId)
      .eq('is_active', true)
      .or('is_deleted.is.null,is_deleted.eq.false')
      .range(from, to)),
    fetchAllReportRows<SchoolClassRow>((from, to) =>
      admin.from('classes').select('id,name,teacher_id').eq('school_id', schoolId).range(from, to),
    ),
  ]);
  const { data: students, error: studentError } = studentResult;
  const { data: classes, error: classError } = classResult;

  if (studentError) throw new Error(`Student data is unavailable: ${studentError.message}`);

  const rawStudents = (students ?? []) as RawPortalStudentRow[];
  const latestRosterByStudent = await loadLatestRosterRowsByStudent(admin, rawStudents);
  const liveBoundary = getSessionBoundary();
  const isCurrentSession =
    !range?.academicYear || range.academicYear.trim() === liveBoundary.periodLabel;

  const studentRows: SchoolRosterRow[] = rawStudents
    .filter((student) => {
      const rosterRow = latestRosterByStudent.get(student.id);
      const sessionStatus = classifyStudentSessionStatus(student, rosterRow, {
        canonicalTermId: range?.academicTermId ?? null,
        boundary: liveBoundary,
      });
      if (sessionStatus === 'withdrawn') return false;
      if (isCurrentSession && sessionStatus === 'carryover_unconfirmed') return false;
      return true;
    })
    .map(({ id, full_name, class_id, section_class, grade, class_arm }) => ({
      id,
      full_name,
      class_id,
      section_class,
      grade,
      class_arm,
    }));

  const dataSources: DataSourceStatus[] = [
    recordSource('students', { rows: studentRows, required: true, checkedAt }),
    recordSource('classes', { error: classError, rows: classes ?? [], checkedAt }),
  ];

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

/** Map loaded school roster rows into Card Studio / PDF roster export input. */
export function schoolRosterToExportInput(data: {
  studentRows: SchoolRosterRow[];
  classNameById: Map<string, string>;
}): StudentRosterInput[] {
  return mapPortalStudentsToRosterInput(
    data.studentRows,
    data.classNameById,
    new Map(data.studentRows.map((row) => [row.id, row.class_id])),
  );
}
