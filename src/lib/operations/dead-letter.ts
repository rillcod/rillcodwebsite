import { createAdminClient } from '@/lib/supabase/admin';

export interface DeadLetterInput {
  source: string;
  jobType: string;
  originalJobId?: string | null;
  userId?: string | null;
  payload?: Record<string, unknown>;
  error: string;
  attempts?: number;
}

export async function recordDeadLetter(input: DeadLetterInput): Promise<string | null> {
  try {
    const db = createAdminClient() as any;
    const row = {
      source: input.source,
      job_type: input.jobType,
      original_job_id: input.originalJobId ?? null,
      user_id: input.userId ?? null,
      payload: input.payload ?? {},
      error: input.error.slice(0, 4000),
      attempts: input.attempts ?? 0,
      status: 'pending',
      updated_at: new Date().toISOString(),
    };
    let existingId: string | null = null;
    if (input.originalJobId) {
      const { data: existing } = await db.from('notification_dead_letters').select('id')
        .eq('source', input.source).eq('original_job_id', input.originalJobId)
        .in('status', ['pending', 'retrying']).maybeSingle();
      existingId = existing?.id ?? null;
    }
    const { data, error } = existingId
      ? await db.from('notification_dead_letters').update(row).eq('id', existingId).select('id').single()
      : await db.from('notification_dead_letters').insert(row).select('id').single();
    if (error) throw error;
    return data?.id ?? null;
  } catch (error) {
    console.error('[dead-letter] unable to persist failed job:', error);
    return null;
  }
}
