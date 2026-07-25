/**
 * Single entry for portal activation structure:
 * - students: school + class (auto-create/resolve class when school is known)
 * - parent/teacher/school: school only
 * - admin: unrestricted
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveClassForStudent } from '@/lib/classes/resolve-or-create';
import {
  canActivatePortalUser,
  portalStructureError,
  type StructureRole,
} from '@/lib/portal/structure';

type AnySupabase = SupabaseClient<any>;

export type StructurePlacementInput = {
  role: StructureRole;
  schoolId?: string | null;
  schoolName?: string | null;
  classId?: string | null;
  /** Hints used to find or auto-create a class for students. */
  classHints?: Array<string | null | undefined>;
  grade?: string | null;
  programme?: string | null;
  /** When true (default), attempt auto class creation for students missing class_id. */
  autoCreateClass?: boolean;
  /** Desired active flag — will be forced false if structure is incomplete. */
  wantActive?: boolean;
};

export type StructurePlacementResult = {
  role: StructureRole;
  schoolId: string | null;
  schoolName: string | null;
  classId: string | null;
  className: string | null;
  isActive: boolean;
  error: string | null;
  /** Safe auth user_metadata fragment for createUser / updateUserById. */
  authMetadata: Record<string, string>;
};

const DEFAULT_CLASS_HINT = 'General Placement';

/**
 * Ensure a student has a class at their school — reuse by id/name or auto-create.
 */
export async function ensureStudentClassPlacement(
  admin: AnySupabase,
  opts: {
    schoolId: string;
    schoolName?: string | null;
    classId?: string | null;
    classHints?: Array<string | null | undefined>;
    grade?: string | null;
    programme?: string | null;
  },
): Promise<{ classId: string | null; className: string | null; error: string | null }> {
  const hints = [
    ...(opts.classHints ?? []),
    opts.programme,
    opts.grade,
    DEFAULT_CLASS_HINT,
  ];

  const resolved = await resolveClassForStudent(
    admin,
    opts.schoolId,
    opts.classId ?? null,
    hints,
  );

  if (resolved.id) {
    return { classId: resolved.id, className: resolved.name, error: null };
  }

  // Fallback: banded class via ensureClassWithTutor (richer naming).
  try {
    const { ensureClassWithTutor } = await import('@/lib/summer-school/onboard');
    const programme =
      (opts.programme || '').replace(/\(.*?\)/g, '').trim()
      || (opts.grade || '').trim()
      || DEFAULT_CLASS_HINT;
    const classId = await ensureClassWithTutor(
      admin,
      opts.schoolId,
      opts.schoolName || '',
      programme,
      undefined,
      opts.grade ?? null,
    );
    if (classId) {
      const { data: cls } = await admin.from('classes').select('name').eq('id', classId).maybeSingle();
      return { classId, className: cls?.name ?? programme, error: null };
    }
  } catch (err) {
    console.error('[ensureStudentClassPlacement] ensureClassWithTutor failed:', err);
  }

  return {
    classId: null,
    className: resolved.name,
    error: resolved.error || 'Could not resolve or create a class for this student.',
  };
}

/**
 * Resolve school/class and clamp is_active so no entry point can activate incomplete structure.
 */
export async function preparePortalStructure(
  admin: AnySupabase,
  input: StructurePlacementInput,
): Promise<StructurePlacementResult> {
  const role = (input.role || 'student').toLowerCase() as StructureRole;
  let schoolId = input.schoolId ?? null;
  const schoolName = input.schoolName ?? null;
  let classId = input.classId ?? null;
  let className: string | null = null;
  let error: string | null = null;

  if (role === 'student' && schoolId && !classId && input.autoCreateClass !== false) {
    const placed = await ensureStudentClassPlacement(admin, {
      schoolId,
      schoolName,
      classId: null,
      classHints: input.classHints,
      grade: input.grade,
      programme: input.programme,
    });
    classId = placed.classId;
    className = placed.className;
    if (placed.error) error = placed.error;
  } else if (role === 'student' && classId) {
    const { data: cls } = await admin
      .from('classes')
      .select('id, name, school_id')
      .eq('id', classId)
      .maybeSingle();
    if (!cls) {
      classId = null;
      error = 'Class not found';
    } else if (schoolId && cls.school_id && cls.school_id !== schoolId) {
      classId = null;
      error = 'Selected class belongs to a different school';
    } else {
      className = cls.name;
      if (!schoolId && cls.school_id) schoolId = cls.school_id;
    }
  }

  const structureErr = portalStructureError(role, { schoolId, classId });
  if (structureErr) error = error || structureErr;

  const wantActive = input.wantActive !== false;
  const isActive = wantActive && canActivatePortalUser(role, { schoolId, classId });

  const authMetadata: Record<string, string> = { role };
  if (schoolId) authMetadata.school_id = schoolId;
  if (classId) authMetadata.class_id = classId;

  return {
    role,
    schoolId,
    schoolName,
    classId,
    className,
    isActive,
    error: isActive ? null : error,
    authMetadata,
  };
}

/** Soft clamp for updates that already have known school/class (no auto-create). */
export function clampActiveFlag(
  role: StructureRole,
  opts: { schoolId?: string | null; classId?: string | null; wantActive?: boolean },
): { isActive: boolean; error: string | null } {
  const wantActive = opts.wantActive !== false;
  const error = portalStructureError(role, opts);
  if (!wantActive) return { isActive: false, error: null };
  if (error) return { isActive: false, error };
  return { isActive: true, error: null };
}
