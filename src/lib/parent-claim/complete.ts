import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';
import { resolveStudentFromCode } from './resolve';
import { looseNameMatch } from './name-match';
import { provisionParentAndLinkChild, autoLinkSiblings } from './provision';
import { ensureResultIntakeForm } from './intake-form';
import { reconcileLeadWithCrm } from '@/lib/crm/reconcile-lead';
import { deliverResultCheckerCredentials, type CredentialDelivery } from '@/lib/parent-claim/deliver-credentials';

type Db = SupabaseClient<Database>;

export interface ClaimDetails {
  fullName: string;
  email: string;
  phone: string | null;
  relationship: string | null;
  childName?: string;
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
}

/**
 * Resolve the scanned child from a code and run the light parent name guard.
 * Shared by the frictionless intake and the OTP `start` step so both gate identically.
 */
export async function resolveAndGuardChild(
  admin: Db,
  code: string,
  details: Pick<ClaimDetails, 'relationship' | 'childName'>,
): Promise<{ studentId?: string; error?: string; status?: number }> {
  const studentId = await resolveStudentFromCode(admin, code);
  if (!studentId) return { error: 'No student record matches this code.', status: 404 };

  const isDirectParent = ['father', 'mother'].includes((details.relationship ?? '').toLowerCase());
  if (isDirectParent && details.childName) {
    const { data: childRow } = await admin
      .from('portal_users').select('full_name').eq('id', studentId).maybeSingle();
    if (!looseNameMatch(details.childName, childRow?.full_name ?? '')) {
      return {
        error: 'That name doesn’t match this card. Please check the child’s name — or select “Guardian” if you’re not the parent.',
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
  const { fullName, email, phone, relationship } = details;

  // Anti-hijack: if this child is ALREADY linked to a parent whose contact differs from
  // the claimant, don't silently attach a stranger (possession of the QR + owning your
  // own email doesn't make you the parent). Route them to the school instead. A matching
  // contact (the same parent re-claiming, or a co-parent already on file) still passes.
  const { data: childStudent } = await admin
    .from('students').select('id, parent_email, parent_phone').eq('user_id', studentId).maybeSingle();
  if (childStudent) {
    const exEmail = (childStudent.parent_email ?? '').trim().toLowerCase();
    const exPhone = (childStudent.parent_phone ?? '').replace(/\D/g, '');
    const inPhone = (phone ?? '').replace(/\D/g, '');
    let hasParent = !!exEmail;
    if (!hasParent) {
      const { data: link } = await admin
        .from('parent_student_links').select('id').eq('student_id', childStudent.id).limit(1).maybeSingle();
      hasParent = !!link;
    }
    const matchesExisting = (!!exEmail && exEmail === email) || (!!exPhone && !!inPhone && exPhone === inPhone);
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

  if (prov.schoolId) {
    try {
      const formId = await ensureResultIntakeForm(admin, prov.schoolId);
      if (formId) {
        const { data: dupe } = await admin
          .from('form_leads').select('id')
          .eq('form_id', formId).eq('matched_student_id', studentId).maybeSingle();
        if (!dupe) {
          await admin.from('form_leads').insert({
            form_id: formId,
            school_id: prov.schoolId,
            email,
            response_data: {
              parent_name: fullName, parent_email: email, parent_whatsapp: phone,
              relationship, child_name: prov.childName, source: 'result_checker', _auto_linked: true,
            },
            matched_student_id: studentId,
            matched_parent_id: prov.parentId,
            match_status: 'approved',
            match_confidence: 'high',
            match_notes: 'Auto-linked via result/ID-card scan (exact child).',
          });
        }
        await reconcileLeadWithCrm(admin, {
          parentName: fullName, parentEmail: email, parentWhatsapp: phone ?? '',
          childName: prov.childName ?? '', childAge: '', childClass: '',
          programCategory: '', currentSchool: prov.schoolName ?? null,
          matchedSchoolId: prov.schoolId, schoolId: prov.schoolId,
          schoolName: prov.schoolName ?? 'Rillcod Technologies',
          formId, formTitle: 'Result Checker Intake',
        });
      }
    } catch (e) {
      console.error('[parent-claim] CRM capture failed:', e);
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

  // Accountability + staff visibility (both best-effort).
  await logClaimAudit(admin, {
    student_id: studentId, parent_id: prov.parentId, email, phone,
    action: 'linked', siblings_linked: siblingNames.length,
  });
  await notifyStaffOfClaim(admin, prov.schoolId ?? null, prov.childName ?? null, fullName);

  return {
    ok: true,
    childName: prov.childName,
    accountCreated: !!prov.accountCreated,
    siblingsLinked: siblingNames.length,
    siblingNames,
    credentials,
  };
}
