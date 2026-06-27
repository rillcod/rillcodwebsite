import type { SupabaseClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { resolveOnlineSchool } from '@/lib/schools/resolve-online-school';
import { ensureDefaultEnrollment } from '@/lib/enrollments/ensure-default-enrollment';
import { syncExplicitParentStudentLink } from '@/lib/parents/links';
import { generateUniqueStudentLoginEmail } from '@/lib/students/generate-login-email';
import { buildClassName, gradeBand } from '@/lib/classes/naming';

/**
 * Shared Summer-School onboarding — the SINGLE source of truth for turning a
 * paid `prospective_students` record into real portal accounts.
 *
 * Why this exists: three separate code paths used to onboard summer students
 * (the Paystack webhook, the `ensure-onboarded` fallback, and manual approval),
 * each inlining slightly different logic. They all created ONE account using the
 * parent's email as the student login — which collides when the parent also has
 * (or later gets) their own parent account, and leaves the student with no
 * distinct identity. Centralising fixes that and guarantees identical behaviour.
 *
 * What it guarantees, idempotently:
 *   • A PARENT portal account (role 'parent') keyed on the parent's email.
 *   • A STUDENT portal account (role 'student') on a distinct generated login
 *     (`mike123@rillcod.com` style — first name + digits) so it never collides with the parent.
 *   • A `students` row linked to the student auth id, attached to the online school.
 *   • An explicit `parent_student_links` row (supports Rillcod's multi-child model).
 *   • A default flagship enrolment so the student dashboard isn't empty.
 *   • Archived student credentials in `registration_results` for staff resend.
 *
 * It does NOT send notifications itself — it returns the credentials so the
 * caller can deliver them (and any payment receipt) once, avoiding double-sends.
 */

type AnySupabase = SupabaseClient<any>;

export interface ProspectLike {
  id: string;
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
  notes?: string | null;
}

export interface OnboardedAccount {
  id: string;
  email: string;
  /** Temp password — null when the account already existed and we did not reset it. */
  password: string | null;
  created: boolean;
}

export interface SummerOnboardResult {
  parent: OnboardedAccount | null;
  student: OnboardedAccount & { studentRowId: string | null };
  schoolId: string;
  schoolName: string;
  whatsappOptIn: boolean;
  parentPhone: string | null;
}

function tempPassword(): string {
  return crypto.randomBytes(8).toString('base64url').slice(0, 10);
}

function parseFlag(notes: string | null | undefined, label: RegExp): string | null {
  const m = (notes || '').match(label);
  return m ? m[1].trim() : null;
}

/** Find an auth user id by email (used when createUser reports "already registered"). */
async function findAuthUserId(admin: AnySupabase, email: string): Promise<string | null> {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  return data?.users?.find((u) => u.email?.trim().toLowerCase() === email)?.id ?? null;
}

const SUMMER_CLASS_NAME = 'Summer School 2026';

/**
 * Ensure the school has a "Summer School 2026" class so students are operational
 * for attendance / timetable / roster (all of which are class-driven). The class's
 * `teacher_id` is the student's tutor — we auto-pick the first teacher linked to the
 * school (junction table first, then `portal_users`); if none exists yet the class is
 * created with no tutor so an admin can assign one later. Idempotent (keyed on
 * school_id + class name); back-fills a tutor onto an existing class if one is found.
 * Returns the class id (or null if creation failed).
 */
export async function ensureClassWithTutor(
  admin: AnySupabase,
  schoolId: string,
  schoolName: string,
  className: string,
  description?: string,
  gradeRange?: string | null,
): Promise<string | null> {
  // Resolve a tutor: an existing teacher for this class name globally, then for
  // the school, then any teacher in the system.
  let tutorId: string | null = null;

  const { data: globalClass } = await admin
    .from('classes')
    .select('teacher_id')
    .eq('name', className)
    .not('teacher_id', 'is', null)
    .limit(1)
    .maybeSingle();
  if (globalClass?.teacher_id) tutorId = globalClass.teacher_id;

  if (!tutorId) {
    const { data: ts } = await admin
      .from('teacher_schools')
      .select('teacher_id')
      .eq('school_id', schoolId)
      .limit(1)
      .maybeSingle();
    tutorId = (ts as any)?.teacher_id ?? null;
  }

  if (!tutorId) {
    const { data: t } = await admin
      .from('portal_users')
      .select('id')
      .eq('role', 'teacher')
      .eq('school_id', schoolId)
      .limit(1)
      .maybeSingle();
    tutorId = (t as any)?.id ?? null;
  }

  if (!tutorId) {
    const { data: tGlobal } = await admin
      .from('portal_users')
      .select('id')
      .eq('role', 'teacher')
      .limit(1)
      .maybeSingle();
    tutorId = (tGlobal as any)?.id ?? null;
  }

  // Link the teacher to the school so class membership is consistent.
  if (tutorId && schoolId) {
    const { data: hasLink } = await admin
      .from('teacher_schools')
      .select('teacher_id')
      .eq('teacher_id', tutorId)
      .eq('school_id', schoolId)
      .maybeSingle();
    if (!hasLink) {
      await admin.from('teacher_schools').insert({ teacher_id: tutorId, school_id: schoolId });
    }
  }

  // Standard, auto-derived name: "{School} · {Programme} · {Grade Band}".
  // Grade band is part of identity: same school + programme can have Basic 1-3,
  // Basic 4-6, JSS 1-3, SS 1-3 without collapsing into one class.
  const isOnline = /online/i.test(schoolName);
  const normalizedBand = gradeBand(gradeRange) || gradeRange || gradeBand(className);
  const standardName = isOnline
    ? buildClassName({ programme: className, online: true })
    : buildClassName({ schoolName, programme: className, range: normalizedBand });

  // Reuse only the exact class identity. Prefix matching wrongly collapsed distinct
  // ranges, e.g. Basic 1-3 and Basic 4-6 under the same programme.
  const { data: schoolClasses } = await admin
    .from('classes')
    .select('id, teacher_id, name, qa_grade_band')
    .eq('school_id', schoolId);
  const existing = (schoolClasses ?? []).find(
    (c: { id: string; teacher_id: string | null; name: string; qa_grade_band?: string | null }) =>
      c.name === standardName || (c.name === className && (!normalizedBand || c.qa_grade_band === normalizedBand)),
  );

  if (existing?.id) {
    if (!existing.teacher_id && tutorId) {
      await admin.from('classes').update({ teacher_id: tutorId, updated_at: new Date().toISOString() }).eq('id', existing.id);
    }
    return existing.id;
  }

  const { data: created, error } = await admin
    .from('classes')
    .insert({
      name: standardName,
      school_id: schoolId,
      teacher_id: tutorId,
      status: 'active',
      qa_grade_band: normalizedBand ?? null,
      description: description ?? `${schoolName} — ${className}`,
    })
    .select('id')
    .single();
  if (error) {
    console.error('[ensureClassWithTutor] ensure class failed:', error.message);
    return null;
  }
  return created?.id ?? null;
}

/** Summer-school cohort class wrapper. */
export async function ensureSummerClassWithTutor(admin: AnySupabase, schoolId: string, schoolName: string): Promise<string | null> {
  return ensureClassWithTutor(admin, schoolId, schoolName, SUMMER_CLASS_NAME, `${schoolName} — AI Summer School 2026 cohort`);
}

export async function onboardSummerStudent(
  admin: AnySupabase,
  prospect: ProspectLike,
  opts: { approvedBy?: string | null } = {},
): Promise<SummerOnboardResult> {
  // ── Consent / contact context ──
  const whatsappOptIn = /\[WhatsApp Opt-in:\s*Yes\]/i.test(prospect.notes || '');
  const studentPhone = parseFlag(prospect.notes, /\[Student Phone:\s*([^\]]+)\]/i);
  const parentPhone = studentPhone || prospect.parent_phone || null;
  const parentName = prospect.parent_name || 'Parent/Guardian';
  const normalizedParentEmail = (prospect.parent_email || prospect.email || '').trim().toLowerCase();

  // ── 1. School ──
  const school = await resolveOnlineSchool(admin, { id: prospect.school_id, name: prospect.school_name });

  // ── 1b. Class + tutor — so the student is operational for attendance/timetable/roster ──
  const classId = await ensureSummerClassWithTutor(admin, school.id, school.name);

  // ── 2. Parent account (only if we have a parent email) ──
  let parent: OnboardedAccount | null = null;
  if (normalizedParentEmail) {
    const { data: existingParent } = await admin
      .from('portal_users')
      .select('id, email')
      .eq('email', normalizedParentEmail)
      .maybeSingle();

    if (existingParent) {
      parent = { id: existingParent.id, email: normalizedParentEmail, password: null, created: false };
      // Keep WhatsApp opt-in fresh if they opted in this time.
      if (whatsappOptIn) {
        await admin.from('portal_users').update({ whatsapp_opt_in: true, phone: parentPhone }).eq('id', existingParent.id);
      }
    } else {
      const pw = tempPassword();
      let parentId: string | null = null;
      const { data: created, error } = await admin.auth.admin.createUser({
        email: normalizedParentEmail,
        password: pw,
        email_confirm: true,
        user_metadata: { full_name: parentName, role: 'parent' },
      });
      if (error) {
        parentId = await findAuthUserId(admin, normalizedParentEmail);
        if (parentId) await admin.auth.admin.updateUserById(parentId, { password: pw, user_metadata: { full_name: parentName, role: 'parent' } });
      } else {
        parentId = created?.user?.id ?? null;
      }
      if (parentId) {
        await admin.from('portal_users').upsert({
          id: parentId,
          email: normalizedParentEmail,
          full_name: parentName,
          role: 'parent',
          phone: parentPhone,
          school_id: school.id,
          school_name: school.name,
          whatsapp_opt_in: whatsappOptIn,
          is_active: true,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'id' });
        parent = { id: parentId, email: normalizedParentEmail, password: pw, created: true };
      }
    }
  }

  // ── 3. Student account — distinct login in the canonical mike123@rillcod.com style.
  // Idempotency: reuse the student already provisioned for this prospect (matched by
  // parent email + name), so re-runs (webhook + fallback both fire) never create a
  // second account. The random-digit email isn't deterministic, so we key off the
  // prospect's identity instead of the generated address.
  const studentPw = tempPassword();
  let studentPortalId: string | null = null;
  let studentEmail = '';
  let studentCreated = false;
  let priorRowId: string | null = null;
  const fullNameTrimmed = (prospect.full_name || '').trim().replace(/\s+/g, ' ');

  if (normalizedParentEmail && fullNameTrimmed) {
    // Reuse a prior row for this parent+child so re-runs never duplicate. Match the
    // name in JS with whitespace/case normalisation — a stored trailing space made the
    // old `.ilike('full_name', trimmed)` miss, so a 15-min cron minted a new account
    // every run. Fetch this parent's rows (oldest first) and pick the matching child.
    const { data } = await admin
      .from('students')
      .select('id, user_id, student_email, full_name')
      .ilike('parent_email', normalizedParentEmail)
      .order('created_at', { ascending: true });
    const wantedName = fullNameTrimmed.toLowerCase();
    const priorStudent = (data ?? []).find(
      (s: { full_name: string | null }) => (s.full_name || '').trim().replace(/\s+/g, ' ').toLowerCase() === wantedName,
    );
    if (priorStudent) {
      priorRowId = priorStudent.id;
      if (priorStudent.user_id) {
        studentPortalId = priorStudent.user_id;
        studentEmail = (priorStudent.student_email || '').trim().toLowerCase();
      }
    }
  }

  if (studentPortalId) {
    // Reuse the existing student account — do NOT reset its password (a re-run from
    // a page refresh or a second webhook would otherwise change the password and
    // lock out a student who already logged in) and do NOT rename it. Just resolve
    // the login email so messaging can reference it.
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

  if (!studentPortalId) {
    throw new Error('Failed to create or resolve the student portal account');
  }

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
    enrollment_type: 'summer_school',
    phone: studentPhone,
    is_active: true,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' });

  // ── 4. students row ──
  const studentPayload: Record<string, unknown> = {
    full_name: prospect.full_name,
    name: prospect.full_name,
    email: studentEmail,
    student_email: studentEmail,
    parent_name: parentName,
    parent_email: normalizedParentEmail || null,
    parent_phone: parentPhone,
    phone: studentPhone,
    age: prospect.age ?? null,
    gender: prospect.gender ?? null,
    grade: prospect.grade ?? null,
    grade_level: prospect.grade ?? null,
    current_class: prospect.grade ?? null,
    school_id: school.id,
    school_name: school.name,
    course_interest: prospect.course_interest || 'Summer School 2026',
    preferred_schedule: prospect.preferred_schedule ?? null,
    enrollment_type: 'summer_school',
    status: 'approved',
    is_active: true,
    is_deleted: false,
    user_id: studentPortalId,
    approved_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...(opts.approvedBy ? { approved_by: opts.approvedBy } : {}),
  };

  // Prefer the prior matched row (parent + name); else the row already linked to
  // this account; else insert — one student row per child, no duplicates.
  let studentRowId: string | null = priorRowId;
  if (!studentRowId) {
    const { data: byUser } = await admin.from('students').select('id').eq('user_id', studentPortalId).limit(1);
    studentRowId = (byUser ?? [])[0]?.id ?? null;
  }
  if (studentRowId) {
    const { error: updateErr } = await admin.from('students').update(studentPayload).eq('id', studentRowId);
    if (updateErr) {
      console.error('[onboardSummerStudent] Failed to update students row:', updateErr.message);
      throw new Error(`Failed to update student record: ${updateErr.message}`);
    }
  } else {
    const { data: insertedStudent, error: insertErr } = await admin
      .from('students')
      .insert({ ...studentPayload, created_at: new Date().toISOString() })
      .select('id')
      .single();
    if (insertErr) {
      console.error('[onboardSummerStudent] Failed to insert students row:', insertErr.message);
      throw new Error(`Failed to create student record: ${insertErr.message}`);
    }
    studentRowId = insertedStudent?.id ?? null;
  }

  // ── 5. Link parent ↔ student (multi-child model) ──
  if (parent && studentRowId) {
    try {
      await syncExplicitParentStudentLink(admin, parent.id, studentRowId);
    } catch (err) {
      console.error('[onboardSummerStudent] parent-student link failed:', err);
    }
  }

  // ── 6. Real learning path ──
  void ensureDefaultEnrollment(admin, studentPortalId, {
    grade: prospect.grade,
    enrollmentType: 'summer_school',
    courseInterest: prospect.course_interest,
  });

  // ── 7. Archive student credentials for staff resend ──
  try {
    const batchName = 'Summer School 2026 — Auto-Onboard';
    const { data: existingBatch } = await admin
      .from('registration_batches')
      .select('id, student_count')
      .eq('school_id', school.id)
      .eq('class_name', batchName)
      .maybeSingle();
    let batchId = existingBatch?.id as string | undefined;
    if (!existingBatch) {
      batchId = crypto.randomUUID();
      await admin.from('registration_batches').insert({
        id: batchId,
        school_id: school.id,
        school_name: school.name,
        class_name: batchName,
        student_count: 1,
      });
    } else if (batchId) {
      await admin.from('registration_batches')
        .update({ student_count: (existingBatch.student_count ?? 0) + 1 })
        .eq('id', batchId);
    }
    if (batchId && studentCreated) {
      // Only archive on first creation — re-runs reuse the account (no new password),
      // so we never write duplicate archive rows or a stale password.
      await admin.from('registration_results').insert({
        batch_id: batchId,
        full_name: prospect.full_name,
        email: studentEmail,
        password: studentPw,
        class_name: prospect.grade || null,
        status: 'sent',
      });
      // Archive the PARENT login too (only when freshly created — we have the temp
      // password then) so staff can view/resend it later.
      if (parent?.created && parent.password) {
        await admin.from('registration_results').insert({
          batch_id: batchId,
          full_name: parentName,
          email: parent.email,
          password: parent.password,
          class_name: 'Parent Account',
          status: 'sent',
        });
      }
    }
  } catch (archiveErr) {
    console.error('[onboardSummerStudent] credential archive failed:', archiveErr);
  }

  // ── 8. Finance sync: link the tuition payment(s) to the student and ensure a
  // paid invoice exists, so transaction ↔ invoice ↔ receipt are all consistent
  // (previously summer payments had portal_user_id null and no invoice). ──
  try {
    const { data: txns } = await admin
      .from('payment_transactions')
      .select('id, amount, currency, invoice_id, payment_status, transaction_reference')
      .contains('payment_gateway_response', { prospect_id: prospect.id })
      .order('created_at', { ascending: false });

    for (const t of (txns ?? []) as Array<{
      id: string; amount: number; currency: string | null; invoice_id: string | null;
      payment_status: string | null; transaction_reference: string | null;
    }>) {
      // Associate payer + school on the transaction.
      await admin.from('payment_transactions')
        .update({ portal_user_id: studentPortalId, school_id: school.id })
        .eq('id', t.id);

      // Create a paid invoice for completed tuition if one isn't linked yet.
      const isCompleted = ['completed', 'success'].includes(t.payment_status || '');
      if (isCompleted && !t.invoice_id) {
        const { data: existingInv } = await admin
          .from('invoices')
          .select('id')
          .eq('payment_transaction_id', t.id)
          .maybeSingle();
        if (!existingInv) {
          const amt = Number(t.amount) || 0;
          const rawRef = String(t.transaction_reference || t.id);
          const invoiceNumber = `INV-SUM-${rawRef.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 40)}`;
          const { data: inv } = await admin
            .from('invoices')
            .insert({
              invoice_number: invoiceNumber,
              amount: amt,
              currency: t.currency || 'NGN',
              status: 'paid',
              due_date: null,
              portal_user_id: studentPortalId,
              school_id: school.id,
              payment_transaction_id: t.id,
              items: [{
                description: `AI Summer School 2026 Tuition — ${prospect.full_name}`,
                quantity: 1,
                unit_price: amt,
                total: amt,
              }],
              metadata: { source: 'summer_school_onboard', student_name: prospect.full_name, prospect_id: prospect.id },
            })
            .select('id')
            .single();
          if (inv?.id) {
            await admin.from('payment_transactions').update({ invoice_id: inv.id }).eq('id', t.id);
          }
        }
      }
    }
  } catch (finErr) {
    console.error('[onboardSummerStudent] finance sync failed:', finErr);
  }

  return {
    parent,
    student: { id: studentPortalId, studentRowId, email: studentEmail, password: studentCreated ? studentPw : null, created: studentCreated },
    schoolId: school.id,
    schoolName: school.name,
    whatsappOptIn,
    parentPhone,
  };
}

/**
 * Deliver onboarding credentials to the parent (email always; WhatsApp when
 * opted-in). Includes the parent portal login ONLY when the parent account was
 * newly created (so we never re-leak a returning parent's password), and always
 * includes the student login. Non-throwing.
 */
export async function sendSummerCredentials(
  result: SummerOnboardResult,
  prospect: ProspectLike,
): Promise<{ email: boolean; whatsapp: boolean }> {
  const sent = { email: false, whatsapp: false };
  const to = (prospect.parent_email || prospect.email || '').trim().toLowerCase();
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://www.rillcod.com').replace(/\/$/, '');
  const parentName = prospect.parent_name || 'Parent/Guardian';

  const parentBlock = result.parent?.created && result.parent.password
    ? `<div style="margin:16px 0;padding:15px;background:#141618;border:1px solid #2a2d33;border-radius:8px;">
         <p style="margin:0 0 8px;font-size:11px;color:#10b981;text-transform:uppercase;letter-spacing:1px;font-weight:800;">Parent Portal Login</p>
         <p style="margin:6px 0;font-size:14px;color:#fff;font-family:monospace;"><strong>Email:</strong> ${result.parent.email}</p>
         <p style="margin:6px 0;font-size:14px;color:#f59e0b;font-family:monospace;"><strong>Temporary Password:</strong> ${result.parent.password}</p>
         <p style="margin:8px 0 0;font-size:11px;color:#71717a;">Track your child's progress, reports and payments at <a href="${appUrl}/login" style="color:#7c3aed;">${appUrl}/login</a>.</p>
       </div>`
    : '';

  // Show the temporary password only when the student account was freshly created
  // this run; for a returning account we never reset it, so we don't leak/print a
  // stale value — we point them to their existing password / reset instead.
  const studentPwLine = result.student.password
    ? `<p style="margin:6px 0;font-size:14px;color:#f59e0b;font-family:monospace;"><strong>Temporary Password:</strong> ${result.student.password}</p>`
    : `<p style="margin:6px 0;font-size:12px;color:#71717a;">Use the password from your earlier welcome email, or reset it at <a href="${appUrl}/login" style="color:#7c3aed;">${appUrl}/login</a>.</p>`;
  const studentBlock = `<div style="margin:16px 0;padding:15px;background:#141618;border:1px solid #2a2d33;border-radius:8px;">
       <p style="margin:0 0 8px;font-size:11px;color:#7c3aed;text-transform:uppercase;letter-spacing:1px;font-weight:800;">Student Portal Login</p>
       <p style="margin:6px 0;font-size:14px;color:#fff;font-family:monospace;"><strong>Email:</strong> ${result.student.email}</p>
       ${studentPwLine}
       <p style="margin:8px 0 0;font-size:11px;color:#71717a;">Your child logs in to lessons, assignments and the playground at <a href="${appUrl}/login" style="color:#7c3aed;">${appUrl}/login</a>.</p>
     </div>`;

  // Resolve the cohort WhatsApp group link (best-effort).
  let waGroupLink = '';
  try {
    const { getSummerSchoolWhatsAppLink } = await import('@/lib/summer-school/whatsapp-group');
    waGroupLink = (await getSummerSchoolWhatsAppLink()) || '';
  } catch { /* non-fatal */ }

  const firstName = (prospect.full_name || 'your child').trim().split(/\s+/)[0];

  const whatsappStep = waGroupLink
    ? `<a href="${waGroupLink}" style="display:inline-block;margin-top:6px;padding:10px 22px;background:#25D366;color:#fff;font-size:13px;font-weight:800;text-decoration:none;border-radius:8px;">Join the Class WhatsApp Group →</a>`
    : `<span style="font-size:12px;color:#71717a;">We'll share the class WhatsApp group link with you shortly.</span>`;

  const nextSteps = `
    <div style="margin:22px 0 6px;">
      <p style="margin:0 0 12px;font-size:13px;color:#10b981;text-transform:uppercase;letter-spacing:1.2px;font-weight:800;">Your Next Steps</p>

      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 14px;">
        <tr>
          <td valign="top" style="width:34px;font-size:20px;">1️⃣</td>
          <td style="font-size:14px;color:#d4d4d8;line-height:1.6;">
            <strong style="color:#fff;">Join the class WhatsApp group</strong> — this is where we share the daily class link, schedule, reminders and announcements.<br/>${whatsappStep}
          </td>
        </tr>
      </table>

      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 14px;">
        <tr>
          <td valign="top" style="width:34px;font-size:20px;">2️⃣</td>
          <td style="font-size:14px;color:#d4d4d8;line-height:1.6;">
            <strong style="color:#fff;">Log ${firstName} in to the Student Portal</strong> using the student details above at
            <a href="${appUrl}/login" style="color:#7c3aed;font-weight:700;">${appUrl}/login</a> — lessons, assignments, the playground and class materials live there.
          </td>
        </tr>
      </table>

      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 14px;">
        <tr>
          <td valign="top" style="width:34px;font-size:20px;">3️⃣</td>
          <td style="font-size:14px;color:#d4d4d8;line-height:1.6;">
            <strong style="color:#fff;">Attend classes</strong> — the cohort starts <strong>28 June 2026</strong>. Online classes are joined from the WhatsApp group link at class time; onsite learners attend at the campus. Your child just logs in and shows up ready to build! 🚀
          </td>
        </tr>
      </table>

      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td valign="top" style="width:34px;font-size:20px;">4️⃣</td>
          <td style="font-size:14px;color:#d4d4d8;line-height:1.6;">
            <strong style="color:#fff;">Track progress as a parent</strong> — use your Parent Portal login to follow ${firstName}'s lessons, reports and certificates.
          </td>
        </tr>
      </table>
    </div>`;

  // Receipt PDF attachment — reuse the canonical server receipt generator and the
  // same `attachments: [{ filename, content: base64 }]` shape the report-card email
  // already uses (SendPulse attachments_binary). Attaching the PDF (vs a link)
  // keeps it to a single, non-spammy email. Only when a completed payment exists.
  let attachments: Array<{ filename: string; content: string }> | undefined;
  let receiptUrl = '';
  try {
    const { createAdminClient } = await import('@/lib/supabase/admin');
    const sb: any = createAdminClient();
    const { data: tx } = await sb
      .from('payment_transactions')
      .select('id')
      .contains('payment_gateway_response', { prospect_id: prospect.id })
      .in('payment_status', ['completed', 'success'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (tx?.id) {
      const { paymentsService } = await import('@/services/payments.service');
      const url = await paymentsService.generateReceipt(tx.id);
      receiptUrl = url || '';
      const r = await fetch(url);
      if (r.ok) {
        const buf = Buffer.from(await r.arrayBuffer());
        const safeName = (prospect.full_name || 'Student').replace(/[^a-z0-9]+/gi, '_');
        attachments = [{ filename: `Rillcod-Receipt-${safeName}.pdf`, content: buf.toString('base64') }];
      }
    }
  } catch (receiptErr) {
    console.error('[sendSummerCredentials] receipt attachment failed:', receiptErr);
  }

  // Always give the parent a way to get the receipt — link works even if the
  // PDF attachment step failed (storage URL not server-fetchable, etc.).
  const receiptBlock = receiptUrl
    ? `<div style="margin:16px 0;padding:14px 16px;background:#141618;border:1px solid #2a2d33;border-radius:8px;text-align:center;">
         <p style="margin:0 0 8px;font-size:11px;color:#10b981;text-transform:uppercase;letter-spacing:1px;font-weight:800;">Payment Receipt</p>
         <p style="margin:0 0 10px;font-size:12px;color:#a1a1aa;">${attachments ? 'Your receipt is attached as a PDF.' : 'Your payment receipt is ready.'} You can also view or download it any time:</p>
         <a href="${receiptUrl}" style="display:inline-block;padding:9px 20px;background:#10b981;color:#fff;font-size:13px;font-weight:800;text-decoration:none;border-radius:8px;">View / Download Receipt →</a>
       </div>`
    : '';

  // ── Email ──
  if (to) {
    try {
      const { notificationsService } = await import('@/services/notifications.service');
      const { buildRillcodTransactionalEmailHtml } = await import('@/lib/email/rillcod-transactional-email');
      const html = buildRillcodTransactionalEmailHtml({
        eyebrow: 'Welcome aboard 🎉',
        title: `Welcome to Rillcod Summer School, ${firstName}!`,
        bodyHtml: `<p style="margin:0 0 12px;font-size:15px;color:#fff;">Dear ${parentName}, we're thrilled to have <strong>${prospect.full_name}</strong> join the Rillcod AI Summer School 2026! 🎉</p>
          <p style="margin:0 0 6px;">Your payment is confirmed and your child's seat is secured. Here are your portal logins — please change the temporary passwords after first login and keep them private.</p>
          ${parentBlock}${studentBlock}
          ${receiptBlock}
          ${nextSteps}
          <p style="margin:18px 0 0;font-size:13px;color:#a1a1aa;">We can't wait to see what ${firstName} builds this summer. Questions? Just reply to this email or call <a href="tel:+2348116600091" style="color:#7c3aed;">+234 811 660 0091</a>.</p>`,
        summaryRows: [
          { label: 'Student', value: prospect.full_name },
          { label: 'School', value: result.schoolName },
          { label: 'Programme', value: 'AI Summer School 2026' },
          { label: 'Cohort starts', value: '28 June 2026' },
        ],
        footerNote: 'rillcod technologies limited • summer school admissions',
      });
      await notificationsService.sendExternalEmail({
        to,
        subject: `🎉 Welcome to Rillcod Summer School — ${firstName}'s account & next steps`,
        html,
        fromName: 'Rillcod Technologies',
        fromEmail: 'support@rillcod.com',
        ...(attachments ? { attachments } : {}),
      });
      sent.email = true;
    } catch (err) {
      console.error('[sendSummerCredentials] email failed:', err);
    }
  }

  // ── WhatsApp (opt-in only) ──
  if (result.whatsappOptIn && result.parentPhone) {
    try {
      const { sendWhatsApp } = await import('@/lib/whatsapp/send');
      const lines = [
        `Hello ${parentName}! 👋 Welcome to Rillcod AI Summer School 2026! 🎉`,
        `${prospect.full_name}'s seat is confirmed and the accounts are ready.`,
        '',
      ];
      if (result.parent?.created && result.parent.password) {
        lines.push('👨‍👩‍👧 Parent Portal', `Email: ${result.parent.email}`, `Password: ${result.parent.password}`, '');
      }
      lines.push('🎓 Student Portal', `Email: ${result.student.email}`, `Password: ${result.student.password}`, `Log in: ${appUrl}/login`, '');
      lines.push('Next steps:', '1. Change the passwords after first login.');
      if (waGroupLink) lines.push(`2. Join the class WhatsApp group: ${waGroupLink}`);
      lines.push(`${waGroupLink ? '3' : '2'}. Classes start 28 June 2026 — your child logs in and joins from the group at class time.`, '', 'Questions? Call +234 811 660 0091');
      const ok = await sendWhatsApp(result.parentPhone, lines.join('\n'));
      sent.whatsapp = ok;
    } catch (err) {
      console.error('[sendSummerCredentials] whatsapp failed:', err);
    }
  }

  return sent;
}
