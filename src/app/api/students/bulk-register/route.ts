import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { logAudit } from '@/lib/audit/log';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { ensureStudentCardIssued } from '@/lib/cards/auto-issue';
import { cleanGrade } from '@/lib/classes/naming';
import {
  BulkClassResolverError,
  createBulkClassResolver,
  requireBulkClassAccess,
  type BulkResolvedClass,
} from '@/lib/classes/resolve-for-bulk-register';
import { cleanStudentName, duplicateNameKey } from '@/lib/students/clean-name';
import {
  buildNameLookupMaps,
  duplicateBlockMessage,
  findNameDuplicate,
  findSchoolNameKeyConflicts,
  loadSchoolStudentsForNameCheck,
  registerCreatedNameInMaps,
} from '@/lib/students/duplicate-name-barricade';
import { reinstateStudentToClass } from '@/lib/students/reinstate-to-class';
import { findAuthUserIdByEmail } from '@/lib/auth/list-all-users';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

interface StudentEntry {
  full_name: string;
  email: string;
  password: string;
  class_name?: string; // incoming grade/header code; never the official section
  class_arm?: string | null;
  class_id?: string | null; // selected canonical section for this student's grade band
  gender?: string | null;
  duplicate_exception_reason?: string | null;
}

type ResolvedClass = BulkResolvedClass;

type CallerProfile = {
  role: string | null;
  school_id?: string | null;
  school_name?: string | null;
};

class HttpError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const normalizeEmail = (email?: string | null) => (email || '').trim().toLowerCase();

async function getAssignedSchoolIds(caller: CallerProfile, userId: string) {
  const assignedIds = new Set<string>();
  if (caller.school_id) assignedIds.add(caller.school_id);

  if (caller.role === 'teacher') {
    const { data: rows } = await supabaseAdmin
      .from('teacher_schools')
      .select('school_id')
      .eq('teacher_id', userId);

    for (const row of rows ?? []) {
      if ((row as any).school_id) assignedIds.add((row as any).school_id);
    }
  }

  return assignedIds;
}

function canAccessSchool(caller: CallerProfile, assignedSchoolIds: Set<string>, schoolId?: string | null) {
  if (caller.role === 'admin') return true;
  return !!schoolId && assignedSchoolIds.has(schoolId);
}

async function requireBatchAccess(batchId: string, caller: CallerProfile, assignedSchoolIds: Set<string>) {
  const { data: batch, error } = await supabaseAdmin
    .from('registration_batches')
    .select('id, school_id, school_name, class_id, class_name')
    .eq('id', batchId)
    .maybeSingle();

  if (error) throw error;
  if (!batch) throw new HttpError('Registration batch not found', 404);
  if (!canAccessSchool(caller, assignedSchoolIds, (batch as any).school_id)) {
    throw new HttpError('You do not have access to this registration batch.', 403);
  }

  return batch as any;
}

