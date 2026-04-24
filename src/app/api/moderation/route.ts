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
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');

  let query = db
    .from('flagged_content')
    .select('*, reporter:portal_users!flagged_content_reporter_id_fkey(full_name, email)')
    .order('created_at', { ascending: false })
    .limit(200);

  if (status && status !== 'all') query = query.eq('status', status);

  const { data, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

// PATCH /api/moderation — resolve / dismiss a flagged item
export async function PATCH(request: Request) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json();
  const { id, status, moderator_notes } = body;

  if (!id || !['resolved', 'dismissed', 'reviewed', 'removed'].includes(status)) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const db = createAdminClient();

  // Map 'resolved' → 'reviewed', 'dismissed' → 'dismissed' (schema only allows pending/reviewed/dismissed/removed)
  const dbStatus = status === 'resolved' ? 'reviewed' : status;

  const { error } = await db
    .from('flagged_content')
    .update({
      status: dbStatus,
      moderator_id: user.id,
      moderator_notes: moderator_notes || null,
      updated_at: new Date().toISOString(),
    } as any)
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
