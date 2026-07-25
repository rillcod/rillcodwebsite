import type { SupabaseClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { resolveOnlineSchool } from '@/lib/schools/resolve-online-school';
import { ensureDefaultEnrollment } from '@/lib/enrollments/ensure-default-enrollment';
import { syncExplicitParentStudentLink } from '@/lib/parents/links';
import { generateUniqueStudentLoginEmail } from '@/lib/students/generate-login-email';
import { buildClassName, gradeBand, bandForGrade, bandCoversGrade, canonicalTier, type BandGranularity } from '@/lib/classes/naming';
import { SMTP_FROM_EMAIL, brandContact } from '@/config/brand';
import { SPECIAL_SOURCE } from '@/lib/registration/enrollment-types';

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
 * school_id + class name + academic term); back-fills a tutor onto an existing class if one is found.
 * Returns the class id (or null if creation failed).
 */
export async function ensureClassWithTutor(
  admin: AnySupabase,
  schoolId: string,
  schoolName: string,
  className: string,
  description?: string,
  gradeRange?: string | null,
  granularity?: BandGranularity,
  termId?: string | null,
): Promise<string | null> {
  // Resolve only an active teacher already assigned to this school.
  let tutorId: string | null = null;

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

  // Prefer an explicit term; otherwise resolve the live calendar session so
  // First Term across years never collides when term is omitted by callers.
  let resolvedTermId = termId?.trim() || null;
  if (!resolvedTermId) {
    try {
      const { liveAcademicSession } = await import('@/lib/reports/academic-period');
      const live = liveAcademicSession();
      const { data: liveTerm } = await admin
        .from('academic_terms')
        .select('id')
        .eq('academic_year', live.periodLabel)
        .eq('term_label', live.termLabel)
        .maybeSingle();
      resolvedTermId = (liveTerm as { id?: string } | null)?.id ?? null;
    } catch {
      resolvedTermId = null;
    }
  }

  // Standard, auto-derived name: "{School} · {Programme} · {Grade Band}".
  // The band is part of identity so a school can run Basic 1-3 / Basic 4-6 / JSS 1-3 / SS 1-3
  // (or teacher-chosen single grades) side by side. Bounds are stored numerically so a grade
  // is placed into whichever class band COVERS its number, at any granularity.
  const isOnline = /online/i.test(schoolName);
  const tier = canonicalTier(className) || className || null;

  // Granularity: explicit param → the school's default → 'fixed'.
  let gran: BandGranularity = granularity ?? 'fixed';
  if (!granularity) {
    const { data: sch } = await admin.from('schools').select('default_band_granularity').eq('id', schoolId).maybeSingle();
    const d = (sch as { default_band_granularity?: string } | null)?.default_band_granularity;
    if (d === 'single' || d === 'fixed') gran = d;
  }

  const band = isOnline ? null : bandForGrade(gradeRange, gran);
  const normalizedBand = band?.label || gradeBand(gradeRange) || gradeRange || gradeBand(className);
  const standardName = isOnline
    ? buildClassName({ programme: className, online: true })
    : buildClassName({ schoolName, programme: className, range: normalizedBand });

  const { data: schoolClasses } = await admin
    .from('classes')
    .select('id, teacher_id, name, qa_grade_band, tier, band_lvl, band_low, band_high, term_id')
    .eq('school_id', schoolId);
  const classes = ((schoolClasses ?? []) as Array<{
    id: string; teacher_id: string | null; name: string; qa_grade_band?: string | null;
    tier?: string | null; band_lvl?: string | null; band_low?: number | null; band_high?: number | null;
    term_id?: string | null;
  }>).filter((c) => {
    // Never reuse a class from a different non-null session.
    if (resolvedTermId && c.term_id && c.term_id !== resolvedTermId) return false;
    return true;
  });

  // Prefer exact session matches; fall back to legacy null-term rows in the same pool.
  const sameSession = resolvedTermId
    ? classes.filter((c) => c.term_id === resolvedTermId)
    : classes;
  const searchPool = sameSession.length ? sameSession : classes;

  // 1) A class of the SAME tier whose band covers this grade (most specific wins) — this is
  //    what lets a single-grade child land in a fixed band, or vice versa.
  const covering = band
    ? searchPool
        .filter((c) => c.tier && canonicalTier(c.tier) === tier
          && bandCoversGrade({ lvl: c.band_lvl ?? '', low: c.band_low ?? 0, high: c.band_high ?? 0 }, gradeRange))
        .sort((a, b) => ((a.band_high ?? 0) - (a.band_low ?? 0)) - ((b.band_high ?? 0) - (b.band_low ?? 0)))
    : [];
  // 2) Else the exact canonical name, or a legacy class with the same band label.
  const existing = covering[0]
    ?? searchPool.find((c) => c.name === standardName || (c.name === className && (!normalizedBand || c.qa_grade_band === normalizedBand)));

  if (existing?.id) {
    const patch: Record<string, unknown> = {};
    if (!existing.teacher_id && tutorId) patch.teacher_id = tutorId;
    // Backfill band/tier on a legacy class we matched by name.
    if (band && existing.band_low == null) {
      patch.tier = tier; patch.band_lvl = band.lvl; patch.band_low = band.low; patch.band_high = band.high;
      if (!existing.qa_grade_band) patch.qa_grade_band = band.label;
    }
    // Pin legacy null-term rows onto the live/selected session once.
    if (resolvedTermId && !existing.term_id) patch.term_id = resolvedTermId;
    if (Object.keys(patch).length) {
      patch.updated_at = new Date().toISOString();
      await admin.from('classes').update(patch).eq('id', existing.id);
    }
    return existing.id;
  }

  if (!tutorId) {
    const { data: anyTeacher } = await admin
      .from('portal_users')
      .select('id')
      .eq('role', 'teacher')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();
    tutorId = (anyTeacher as any)?.id ?? null;
  }

  if (!tutorId) {
    const { data: anyAdmin } = await admin
      .from('portal_users')
      .select('id')
      .eq('role', 'admin')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();
    tutorId = (anyAdmin as any)?.id ?? null;
  }

  const { data: created, error } = await admin
    .from('classes')
    .insert({
      name: standardName,
      school_id: schoolId,
      teacher_id: tutorId || null,
      status: 'active',
      qa_grade_band: normalizedBand ?? null,
      tier: tier ?? null,
      band_lvl: band?.lvl ?? null,
      band_low: band?.low ?? null,
      band_high: band?.high ?? null,
      term_id: resolvedTermId,
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
    section_class: SUMMER_CLASS_NAME,
    grade: prospect.grade || null,
    enrollment_type: 'special',
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
    current_class: SUMMER_CLASS_NAME,
    section: SUMMER_CLASS_NAME,
    school_id: school.id,
    school_name: school.name,
    course_interest: prospect.course_interest || 'Summer School 2026',
    preferred_schedule: prospect.preferred_schedule ?? null,
    enrollment_type: 'special',
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

  // ── 6. Real learning path (prefer special page program_id when linked) ──
  let preferredProgramId: string | null = null;
  const specialMatch = String(prospect.notes || '').match(/\[SpecialPage:\s*([0-9a-f-]{36})\]/i);
  if (specialMatch?.[1]) {
    try {
      const { data: sp } = await admin
        .from('special_program_pages')
        .select('program_id')
        .eq('id', specialMatch[1])
        .maybeSingle();
      preferredProgramId = sp?.program_id || null;
    } catch {
      /* non-critical */
    }
  }

  void ensureDefaultEnrollment(admin, studentPortalId, {
    grade: prospect.grade,
    enrollmentType: 'special',
    courseInterest: prospect.course_interest,
    preferredProgramId,
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

  // Link completed tuition payments to the admitted learner and repair any
  // missing paid invoice through the canonical settlement service.
  try {
    const { ensureSettledInvoiceForTransaction } = await import('@/lib/finance/settled-invoice');
    const { data: transactions, error: transactionLoadError } = await admin
      .from('payment_transactions')
      .select('id, amount, currency, invoice_id, payment_status, transaction_reference')
      .contains('payment_gateway_response', { prospect_id: prospect.id })
      .order('created_at', { ascending: false });
    if (transactionLoadError) throw new Error(transactionLoadError.message);

    for (const transaction of transactions ?? []) {
      const { error: ownerLinkError } = await admin.from('payment_transactions')
        .update({ portal_user_id: studentPortalId, school_id: school.id, updated_at: new Date().toISOString() })
        .eq('id', transaction.id);
      if (ownerLinkError) throw new Error(`Could not link tuition payment to learner: ${ownerLinkError.message}`);

      if (['completed', 'success', 'paid'].includes(String(transaction.payment_status || '').toLowerCase()) && !transaction.invoice_id) {
        const amount = Number(transaction.amount) || 0;
        const rawReference = String(transaction.transaction_reference || transaction.id);
        const invoice = await ensureSettledInvoiceForTransaction(admin as any, {
          transactionId: transaction.id,
          invoiceNumber: `INV-SUM-${rawReference.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 40)}`,
          amount,
          currency: transaction.currency || 'NGN',
          portalUserId: studentPortalId,
          schoolId: school.id,
          items: [{
            description: `AI Summer School 2026 Tuition — ${prospect.full_name}`,
            quantity: 1,
            unit_price: amount,
            total: amount,
          }],
          metadata: { source: SPECIAL_SOURCE, student_name: prospect.full_name, prospect_id: prospect.id },
        });
        if (!invoice.ok) throw new Error(invoice.error.message);
      }
    }
  } catch (financeError) {
    console.error('[onboardSummerStudent] finance sync failed:', financeError);
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
  opts: { activation?: boolean; force?: boolean } = {},
): Promise<{ email: boolean; whatsapp: boolean; alreadySent?: boolean }> {
  const { createAdminClient } = await import('@/lib/supabase/admin');
  const { deliverSummerSchoolCredentials } = await import('@/lib/credentials/summer-school-credentials');
  const deliveryInput = {
    ...result,
    parentPhone: result.whatsappOptIn ? result.parentPhone : null,
  };
  return deliverSummerSchoolCredentials(createAdminClient(), deliveryInput, prospect, {
    ...opts,
    prospectId: prospect.id,
  });
}

/**
 * Post-approval / post-payment activation notice — always sends parent acknowledgement
 * even when both portal accounts already exist. Resets temp passwords only for
 * accounts that have never signed in.
 */
export async function sendSpecialProgramActivation(
  result: SummerOnboardResult,
  prospect: ProspectLike,
  opts: { force?: boolean } = {},
): Promise<{ email: boolean; whatsapp: boolean; alreadySent?: boolean }> {
  return sendSummerCredentials(result, prospect, { activation: true, force: opts.force });
}
