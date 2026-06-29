import type { SupabaseClient } from '@supabase/supabase-js';

type AnySupabase = SupabaseClient<any>;

export type RequiredConsentForm = {
  id: string;
  title: string;
  form_type: string | null;
  school_id: string;
  class_id: string | null;
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

function responseDataMatchesStudent(responseData: unknown, studentUserId: string) {
  if (!responseData || typeof responseData !== 'object' || Array.isArray(responseData)) return false;
  const data = responseData as Record<string, unknown>;
  const childMatches = Array.isArray(data.child_matches)
    ? data.child_matches as Array<{ studentId?: string | null; confidence?: string | null }>
    : [];
  return childMatches.some((match) =>
    match.studentId === studentUserId &&
    (!match.confidence || match.confidence === 'high')
  );
}

export async function resolveRequiredConsentForm(
  admin: AnySupabase,
  params: { schoolId?: string | null; classId?: string | null },
): Promise<RequiredConsentForm | null> {
  if (!params.schoolId) return null;

  const { data, error } = await admin
    .from('consent_forms')
    .select('id, title, form_type, school_id, class_id, created_at')
    .eq('school_id', params.schoolId)
    .eq('is_public', true)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) throw error;
  const forms = (data ?? []) as Array<RequiredConsentForm & { created_at?: string | null }>;
  if (forms.length === 0) return null;
  const typedForms = forms.filter((form) => FORM_TYPE_PRIORITY.has(String(form.form_type || '').toLowerCase()));
  const candidates = typedForms.length > 0 ? typedForms : forms;

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
    parentId?: string | null;
  },
): Promise<ConsentAccessStatus> {
  const form = await resolveRequiredConsentForm(admin, {
    schoolId: params.schoolId,
    classId: params.classId,
  });

  if (!form) {
    return { required: false, complete: true, form: null, formUrl: null, matchedLeadId: null };
  }

  const { data, error } = await admin
    .from('form_leads')
    .select('id, status, match_status, matched_parent_id, matched_student_id, response_data')
    .eq('form_id', form.id)
    .order('created_at', { ascending: false })
    .limit(1000);

  if (error) throw error;

  const validStatuses = new Set(['enrolled', 'contacted', 'new', null]);
  const validMatchStatuses = new Set(['approved', 'auto_matched', 'matched']);
  const matched = (data ?? []).find((lead: any) => {
    const statusOk = validStatuses.has(lead.status ?? null);
    const matchOk = validMatchStatuses.has(lead.match_status ?? null);
    const studentMatches =
      lead.matched_student_id === params.studentUserId ||
      responseDataMatchesStudent(lead.response_data, params.studentUserId);
    const parentMatches = !params.parentId || !lead.matched_parent_id || lead.matched_parent_id === params.parentId;
    return statusOk && matchOk && studentMatches && parentMatches;
  });

  return {
    required: true,
    complete: !!matched,
    form,
    formUrl: `${appBaseUrl()}/forms/${form.id}`,
    matchedLeadId: matched?.id ?? null,
  };
}
