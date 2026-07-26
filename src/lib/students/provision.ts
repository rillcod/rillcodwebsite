import type { SupabaseClient } from '@supabase/supabase-js';
import { generateTempPassword } from '@/lib/utils/password';
import { preparePortalStructure } from '@/lib/portal/ensure-structure';
import { archivePortalCredential } from '@/lib/credentials/archive-registration-result';
import { findAuthUserIdByEmail } from '@/lib/auth/list-all-users';
import { cleanStudentName } from '@/lib/students/clean-name';

type AnySupabase = SupabaseClient<any>;

export type PasswordPolicy = 'set' | 'reset' | 'keep';

export type FindOrCreateStudentInput = {
  email: string;
  fullName: string;
  schoolId?: string | null;
  schoolName?: string | null;
  classId?: string | null;
  sectionClass?: string | null;
  grade?: string | null;
  passwordPolicy?: PasswordPolicy;
  password?: string | null;
  enrollmentType?: string | null;
  gender?: string | null;
  dateOfBirth?: string | null;
  phone?: string | null;
  /** Prefer this auth/portal id when reactivating a known student. */
  existingUserId?: string | null;
  preserveExistingProfile?: boolean;
  archiveCredentials?: boolean;
  batchLabel?: string;
  classNameForArchive?: string | null;
};

export type FindOrCreateStudentResult = {
  ok: boolean;
  error?: string;
  status?: number;
  studentId?: string;
  email?: string;
  created?: boolean;
  password?: string | null;
  schoolId?: string | null;
  schoolName?: string | null;
  classId?: string | null;
};

/**
 * Single entry for activate / summer / paid / consent / prospect student portals.
 * Dedupes by portal_users email (role=student). Recovers auth races via paginated email lookup.
 */
