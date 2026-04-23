import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabase } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import type { Database, Tables } from '@/types/supabase';

function adminClient() {
  return createSupabase<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function getCaller() {
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

function toCsv(rows: Tables<'customer_contact_book'>[]) {
  const header = ['id', 'role', 'full_name', 'email', 'phone', 'school_name', 'class_name', 'source', 'last_channel', 'confirmed_at'];
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push([
      r.id, r.role, r.full_name, r.email, r.phone, r.school_name, r.class_name, r.source, r.last_channel, r.confirmed_at,
    ].map(esc).join(','));
  }
  return lines.join('\n');
}

export async function GET(req: NextRequest) {
  const caller = await getCaller();
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const url = new URL(req.url);
  const role = url.searchParams.get('role') || 'all';
  const source = url.searchParams.get('source') || 'all';
  const school = url.searchParams.get('school') || '';
  const className = url.searchParams.get('class') || '';
  const q = url.searchParams.get('q') || '';
  const asCsv = url.searchParams.get('format') === 'csv';

  let query = adminClient()
    .from('customer_contact_book')
    .select('*')
    .order('confirmed_at', { ascending: false })
    .limit(500);

  if (role !== 'all') query = query.eq('role', role);
  if (source !== 'all') query = query.eq('source', source);
  if (school.trim()) query = query.ilike('school_name', `%${school.trim()}%`);
  if (className.trim()) query = query.ilike('class_name', `%${className.trim()}%`);
  if (q.trim()) query = query.or(`full_name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`);
  if (caller.role === 'school' && caller.school_id) {
    const { data: schoolRow } = await adminClient().from('schools').select('name').eq('id', caller.school_id).maybeSingle();
    if (schoolRow?.name) query = query.ilike('school_name', `%${schoolRow.name}%`);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const rows = data ?? [];

  if (asCsv) {
    return new NextResponse(toCsv(rows), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="customer-book-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  }
  return NextResponse.json({ data: rows });
}

export async function PATCH(req: NextRequest) {
  const caller = await getCaller();
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const targetId = typeof body.target_id === 'string' ? body.target_id : '';
  const sourceId = typeof body.source_id === 'string' ? body.source_id : '';
  if (!targetId || !sourceId || targetId === sourceId) {
    return NextResponse.json({ error: 'source_id and target_id are required and must differ' }, { status: 400 });
  }

  const admin = adminClient();
  const { data: rows } = await admin
    .from('customer_contact_book')
    .select('*')
    .in('id', [targetId, sourceId]);
  const target = (rows ?? []).find((r) => r.id === targetId);
  const source = (rows ?? []).find((r) => r.id === sourceId);
  if (!target || !source) return NextResponse.json({ error: 'One or both records not found' }, { status: 404 });

  const mergedMetadata = {
    ...(target.metadata && typeof target.metadata === 'object' ? target.metadata : {}),
    ...(source.metadata && typeof source.metadata === 'object' ? source.metadata : {}),
    merge: {
      merged_by: caller.id,
      merged_at: new Date().toISOString(),
      source_id: source.id,
    },
  };
  const updatePayload = {
    full_name: target.full_name || source.full_name,
    email: target.email || source.email,
    phone: target.phone || source.phone,
    school_name: target.school_name || source.school_name,
    class_name: target.class_name || source.class_name,
    source: target.source || source.source,
    last_channel: target.last_channel || source.last_channel,
    metadata: mergedMetadata,
    updated_at: new Date().toISOString(),
  };

  const { error: updateErr } = await admin.from('customer_contact_book').update(updatePayload).eq('id', target.id);
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });
  const { error: deleteErr } = await admin.from('customer_contact_book').delete().eq('id', source.id);
  if (deleteErr) return NextResponse.json({ error: deleteErr.message }, { status: 500 });

  return NextResponse.json({ success: true, merged_into: target.id, removed: source.id });
}