export async function POST(request: Request) {
  try {
    // Verify caller is admin or teacher
    const supabase = await createServerClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: caller } = await supabase
      .from('portal_users')
      .select('role, school_id, school_name')
      .eq('id', user.id)
      .single();

    if (!caller || (caller.role !== 'admin' && caller.role !== 'teacher')) {
      return NextResponse.json(
        { error: 'Only admins and teachers can bulk-register students' },
        { status: 403 },
      );
    }

    const body = await request.json();
    const students: StudentEntry[] = body.students;

    if (!Array.isArray(students) || students.length === 0) {
      return NextResponse.json({ error: 'No students provided' }, { status: 400 });
    }

    if (students.length > 200) {
      return NextResponse.json({ error: 'Maximum 200 students per batch' }, { status: 400 });
    }

    // Determine which school to assign:
    // Priority: 1. ID from request body (selected in UI) 2. ID from caller's own profile
    const rId = body.school_id?.toString().trim() || null;
    const cId = caller.school_id?.toString().trim() || null;
    
    const resolvedSchoolId: string | null = rId || cId;

    // Teachers must be assigned to the school they're registering students under
    const assignedSchoolIds = await getAssignedSchoolIds(caller, user.id);
    if (caller.role === 'teacher' && rId) {
      if (!assignedSchoolIds.has(rId)) {
        return NextResponse.json(
          { error: 'You are not assigned to the school you selected for registration.' },
          { status: 403 },
        );
      }
    }

    const resolvedSchoolName: string | null = (body.school_name?.trim() ? body.school_name : null) ?? caller.school_name ?? null;

    console.log('[BulkRegister] Auth User:', user.id);
    console.log('[BulkRegister] Request Body School ID:', body.school_id);
    console.log('[BulkRegister] Caller Profile School ID:', caller.school_id);
    console.log('[BulkRegister] Resolved School ID:', resolvedSchoolId);
    console.log('[BulkRegister] Resolved School Name:', resolvedSchoolName);

    if (!resolvedSchoolId) {
      return NextResponse.json(
        { error: 'A school must be selected before registering students. Create or select a school first.' },
        { status: 400 },
      );
    }
    const bulkSchoolId = resolvedSchoolId;
    const bulkSchoolName = resolvedSchoolName;

    const programId: string | null = (body.program_id as string | undefined) ?? null;
    const batchClassId: string | null = (body.class_id as string | undefined) ?? null;
    const batchClassName: string | null = (body.class_name as string | undefined) ?? null;
    const batchGradeName: string | null = (body.grade_name as string | undefined) ?? null;
    const selectedTermId: string | null = (body.term_id as string | undefined) ?? null;
    const batchSelectedClassIds = Array.isArray(body.class_ids)
      ? [...new Set(body.class_ids.filter((value: unknown): value is string => typeof value === 'string' && !!value))]
      : [];
    const batchClassArm: string | null = typeof body.class_arm === 'string' && body.class_arm.trim() ? body.class_arm.trim().toUpperCase() : null;
    if (batchClassArm && !/^[A-Z0-9]{1,4}$/.test(batchClassArm)) throw new HttpError('Class arm must be 1-4 letters or numbers.', 400);

    let programName: string | null = null;
    if (programId) {
      const { data: program } = await supabaseAdmin
        .from('programs')
        .select('name')
        .eq('id', programId)
        .maybeSingle();
      programName = (program as any)?.name ?? null;
    }

    // Resolve the batch class's teacher — used to stamp primary_teacher_id on NEW students only
    let batchClassTeacherId: string | null = null;
    let batchClass: any = null;
    if (batchClassId) {
      batchClass = await requireBulkClassAccess(supabaseAdmin, batchClassId, caller, assignedSchoolIds);
      if (batchClass.school_id && batchClass.school_id !== resolvedSchoolId) {
        throw new HttpError('Selected class does not belong to the selected school.', 400);
      }
      batchClassTeacherId = batchClass.teacher_id ?? null;
    }
    const resolveClassForStudent = createBulkClassResolver({
      admin: supabaseAdmin,
      caller,
      assignedSchoolIds,
      resolvedSchoolId: bulkSchoolId,
      resolvedSchoolName: bulkSchoolName,
      programId,
      programName,
      selectedTermId,
      batchClassId,
      batchClassName,
      batchGradeName,
      batchClass,
    });
    const touchedClassIds = new Set<string>();
    const rosterAssignments = new Map<string, { cls: ResolvedClass; studentIds: Set<string> }>();

    const results: Array<{
      full_name: string;
      email: string;
      password: string;
      class_name?: string;
      class_arm?: string | null;
      status: 'created' | 'updated' | 'skipped' | 'failed' | 'name_swap_conflict' | 'reinstated' | 'needs_transfer';
      error?: string;
      userId?: string;
      cardIssued?: boolean;
      cardId?: string | null;
    }> = [];

    // ── Duplicate barricade: same normalized name at this school (emails irrelevant) ──
    // 1) RPC keyed lookup (same key as the DB trigger) for the names in this batch
    // 2) Paged full-school scan as a safety net / for exact+swap maps + within-batch updates
    const batchNameKeys = students
      .map((s) => duplicateNameKey(s.full_name))
      .filter((k): k is string => !!k);
    const rpcConflicts = await findSchoolNameKeyConflicts(
      supabaseAdmin as any,
      resolvedSchoolId,
      resolvedSchoolName,
      batchNameKeys,
    );
    const existingStudents = await loadSchoolStudentsForNameCheck(
      supabaseAdmin as any,
      resolvedSchoolId,
      resolvedSchoolName,
    );
    const nameMaps = buildNameLookupMaps(existingStudents);
    for (const [key, hit] of rpcConflicts) {
      if (!nameMaps.byKey.has(key)) nameMaps.byKey.set(key, hit);
    }

    for (const student of students) {
      const { full_name, email, password, class_name, class_arm, class_id, gender } = student;
      const duplicateExceptionReason = student.duplicate_exception_reason?.trim() || null;
      const hasDuplicateException = !!duplicateExceptionReason && duplicateExceptionReason.length >= 10;

      if (!full_name?.trim() || !email?.trim() || !password) {
        results.push({ full_name, email, password, class_name, status: 'failed', error: 'Missing fields' });
        continue;
      }

      // Grade is mandatory: each row must carry its own grade code, or the batch
      // must supply one (grade_name from the Grade Level selector). Kept separate
      // from the registered section and from the arm. batchClassName only counts
      // on the legacy no-class_id path, where it actually feeds grade resolution —
      // when a registered class is selected its name never contributes to grade.
      const hasGradeSource = !!(class_name?.trim() || batchGradeName?.trim() || (!batchClassId && batchClassName?.trim()));
      if (!hasGradeSource) {
        results.push({ full_name, email, password, class_name, status: 'failed', error: 'No grade provided for this student. Include a grade code (e.g. JSS2A) or set a batch Grade Level.' });
        continue;
      }

      // Email check: already in use by a different student or role
      const emailKey = normalizeEmail(email);
      const { data: userWithEmail } = await supabaseAdmin
        .from('portal_users')
        .select('id, full_name, role, is_deleted')
        .eq('email', emailKey)
        .maybeSingle();

      if (userWithEmail && !userWithEmail.is_deleted) {
        const normExistingName = userWithEmail.full_name.trim().replace(/\s+/g, ' ').toLowerCase();
        const normIncomingName = full_name.trim().replace(/\s+/g, ' ').toLowerCase();
        
        const isSameName = normExistingName === normIncomingName;
        
        let isReversedName = false;
        const incomingParts = normIncomingName.split(/\s+/);
        if (incomingParts.length >= 2) {
          const reversedIncoming = [...incomingParts].reverse().join(' ');
          if (normExistingName === reversedIncoming) {
            isReversedName = true;
          }
        }

        const nameMatches = isSameName || isReversedName;

        if (userWithEmail.role !== 'student' || !nameMatches) {
          results.push({
            full_name,
            email,
            password,
            class_name,
            status: 'failed',
            error: `Email ${emailKey} is already in use by another user "${userWithEmail.full_name}" (${userWithEmail.role}).`,
          });
          continue;
        }
      }

      // Same-school name duplicate — prefer reinstate into the selected class (keeps records
      // + moves ownership/authorship) instead of creating a second account.
      const nameDup = findNameDuplicate(nameMaps, full_name);
      if (nameDup && !hasDuplicateException) {
        let destClassId: string | null = class_id || batchClassId || null;
        let destGrade: string | null = null;
        try {
          const resolvedForDup = await resolveClassForStudent(class_name || batchClassName || null, class_id);
          destClassId = resolvedForDup.id || destClassId;
          destGrade = resolvedForDup.grade;
          if (resolvedForDup.id) touchedClassIds.add(resolvedForDup.id);
        } catch (resolveErr: any) {
          // Fall through to skip if class cannot be resolved
          destClassId = destClassId;
        }

        if (destClassId) {
          const reinstate = await reinstateStudentToClass(supabaseAdmin as any, {
            studentId: nameDup.hit.id,
            classId: destClassId,
            actor: { id: user.id, role: caller.role },
            grade: destGrade || class_name || batchGradeName || null,
            classArm: class_arm || batchClassArm || null,
            forceCrossTeacher: caller.role === 'admin',
          });

          if (reinstate.ok) {
            registerCreatedNameInMaps(nameMaps, reinstate.fullName, {
              id: reinstate.studentId,
              email: reinstate.email,
              full_name: reinstate.fullName,
            });
            if (reinstate.toClassId) {
              const { data: destClass } = await supabaseAdmin
                .from('classes')
                .select('term_id')
                .eq('id', reinstate.toClassId)
                .maybeSingle();
              const assignment = rosterAssignments.get(reinstate.toClassId) ?? {
                cls: {
                  id: reinstate.toClassId,
                  name: reinstate.toClassName,
                  teacherId: reinstate.ownerTeacherId,
                  grade: destGrade,
                  schoolId: resolvedSchoolId,
                  programId,
                  termId: (destClass as any)?.term_id ?? selectedTermId,
                },
                studentIds: new Set<string>(),
              };
              assignment.studentIds.add(reinstate.studentId);
              rosterAssignments.set(reinstate.toClassId, assignment);
            }
            results.push({
              full_name,
              email: reinstate.email || email,
              password,
              class_name: reinstate.toClassName || class_name,
              status: 'reinstated',
              error: reinstate.wasWithdrawn
                ? `Reinstated existing withdrawn student into "${reinstate.toClassName}" with ownership moved (${reinstate.reportsTransferred} report${reinstate.reportsTransferred === 1 ? '' : 's'}).`
                : `Existing student moved into "${reinstate.toClassName}" with ownership/authorship transferred (${reinstate.reportsTransferred} report${reinstate.reportsTransferred === 1 ? '' : 's'}).`,
              userId: reinstate.studentId,
            });
            continue;
          }

          if (reinstate.code === 'OTHER_TEACHER') {
            results.push({
              full_name, email, password, class_name,
              status: 'needs_transfer',
              error: reinstate.error,
              userId: nameDup.hit.id,
            });
            continue;
          }

          results.push({
            full_name, email, password, class_name,
            status: nameDup.kind === 'swap' ? 'name_swap_conflict' : 'skipped',
            error: `${duplicateBlockMessage(nameDup.kind, full_name, nameDup.hit)} Reinstate failed: ${reinstate.error}`,
            userId: nameDup.hit.id,
          });
          continue;
        }

        results.push({
          full_name, email, password, class_name,
          status: nameDup.kind === 'swap' ? 'name_swap_conflict' : 'skipped',
          error: `${duplicateBlockMessage(nameDup.kind, full_name, nameDup.hit)} Select a destination class to reinstate them with records intact.`,
          userId: nameDup.hit.id,
        });
        continue;
      }

      try {
        // Attempt to create auth user
        const { data: authData, error: signupErr } = await supabaseAdmin.auth.admin.createUser({
          email: email.trim().toLowerCase(),
          password,
          email_confirm: true,
          user_metadata: {
            full_name: full_name.trim(),
            role: 'student',
            must_change_password: true,
            ...(resolvedSchoolId ? { school_id: resolvedSchoolId } : {}),
          },
        });

        let authUserId: string | null = null;
        let status: 'created' | 'updated' | 'failed' = 'created';

        if (signupErr) {
          if (
            signupErr.message.toLowerCase().includes('already') ||
            signupErr.message.toLowerCase().includes('exists')
          ) {
            // User exists — resolve by portal profile first, then page through auth users.
            // The password reset is DEFERRED until after the ghost-row guard so a row
            // skipped for a protected-account conflict never touches live credentials.
            authUserId = (userWithEmail as any)?.id ?? await findAuthUserIdByEmail(supabaseAdmin as any, email);
            if (authUserId) {
              status = 'updated';
            } else {
              results.push({
                full_name, email, password, class_name, status: 'failed',
                error: 'Auth conflict — could not resolve existing user',
              });
              continue;
            }
          } else {
            results.push({ full_name, email, password, class_name, status: 'failed', error: signupErr.message });
            continue;
          }
        } else {
          authUserId = authData.user?.id ?? null;
        }

        if (!authUserId) {
          results.push({ full_name, email, password, class_name, status: 'failed', error: 'No user ID returned' });
          continue;
        }

        const requestedClassLabel = class_name || batchClassName || null;
        const resolvedClass = await resolveClassForStudent(requestedClassLabel, class_id);
        const effectiveClassId = resolvedClass.id;
        const effectiveClassName = resolvedClass.name || requestedClassLabel || null;
        const effectiveTeacherId = resolvedClass.teacherId || batchClassTeacherId;
        if (!effectiveClassId) {
          if (status === 'created') {
            await supabaseAdmin.auth.admin.deleteUser(authUserId).catch(() => {});
          }
          results.push({
            full_name, email, password, class_name, status: 'failed',
            error: 'Could not resolve a class. Students must be assigned to a class before activation.',
          });
          continue;
        }
        if (effectiveClassId) touchedClassIds.add(effectiveClassId);
        await supabaseAdmin.auth.admin.updateUserById(authUserId, {
          user_metadata: {
            full_name: full_name.trim(),
            role: 'student',
            must_change_password: true,
            school_id: resolvedSchoolId,
            class_id: effectiveClassId,
          },
        }).catch(() => {});

        // Specific canonical grade = what the teacher typed per row (e.g. "Basic 2"), NOT the
        // resolved band-class name. Falls back to the class name only when no row label exists,
        // so grade stays separate from the section/cohort (modern convention).
        const specificGrade = resolvedClass.grade;

        // Ghost-row guard: if portal_users already has a NON-DELETED row with this email
        // but a DIFFERENT id (created outside the auth flow or by a stale import), that row
        // would become an unreachable duplicate. Soft-delete it so the auth user's row wins.
        const { data: ghostRows } = await supabaseAdmin
          .from('portal_users')
          .select('id, primary_teacher_id')
          .ilike('email', email.trim())
          .eq('is_deleted', false)
          .neq('id', authUserId);
        // Don't silently nuke a protected student — flag and skip this row entirely.
        const protectedGhost = (ghostRows ?? []).find((g) => g.primary_teacher_id);
        if (protectedGhost) {
          // Roll back the auth user we just created so it doesn't become an orphan.
          if (status === 'created') {
            await supabaseAdmin.auth.admin.deleteUser(authUserId).catch((deleteErr) => {
              console.error('[BulkRegister] Failed to rollback auth user after protected-ghost conflict:', deleteErr);
            });
          }
          results.push({
            full_name, email, password, class_name, status: 'skipped',
            error: `Duplicate account conflict: existing protected account (${protectedGhost.id}) for this email. Resolve in Class Health & Repair first.`,
          });
          continue;
        }
        for (const ghost of (ghostRows ?? [])) {
          await supabaseAdmin.from('portal_users')
            .update({ is_deleted: true, is_active: false, class_id: null })
            .eq('id', ghost.id);
          // Mirror is_deleted into the registry too (status alone left phantoms in
          // registry-backed lists — the duplicate-appears-twice bug).
          await supabaseAdmin.from('students')
            .update({ status: 'inactive', is_deleted: true, is_active: false })
            .eq('user_id', ghost.id);
        }

        // Existing auth user, past every skip/conflict gate — NOW reset the password to
        // the freshly printed credential and force a change on next login. Failing here
        // fails the row before any profile mutation, so credentials never print wrong.
        if (status === 'updated') {
          const { data: existingProfile } = await supabaseAdmin
            .from('portal_users')
            .select('id, full_name, school_id, school_name, primary_teacher_id, section_class')
            .eq('id', authUserId)
            .maybeSingle();

          if (existingProfile) {
            // 1. Cross-school protection check
            const currentSchoolName = (resolvedSchoolName || '').trim().toLowerCase();
            const existingSchoolName = (existingProfile.school_name || '').trim().toLowerCase();
            const isSameSchool =
              (!existingProfile.school_id && !resolvedSchoolId) ||
              (existingProfile.school_id && resolvedSchoolId && existingProfile.school_id === resolvedSchoolId) ||
              (currentSchoolName && existingSchoolName && currentSchoolName === existingSchoolName);

            if (!isSameSchool && existingProfile.school_id) {
              results.push({
                full_name,
                email,
                password,
                class_name,
                status: 'failed',
                error: `Email ${emailKey} is already registered to student "${existingProfile.full_name || full_name}" at ${existingProfile.school_name || 'another school'}. Cross-school transfers require School Admin intervention.`,
                userId: authUserId,
              });
              continue;
            }

            // 2. Same-school, cross-teacher ownership check
            const currentTeacherId = user.id;
            const isNonAdminTeacher = caller.role === 'teacher';
            const ownerTeacherId = existingProfile.primary_teacher_id;

            if (isNonAdminTeacher && ownerTeacherId && ownerTeacherId !== currentTeacherId) {
              let teacherName = 'another teacher';
              const { data: ownerTeacher } = await supabaseAdmin
                .from('portal_users')
                .select('full_name')
                .eq('id', ownerTeacherId)
                .maybeSingle();
              if (ownerTeacher?.full_name) {
                teacherName = ownerTeacher.full_name;
              }
              const currentClassLabel = existingProfile.section_class || 'another class';
              results.push({
                full_name,
                email,
                password,
                class_name,
                status: 'needs_transfer',
                error: `Student "${full_name}" is already registered in "${currentClassLabel}" under Teacher "${teacherName}". Please use the Transfer Request form or contact your School Admin to transfer this student.`,
                userId: authUserId,
              });
              continue;
            }
          }

          const { error: pwErr } = await supabaseAdmin.auth.admin.updateUserById(authUserId, {
            password,
            user_metadata: { must_change_password: true },
          });
          if (pwErr) {
            results.push({
              full_name, email, password, class_name, status: 'failed',
              error: `Password reset failed for existing account: ${pwErr.message}`,
            });
            continue;
          }
        }

        // Upsert into portal_users — never include primary_teacher_id here so that
        // existing students' ownership is never overwritten by a batch registration.
        // primary_teacher_id is stamped separately below, only for newly created students.
        const { error: profileErr } = await supabaseAdmin.from('portal_users').upsert(
          {
            id: authUserId,
            email: normalizeEmail(email),
            full_name: cleanStudentName(full_name) || full_name.trim(),
            role: 'student',
            school_id: resolvedSchoolId,
            school_name: resolvedSchoolName,
            section_class: effectiveClassName,
            grade: specificGrade,
            class_arm: class_arm || batchClassArm || null,
            class_id: effectiveClassId,
            enrollment_type: 'in_person',
            is_active: true,
            gender: gender || null,
            ...(hasDuplicateException ? {
              duplicate_name_exception_reason: duplicateExceptionReason,
              duplicate_name_exception_key: duplicateNameKey(full_name),
              duplicate_name_exception_approved_by: user.id,
              duplicate_name_exception_approved_at: new Date().toISOString(),
            } : {}),
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'id' },
        );

        if (profileErr) {
          if (status === 'created') {
            await supabaseAdmin.auth.admin.deleteUser(authUserId).catch((deleteErr) => {
              console.error('[BulkRegister] Failed to rollback auth user after profile error:', deleteErr);
            });
          }
          results.push({
            full_name, email, password, class_name, status: 'failed',
            error: `Profile error: ${profileErr.message}`,
          });
          continue;
        }

        if (hasDuplicateException) {
          await logAudit(supabaseAdmin, {
            action: 'student_duplicate_name_exception',
            actorId: user.id,
            tableName: 'portal_users',
            recordId: authUserId,
            newValues: {
              student_name: cleanStudentName(full_name) || full_name.trim(),
              student_email: normalizeEmail(email),
              school_id: resolvedSchoolId,
              exception_reason: duplicateExceptionReason,
              exception_key: duplicateNameKey(full_name),
            },
          });
        }
        // Stamp primary_teacher_id if it is not already set so the DB trigger protects them going forward.
        if (effectiveTeacherId) {
          await supabaseAdmin.from('portal_users')
            .update({ primary_teacher_id: effectiveTeacherId })
            .eq('id', authUserId)
            .is('primary_teacher_id', null); // safety: only if not already set
        }

        // --- NEW: Also ensure a record exists in the 'students' table ---
        // This is crucial because the parents management logic and other dashboard features
        // expect students to have a record in the 'students' table for linkage.
        const { error: studentErr } = await supabaseAdmin.from('students').upsert({
          user_id: authUserId,
          name: cleanStudentName(full_name) || full_name.trim(),
          full_name: cleanStudentName(full_name) || full_name.trim(),
          student_email: normalizeEmail(email),
          school_id: resolvedSchoolId,
          school_name: resolvedSchoolName,
          current_class: effectiveClassName,
          grade_level: specificGrade,
          class_arm: class_arm || batchClassArm || null,
          enrollment_type: 'in_person',
          status: 'approved', // Bulk-registered students are pre-approved
          gender: gender || null,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' }); // Use user_id as conflict target

        if (studentErr) {
          console.error('[BulkRegister] Student table sync error:', studentErr);
          if (status === 'created') {
            await supabaseAdmin.from('portal_users').delete().eq('id', authUserId);
            await supabaseAdmin.auth.admin.deleteUser(authUserId).catch((deleteErr) => {
              console.error('[BulkRegister] Failed to rollback auth user after student sync error:', deleteErr);
            });
          }
          results.push({
            full_name, email, password, class_name, status: 'failed',
            error: `Student sync error: ${studentErr.message}`,
          });
          continue;
        }

        const effectiveClass = effectiveClassName || undefined;
        let cardIssued = false;
        let cardId: string | null = null;

        try {
          const card = await ensureStudentCardIssued(supabaseAdmin as any, {
            holderId: authUserId,
            schoolId: resolvedSchoolId,
            classId: effectiveClassId,
            actorId: user.id,
            metadata: {
              source: 'bulk_register',
              class_name: effectiveClass || null,
              batch_id: body.batch_id || null,
            },
          });
          cardIssued = card.created;
          cardId = card.id;
        } catch (cardErr) {
          console.error('[BulkRegister] Card auto-issue failed:', cardErr);
        }

        // Within-batch barricade: later rows in this upload hit the same maps.
        {
          const createdName = cleanStudentName(full_name) || full_name.trim();
          registerCreatedNameInMaps(nameMaps, createdName, {
            id: authUserId,
            email: emailKey,
            full_name: createdName,
          });
        }

        if (resolvedClass.id) {
          const assignment = rosterAssignments.get(resolvedClass.id) ?? {
            cls: resolvedClass,
            studentIds: new Set<string>(),
          };
          assignment.studentIds.add(authUserId);
          rosterAssignments.set(resolvedClass.id, assignment);
        }

        results.push({ full_name, email, password, class_name: effectiveClass, class_arm: class_arm || batchClassArm || null, status, userId: authUserId, cardIssued, cardId });
      } catch (err: any) {
        results.push({ full_name, email, password, class_name, status: 'failed', error: err.message });
      }
    }

    // Auto-enroll into programme if one was selected
    if (programId) {
      const successIds = results
        .filter((r) => r.status === 'created' || r.status === 'updated' || r.status === 'reinstated')
        .filter((r) => r.userId)
        .map((r) => r.userId as string);

      if (successIds.length > 0) {
        const enrollments = successIds.map((userId) => ({
          user_id: userId,
          program_id: programId,
          status: 'active',
          role: 'student',
        }));

        // Insert only those not already enrolled
        const { data: alreadyEnrolled } = await supabaseAdmin
          .from('enrollments')
          .select('user_id')
          .eq('program_id', programId)
          .in('user_id', successIds);
        const enrolledSet = new Set((alreadyEnrolled ?? []).map((e: any) => e.user_id));
        const toInsert = enrollments.filter((e) => !enrolledSet.has(e.user_id));
        if (toInsert.length > 0) {
          const { error: enrollmentErr } = await supabaseAdmin.from('enrollments').insert(toInsert);
          if (enrollmentErr) {
            for (const result of results) {
              if (result.userId && successIds.includes(result.userId)) {
                result.error = `Account created, but programme enrollment failed: ${enrollmentErr.message}`;
              }
            }
          }
        }
      }
    }

    // Each selected section owns the roster for its own canonical term. Mixed-grade
    // imports may therefore write several class rosters in one registration batch.
    for (const [classId, assignment] of rosterAssignments) {
      for (const studentId of assignment.studentIds) {
        let rosterQuery = (supabaseAdmin as any).from('class_term_rosters').select('id').eq('class_id', classId).eq('student_id', studentId).limit(1);
        rosterQuery = assignment.cls.termId ? rosterQuery.eq('term_id', assignment.cls.termId) : rosterQuery.is('term_id', null);
        const { data: existingRoster } = await rosterQuery.maybeSingle();
        const rosterPayload = {
          class_id: classId,
          student_id: studentId,
          school_id: assignment.cls.schoolId,
          program_id: assignment.cls.programId,
          term_id: assignment.cls.termId,
          status: 'active',
          ended_at: null,
          updated_by: user.id,
        };
        const { error: rosterError } = existingRoster?.id
          ? await (supabaseAdmin as any).from('class_term_rosters').update({ ...rosterPayload, reinstated_at: new Date().toISOString() }).eq('id', existingRoster.id)
          : await (supabaseAdmin as any).from('class_term_rosters').insert({ ...rosterPayload, started_at: new Date().toISOString(), created_by: user.id });
        if (rosterError) throw new HttpError(`Student created but term roster sync failed: ${rosterError.message}`, 500);
      }
    }
    // Sync current_students count for every class touched by this import.
    for (const classId of touchedClassIds) {
      try {
        const { data: studentsInClass } = await supabaseAdmin
          .from('portal_users')
          .select('id', { count: 'exact' })
          .eq('class_id', classId)
          .eq('role', 'student');
        
        const actualCount = studentsInClass?.length || 0;
        await supabaseAdmin
          .from('classes')
          .update({ current_students: actualCount })
          .eq('id', classId);
      } catch (err) {
        console.error('[BulkRegister] Failed to sync class count:', err);
      }
    }

    // Include portal_user_id so frontend can display RC-XXXXXXXX student codes
    const publicResults = results.map(({ userId, ...rest }) => ({
      ...rest,
      cardIssued: rest.cardIssued ?? false,
      cardId: rest.cardId ?? null,
      portal_user_id: userId || null,
      batch_id: body.batch_id || null
    }));

    // ── Save to Official Registry (History) ──────────────────────────────────
    const batchId = body.batch_id;
    if (batchId) {
      try {
        const batchIsSingleClass = batchSelectedClassIds.length
          ? batchSelectedClassIds.length === 1
          : touchedClassIds.size === 1;
        const singleTouchedClassId = batchSelectedClassIds.length === 1
          ? batchSelectedClassIds[0]
          : touchedClassIds.size === 1 ? Array.from(touchedClassIds)[0] : null;
        const singleTouchedClassName = batchIsSingleClass && results.length > 0
          ? Array.from(new Set(results.map((r) => r.class_name).filter(Boolean)))[0] ?? null
          : null;
        // 1. Upsert batch metadata
        const { error: batchErr } = await supabaseAdmin.from('registration_batches').upsert({
          id: batchId,
          created_by: user.id,
          school_id: resolvedSchoolId,
          school_name: resolvedSchoolName,
          program_id: programId,
          class_id: batchClassId || singleTouchedClassId,
          class_name: batchClassId ? batchClassName : singleTouchedClassName,
        }, { onConflict: 'id' });
        if (batchErr) throw batchErr;

        // 2. Map results to history entries — only archive registrations that
        // actually produced a live account. 'failed' / 'name_swap_conflict' never
        // create one, so archiving them would leave a credential row with no account
        // that surfaces forever as "Deleted". (Account deletions are auto-purged by
        // the trg_purge_registration_archive trigger.)
        const historyEntries = results
          .filter(r => ['created', 'updated', 'skipped'].includes(r.status))
          .map(r => ({
            batch_id: batchId,
            full_name: r.full_name,
            email: r.email,
            password: r.password,
            class_name: r.class_name || null,
            class_arm: r.class_arm || batchClassArm || null,
            status: r.status,
            error: r.error || null
          }));

        // 3. Insert results
        if (historyEntries.length > 0) {
          const { error: historyErr } = await supabaseAdmin.from('registration_results').insert(historyEntries);
          if (historyErr) throw historyErr;
        }
        
        // 4. Update student count on batch
        const { count: archivedCount } = await supabaseAdmin
          .from('registration_results')
          .select('id', { count: 'exact', head: true })
          .eq('batch_id', batchId);
        const { error: countErr } = await supabaseAdmin
          .from('registration_batches')
          .update({ student_count: archivedCount ?? historyEntries.length })
          .eq('id', batchId);
        if (countErr) throw countErr;
          
      } catch (histErr) {
        console.error('[BulkRegister] Failed to save history:', histErr);
        // We don't fail the whole request if history saving fails, 
        // as students were already created.
      }
    }

    return NextResponse.json({ results: publicResults });
  } catch (err: any) {
    console.error('Bulk register error:', err);
    const status = err instanceof BulkClassResolverError ? err.status : (err.status || 500);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status });
  }
}

