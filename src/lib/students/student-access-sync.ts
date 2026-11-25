import type { SupabaseClient } from '@supabase/supabase-js';
import { getSessionBoundary } from '@/lib/academic/session-scope';
import { inferCanonicalEnrollmentTypeForClass } from '@/lib/academic/enrollment-type';
import { archivePortalCredential } from '@/lib/credentials/archive-registration-result';
import { defaultRosterBillingPayload } from '@/lib/rosters/billing-sync';
import { generateTempPassword, normalizeRillcodTempPassword } from '@/lib/utils/password';

const SPECIALIZED_RE = /\b(summer\s*school|bootcamp|coding\s*club|holiday|speciali[sz]ed|rillcod\s*academy)\b/i;
const SPECIALIZED_TYPES = new Set(['bootcamp', 'summer_school', 'in_person', 'online', 'independent', 'special']);

/** Postgres CHECK constraint on students.status — only these values are accepted. */
const STUDENT_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  GRADUATED: 'graduated',
  INACTIVE: 'inactive',
} as const;
type StudentStatus = (typeof STUDENT_STATUS)[keyof typeof STUDENT_STATUS];

function isSpecializedContext(enrollmentType?: string | null, label?: string | null): boolean {
  const et = String(enrollmentType ?? '').trim().toLowerCase();
  if (et && SPECIALIZED_TYPES.has(et)) return true;
  const text = String(label ?? '').trim();
  return Boolean(text && SPECIALIZED_RE.test(text));
}

export interface StudentAuthTarget {
  id: string;
  full_name: string | null;
  email: string | null;
  school_id?: string | null;
  school_name?: string | null;
  section_class?: string | null;
}

/**
 * Ensures Supabase Auth readiness for placed students WITHOUT overwriting passwords
 * of learners who have already signed in:
 * - Creates missing `auth.users` rows for orphaned `portal_users` accounts
 * - Confirms email (`email_confirm: true`), lifts bans, and clears blocking `must_change_password`
 * - If the learner has NEVER signed in (`!last_sign_in_at`), syncs their `auth.users` password
 *   with their archived `registration_results` slip password (or issues & archives one if missing)
 *   so staff never have to manually reset old/adopted accounts before an exam.
 */
