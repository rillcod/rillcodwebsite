import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveStudentRowId } from '@/lib/parents/links';
import { normalizeEnrollmentType } from '@/lib/registration/enrollment-types';

type AnySupabase = SupabaseClient<any>;

export type RequiredConsentForm = {
  id: string;
  title: string;
  form_type: string | null;
  school_id: string;
  class_id: string | null;
  enrollment_type: string;
  academic_offering_id: string | null;
};

export type ConsentAccessStatus = {
  required: boolean;
  complete: boolean;
  form: RequiredConsentForm | null;
  formUrl: string | null;
  matchedLeadId: string | null;
};

const FORM_TYPE_PRIORITY = new Map([
  ['assessment', 0],
  ['registration', 1],
  ['consent', 2],
]);

function appBaseUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || 'https://rillcod.com').replace(/\/$/, '');
}

function formRank(form: RequiredConsentForm, classId?: string | null) {
  const classRank = classId && form.class_id === classId ? 0 : form.class_id ? 2 : 1;
  const typeRank = FORM_TYPE_PRIORITY.get(String(form.form_type || '').toLowerCase()) ?? 3;
  return classRank * 10 + typeRank;
}

export function consentFormMatchesEnrollment(
  formEnrollmentType: string | null | undefined,
  learnerEnrollmentType: string | null | undefined,
): boolean {
  return normalizeEnrollmentType(formEnrollmentType, 'school')
    === normalizeEnrollmentType(learnerEnrollmentType, 'school');
}


export async function resolveRequiredConsentForm(
  admin: AnySupabase,
  params: { schoolId?: string | null; classId?: string | null; enrollmentType?: string | null },
): Promise<RequiredConsentForm | null> {
  if (!params.schoolId) return null;

  const { data, error } = await admin
    .from('consent_forms')
    .select('id, title, form_type, school_id, class_id, enrollment_type, academic_offering_id, created_at')
    .eq('school_id', params.schoolId)
    .eq('is_public', true)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) throw error;
  const forms = (data ?? []) as Array<RequiredConsentForm & { created_at?: string | null }>;
  if (forms.length === 0) return null;
  const expectedType = normalizeEnrollmentType(params.enrollmentType, 'school');
  const pathwayForms = forms.filter(
    (form) => consentFormMatchesEnrollment(form.enrollment_type, expectedType),
  );
  if (pathwayForms.length === 0) return null;
  const typedForms = pathwayForms.filter((form) => FORM_TYPE_PRIORITY.has(String(form.form_type || '').toLowerCase()));
  const candidates = typedForms.length > 0 ? typedForms : pathwayForms;

  return candidates
    .slice()
    .sort((a, b) => formRank(a, params.classId) - formRank(b, params.classId))
    [0] ?? null;
}

export async function getResultConsentAccessStatus(
  admin: AnySupabase,
  params: {
    studentUserId: string;
    schoolId?: string | null;
    classId?: string | null;
    enrollmentType?: string | null;
    parentId?: string | null;
  },
): Promise<ConsentAccessStatus> {
  const form = await resolveRequiredConsentForm(admin, {
    schoolId: params.schoolId,
    classId: params.classId,
    enrollmentType: params.enrollmentType,
  });

  if (!form) {
    return { required: false, complete: true, form: null, formUrl: null, matchedLeadId: null };
  }

  const { data, error } = await admin
    .from('form_leads')
    .select('id, status, match_status, matched_parent_id, matched_student_id')
    .eq('form_id', form.id)
    // form_leads is timestamped by submitted_at (there is no created_at column) — ordering
    // by a non-existent column threw 42703 and 500'd result access for every school that
    // had a public consent form. Keep the newest-first ordering on the real column.
    .order('submitted_at', { ascending: false, nullsFirst: false })
    .limit(1000);

  if (error) throw error;
  const leadIds = (data ?? []).map((lead) => lead.id);
  const { data: childLinks, error: childLinkError } = leadIds.length
    ? await admin
      .from('form_lead_child_links')
      .select('lead_id, student_portal_user_id')
      .in('lead_id', leadIds)
      .eq('student_portal_user_id', params.studentUserId)
      .in('status', ['approved', 'onboarded'])
    : { data: [], error: null };
  if (childLinkError) throw childLinkError;
  const matchingLeadIds = new Set((childLinks ?? []).map((link) => link.lead_id));

  const validStatuses = new Set(['enrolled', 'contacted', 'new', null]);
  const validMatchStatuses = new Set(['approved', 'auto_matched', 'matched']);
  const matched = (data ?? []).find((lead: any) => {
    const statusOk = validStatuses.has(lead.status ?? null);
    const matchOk = validMatchStatuses.has(lead.match_status ?? null);
    const studentMatches = matchingLeadIds.has(lead.id);
    const parentMatches = !params.parentId || !lead.matched_parent_id || lead.matched_parent_id === params.parentId;
    return statusOk && matchOk && studentMatches && parentMatches;
  });

  let signedInPortal = false;
  if (!matched && params.parentId) {
    const studentRowId = await resolveStudentRowId(admin, params.studentUserId);
    const [{ data: signed }, { data: explicitLink }] = await Promise.all([
      admin
        .from('consent_responses')
        .select('form_id')
        .eq('form_id', form.id)
        .eq('parent_id', params.parentId)
        .maybeSingle(),
      studentRowId
        ? admin
          .from('parent_student_links')
          .select('id')
          .eq('parent_id', params.parentId)
          .eq('student_id', studentRowId)
          .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    signedInPortal = Boolean(signed && explicitLink);
  }

  return {
    required: true,
    complete: Boolean(matched || signedInPortal),
    form,
    formUrl: `${appBaseUrl()}/forms/${form.id}`,
    matchedLeadId: matched?.id ?? null,
  };
}
