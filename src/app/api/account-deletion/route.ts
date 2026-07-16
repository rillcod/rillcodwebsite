import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createEngagementAdminClient } from '@/lib/supabase/admin';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { email?: string; fullName?: string; reason?: string; website?: string };
    if (body.website) return NextResponse.json({ success: true });

    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    const admin = createEngagementAdminClient();
    const { data: profile } = user
      ? await admin.from('portal_users').select('id, email, full_name, role').eq('id', user.id).maybeSingle()
      : { data: null } as any;

    const email = String(profile?.email || user?.email || body.email || '').trim().toLowerCase();
    if (!EMAIL.test(email)) return NextResponse.json({ error: 'Enter a valid account email address.' }, { status: 400 });

    const { data: existing } = await admin.from('account_deletion_requests')
      .select('id, status, requested_at')
      .eq('email', email)
      .in('status', ['pending', 'in_progress'])
      .order('requested_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing) return NextResponse.json({ success: true, existing: true, status: existing.status });

    const reason = String(body.reason || '').trim().slice(0, 1000) || null;
    const { error } = await admin.from('account_deletion_requests').insert({
      user_id: user?.id ?? null,
      email,
      full_name: String(profile?.full_name || body.fullName || '').trim().slice(0, 160) || null,
      account_role: profile?.role ?? null,
      reason,
      status: 'pending',
    });
    if (error) return NextResponse.json({ error: 'We could not submit the request. Please try again.' }, { status: 500 });
    return NextResponse.json({ success: true, status: 'pending' });
  } catch {
    return NextResponse.json({ error: 'We could not submit the request. Please try again.' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ request: null }, { status: 401 });
  const admin = createEngagementAdminClient();
  const { data: profile } = await admin.from('portal_users').select('role').eq('id', user.id).maybeSingle();
  if (request.nextUrl.searchParams.get('admin') === '1') {
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    const { data, error } = await admin.from('account_deletion_requests').select('*').order('requested_at', { ascending: false }).limit(250);
    return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ requests: data ?? [] });
  }
  const { data } = await admin.from('account_deletion_requests')
    .select('id, status, requested_at, completed_at, retention_note')
    .eq('user_id', user.id).order('requested_at', { ascending: false }).limit(1).maybeSingle();
  return NextResponse.json({ request: data ?? null });
}

export async function PATCH(request: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const admin = createEngagementAdminClient();
  const { data: profile } = await admin.from('portal_users').select('role').eq('id', user.id).maybeSingle();
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  const body = await request.json() as { id?: string; status?: string; retentionNote?: string; adminNote?: string };
  const statuses = ['pending', 'in_progress', 'completed', 'rejected', 'cancelled'];
  if (!body.id || !body.status || !statuses.includes(body.status)) return NextResponse.json({ error: 'Invalid request update' }, { status: 400 });
  const update: Record<string, unknown> = { status: body.status, retention_note: String(body.retentionNote || '').slice(0, 2000) || null, admin_note: String(body.adminNote || '').slice(0, 2000) || null, updated_at: new Date().toISOString() };
  if (body.status === 'completed') update.completed_at = new Date().toISOString();
  const { error } = await admin.from('account_deletion_requests').update(update).eq('id', body.id);
  return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ success: true });
}