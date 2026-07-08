import type { SupabaseClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { resolveOnlineSchool } from '@/lib/schools/resolve-online-school';
import { ensureDefaultEnrollment } from '@/lib/enrollments/ensure-default-enrollment';
import { ensureClassWithTutor } from '@/lib/summer-school/onboard';
import { syncExplicitParentStudentLink } from '@/lib/parents/links';
import { generateUniqueStudentLoginEmail } from '@/lib/students/generate-login-email';
import { namesAreNearDuplicate, duplicateNameKey } from '@/lib/students/clean-name';

type AnySupabase = SupabaseClient<any>;

/**
 * Onboard a CHILD into a real student account from a prospect / lead record, and
 * (optionally) link them to an already-created parent account.
 *
 * This is the GENERAL counterpart to `onboardSummerStudent` — same shared
 * building blocks (school resolve, unique `mike123@rillcod.com` login, class +
 * tutor, flagship enrolment, parent link) but WITHOUT the summer-school branding.
 * It exists so the consent-form flow can turn a new child into an operational
 * student (login + class + learning path) and have the parent dashboard show them,
 * instead of leaving the child as a never-converted `prospective_students` row.
 *
 * Idempotent: reuses an existing student matched by parent email + name.
 */

export interface ProspectChild {
  id?: string;
  full_name: string;
  email?: string | null;
  parent_email?: string | null;
  parent_name?: string | null;
  parent_phone?: string | null;
  grade?: string | null;
  age?: number | null;
  gender?: string | null;
  school_id?: string | null;
  school_name?: string | null;
  course_interest?: string | null;
  preferred_schedule?: string | null;
}

export interface OnboardFromProspectResult {
  studentPortalId: string;
  studentRowId: string | null;
  studentEmail: string;
  studentPassword: string;
  created: boolean;
  schoolId: string;
  schoolName: string;
  classId: string | null;
}

function tempPassword() {
  return crypto.randomBytes(8).toString('base64url').slice(0, 10);
}

/** Clean class/cohort name from the programme label (strip parentheticals). */
function classNameFromProgram(courseInterest: string | null | undefined, grade: string | null | undefined): string {
  const ci = (courseInterest || '').replace(/\(.*?\)/g, '').trim();
  if (ci) return ci;
  if (grade) return grade;
  return 'General Cohort';
}

async function findAuthUserId(admin: AnySupabase, email: string): Promise<string | null> {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  return data?.users?.find((u) => u.email?.trim().toLowerCase() === email)?.id ?? null;
}

const nameTokens = (n: string | null | undefined): Set<string> =>
  new Set((n || '').toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter((t) => t.length > 1));

/**
 * DUPLICATE GATE: catch a same-school student who is the SAME child as this one even when
 * the parent email differs and the name is a spelling variant, reversed, has an added middle
 * name, or is run together — e.g. "Micheal Ayomide Akinbi" ↔ "Michael Akinbi", "Odanibeh
 * Catherinemary" ↔ "Catherine Mary Odanibeh", "Paul Aladhe" ↔ "Paul Aladhe Eseoghene".
 * Uses the shared fuzzy matcher (`namesAreNearDuplicate`) which requires ≥2 matched tokens
 * plus a minimum overall similarity, so siblings/twins that share only ONE token (surname)
 * are never collapsed. An exact normalized-key match wins first (fast + safest). When found,
 * onboarding REUSES that account instead of creating a second one.
 */
async function findDuplicateStudentByName(
  admin: AnySupabase, schoolId: string | null | undefined, fullName: string,
): Promise<{ rowId: string; userId: string | null; studentEmail: string | null; schoolId: string | null; schoolName: string | null } | null> {
  if (!schoolId) return null;
  if (nameTokens(fullName).size < 2) return null;
  const targetKey = duplicateNameKey(fullName);
  const { data } = await admin
    .from('students')
    .select('id, user_id, student_email, full_name, school_id, school_name')
    .eq('school_id', schoolId)
    .neq('is_deleted', true);
  const rows = (data ?? []) as Array<{ id: string; user_id: string | null; student_email: string | null; full_name: string | null; school_id: string | null; school_name: string | null }>;
  const hit = (s: typeof rows[number]) => ({ rowId: s.id, userId: s.user_id, studentEmail: s.student_email, schoolId: s.school_id, schoolName: s.school_name });
  // 1) exact normalized key (order/number/casing-insensitive) — highest confidence.
  const exact = rows.find((s) => s.full_name && duplicateNameKey(s.full_name) === targetKey);
  if (exact) return hit(exact);
  // 2) fuzzy variant (typo / concatenation / added middle name).
  const fuzzy = rows.find((s) => namesAreNearDuplicate(fullName, s.full_name));
  return fuzzy ? hit(fuzzy) : null;
}

export async function onboardStudentFromProspect(
  admin: AnySupabase,
  prospect: ProspectChild,
  opts: {
    parentId?: string | null;
    enrollmentType?: string;
    approvedBy?: string | null;
    /** Explicit class to place the student in (staff choice). */
    classId?: string | null;
    /** Class name to find-or-create for the student's school (staff choice). */
    className?: string | null;
  } = {},
): Promise<OnboardFromProspectResult> {
  const normalizedParentEmail = (prospect.parent_email || prospect.email || '').trim().toLowerCase();
  const parentName = prospect.parent_name || 'Parent/Guardian';
  const enrollmentType = opts.enrollmentType || 'in_person';

  // ── Reuse an existing student row for this parent + child name FIRST — so we never
  // create a duplicate AND never relocate a child who is already enrolled somewhere.
  // Robust against multiple matches (limit 1), case/space differences, and rows that
  // exist WITHOUT a portal account yet.
  const fullNameTrimmed = (prospect.full_name || '').trim().replace(/\s+/g, ' ');
  let priorRowId: string | null = null;
  let priorUserId: string | null = null;
  let priorStudentEmail = '';
  let priorSchoolId: string | null = null;
  let priorSchoolName: string | null = null;
  let priorClassId: string | null = null;
  if (normalizedParentEmail && fullNameTrimmed) {
    // NOTE: the students table has NO class_id column — class lives on portal_users.
    const { data } = await admin
      .from('students')
      .select('id, user_id, student_email, school_id, school_name')
      .ilike('parent_email', normalizedParentEmail)
      .ilike('full_name', fullNameTrimmed)
      .order('created_at', { ascending: true })
      .limit(1);
    const prior = (data ?? [])[0] as { id: string; user_id: string | null; student_email: string | null; school_id: string | null; school_name: string | null } | undefined;
    if (prior) {
      priorRowId = prior.id;
      priorUserId = prior.user_id ?? null;
      priorStudentEmail = (prior.student_email || '').trim().toLowerCase();
      priorSchoolId = prior.school_id ?? null;
      priorSchoolName = prior.school_name ?? null;
    }
  }
  // DUPLICATE GATE — no exact parent+name match: catch a same-school name-variant
  // duplicate (different/typo parent email) so a second consent form for the same
  // child reuses the account instead of creating a twin.
  if (!priorRowId) {
    const dup = await findDuplicateStudentByName(admin, prospect.school_id, fullNameTrimmed);
    if (dup) {
      priorRowId = dup.rowId;
      priorUserId = dup.userId;
      priorStudentEmail = (dup.studentEmail || '').trim().toLowerCase();
      priorSchoolId = priorSchoolId ?? dup.schoolId;
      priorSchoolName = priorSchoolName ?? dup.schoolName;
    }
  }

  // Retain the existing student's class/school from their PORTAL account (the
  // authoritative source for placement — students has no class_id).
  // CONSENT-FORM DOMINANCE: the child's details on the form are the source of truth, so the
  // form name (and age/gender below) UPDATE the matched account. We only fall back to the
  // existing name when the form provides none — so a match is refreshed, never blanked. The
  // safeguard against mutating the WRONG account is the precise duplicate matcher above
  // (≥2 shared tokens + similarity), not name-freezing.
  let effectiveName = fullNameTrimmed;
  if (priorUserId) {
    const { data: pu } = await admin.from('portal_users').select('class_id, school_id, school_name, full_name').eq('id', priorUserId).maybeSingle();
    if (pu) {
      priorClassId = (pu as any).class_id ?? null;
      priorSchoolId = priorSchoolId ?? (pu as any).school_id ?? null;
      priorSchoolName = priorSchoolName ?? (pu as any).school_name ?? null;
      if (!effectiveName) effectiveName = ((pu as any).full_name ?? '').trim();
    }
  }

  // School — the EXISTING school has dominance: a known student is never relocated
  // between schools by a new form. Only brand-new children use the parent's form
  // school (prospect.school_id), and the online school only as a true last resort.
  // (Parent-submitted name/class/gender/bio still overwrite — placement does not.)
  const school = await resolveOnlineSchool(admin, {
    id: priorSchoolId ?? prospect.school_id,
    name: priorSchoolName ?? prospect.school_name,
  });

  // Classification written to the student record: the generic 'in_person' default (and
  // an unset type) is derived from the resolved school — a partner school → 'school',
  // the online school → 'online'. Explicit types (summer_school, bootcamp, online) are
  // respected. This fixes partner-school students being mislabelled 'in_person'.
  // NB: the learning-path logic below still receives the original `enrollmentType`, so
  // tier/track resolution is unchanged.
  const recordEnrollmentType = (enrollmentType && enrollmentType !== 'in_person')
    ? enrollmentType
    : (/online/i.test(school.name) ? 'online' : 'school');

  // Class — an already-enrolled child KEEPS their current class (e.g. "Python JSS");
  // a new form never moves them. Only a child with NO class yet gets placed: into
  // the parent's/staff's explicit class (when it belongs to this school), else a
  // derived one.
  let classId: string | null = priorClassId;   // existing enrolment dominates
  if (!classId && opts.classId) {
    const { data: cls } = await admin.from('classes').select('id, school_id').eq('id', opts.classId).maybeSingle();
    if (cls?.id && (!cls.school_id || cls.school_id === school.id)) classId = cls.id;
  }
  if (!classId) {
    const className = (opts.className?.trim()) || classNameFromProgram(prospect.course_interest, prospect.grade);
    classId = await ensureClassWithTutor(admin, school.id, school.name, className, undefined, prospect.grade);
  }

  // Student account.
  let studentPortalId: string | null = priorUserId;
  let studentEmail = priorStudentEmail;
  let studentCreated = false;

  const studentPw = tempPassword();
  if (studentPortalId) {
    // Reuse the existing account — resolve its login email but DO NOT reset the
    // password (a re-onboard would otherwise lock out a child who already logged in).
    if (!studentEmail) {
      const { data: pu } = await admin.from('portal_users').select('email').eq('id', studentPortalId).maybeSingle();
      studentEmail = (pu?.email || await generateUniqueStudentLoginEmail(admin, prospect.full_name)).toLowerCase();
    }
  } else {
    studentEmail = await generateUniqueStudentLoginEmail(admin, prospect.full_name);
    const { data: created, error } = await admin.auth.admin.createUser({
      email: studentEmail,
      password: studentPw,
      email_confirm: true,
      user_metadata: { full_name: prospect.full_name, role: 'student' },
    });
    if (error) {
      studentPortalId = await findAuthUserId(admin, studentEmail);
      if (studentPortalId) await admin.auth.admin.updateUserById(studentPortalId, { password: studentPw, user_metadata: { full_name: prospect.full_name, role: 'student' } });
    } else {
      studentPortalId = created?.user?.id ?? null;
      studentCreated = true;
    }
  }

  if (!studentPortalId) throw new Error('Failed to create or resolve the student portal account');

  await admin.from('portal_users').upsert({
    id: studentPortalId,
    email: studentEmail,
    full_name: effectiveName,
    role: 'student',
    school_id: school.id,
    school_name: school.name,
    class_id: classId,
    // Consent-form details update the account, but only when provided — never blank an
    // existing gender / dob / class on a reused account.
    ...(prospect.gender ? { gender: prospect.gender } : {}),
    ...(prospect.age ? { date_of_birth: `${new Date().getFullYear() - prospect.age}-01-01` } : {}),
    ...(prospect.grade ? { section_class: prospect.grade } : {}),
    enrollment_type: recordEnrollmentType,
    phone: prospect.parent_phone || null,
    is_active: true,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' });

  // students row.
  const studentPayload: Record<string, unknown> = {
    full_name: effectiveName,
    name: effectiveName,
    email: studentEmail,
    student_email: studentEmail,
    parent_name: parentName,
    parent_email: normalizedParentEmail || null,
    parent_phone: prospect.parent_phone || null,
    // Consent-form child details have dominance, but only overwrite when provided (an
    // empty form field must not wipe an existing student's gender/age/grade).
    ...(prospect.age != null ? { age: prospect.age } : {}),
    ...(prospect.gender ? { gender: prospect.gender } : {}),
    ...(prospect.grade ? { grade: prospect.grade, grade_level: prospect.grade, current_class: prospect.grade } : {}),
    school_id: school.id,
    school_name: school.name,
    // class_id intentionally omitted — the students table has no class_id column;
    // class placement is tracked on portal_users (set in the upsert above).
    course_interest: prospect.course_interest || null,
    preferred_schedule: prospect.preferred_schedule ?? null,
    enrollment_type: recordEnrollmentType,
    status: 'approved',
    is_active: true,
    is_deleted: false,
    user_id: studentPortalId,
    approved_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...(opts.approvedBy ? { approved_by: opts.approvedBy } : {}),
  };

  // Prefer the prior matched row (parent + name); else the row already linked to
  // this account; else insert. This guarantees one student row per child.
  let studentRowId: string | null = priorRowId;
  if (!studentRowId) {
    const { data: byUser } = await admin.from('students').select('id').eq('user_id', studentPortalId).limit(1);
    studentRowId = (byUser ?? [])[0]?.id ?? null;
  }
  if (studentRowId) {
    await admin.from('students').update(studentPayload).eq('id', studentRowId);
  } else {
    const { data: inserted } = await admin.from('students').insert({ ...studentPayload, created_at: new Date().toISOString() }).select('id').single();
    studentRowId = inserted?.id ?? null;
  }

  // Link to parent (multi-child model).
  if (opts.parentId && studentRowId) {
    try { await syncExplicitParentStudentLink(admin, opts.parentId, studentRowId); } catch (e) { console.error('[onboardStudentFromProspect] link failed:', e); }
  }

  // Real learning path so the dashboard isn't empty (online tracks resolve from
  // course_interest; everyone else falls back to a flagship programme).
  void ensureDefaultEnrollment(admin, studentPortalId, { grade: prospect.grade, enrollmentType, courseInterest: prospect.course_interest });

  return {
    studentPortalId,
    studentRowId,
    studentEmail,
    studentPassword: studentPw,
    created: studentCreated,
    schoolId: school.id,
    schoolName: school.name,
    classId,
  };
}
