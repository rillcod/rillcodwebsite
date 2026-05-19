import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

// POST /api/consent-forms/strip-copy-suffix
// Admin/teacher: strips " (Copy)" from all consent form titles in caller's scope.
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sb = adminClient();
  const { data: profile } = await (sb as any)
    .from('portal_users').select('role, school_id').eq('id', user.id).single();

  if (!profile || !['admin', 'teacher', 'school'].includes(profile.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Fetch forms whose titles end with " (Copy)"
  let query = (sb as any)
    .from('consent_forms')
    .select('id, title')
    .ilike('title', '% (Copy)');

  if (profile.role !== 'admin') {
    query = query.eq('school_id', profile.school_id);
  }

  const { data: forms } = await query;
  if (!forms || forms.length === 0) {
    return NextResponse.json({ updated: 0, message: 'No forms with "(Copy)" suffix found.' });
  }

  // Strip the suffix from each
  let updated = 0;
  for (const form of forms) {
    const cleanTitle = (form.title as string).replace(/\s*\(Copy\)\s*$/i, '').trim();
    // Guard against duplicate: check if clean title already exists for same school
    const { data: existing } = await (sb as any)
      .from('consent_forms')
      .select('id')
      .neq('id', form.id)
      .ilike('title', cleanTitle)
      .maybeSingle();

    if (!existing) {
      await (sb as any).from('consent_forms').update({ title: cleanTitle }).eq('id', form.id);
      updated++;
    }
  }

  const skipped = forms.length - updated;
  return NextResponse.json({
    updated,
    skipped,
    message: skipped > 0
      ? `${updated} form${updated !== 1 ? 's' : ''} cleaned. ${skipped} skipped (clean title already exists for that school).`
      : `${updated} form title${updated !== 1 ? 's' : ''} cleaned successfully.`,
  });
}