export async function syncStudentAuthReadiness(
  admin: SupabaseClient,
  students: StudentAuthTarget[],
): Promise<{ repairedCount: number }> {
  const authAdmin = (admin as any)?.auth?.admin;
  if (!authAdmin || typeof authAdmin.getUserById !== 'function' || students.length === 0) {
    return { repairedCount: 0 };
  }

  const emails = Array.from(
    new Set(
      students
        .map((s) => String(s.email ?? '').trim().toLowerCase())
        .filter(Boolean),
    ),
  );

  const archivedPasswordByEmail = new Map<string, string>();
  if (emails.length > 0) {
    for (let i = 0; i < emails.length; i += 200) {
      const slice = emails.slice(i, i + 200);
      const { data: credRows } = await admin
        .from('registration_results')
        .select('email, password, created_at')
        .in('email', slice)
        .order('created_at', { ascending: false });
      for (const row of (credRows ?? []) as Array<{ email?: string | null; password?: string | null }>) {
        const em = String(row.email ?? '').trim().toLowerCase();
        const pw = String(row.password ?? '').trim();
        if (em && pw && !archivedPasswordByEmail.has(em)) {
          archivedPasswordByEmail.set(em, pw);
        }
      }
    }
  }

  let repairedCount = 0;

  for (const stu of students) {
    const cleanEmail = String(stu.email ?? '').trim().toLowerCase();
    if (!stu.id || !cleanEmail) continue;

    try {
      const { data: userRes, error: getErr } = await authAdmin.getUserById(stu.id);
      const authUser = userRes?.user ?? null;
      const rawArchivedPw = archivedPasswordByEmail.get(cleanEmail) ?? null;
      const archivedPw = rawArchivedPw ? normalizeRillcodTempPassword(rawArchivedPw) : null;

      if (!authUser && getErr) {
        const freshPassword = archivedPw && archivedPw.length >= 6 ? archivedPw : generateTempPassword();
        const { error: createErr } = await authAdmin.createUser({
          id: stu.id,
          email: cleanEmail,
          password: freshPassword,
          email_confirm: true,
          user_metadata: {
            full_name: stu.full_name || 'Student',
            role: 'student',
            must_change_password: false,
          },
        });
        if (!createErr) {
          repairedCount += 1;
          if (!archivedPw || archivedPw !== freshPassword) {
            await archivePortalCredential(admin as any, {
              schoolId: stu.school_id ?? null,
              schoolName: stu.school_name ?? null,
              fullName: stu.full_name || 'Student',
              email: cleanEmail,
              password: freshPassword,
              className: stu.section_class ?? null,
              batchLabel: stu.section_class ? `Class Roster · ${stu.section_class}` : 'Portal Credentials',
              status: 'synced',
            });
          }
        }
        continue;
      }

      if (!authUser) continue;

      const neverSignedIn = !authUser.last_sign_in_at;
      const meta = (authUser.user_metadata && typeof authUser.user_metadata === 'object')
        ? (authUser.user_metadata as Record<string, unknown>)
        : {};
      const emailMismatch = String(authUser.email ?? '').trim().toLowerCase() !== cleanEmail;
      const emailUnconfirmed = !authUser.email_confirmed_at;
      const isBanned = Boolean((authUser as any).banned_until && new Date((authUser as any).banned_until) > new Date());
      const hasPasswordWall = meta.must_change_password === true;

      let passwordToSync: string | null = null;
      let shouldArchiveFresh = false;
      if (neverSignedIn) {
        if (archivedPw && archivedPw.length >= 6) {
          passwordToSync = archivedPw;
          if (rawArchivedPw && rawArchivedPw !== archivedPw) {
            shouldArchiveFresh = true;
          }
        } else if (!archivedPw) {
          passwordToSync = generateTempPassword();
          shouldArchiveFresh = true;
        }
      }

      if (emailMismatch || emailUnconfirmed || isBanned || hasPasswordWall || passwordToSync) {
        const { error: updErr } = await authAdmin.updateUserById(stu.id, {
          email: cleanEmail,
          email_confirm: true,
          ban_duration: 'none',
          user_metadata: {
            ...meta,
            full_name: stu.full_name || meta.full_name || 'Student',
            role: 'student',
            must_change_password: false,
          },
          ...(passwordToSync ? { password: passwordToSync } : {}),
        });
        if (!updErr) {
          repairedCount += 1;
          if (shouldArchiveFresh && passwordToSync) {
            await archivePortalCredential(admin as any, {
              schoolId: stu.school_id ?? null,
              schoolName: stu.school_name ?? null,
              fullName: stu.full_name || 'Student',
              email: cleanEmail,
              password: passwordToSync,
              className: stu.section_class ?? null,
              batchLabel: stu.section_class ? `Class Roster · ${stu.section_class}` : 'Portal Credentials',
              status: 'synced',
            });
          }
        }
      }
    } catch {
      // Non-fatal per-student auth check
    }
  }

  return { repairedCount };
}

export interface SyncStudentAccessOptions {
  studentIds: string[];
  classId: string;
  actorId?: string | null;
  syncAuth?: boolean;
}

export interface SyncStudentAccessResult {
  syncedCount: number;
  authRepairedCount: number;
  programId: string | null;
  className: string | null;
}

/**
 * Single source of truth for aligning student accounts to their current class,
 * session confirmation state, programme/course exam allocation, and login readiness.
 */