export async function findOrCreateStudentPortal(
  admin: AnySupabase,
  input: FindOrCreateStudentInput,
): Promise<FindOrCreateStudentResult> {
  const email = input.email.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, status: 400, error: 'A valid student login email is required' };
  }

  const passwordPolicy: PasswordPolicy = input.passwordPolicy ?? 'set';
  const fullName = cleanStudentName(input.fullName) || input.fullName.trim() || 'Student';
  const preserve = input.preserveExistingProfile !== false;

  let existing: { id: string; role: string; phone?: string | null; full_name?: string | null; school_id?: string | null } | null = null;

  if (input.existingUserId) {
    const { data } = await admin
      .from('portal_users')
      .select('id, role, phone, full_name, school_id, email')
      .eq('id', input.existingUserId)
      .maybeSingle();
    if (data) existing = data as any;
  }

  if (!existing) {
    const { data } = await admin
      .from('portal_users')
      .select('id, role, phone, full_name, school_id')
      .eq('email', email)
      .maybeSingle();
    existing = data as any;
  }

  if (existing && existing.role !== 'student') {
    return {
      ok: false,
      status: 409,
      error: `This email is already registered as a ${existing.role} account. Use a different student login.`,
    };
  }

  let schoolId = input.schoolId ?? existing?.school_id ?? null;
  let schoolName = input.schoolName ?? null;
  let classId = input.classId ?? null;
  let sectionClass = input.sectionClass ?? null;
  let placedAuthMeta: Record<string, unknown> = { role: 'student' };

  if (schoolId) {
    const placed = await preparePortalStructure(admin, {
      role: 'student',
      schoolId,
      schoolName,
      classId,
      classHints: [sectionClass],
      grade: input.grade,
      wantActive: true,
      autoCreateClass: !classId,
    });
    if (!placed.isActive) {
      return { ok: false, status: 400, error: placed.error || 'Student portal structure blocked' };
    }
    schoolId = placed.schoolId;
    schoolName = placed.schoolName || schoolName;
    classId = placed.classId || classId;
    sectionClass = sectionClass || placed.className;
    placedAuthMeta = placed.authMetadata ?? placedAuthMeta;
  }

  const buildPortalRow = (id: string, extras?: Record<string, unknown>) => ({
    id,
    email,
    full_name: fullName,
    role: 'student',
    school_id: schoolId,
    school_name: schoolName,
    class_id: classId,
    section_class: sectionClass,
    grade: input.grade ?? null,
    enrollment_type: input.enrollmentType ?? null,
    gender: input.gender ?? null,
    date_of_birth: input.dateOfBirth ?? null,
    phone: input.phone ?? null,
    is_active: true,
    updated_at: new Date().toISOString(),
    ...extras,
  });

  const maybeArchive = async (password: string | null | undefined) => {
    if (input.archiveCredentials === false || !password || !schoolId) return;
    await archivePortalCredential(admin, {
      schoolId,
      schoolName: schoolName ?? null,
      fullName,
      email,
      password,
      className: input.classNameForArchive ?? sectionClass ?? null,
      batchLabel: input.batchLabel || 'Student Account',
    });
  };

  if (existing?.id) {
    const studentId = existing.id;
    const patch: Record<string, unknown> = {
      is_active: true,
      role: 'student',
      email,
      updated_at: new Date().toISOString(),
    };
    if (schoolId) {
      patch.school_id = schoolId;
      patch.school_name = schoolName;
    }
    if (classId) patch.class_id = classId;
    if (sectionClass) patch.section_class = sectionClass;
    if (input.grade !== undefined) patch.grade = input.grade;
    if (input.enrollmentType) patch.enrollment_type = input.enrollmentType;
    if (!preserve) {
      patch.full_name = fullName;
      if (input.phone !== undefined) patch.phone = input.phone;
      if (input.gender !== undefined) patch.gender = input.gender;
      if (input.dateOfBirth !== undefined) patch.date_of_birth = input.dateOfBirth;
    } else {
      if (input.phone && !existing.phone) patch.phone = input.phone;
      if (input.gender) patch.gender = input.gender;
      if (input.dateOfBirth) patch.date_of_birth = input.dateOfBirth;
    }

    await admin.from('portal_users').update(patch).eq('id', studentId);

    let password: string | null = null;
    if (passwordPolicy === 'reset' || (passwordPolicy === 'set' && input.password)) {
      password = (input.password?.trim() && input.password.length >= 8)
        ? input.password.trim()
        : generateTempPassword();
      const { error: resetErr } = await admin.auth.admin.updateUserById(studentId, {
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName, ...placedAuthMeta },
      });
      if (resetErr) {
        return { ok: false, status: 500, error: resetErr.message || 'Could not reset student password' };
      }
      await maybeArchive(password);
    }

    return {
      ok: true,
      studentId,
      email,
      created: false,
      password,
      schoolId,
      schoolName,
      classId,
    };
  }

  const password = (input.password?.trim() && input.password.length >= 8)
    ? input.password.trim()
    : generateTempPassword();

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, ...placedAuthMeta },
  });

  let studentId = created?.user?.id ?? null;
  if (createErr || !studentId) {
    const recoveredId = await findAuthUserIdByEmail(admin as any, email).catch(() => null);
    if (recoveredId) {
      const { data: recoveredPortal } = await admin
        .from('portal_users')
        .select('id, role')
        .eq('id', recoveredId)
        .maybeSingle();
      if (recoveredPortal && recoveredPortal.role !== 'student') {
        return {
          ok: false,
          status: 409,
          error: `This email is already registered as a ${recoveredPortal.role} account.`,
        };
      }
      studentId = recoveredId;
      // `keep` means "reuse the credentials this account already has". When the
      // auth user exists but has NO portal row we are effectively provisioning
      // the portal for the first time, so there are no credentials to keep —
      // issue one, otherwise we would report created:true with no password the
      // caller could ever deliver.
      const recoverPassword = (passwordPolicy === 'keep' && recoveredPortal) ? null : password;
      if (recoverPassword) {
        await admin.auth.admin.updateUserById(studentId, {
          password: recoverPassword,
          email_confirm: true,
          user_metadata: { full_name: fullName, ...placedAuthMeta },
        });
      }
      await admin.from('portal_users').upsert(buildPortalRow(studentId), { onConflict: 'id' });
      await maybeArchive(recoverPassword);
      return {
        ok: true,
        studentId,
        email,
        created: !recoveredPortal,
        password: recoverPassword,
        schoolId,
        schoolName,
        classId,
      };
    }
    return { ok: false, status: 500, error: createErr?.message || 'Could not create student account' };
  }

  const { error: upsertErr } = await admin.from('portal_users').upsert(
    buildPortalRow(studentId),
    { onConflict: 'id' },
  );
  if (upsertErr) {
    try { await admin.auth.admin.deleteUser(studentId); } catch { /* best-effort */ }
    return { ok: false, status: 500, error: upsertErr.message || 'Could not set up student profile' };
  }

  await maybeArchive(password);

  return {
    ok: true,
    studentId,
    email,
    created: true,
    password,
    schoolId,
    schoolName,
    classId,
  };
}
