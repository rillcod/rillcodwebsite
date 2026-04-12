import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('portal_users').select('role').eq('id', user.id).single();
  if (data?.role !== 'admin') return null;
  return user;
}

// GET /api/moderation — list flagged content (admin only)
export async function GET(request: Request) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const db = createAdminClient();
  const { data, error } = await db
    .from('flagged_content')
    .select('*, reporter:portal_users!flagged_content_reporter_id_fkey(full_name, email)')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

// PATCH /api/moderation — resolve / dismiss a flagged item
export async function PATCH(request: Request) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id, status } = await request.json();
  if (!id || !['resolved', 'dismissed'].includes(status)) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const db = createAdminClient();
  const { error } = await db
    .from('flagged_content')
    .update({ status: status as string, resolved_by: user.id, resolved_at: new Date().toISOString() } as any)
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
