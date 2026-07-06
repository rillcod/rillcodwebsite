import type { SupabaseClient } from '@supabase/supabase-js';

type AnySupabase = SupabaseClient<any>;

/**
 * Single source of truth for "has this child's real parent been captured?" — a VERIFIED
 * linked parent account via parent_student_links, NOT merely a parent_email on file
 * (which bulk registration sets without a real parent). Used by every result surface so
 * the parent gate behaves identically everywhere.
 */
export async function isParentCaptured(admin: AnySupabase, studentUserId: string): Promise<boolean> {
  if (!studentUserId) return false;
  try {
    const { data: sRow } = await admin.from('students').select('id').eq('user_id', studentUserId).maybeSingle();
    if (!sRow?.id) return false;
    const { data: link } = await admin
      .from('parent_student_links').select('id').eq('student_id', sRow.id).limit(1).maybeSingle();
    return !!link;
  } catch {
    return false; // junction table missing → treat as not captured (gate will show)
  }
}
