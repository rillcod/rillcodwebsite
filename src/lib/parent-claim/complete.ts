import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';
import { resolveStudentFromCode } from './resolve';
import { looseNameMatch } from './name-match';
import { provisionParentAndLinkChild, autoLinkSiblings } from './provision';
import { reconcileLeadWithCrm } from '@/lib/crm/reconcile-lead';
import { deliverResultCheckerCredentials, type CredentialDelivery } from '@/lib/parent-claim/deliver-credentials';
import { applyParentRecordEnrichment, normaliseChildAge, validateParentSuppliedRecordGaps, type RecordEnrichmentResult } from '@/lib/parent-claim/record-enrichment';
import { upsertResultCheckerLead } from '@/lib/parent-claim/upsert-lead';
import { harmonizeStudentParentIdentity } from '@/lib/sync/student-parent-identity';
import { getExistingParentLink, resolveOrCreateStudentRowId } from '@/lib/parents/links';

type Db = SupabaseClient<Database>;

export interface ClaimDetails {
  fullName: string;
  email: string;
  phone: string | null;
  relationship: string | null;
  childName?: string;
  childGender?: string | null;
  childAge?: string | number | null;
  childDob?: string | null;
  whatsappOptIn?: boolean;
}

export interface ClaimResult {
  ok: boolean;
  error?: string;
  status?: number;
  childName?: string | null;
  accountCreated?: boolean;
  siblingsLinked?: number;
  siblingNames?: string[];
  credentials?: CredentialDelivery;
  enrichment?: RecordEnrichmentResult;
}

/**
 * Resolve the scanned child from a student number (RC code).
 * The code itself identifies the child — parent name is not required on the form.
 * An optional childName, when supplied, is still checked (legacy quick-view path).
 */
export async function resolveAndGuardChild(
  admin: Db,
  code: string,
  details: Partial<Pick<ClaimDetails, 'relationship' | 'childName'>> = {},
): Promise<{ studentId?: string; error?: string; status?: number }> {
  const studentId = await resolveStudentFromCode(admin, code);
  if (!studentId) return { error: 'No student record matches this code.', status: 404 };

  const childName = (details.childName ?? '').trim();
  if (childName.length >= 2) {
    const isDirectParent = ['father', 'mother'].includes((details.relationship ?? '').toLowerCase());
    const { data: childRow } = await admin
      .from('portal_users').select('full_name').eq('id', studentId).maybeSingle();
    if (!looseNameMatch(childName, childRow?.full_name ?? '')) {
      return {
        error: isDirectParent
          ? 'That name doesn\'t match this card. Check spelling on the access card.'
          : 'That name doesn\'t match this student number. Only enter a name you know belongs to this child.',
        status: 400,
      };
    }
  }

  return { studentId };
}

/** Best-effort accountability log for the claim (never blocks the flow). */
async function logClaimAudit(admin: Db, row: {
  student_id: string; parent_id?: string | null; email: string; phone: string | null;
  action: 'linked' | 'blocked'; siblings_linked?: number; note?: string;
}): Promise<void> {
  try {
    await (admin as any).from('parent_claim_audit').insert({
      student_id: row.student_id, parent_id: row.parent_id ?? null,
      email: row.email, phone: row.phone, action: row.action,
      siblings_linked: row.siblings_linked ?? 0, note: row.note ?? null,
    });
  } catch { /* best-effort */ }
}

/** In-app notification to the school's staff + admins when a parent self-links via QR. */
async function notifyStaffOfClaim(admin: Db, schoolId: string | null, childName: string | null, parentName: string): Promise<void> {
  if (!schoolId) return;
  try {
    const [{ data: schoolStaff }, { data: admins }] = await Promise.all([
      admin.from('portal_users').select('id').in('role', ['teacher', 'school']).eq('school_id', schoolId).eq('is_active', true),
      admin.from('portal_users').select('id').eq('role', 'admin').eq('is_active', true),
    ]);
    const users = [...(schoolStaff ?? []), ...(admins ?? [])];
    if (users.length === 0) return;
    const now = new Date().toISOString();
    await (admin as any).from('notifications').insert(users.map((u: { id: string }) => ({
      user_id: u.id,
      title: 'Parent self-registered via result QR',
      message: `${parentName} linked to ${childName ?? 'a student'} by scanning a result / ID card.`,
      type: 'info', is_read: false, created_at: now, updated_at: now,
    })));
  } catch { /* best-effort */ }
}

/**
 * The full self-service completion: create/link the parent + scanned child, auto-link
 * siblings (full parent info), record the consent-form lead, mine the parent into the
 * CRM, and deliver the login. Called after the name guard (frictionless) OR after OTP
 * verification — one implementation so both paths behave identically.
 */