export async function syncStudentAccessAndAllocation(
  admin: SupabaseClient,
  opts: SyncStudentAccessOptions,
): Promise<SyncStudentAccessResult> {
  const uniqueIds = Array.from(new Set(opts.studentIds.map((id) => String(id ?? '').trim()).filter(Boolean)));
  if (uniqueIds.length === 0 || !opts.classId) {
    return { syncedCount: 0, authRepairedCount: 0, programId: null, className: null };
  }

  const { data: cls } = await admin
    .from('classes')
    .select('id, name, school_id, program_id, current_course_id, term_id, teacher_id, schools(name), academic_offerings(enrollment_type)')
    .eq('id', opts.classId)
    .maybeSingle();

  if (!cls) {
    return { syncedCount: 0, authRepairedCount: 0, programId: null, className: null };
  }

  let effectiveProgramId: string | null = cls.program_id ?? null;
  if (!effectiveProgramId && (cls as any).current_course_id) {
    const { data: courseRow } = await admin
      .from('courses')
      .select('program_id')
      .eq('id', (cls as any).current_course_id)
      .maybeSingle();
    effectiveProgramId = courseRow?.program_id ?? null;
  }

  const destSchoolName = Array.isArray((cls as any).schools)
    ? (cls as any).schools[0]?.name ?? null
    : (cls as any).schools?.name ?? null;
  const offeringEnrollmentType = Array.isArray((cls as any).academic_offerings)
    ? (cls as any).academic_offerings[0]?.enrollment_type ?? null
    : (cls as any).academic_offerings?.enrollment_type ?? null;
  const isSpecializedDest = isSpecializedContext(offeringEnrollmentType, cls.name);

  const { data: studentRows } = await admin
    .from('portal_users')
    .select('id, full_name, email, role, school_id, school_name, enrollment_type, metadata, is_deleted')
    .in('id', uniqueIds)
    .eq('role', 'student');

  const validStudents = ((studentRows ?? []) as any[]).filter((s) => !s.is_deleted);
  if (validStudents.length === 0) {
    return { syncedCount: 0, authRepairedCount: 0, programId: effectiveProgramId, className: cls.name };
  }

  const sessionLabel = getSessionBoundary().periodLabel;
  const nowIso = new Date().toISOString();
  const actorId = opts.actorId ?? cls.teacher_id ?? null;

  // 1. Update each learner's portal_users placement, enrollment_type, and confirmed_session metadata
  for (const stu of validStudents) {
    const existingMeta = stu.metadata && typeof stu.metadata === 'object' && !Array.isArray(stu.metadata)
      ? (stu.metadata as Record<string, unknown>)
      : {};
    const targetSchoolId = cls.school_id ?? stu.school_id ?? null;
    const targetSchoolName = destSchoolName ?? stu.school_name ?? null;
    const targetEnrollmentType = inferCanonicalEnrollmentTypeForClass({
      offeringEnrollmentType,
      className: cls.name,
      schoolId: targetSchoolId,
      schoolName: targetSchoolName,
      fallbackEnrollmentType: stu.enrollment_type,
    });

    await admin
      .from('portal_users')
      .update({
        class_id: cls.id,
        section_class: cls.name,
        school_id: targetSchoolId,
        school_name: targetSchoolName,
        enrollment_type: targetEnrollmentType,
        is_active: true,
        ...(cls.teacher_id ? { primary_teacher_id: cls.teacher_id } : {}),
        metadata: {
          ...existingMeta,
          confirmed_session: sessionLabel,
          confirmed_at: nowIso,
        },
        updated_at: nowIso,
      })
      .eq('id', stu.id)
      .eq('role', 'student');
  }

  const validIds = validStudents.map((s) => s.id as string);

  // 2. Sync shadow `students` registry rows
  await admin
    .from('students')
    .update({
      ...(cls.school_id ? { school_id: cls.school_id } : {}),
      ...(destSchoolName ? { school_name: destSchoolName } : {}),
      section: cls.name,
      current_class: cls.name,
      is_active: true,
      status: STUDENT_STATUS.APPROVED,
      updated_at: nowIso,
    })
    .in('user_id', validIds);

  // 3. Withdraw stale active rosters in other regular classes & activate current class roster
  if (!isSpecializedDest) {
    const { data: otherActive } = await (admin as any)
      .from('class_term_rosters')
      .select('id, class_id, classes:class_id(name)')
      .in('student_id', validIds)
      .neq('class_id', cls.id)
      .eq('status', 'active');

    const staleRosterIds = ((otherActive ?? []) as any[])
      .filter((r) => !isSpecializedContext(null, Array.isArray(r.classes) ? r.classes[0]?.name : r.classes?.name))
      .map((r) => r.id)
      .filter(Boolean);

    if (staleRosterIds.length > 0) {
      await (admin as any)
        .from('class_term_rosters')
        .update({
          status: 'withdrawn',
          ended_at: nowIso,
          ...(actorId ? { updated_by: actorId } : {}),
        })
        .in('id', staleRosterIds);
    }
  }

  const billingPayload = await defaultRosterBillingPayload(admin as any, {
    school_id: cls.school_id ?? null,
  });

  for (const sid of validIds) {
    let lookup = (admin as any)
      .from('class_term_rosters')
      .select('id')
      .eq('class_id', cls.id)
      .eq('student_id', sid)
      .limit(1);
    lookup = cls.term_id ? lookup.eq('term_id', cls.term_id) : lookup.is('term_id', null);
    const { data: existingRoster, error: rErr } = await lookup.maybeSingle();
    if (rErr?.code === '42P01') break;

    const payload = {
      class_id: cls.id,
      student_id: sid,
      term_id: cls.term_id ?? null,
      school_id: cls.school_id ?? null,
      program_id: effectiveProgramId,
      status: 'active',
      ended_at: null,
      reinstated_at: nowIso,
      ...billingPayload,
      ...(actorId ? { updated_by: actorId } : {}),
    };

    if (existingRoster?.id) {
      await (admin as any).from('class_term_rosters').update(payload).eq('id', existingRoster.id);
    } else {
      await (admin as any).from('class_term_rosters').insert({
        ...payload,
        started_at: nowIso,
        ...(actorId ? { created_by: actorId } : {}),
      });
    }
  }

  // 4. Retire old programme enrollments & activate current class's programme so old exams never bleed
  if (effectiveProgramId) {
    if (!isSpecializedDest) {
      await admin
        .from('enrollments')
        .update({ status: 'completed', updated_at: nowIso })
        .in('user_id', validIds)
        .neq('program_id', effectiveProgramId)
        .in('status', ['active', 'enrolled', 'approved']);
    }

    const { data: existingEnrollments } = await admin
      .from('enrollments')
      .select('id, user_id, status')
      .eq('program_id', effectiveProgramId)
      .in('user_id', validIds);

    const existingByUser = new Map<string, { id: string; status: string }>();
    for (const row of (existingEnrollments ?? []) as Array<{ id: string; user_id: string; status: string }>) {
      if (row.user_id && !existingByUser.has(row.user_id)) {
        existingByUser.set(row.user_id, row);
      }
    }

    const toActivateIds = Array.from(existingByUser.values())
      .filter((r) => r.status !== 'active')
      .map((r) => r.id);
    if (toActivateIds.length > 0) {
      await admin
        .from('enrollments')
        .update({ status: 'active', updated_at: nowIso })
        .in('id', toActivateIds);
    }

    const toInsert = validIds
      .filter((uid) => !existingByUser.has(uid))
      .map((uid) => ({
        user_id: uid,
        program_id: effectiveProgramId,
        role: 'student',
        status: 'active',
      }));
    if (toInsert.length > 0) {
      await admin.from('enrollments').insert(toInsert);
    }
  }

  // 5. Sync Supabase Auth readiness so old/adopted accounts never get stuck at login
  let authRepairedCount = 0;
  if (opts.syncAuth !== false) {
    const authRes = await syncStudentAuthReadiness(
      admin,
      validStudents.map((s) => ({
        id: s.id,
        full_name: s.full_name ?? null,
        email: s.email ?? null,
        school_id: cls.school_id ?? s.school_id ?? null,
        school_name: destSchoolName ?? s.school_name ?? null,
        section_class: cls.name,
      })),
    );
    authRepairedCount = authRes.repairedCount;
  }

  return {
    syncedCount: validIds.length,
    authRepairedCount,
    programId: effectiveProgramId,
    className: cls.name,
  };
}
