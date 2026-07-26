import type { SupabaseClient } from '@supabase/supabase-js';
import { generateTempPassword } from '@/lib/utils/password';
import { preparePortalStructure } from '@/lib/portal/ensure-structure';
import { archivePortalCredential } from '@/lib/credentials/archive-registration-result';
import { syncExplicitParentStudentLink, resolveOrCreateStudentRowId, isParentLinkConflict } from '@/lib/parents/links';

type AnySupabase = SupabaseClient<any>;

export type PasswordPolicy = 'set' | 'reset' | 'keep';

export type FindOrCreateParentInput = {
  email: string;
  fullName?: string | null;
  phone?: string | null;
  schoolId?: string | null;
  schoolName?: string | null;
  /** set = create with new password; reset = always rotate; keep = reuse existing, no new password */
  passwordPolicy?: PasswordPolicy;
  /** Staff-supplied password when creating/resetting (manage UI). Otherwise a temp password is generated. */
  password?: string | null;
  preserveExistingProfile?: boolean;
  archiveCredentials?: boolean;
  batchLabel?: string;
};

export type FindOrCreateParentResult = {
  ok: boolean;
  error?: string;
  status?: number;
  parentId?: string;
  created?: boolean;
  password?: string | null;
};

/**
 * Single entry point for staff/activation/claim flows that need a parent portal.
 * Dedupes by portal_users email (role=parent). Avoids listUsers(1000) pagination traps.
 */
