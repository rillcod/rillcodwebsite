import { createClient } from '@supabase/supabase-js';
import {
  mapSpecialProgramRow,
  type SpecialProgramPage,
} from '@/lib/special-programs/types';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

const SELECT_COLS =
  'id, program_id, slug, title, button_label, is_published, is_featured, starts_on, ends_on, registration_deadline, online_fee, onsite_fee, deposit_percent, content, created_at, updated_at';

export async function getFeaturedSpecialProgram(): Promise<SpecialProgramPage | null> {
  try {
    const sb = adminClient();
    const { data, error } = await sb
      .from('special_program_pages')
      .select(SELECT_COLS)
      .eq('is_published', true)
      .eq('is_featured', true)
      .maybeSingle();
    if (error) {
      console.warn('special_program_pages featured lookup:', error.message);
      return null;
    }
    if (data) return mapSpecialProgramRow(data);

    const { data: anyPub } = await sb
      .from('special_program_pages')
      .select(SELECT_COLS)
      .eq('is_published', true)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    return anyPub ? mapSpecialProgramRow(anyPub) : null;
  } catch (e) {
    console.warn('getFeaturedSpecialProgram failed', e);
    return null;
  }
}

export async function getSpecialProgramBySlug(
  slug: string,
  opts?: { requirePublished?: boolean },
): Promise<SpecialProgramPage | null> {
  const sb = adminClient();
  let q = sb.from('special_program_pages').select(SELECT_COLS).eq('slug', slug);
  if (opts?.requirePublished !== false) q = q.eq('is_published', true);
  const { data } = await q.maybeSingle();
  return data ? mapSpecialProgramRow(data) : null;
}

export async function getSpecialProgramById(id: string): Promise<SpecialProgramPage | null> {
  const sb = adminClient();
  const { data } = await sb
    .from('special_program_pages')
    .select(SELECT_COLS)
    .eq('id', id)
    .maybeSingle();
  return data ? mapSpecialProgramRow(data) : null;
}

export async function listSpecialProgramsAdmin(): Promise<SpecialProgramPage[]> {
  const sb = adminClient();
  const { data } = await sb
    .from('special_program_pages')
    .select(SELECT_COLS)
    .order('updated_at', { ascending: false });
  return (data ?? []).map(mapSpecialProgramRow);
}

/** Clear other featured flags, then set this one featured (and published). */
export async function setFeaturedSpecialProgram(id: string): Promise<void> {
  const sb = adminClient();
  await sb.from('special_program_pages').update({ is_featured: false, updated_at: new Date().toISOString() }).eq('is_featured', true);
  await sb
    .from('special_program_pages')
    .update({ is_featured: true, is_published: true, updated_at: new Date().toISOString() })
    .eq('id', id);
}

export { adminClient as specialProgramsAdminClient };
