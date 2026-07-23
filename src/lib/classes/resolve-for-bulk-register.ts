import type { SupabaseClient } from '@supabase/supabase-js';
import { buildClassName, gradeBand, cleanGrade } from '@/lib/classes/naming';
import { ensureClassWithTutor } from '@/lib/summer-school/onboard';
import { validateBulkClassPlacement } from '@/lib/students/bulk-placement';

type AnySupabase = SupabaseClient<any>;

export type BulkResolvedClass = {
  id: string | null;
  name: string | null;
  teacherId: string | null;
  grade: string | null;
  schoolId: string | null;
  programId: string | null;
  termId: string | null;
};

export class BulkClassResolverError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

type CallerProfile = {
  role: string | null;
  school_id?: string | null;
};

function canAccessSchool(
  caller: CallerProfile,
  assignedSchoolIds: Set<string>,
  schoolId?: string | null,
): boolean {
  if (caller.role === 'admin') return true;
  return !!schoolId && assignedSchoolIds.has(schoolId);
}

/** Staff-scoped class lookup for bulk registration placement. */
export async function requireBulkClassAccess(
  admin: AnySupabase,
  classId: string,
  caller: CallerProfile,
  assignedSchoolIds: Set<string>,
) {
  const { data: cls, error } = await admin
    .from('classes')
    .select('school_id, name, teacher_id, term_id, program_id, qa_grade_key, qa_grade_band')
    .eq('id', classId)
    .maybeSingle();

  if (error) throw error;
  if (!cls) throw new BulkClassResolverError('Class not found', 404);
  if (!canAccessSchool(caller, assignedSchoolIds, (cls as { school_id?: string }).school_id)) {
    throw new BulkClassResolverError('You are not assigned to this class school.', 403);
  }
  return cls;
}

export type BulkClassResolverOptions = {
  admin: AnySupabase;
  caller: CallerProfile;
  assignedSchoolIds: Set<string>;
  resolvedSchoolId: string;
  resolvedSchoolName: string | null;
  programId: string | null;
  programName: string | null;
  selectedTermId: string | null;
  batchClassId: string | null;
  batchClassName: string | null;
  batchGradeName: string | null;
  batchClass: {
    school_id?: string | null;
    name?: string | null;
    teacher_id?: string | null;
    program_id?: string | null;
    term_id?: string | null;
  } | null;
};

/**
 * Term/program-aware class resolver for bulk registration batches.
 * Shared closure extracted from bulk-register/route.ts.
 */
export function createBulkClassResolver(opts: BulkClassResolverOptions) {
  const autoClassCache = new Map<string, BulkResolvedClass>();
  const selectedClassCache = new Map<string, Record<string, unknown>>();
  if (opts.batchClassId && opts.batchClass) {
    selectedClassCache.set(opts.batchClassId, opts.batchClass as Record<string, unknown>);
  }

  return async (
    gradeOrClass: string | null | undefined,
    studentClassId?: string | null,
  ): Promise<BulkResolvedClass> => {
    const selectedClassId = studentClassId || opts.batchClassId;
    if (selectedClassId) {
      let selected = selectedClassCache.get(selectedClassId);
      if (!selected) {
        selected = await requireBulkClassAccess(
          opts.admin,
          selectedClassId,
          opts.caller,
          opts.assignedSchoolIds,
        ) as Record<string, unknown>;
        selectedClassCache.set(selectedClassId, selected);
      }
      const placementError = validateBulkClassPlacement(selected, {
        schoolId: opts.resolvedSchoolId,
        programId: opts.programId,
        termId: opts.selectedTermId,
      });
      if (placementError) throw new BulkClassResolverError(placementError, 400);
      return {
        id: selectedClassId,
        name: (selected.name as string | null) ?? null,
        teacherId: (selected.teacher_id as string | null) ?? null,
        grade: cleanGrade(gradeOrClass) || cleanGrade(opts.batchGradeName) || null,
        schoolId: (selected.school_id as string | null) ?? null,
        programId: (selected.program_id as string | null) ?? opts.programId,
        termId: (selected.term_id as string | null) ?? opts.selectedTermId,
      };
    }

    const placementLabel = (gradeOrClass || opts.batchClassName || '').trim();
    if (!opts.programName || !placementLabel || !opts.resolvedSchoolName) {
      return {
        id: null,
        name: null,
        teacherId: null,
        grade: cleanGrade(placementLabel) || cleanGrade(opts.batchGradeName) || null,
        schoolId: opts.resolvedSchoolId,
        programId: opts.programId,
        termId: null,
      };
    }

    const band = gradeBand(placementLabel);
    const standardName = buildClassName({
      schoolName: opts.resolvedSchoolName,
      programme: opts.programName,
      range: band ?? placementLabel,
    });
    const cacheKey = `${opts.resolvedSchoolId}::${opts.programId ?? opts.programName}::${band ?? placementLabel}::${opts.selectedTermId || 'no-term'}`;
    const cached = autoClassCache.get(cacheKey);
    if (cached) return cached;

    const classId = await ensureClassWithTutor(
      opts.admin,
      opts.resolvedSchoolId,
      opts.resolvedSchoolName,
      opts.programName,
      `${opts.resolvedSchoolName} — ${opts.programName}${band ? ` — ${band}` : ''}`,
      placementLabel,
      undefined,
      opts.selectedTermId || null,
    );

    let teacherId: string | null = null;
    let className = standardName;
    let classTermId: string | null = opts.selectedTermId || null;
    if (classId) {
      const { data: cls } = await opts.admin
        .from('classes')
        .select('name, teacher_id, school_id, program_id, term_id')
        .eq('id', classId)
        .maybeSingle();
      teacherId = cls?.teacher_id ?? null;
      className = cls?.name ?? standardName;
      classTermId = cls?.term_id ?? opts.selectedTermId ?? null;
    }

    const resolved: BulkResolvedClass = {
      id: classId,
      name: className,
      teacherId,
      grade: cleanGrade(placementLabel) || cleanGrade(opts.batchGradeName) || null,
      schoolId: opts.resolvedSchoolId,
      programId: opts.programId,
      termId: classTermId,
    };
    autoClassCache.set(cacheKey, resolved);
    return resolved;
  };
}
