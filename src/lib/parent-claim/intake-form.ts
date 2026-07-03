import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';

type Db = SupabaseClient<Database>;

export const RESULT_INTAKE_FORM_TYPE = 'result_intake';

/**
 * Find-or-create the per-school "Result Checker Intake" consent form that parent-scan
 * leads are attached to (form_leads.form_id is NOT NULL). Created once per school and
 * reused, so result-checker leads stay separate from enrolment enquiry forms.
 * Returns null if no owner can be attributed (created_by is required).
 */
export async function ensureResultIntakeForm(admin: Db, schoolId: string): Promise<string | null> {
  const { data: existing } = await admin
    .from('consent_forms')
    .select('id')
    .eq('school_id', schoolId)
    .eq('form_type', RESULT_INTAKE_FORM_TYPE)
    .limit(1)
    .maybeSingle();
  if (existing?.id) return existing.id;

  // created_by is NOT NULL — attribute to the school's own account, else a platform admin.
  const { data: schoolUser } = await admin
    .from('portal_users').select('id').eq('role', 'school').eq('school_id', schoolId).limit(1).maybeSingle();
  let creatorId = schoolUser?.id ?? null;
  if (!creatorId) {
    const { data: adminUser } = await admin
      .from('portal_users').select('id').eq('role', 'admin').limit(1).maybeSingle();
    creatorId = adminUser?.id ?? null;
  }
  if (!creatorId) return null;

  const { data: created } = await admin
    .from('consent_forms')
    .insert({
      school_id: schoolId,
      created_by: creatorId,
      title: 'Result Checker Intake',
      body: 'Parent details captured automatically when a parent views their child’s results via QR.',
      form_type: RESULT_INTAKE_FORM_TYPE,
      is_public: true,
    })
    .select('id')
    .single();
  return created?.id ?? null;
}
