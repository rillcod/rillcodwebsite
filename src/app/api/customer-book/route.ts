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
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const header = ['S/N', 'Full Name', 'Role', 'Email', 'Phone', 'School', 'Class/Year', 'Source', 'Channel', 'Date Added'];
  const lines = [header.join(',')];
  rows.forEach((r, i) => {
    lines.push([
      i + 1,
      r.full_name,
      r.role,
      r.email,
      r.phone,
      r.school_name,
      r.class_name,
      r.source,
      r.last_channel,
      r.confirmed_at ? new Date(r.confirmed_at).toLocaleDateString('en-GB') : '',
    ].map(esc).join(','));
  });
  return '﻿' + lines.join('\n'); // UTF-8 BOM so Excel opens correctly
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
  const format = url.searchParams.get('format') || 'json';
  const asCsv  = format === 'csv';
  const asPrint = format === 'print';

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
        'Content-Disposition': `attachment; filename="rillcod-customer-book-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  }

  if (asPrint) {
    const date = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
    const rows_html = rows.map((r, i) => `
      <tr>
        <td>${i + 1}</td>
        <td><strong>${r.full_name ?? '—'}</strong></td>
        <td>${r.role ?? '—'}</td>
        <td>${r.email ?? '—'}</td>
        <td>${r.phone ?? '—'}</td>
        <td>${r.school_name ?? '—'}</td>
        <td>${r.class_name ?? '—'}</td>
        <td>${r.source ?? '—'}</td>
        <td>${r.confirmed_at ? new Date(r.confirmed_at).toLocaleDateString('en-GB') : '—'}</td>
      </tr>`).join('');
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Customer Book — Rillcod Technologies</title>
<style>
  body{font-family:Arial,sans-serif;font-size:11px;margin:20px;color:#111}
  h1{font-size:18px;margin-bottom:2px} .sub{font-size:11px;color:#666;margin-bottom:16px}
  table{width:100%;border-collapse:collapse;page-break-inside:auto}
  th{background:#09090b;color:#f5a623;font-size:9px;text-transform:uppercase;letter-spacing:.08em;padding:6px 8px;text-align:left}
  td{padding:5px 8px;border-bottom:1px solid #eee;vertical-align:top}
  tr:nth-child(even) td{background:#fafafa}
  .footer{margin-top:20px;font-size:9px;color:#999;border-top:1px solid #eee;padding-top:8px}
  @media print{@page{size:A4 landscape;margin:15mm}}
</style></head><body>
<h1>Rillcod Technologies — Customer Book</h1>
<p class="sub">Generated: ${date} · ${rows.length} contacts</p>
<table><thead><tr>
  <th>#</th><th>Full Name</th><th>Role</th><th>Email</th><th>Phone</th>
  <th>School</th><th>Class</th><th>Source</th><th>Date Added</th>
</tr></thead><tbody>${rows_html}</tbody></table>
<div class="footer">Rillcod Technologies · 26 Ogiesoba Avenue, GRA, Benin City · +234 811 660 0091 · rillcod.com</div>
<script>window.onload=()=>window.print()</script>
</body></html>`;
    return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }

  return NextResponse.json({ data: rows, total: rows.length });
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

// POST /api/customer-book — create a new contact manually
export async function POST(req: NextRequest) {
  const caller = await getCaller();
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const { full_name, email, phone, role, school_name, class_name } = body as Record<string, string>;

  if (!full_name?.trim()) {
    return NextResponse.json({ error: 'full_name is required' }, { status: 400 });
  }

  const now = new Date().toISOString();
  const { data, error } = await adminClient()
    .from('customer_contact_book')
    .insert({
      full_name: full_name.trim(),
      email: email?.trim().toLowerCase() || null,
      phone: phone?.trim() || null,
      role: role || 'parent',
      school_name: school_name?.trim() || null,
      class_name: class_name?.trim() || null,
      source: 'manual',
      last_channel: 'manual',
      confirmed_at: now,
      created_at: now,
      updated_at: now,
      metadata: { created_by: caller.id },
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
