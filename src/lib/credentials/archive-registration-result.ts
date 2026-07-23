import type { SupabaseClient } from '@supabase/supabase-js';

type AnySupabase = SupabaseClient<any>;

/**
 * Archive or refresh a portal login in registration_results (credentials vault).
 * Used by resend-credentials so staff always see the latest password.
 */
export async function archivePortalCredential(
  admin: AnySupabase,
  input: {
    schoolId: string | null;
    schoolName?: string | null;
    fullName: string;
    email: string;
    password: string;
    className?: string | null;
    batchLabel?: string;
    status?: string;
  },
): Promise<void> {
  const email = input.email.trim().toLowerCase();
  if (!email || !input.password) return;

  const batchName = input.batchLabel ?? 'Portal Credentials';
  let batchId: string | undefined;

  if (input.schoolId) {
    const { data: existingBatch } = await admin
      .from('registration_batches')
      .select('id')
      .eq('school_id', input.schoolId)
      .eq('class_name', batchName)
      .maybeSingle();
    batchId = existingBatch?.id;
    if (!batchId) {
      batchId = crypto.randomUUID();
      await admin.from('registration_batches').insert({
        id: batchId,
        school_id: input.schoolId,
        school_name: input.schoolName ?? null,
        class_name: batchName,
        student_count: 1,
      });
    }
  }

  const { data: existing } = await admin
    .from('registration_results')
    .select('id')
    .eq('email', email)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    await admin.from('registration_results').update({
      password: input.password,
      full_name: input.fullName,
      class_name: input.className ?? null,
      status: input.status ?? 'created',
      ...(batchId ? { batch_id: batchId } : {}),
    }).eq('id', existing.id);
    return;
  }

  if (!batchId) {
    batchId = crypto.randomUUID();
    await admin.from('registration_batches').insert({
      id: batchId,
      school_id: input.schoolId,
      school_name: input.schoolName ?? null,
      class_name: batchName,
      student_count: 1,
    });
  }

  await admin.from('registration_results').insert({
    batch_id: batchId,
    full_name: input.fullName,
    email,
    password: input.password,
    class_name: input.className ?? null,
    status: input.status ?? 'created',
  });
}
