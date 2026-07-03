import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';
import { resolveStudentFromCode } from './resolve';
import { looseNameMatch } from './name-match';
import { provisionParentAndLinkChild, autoLinkSiblings } from './provision';
import { ensureResultIntakeForm } from './intake-form';
import { reconcileLeadWithCrm } from '@/lib/crm/reconcile-lead';
import { deliverParentLogin } from '@/lib/parents/deliver-login';

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

/**
 * The full self-service completion: create/link the parent + scanned child, auto-link
 * siblings (full parent info), record the consent-form lead, mine the parent into the
 * CRM, and deliver the login. Called after the name guard (frictionless) OR after OTP
 * verification — one implementation so both paths behave identically.
 */
export async function completeParentClaim(admin: Db, studentId: string, details: ClaimDetails): Promise<ClaimResult> {
  const { fullName, email, phone, relationship } = details;

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

  if (prov.accountCreated && prov.generatedPassword) {
    await deliverParentLogin({ email, phone, fullName, password: prov.generatedPassword, schoolName: prov.schoolName });
  }

  return {
    ok: true,
    childName: prov.childName,
    accountCreated: !!prov.accountCreated,
    siblingsLinked: siblingNames.length,
    siblingNames,
  };
}