export async function completeParentClaim(admin: Db, studentId: string, details: ClaimDetails): Promise<ClaimResult> {
  const { fullName, email, phone, relationship, childGender, childAge, childDob, whatsappOptIn } = details;
  const parsedAge = normaliseChildAge(childAge);

  const gapError = await validateParentSuppliedRecordGaps(admin, studentId, {
    childGender, childAge, childDob,
  });
  if (gapError) return { ok: false, error: gapError, status: 400 };

  const studentRowId = await resolveOrCreateStudentRowId(admin as any, studentId);
  const { data: childStudent } = studentRowId
    ? await admin.from('students').select('id, parent_email, parent_phone').eq('id', studentRowId).maybeSingle()
    : { data: null };
  if (childStudent) {
    const exEmail = (childStudent.parent_email ?? '').trim().toLowerCase();
    const exPhone = (childStudent.parent_phone ?? '').replace(/\D/g, '');
    const inPhone = (phone ?? '').replace(/\D/g, '');
    const existingLink = await getExistingParentLink(admin as any, childStudent.id);
    let linkedParentEmail = '';
    let linkedParentPhone = '';
    if (existingLink) {
      const { data: linkedParent } = await admin
        .from('portal_users')
        .select('email, phone')
        .eq('id', existingLink.parentId)
        .maybeSingle();
      linkedParentEmail = (linkedParent?.email ?? '').trim().toLowerCase();
      linkedParentPhone = (linkedParent?.phone ?? '').replace(/\D/g, '');
    }
    const hasParent = Boolean(existingLink || exEmail);
    const matchesExisting =
      (!!exEmail && exEmail === email)
      || (!!linkedParentEmail && linkedParentEmail === email)
      || (!!exPhone && !!inPhone && exPhone === inPhone)
      || (!!linkedParentPhone && !!inPhone && linkedParentPhone === inPhone);
    if (hasParent && !matchesExisting) {
      await logClaimAudit(admin, { student_id: studentId, email, phone, action: 'blocked', note: 'child already linked to a different parent' });
      return {
        ok: false,
        status: 409,
        error: 'This child is already linked to a parent account. Please ask the school to add you as an additional guardian.',
      };
    }
  }

  const prov = await provisionParentAndLinkChild(admin, { email, phone, fullName, relationship, studentId });
  if (!prov.ok || !prov.parentId) {
    return { ok: false, error: prov.error ?? 'Could not link your account.', status: prov.status ?? 500 };
  }

  const siblingNames = await autoLinkSiblings(admin, {
    parentId: prov.parentId, email, phone, fullName, relationship, schoolName: prov.schoolName ?? null, studentId,
  });

  const enrichment = await applyParentRecordEnrichment(admin, {
    studentUserId: studentId,
    parentId: prov.parentId,
    phone,
    childGender,
    childAge: parsedAge,
    childDob,
    whatsappOptIn,
  });

  if (prov.schoolId) {
    try {
      const leadId = await upsertResultCheckerLead(admin, {
        schoolId: prov.schoolId,
        schoolName: prov.schoolName ?? null,
        studentUserId: studentId,
        parentId: prov.parentId,
        email,
        fullName,
        phone,
        relationship,
        childName: prov.childName ?? null,
        childGender: childGender ?? null,
        childAge: parsedAge,
        childDob: childDob ?? null,
        whatsappOptIn,
      });
      const formId = leadId ? (await admin.from('form_leads').select('form_id').eq('id', leadId).maybeSingle()).data?.form_id : null;
      const leadSnap = await harmonizeStudentParentIdentity(admin, {
        studentUserId: studentId,
        parentId: prov.parentId,
        parentPhone: phone,
        parentWhatsappOptIn: whatsappOptIn,
      });
      await reconcileLeadWithCrm(admin, {
        parentName: fullName, parentEmail: email, parentWhatsapp: phone ?? '',
        childName: prov.childName ?? '',
        childAge: leadSnap?.child_age ?? (parsedAge != null ? String(parsedAge) : ''),
        childGender: leadSnap?.child_gender ?? childGender ?? undefined,
        childDob: leadSnap?.child_dob ?? childDob ?? undefined,
        whatsappOptIn: whatsappOptIn ?? leadSnap?.parent_whatsapp_opt_in,
        childClass: '', programCategory: '', currentSchool: prov.schoolName ?? null,
        matchedSchoolId: prov.schoolId, schoolId: prov.schoolId,
        schoolName: prov.schoolName ?? 'Rillcod Technologies',
        formId: formId ?? `result-check-${prov.schoolId}`,
        formTitle: 'Result Checker Intake',
        stage: 'won',
      });
    } catch (e) {
      console.error('[parent-claim] CRM/lead capture failed:', e);
    }
  }

  const credentials = await deliverResultCheckerCredentials(admin, {
    parentId: prov.parentId,
    studentUserId: studentId,
    parentEmail: email,
    parentPhone: phone,
    parentName: fullName,
    childName: prov.childName ?? null,
    schoolName: prov.schoolName ?? null,
    newParentPassword: prov.generatedPassword ?? null,
  });

  const enrichNote = [
    enrichment.genderRecorded && 'gender',
    enrichment.dobRecorded && 'dob',
    enrichment.ageRecorded && 'age',
    enrichment.whatsappOptInSet && 'whatsapp_opt_in',
  ].filter(Boolean).join(', ');

  await logClaimAudit(admin, {
    student_id: studentId, parent_id: prov.parentId, email, phone,
    action: 'linked', siblings_linked: siblingNames.length,
    note: enrichNote ? `enriched: ${enrichNote}` : undefined,
  });
  await notifyStaffOfClaim(admin, prov.schoolId ?? null, prov.childName ?? null, fullName);

  return {
    ok: true,
    childName: prov.childName,
    accountCreated: !!prov.accountCreated,
    siblingsLinked: siblingNames.length,
    siblingNames,
    credentials,
    enrichment,
  };
}
