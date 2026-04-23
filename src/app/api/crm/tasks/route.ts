import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabase } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import type { Database } from '@/types/supabase';

function adminClient() {
  return createSupabase<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function requireStaff() {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const { data } = await adminClient()
    .from('portal_users')
    .select('id, role, school_id')
    .eq('id', user.id)
    .maybeSingle();
  if (!data || !['admin', 'teacher', 'school'].includes(data.role)) return null;
  return data;
}

export async function GET(req: NextRequest) {
  const caller = await requireStaff();
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const url = new URL(req.url);
  const mine = url.searchParams.get('mine') === '1';
  const overdue = url.searchParams.get('overdue') === '1';
  const status = url.searchParams.get('status') || 'all';
  const nowIso = new Date().toISOString();

  let q = adminClient()
    .from('crm_tasks')
    .select('id, contact_id, contact_name, title, due_at, priority, status, owner_id, created_at')
    .order('due_at', { ascending: true, nullsFirst: false })
    .limit(150);
  if (mine) q = q.eq('owner_id', caller.id);
  if (status !== 'all') q = q.eq('status', status);
  if (overdue) q = q.not('due_at', 'is', null).lt('due_at', nowIso).in('status', ['open', 'in_progress']);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}