export async function findOrCreateParentPortal(
  admin: AnySupabase,
  input: FindOrCreateParentInput,
): Promise<FindOrCreateParentResult> {
  const email = input.email.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, status: 400, error: 'A valid parent email is required' };
  }

  const passwordPolicy: PasswordPolicy = input.passwordPolicy ?? 'set';
  const fullName = (input.fullName || 'Parent/Guardian').trim() || 'Parent/Guardian';
  const preserve = input.preserveExistingProfile !== false;

  const { data: existing } = await admin
    .from('portal_users')
    .select('id, role, phone, full_name, school_id')
    .eq('email', email)
    .maybeSingle();

  if (existing && existing.role !== 'parent') {
    return {
      ok: false,
      status: 409,
      error: `This email is already registered as a ${existing.role} account. Use a different email.`,
    };
  }

  let schoolId = input.schoolId ?? existing?.school_id ?? null;
  let schoolName = input.schoolName ?? null;
  let placedAuthMeta: Record<string, unknown> = { role: 'parent' };

  if (schoolId) {
    const placed = await preparePortalStructure(admin, {
      role: 'parent',
      schoolId,
      schoolName,
      wantActive: true,
    });
    if (!placed.isActive) {
      return { ok: false, status: 400, error: placed.error || 'Parent portal structure blocked' };
    }
    schoolId = placed.schoolId;
    schoolName = placed.schoolName || schoolName;
    placedAuthMeta = placed.authMetadata ?? placedAuthMeta;
  }

  if (existing?.id) {
    const parentId = existing.id;
    const patch: Record<string, unknown> = {
      is_active: true,
      updated_at: new Date().toISOString(),
    };
    if (schoolId) {
      patch.school_id = schoolId;
      patch.school_name = schoolName;
    }
    if (!preserve) {
      patch.full_name = fullName;
      if (input.phone !== undefined) patch.phone = input.phone;
    } else if (input.phone && !existing.phone) {
      patch.phone = input.phone;
    }
    await admin.from('portal_users').update(patch).eq('id', parentId);

    let password: string | null = null;
    if (passwordPolicy === 'reset' || (passwordPolicy === 'set' && input.password)) {
      password = (input.password?.trim() && input.password.length >= 8)
        ? input.password.trim()
        : generateTempPassword();
      const { error: resetErr } = await admin.auth.admin.updateUserById(parentId, {
        password,
        user_metadata: { full_name: fullName, ...placedAuthMeta },
      });
      if (resetErr) {
        return { ok: false, status: 500, error: resetErr.message || 'Could not reset parent password' };
      }
      if (input.archiveCredentials !== false && schoolId && password) {
        await archivePortalCredential(admin, {
          schoolId,
          schoolName: schoolName ?? null,
          fullName,
          email,
          password,
          className: 'Parent Account',
          batchLabel: input.batchLabel || 'Parent Account',
        });
      }
    }

    return { ok: true, parentId, created: false, password };
  }

  // New parent — create Auth + portal_users
  const password = (input.password?.trim() && input.password.length >= 8)
    ? input.password.trim()
    : generateTempPassword();
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, ...placedAuthMeta },
  });

  let parentId = created?.user?.id ?? null;
  if (createErr || !parentId) {
    // Race: auth user may already exist without a portal row — recover by email
    // without the listUsers(1000) single-page trap.
    const { findAuthUserIdByEmail } = await import('@/lib/auth/list-all-users');
    const recoveredId = await findAuthUserIdByEmail(admin as any, email).catch(() => null);
    if (recoveredId) {
      const { data: recoveredPortal } = await admin
        .from('portal_users')
        .select('id, role')
        .eq('id', recoveredId)
        .maybeSingle();
      if (recoveredPortal && recoveredPortal.role !== 'parent') {
        return {
          ok: false,
          status: 409,
          error: `This email is already registered as a ${recoveredPortal.role} account. Use a different email.`,
        };
      }
      parentId = recoveredId;
      const recoverPassword = (input.password?.trim() && input.password.length >= 8)
        ? input.password.trim()
        : (passwordPolicy === 'reset' || passwordPolicy === 'set' ? password : null);
      if (recoverPassword) {
        await admin.auth.admin.updateUserById(parentId, {
          password: recoverPassword,
          email_confirm: true,
          user_metadata: { full_name: fullName, ...placedAuthMeta },
        });
      }
      await admin.from('portal_users').upsert({
        id: parentId,
        email,
        full_name: fullName,
        phone: input.phone ?? null,
        role: 'parent',
        school_id: schoolId,
        school_name: schoolName,
        is_active: true,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });
      return {
        ok: true,
        parentId,
        created: !recoveredPortal,
        password: recoverPassword,
      };
    }

    const { data: again } = await admin
      .from('portal_users')
      .select('id, role')
      .eq('email', email)
      .maybeSingle();
    if (again?.id && again.role === 'parent') {
      return { ok: true, parentId: again.id, created: false, password: null };
    }
    return { ok: false, status: 500, error: createErr?.message || 'Could not create parent account' };
  }

  const { error: upsertErr } = await admin.from('portal_users').upsert({
    id: parentId,
    email,
    full_name: fullName,
    phone: input.phone ?? null,
    role: 'parent',
    school_id: schoolId,
    school_name: schoolName,
    is_active: true,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' });

  if (upsertErr) {
    try { await admin.auth.admin.deleteUser(parentId); } catch { /* best-effort */ }
    return { ok: false, status: 500, error: upsertErr.message || 'Could not set up parent profile' };
  }

  if (input.archiveCredentials !== false && schoolId) {
    await archivePortalCredential(admin, {
      schoolId,
      schoolName: schoolName ?? null,
      fullName,
      email,
      password,
      className: 'Parent Account',
      batchLabel: input.batchLabel || 'Parent Account',
    });
  }

  return { ok: true, parentId, created: true, password };
}

/**
 * Provision parent (if needed) and establish the canonical junction link.
 * Fails closed on link conflicts so callers never treat "account created" as "linked".
 */
export async function ensureParentPortalAndLink(
  admin: AnySupabase,
  input: FindOrCreateParentInput & {
    /** students.id or portal_users.id — resolved centrally */
    studentId: string;
    actorId?: string | null;
    source?: string;
  },
): Promise<FindOrCreateParentResult & { studentRowId?: string; linked?: boolean }> {
  const provisioned = await findOrCreateParentPortal(admin, input);
  if (!provisioned.ok || !provisioned.parentId) return provisioned;

  const studentRowId =
    (await resolveOrCreateStudentRowId(admin, input.studentId))
    ?? null;
  if (!studentRowId) {
    return { ...provisioned, ok: false, status: 404, error: 'Student record not found for linking', linked: false };
  }

  try {
    await syncExplicitParentStudentLink(admin, provisioned.parentId, studentRowId, {
      actorId: input.actorId ?? null,
      source: input.source ?? 'ensureParentPortalAndLink',
    });
  } catch (err) {
    if (isParentLinkConflict(err)) {
      return {
        ...provisioned,
        ok: false,
        status: 409,
        error: err.message,
        studentRowId,
        linked: false,
      };
    }
    throw err;
  }

  return { ...provisioned, studentRowId, linked: true };
}
