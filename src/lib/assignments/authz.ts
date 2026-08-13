import type { SupabaseClient } from '@supabase/supabase-js';
import { getTeacherSchoolIds } from '@/lib/auth-utils';

export type AssignmentStaffCaller = {
  id: string;
  role: string;
  school_id: string | null;
};

export type AssignmentAccessRow = {
  school_id?: string | null;
  created_by?: string | null;
  class_id?: string | null;
  metadata?: { target_class_id?: string | null } | null;
};

/** Resolve the class this assignment targets (metadata override or class_id). */
export function assignmentTargetClassId(assignment: AssignmentAccessRow | null | undefined): string | null {
  if (!assignment) return null;
  const fromMeta = assignment.metadata?.target_class_id;
  if (typeof fromMeta === 'string' && fromMeta.trim()) return fromMeta.trim();
  return assignment.class_id ?? null;
}

/**
 * Single source of truth: may this staff member grade / delete / AI-suggest
 * submissions (or open the staff assignment detail) for this assignment?
 *
 * Rules (mirrors the hardened grade route):
 * - admin: always
 * - school: same school_id only
 * - teacher: creator, OR owns the target class, OR school-wide (no class) at their school
 */
export async function callerCanManageAssignmentWork(
  admin: SupabaseClient<any>,
  caller: AssignmentStaffCaller,
  assignment: AssignmentAccessRow | null | undefined,
): Promise<boolean> {
  if (!assignment) return false;
  if (caller.role === 'admin') return true;

  const schoolId = assignment.school_id ?? null;
  const createdBy = assignment.created_by ?? null;
  const targetClassId = assignmentTargetClassId(assignment);

  if (caller.role === 'school') {
    return !!caller.school_id && schoolId === caller.school_id;
  }

  if (caller.role !== 'teacher') return false;

  if (createdBy === caller.id) return true;

  if (targetClassId) {
    const { data: cls, error: classError } = await admin
      .from('classes')
      .select('teacher_id')
      .eq('id', targetClassId)
      .maybeSingle();
    if (classError) throw new Error(`Assignment class scope could not be verified: ${classError.message}`);
    return cls?.teacher_id === caller.id;
  }

  if (!schoolId) return false;
  const schoolIds = await getTeacherSchoolIds(caller.id, caller.school_id, admin);
  return schoolIds.includes(schoolId);
}

/** Assignment IDs a teacher/school may see in grading queues (SQL-first filtering). */
export async function listManageableAssignmentIds(
  admin: SupabaseClient<any>,
  caller: AssignmentStaffCaller,
  opts?: { classId?: string | null; termId?: string | null },
): Promise<string[] | 'all'> {
  if (caller.role === 'admin') return 'all';

  let query = admin.from('assignments').select('id, created_by, school_id, class_id, metadata');

  if (caller.role === 'school') {
    if (!caller.school_id) return [];
    query = query.eq('school_id', caller.school_id);
  } else if (caller.role === 'teacher') {
    const schoolIds = await getTeacherSchoolIds(caller.id, caller.school_id, admin);
    const { data: ownedClasses, error: ownedClassesError } = await admin
      .from('classes')
      .select('id')
      .eq('teacher_id', caller.id);
    if (ownedClassesError) throw new Error(`Teacher class scope could not be loaded: ${ownedClassesError.message}`);
    const classIds = (ownedClasses ?? []).map((c: { id: string }) => c.id);

    // Creator OR school-wide at assigned schools OR class-targeted to owned classes.
    // PostgREST `or` filter — keep it tight.
    const parts = [`created_by.eq.${caller.id}`];
    if (schoolIds.length) {
      parts.push(`and(school_id.in.(${schoolIds.join(',')}),class_id.is.null)`);
    }
    if (classIds.length) {
      parts.push(`class_id.in.(${classIds.join(',')})`);
    }
    query = query.or(parts.join(','));
  } else {
    return [];
  }

  if (opts?.classId) query = query.eq('class_id', opts.classId);
  if (opts?.termId) query = query.eq('term_id', opts.termId);

  const { data, error } = await query.limit(2000);
  if (error) {
    throw new Error(`Manageable assignments could not be loaded: ${error.message}`);
  }

  // Extra post-filter for metadata.target_class_id (not expressible cleanly in or-filter alone).
  if (caller.role === 'teacher') {
    const { data: ownedClasses, error: ownedClassesError } = await admin
      .from('classes')
      .select('id')
      .eq('teacher_id', caller.id);
    if (ownedClassesError) throw new Error(`Teacher class scope could not be loaded: ${ownedClassesError.message}`);
    const classIds = new Set((ownedClasses ?? []).map((c: { id: string }) => c.id));
    const schoolIds = new Set(await getTeacherSchoolIds(caller.id, caller.school_id, admin));
    return (data ?? [])
      .filter((row: any) => {
        if (row.created_by === caller.id) return true;
        const target = row.metadata?.target_class_id || row.class_id || null;
        if (target) return classIds.has(target);
        return !!row.school_id && schoolIds.has(row.school_id);
      })
      .map((row: any) => row.id as string);
  }

  return (data ?? []).map((row: any) => row.id as string);
}
