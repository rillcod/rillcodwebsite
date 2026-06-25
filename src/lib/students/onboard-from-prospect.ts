import type { SupabaseClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { resolveOnlineSchool } from '@/lib/schools/resolve-online-school';
import { ensureDefaultEnrollment } from '@/lib/enrollments/ensure-default-enrollment';
import { ensureClassWithTutor } from '@/lib/summer-school/onboard';
import { syncExplicitParentStudentLink } from '@/lib/parents/links';
import { generateUniqueStudentLoginEmail } from '@/lib/students/generate-login-email';

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
    const { data } = await admin
      .from('students')
      .select('id, user_id, student_email, school_id, school_name, class_id')
      .ilike('parent_email', normalizedParentEmail)
      .ilike('full_name', fullNameTrimmed)
      .order('created_at', { ascending: true })
      .limit(1);
    const prior = (data ?? [])[0] as { id: string; user_id: string | null; student_email: string | null; school_id: string | null; school_name: string | null; class_id: string | null } | undefined;
    if (prior) {
      priorRowId = prior.id;
      priorUserId = prior.user_id ?? null;
      priorStudentEmail = (prior.student_email || '').trim().toLowerCase();
      priorSchoolId = prior.school_id ?? null;
      priorSchoolName = prior.school_name ?? null;
      priorClassId = prior.class_id ?? null;
    }
  }

  // School — an EXISTING student keeps their current LOCAL school; they are never
  // relocated to the online fallback. Only brand-new children use the form's school
  // (prospect.school_id), falling back to the online school when none was provided.
  const school = await resolveOnlineSchool(admin, {
    id: priorSchoolId ?? prospect.school_id,
    name: priorSchoolName ?? prospect.school_name,
  });

  // Class — an explicit staff/form class wins (when it belongs to this school);
  // otherwise an existing student keeps their current class; else we derive one.
  let classId: string | null = null;
  if (opts.classId) {
    const { data: cls } = await admin.from('classes').select('id, school_id').eq('id', opts.classId).maybeSingle();
    if (cls?.id && (!cls.school_id || cls.school_id === school.id)) classId = cls.id;
  }
  if (!classId && priorClassId) classId = priorClassId;   // retain the local class they're in
  if (!classId) {
    const className = (opts.className?.trim()) || classNameFromProgram(prospect.course_interest, prospect.grade);
    classId = await ensureClassWithTutor(admin, school.id, school.name, className);
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
    full_name: prospect.full_name,
    role: 'student',
    school_id: school.id,
    school_name: school.name,
    class_id: classId,
    date_of_birth: prospect.age ? `${new Date().getFullYear() - prospect.age}-01-01` : null,
    section_class: prospect.grade || null,
    enrollment_type: enrollmentType,
    phone: prospect.parent_phone || null,
    is_active: true,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' });

  // students row.
  const studentPayload: Record<string, unknown> = {
    full_name: prospect.full_name,
    name: prospect.full_name,
    email: studentEmail,
    student_email: studentEmail,
    parent_name: parentName,
    parent_email: normalizedParentEmail || null,
    parent_phone: prospect.parent_phone || null,
    age: prospect.age ?? null,
    gender: prospect.gender ?? null,
    grade: prospect.grade ?? null,
    grade_level: prospect.grade ?? null,
    current_class: prospect.grade ?? null,
    school_id: school.id,
    school_name: school.name,
    class_id: classId,
    course_interest: prospect.course_interest || null,
    preferred_schedule: prospect.preferred_schedule ?? null,
    enrollment_type: enrollmentType,
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