export async function PATCH(request: Request) {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: patchCaller } = await supabase.from('portal_users').select('role, school_id, school_name').eq('id', user.id).single();
    if (!patchCaller || !['admin', 'teacher'].includes(patchCaller.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const assignedSchoolIds = await getAssignedSchoolIds(patchCaller, user.id);

    if (body.type === 'batch') {
      const { id, class_name, school_id, school_name } = body.data;
      if (!id) return NextResponse.json({ error: 'Batch id required' }, { status: 400 });
      await requireBatchAccess(id, patchCaller, assignedSchoolIds);
      if (patchCaller.role !== 'admin' && school_id && !assignedSchoolIds.has(school_id)) {
        return NextResponse.json({ error: 'You cannot move this batch to another school.' }, { status: 403 });
      }
      const { error } = await supabaseAdmin
        .from('registration_batches')
        .update({ class_name: class_name || null, school_id: school_id || null, school_name: school_name || null })
        .eq('id', id);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    if (body.type === 'result') {
      const r = body.data;
      if (!r?.id) return NextResponse.json({ error: 'Result id required' }, { status: 400 });
      const { data: currentResult, error: currentResultErr } = await supabaseAdmin
        .from('registration_results')
        .select('id, batch_id, email')
        .eq('id', r.id)
        .maybeSingle();
      if (currentResultErr) throw currentResultErr;
      if (!currentResult) return NextResponse.json({ error: 'Registration result not found' }, { status: 404 });
      await requireBatchAccess((currentResult as any).batch_id, patchCaller, assignedSchoolIds);

      const { error: resErr } = await supabaseAdmin
        .from('registration_results')
        .update({ full_name: r.full_name, class_name: r.class_name || null, email: r.email })
        .eq('id', r.id);
      if (resErr) throw resErr;

      const { data: existingUser } = await supabaseAdmin
        .from('portal_users')
        .select('id, school_id')
        .eq('email', (currentResult as any).email)
        .maybeSingle();
      if (existingUser && canAccessSchool(patchCaller, assignedSchoolIds, (existingUser as any).school_id)) {
        // Per-row class_name in registration vault is the grade code, not the cohort name.
        const gradeOnly = cleanGrade(r.class_name) || null;
        await supabaseAdmin.from('portal_users')
          .update({ full_name: r.full_name, ...(gradeOnly ? { grade: gradeOnly } : {}) })
          .eq('id', existingUser.id);
        await supabaseAdmin.from('students')
          .update({ full_name: r.full_name, name: r.full_name, ...(gradeOnly ? { grade_level: gradeOnly, grade: gradeOnly } : {}) })
          .eq('user_id', existingUser.id);
      }
      return NextResponse.json({ success: true });
    }

    // Assign all students from a batch to a class (sets class_id, school_id, section_class).
    // Safe: only targets portal_users with role='student' and email in the batch.
    // Protected students (primary_teacher_id set to a different teacher) are skipped.
    if (body.type === 'batch_assign_class') {
      const { batchId, classId } = body;
      if (!batchId || !classId) return NextResponse.json({ error: 'batchId and classId required' }, { status: 400 });

      await requireBatchAccess(batchId, patchCaller, assignedSchoolIds);
      const cls = await requireBulkClassAccess(supabaseAdmin, classId, patchCaller, assignedSchoolIds);

      const { data: results } = await supabaseAdmin.from('registration_results').select('email').eq('batch_id', batchId);
      const emails = (results ?? []).map((r: any) => r.email).filter(Boolean);
      if (emails.length === 0) return NextResponse.json({ updated: 0 });

      const { data: users } = await supabaseAdmin
        .from('portal_users')
        .select('id, primary_teacher_id, school_id')
        .in('email', emails)
        .eq('role', 'student')
        .eq('is_deleted', false);

      // Skip students protected by a different teacher
      const allowedIds = (users ?? [])
        .filter((u: any) => canAccessSchool(patchCaller, assignedSchoolIds, u.school_id))
        .filter((u: any) => !u.primary_teacher_id || u.primary_teacher_id === cls.teacher_id)
        .map((u: any) => u.id);
      const protectedCount = (users ?? []).length - allowedIds.length;

      if (allowedIds.length === 0) {
        return NextResponse.json({
          updated: 0,
          protected: protectedCount,
          message: `All ${protectedCount} student(s) in this batch belong to a different teacher's class and are protected. Use the Class Health tool to transfer them.`,
        });
      }

      const { error } = await supabaseAdmin.from('portal_users').update({
        class_id: classId,
        school_id: cls.school_id,
        section_class: cls.name,
        grade: cleanGrade(cls.qa_grade_key || cls.qa_grade_band) || null,
        primary_teacher_id: cls.teacher_id ?? null,
        updated_at: new Date().toISOString(),
      }).in('id', allowedIds).eq('role', 'student');
      if (error) throw error;

      // Keep students shadow table in sync
      await supabaseAdmin.from('students').update({
        current_class: cls.name,
        grade: cleanGrade(cls.qa_grade_key || cls.qa_grade_band) || null,
        grade_level: cleanGrade(cls.qa_grade_key || cls.qa_grade_band) || null,
        section: cls.name,
        school_id: cls.school_id,
      }).in('user_id', allowedIds);

      // Keep identity_cards class_id in sync so card studio shows correct class grouping
      await supabaseAdmin.from('identity_cards').update({
        class_id: classId,
      }).in('holder_id', allowedIds).eq('holder_type', 'student');

      // Also update the batch record so future exports reflect the class
      await supabaseAdmin.from('registration_batches').update({
        class_name: cls.name,
        school_id: cls.school_id,
      }).eq('id', batchId);

      return NextResponse.json({ success: true, updated: allowedIds.length, protected: protectedCount });
    }

    // Activate or deactivate all students in a batch
    if (body.type === 'batch_toggle_active') {
      const { batchId, isActive } = body;
      if (!batchId || typeof isActive !== 'boolean') return NextResponse.json({ error: 'batchId and isActive required' }, { status: 400 });
      await requireBatchAccess(batchId, patchCaller, assignedSchoolIds);

      const { data: results } = await supabaseAdmin.from('registration_results').select('email').eq('batch_id', batchId);
      const emails = (results ?? []).map((r: any) => r.email).filter(Boolean);
      if (emails.length === 0) return NextResponse.json({ updated: 0 });

      const { data: users } = await supabaseAdmin.from('portal_users').select('id, school_id').in('email', emails).eq('role', 'student').eq('is_deleted', false);
      const userIds = (users ?? [])
        .filter((u: any) => canAccessSchool(patchCaller, assignedSchoolIds, u.school_id))
        .map((u: any) => u.id);
      if (userIds.length === 0) return NextResponse.json({ updated: 0 });

      const { error } = await supabaseAdmin.from('portal_users').update({
        is_active: isActive,
        updated_at: new Date().toISOString(),
      }).in('id', userIds);
      if (error) throw error;
      return NextResponse.json({ success: true, updated: userIds.length });
    }

    const results: any[] = body.results;
    if (Array.isArray(results)) {
       for (const r of results) {
          if (!r?.batch_id) continue;
          await requireBatchAccess(r.batch_id, patchCaller, assignedSchoolIds);
          // 1. Update the registration_results history archive
          await supabaseAdmin
            .from('registration_results')
            .update({ full_name: r.full_name, class_name: r.class_name || null, email: r.email })
            .eq('batch_id', r.batch_id)
            .eq('email', r.email);

          // 2. Synchronize active account (portal_users) and shadow profile (students)
          const { data: existingUser } = await supabaseAdmin
            .from('portal_users')
            .select('id, school_id')
            .eq('email', r.email)
            .maybeSingle();

          if (existingUser && canAccessSchool(patchCaller, assignedSchoolIds, (existingUser as any).school_id)) {
            // class_name in vault = grade code; do not overwrite section_class / current_class.
            const gradeOnly = cleanGrade(r.class_name) || null;
            await supabaseAdmin.from('portal_users')
              .update({ full_name: r.full_name, ...(gradeOnly ? { grade: gradeOnly } : {}) })
              .eq('id', existingUser.id);

            await supabaseAdmin.from('students')
              .update({ full_name: r.full_name, name: r.full_name, ...(gradeOnly ? { grade_level: gradeOnly, grade: gradeOnly } : {}) })
              .eq('user_id', existingUser.id);
          }
       }
    }
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Bulk update error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: err.status || 500 });
  }
}

export async function DELETE() {
  return NextResponse.json(
    { error: 'Registration archive deletion has been retired. Use Records for live credentials, or Bulk Delete Students to remove accounts and cleanup credentials.' },
    { status: 410 },
  );
}
