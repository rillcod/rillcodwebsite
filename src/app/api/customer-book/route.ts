import { NextRequest, NextResponse } from 'next/server';
import type { Tables } from '@/types/supabase';
import { crmAuthErrorResponse, requireCustomerBookCaller } from '@/lib/crm/auth';
import { assertCrmContactAccess, schoolNameNeedlesForCaller, rowMatchesSchoolNames } from '@/lib/crm/scope';
import { repointCrmContactIds } from '@/lib/crm/contact-book';
import { brandContact } from '@/config/brand';

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
  return '﻿' + lines.join('\n');
}

export async function GET(req: NextRequest) {
  try {
    const { caller, db: admin } = await requireCustomerBookCaller();
    const url = new URL(req.url);
    const role = url.searchParams.get('role') || 'all';
    const source = url.searchParams.get('source') || 'all';
    const school = url.searchParams.get('school') || '';
    const className = url.searchParams.get('class') || '';
    const q = url.searchParams.get('q') || '';
    const format = url.searchParams.get('format') || 'json';
    const asCsv  = format === 'csv';
    const asPrint = format === 'print';

    const scope = await schoolNameNeedlesForCaller(admin, caller);
    if (scope === 'none') {
      if (asCsv) {
        return new NextResponse(toCsv([]), {
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="rillcod-customer-book-${new Date().toISOString().slice(0, 10)}.csv"`,
          },
        });
      }
      if (asPrint) {
        return new NextResponse('<!DOCTYPE html><html><body><p>No contacts in your school scope.</p></body></html>', {
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
      }
      return NextResponse.json({ data: [], total: 0 });
    }

    let query = admin
      .from('customer_contact_book')
      .select('*')
      .order('confirmed_at', { ascending: false })
      .limit(500);

    if (role !== 'all') query = query.eq('role', role);
    if (source !== 'all') query = query.eq('source', source);
    if (school.trim()) query = query.ilike('school_name', `%${school.trim()}%`);
    if (className.trim()) query = query.ilike('class_name', `%${className.trim()}%`);
    if (q.trim()) query = query.or(`full_name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    let rows = data ?? [];
    if (scope !== 'all') {
      rows = rows.filter((r) => rowMatchesSchoolNames(r, scope));
    }

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
<div class="footer">Rillcod Technologies · 26 Ogiesoba Avenue, GRA, Benin City · ${brandContact.phone} · rillcod.com</div>
<script>window.onload=()=>window.print()</script>
</body></html>`;
      return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }

    return NextResponse.json({ data: rows, total: rows.length });
  } catch (e) {
    return crmAuthErrorResponse(e);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { caller, db: admin } = await requireCustomerBookCaller();
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const targetId = typeof body.target_id === 'string' ? body.target_id : '';
    const sourceId = typeof body.source_id === 'string' ? body.source_id : '';
    if (!targetId || !sourceId || targetId === sourceId) {
      return NextResponse.json({ error: 'source_id and target_id are required and must differ' }, { status: 400 });
    }

    const targetAccess = await assertCrmContactAccess(admin, caller, targetId);
    const sourceAccess = await assertCrmContactAccess(admin, caller, sourceId);
    if (!targetAccess.ok) return NextResponse.json({ error: targetAccess.error }, { status: targetAccess.status });
    if (!sourceAccess.ok) return NextResponse.json({ error: sourceAccess.error }, { status: sourceAccess.status });
    if (targetAccess.kind !== 'book' || sourceAccess.kind !== 'book') {
      return NextResponse.json({ error: 'Both records must be customer-book contacts' }, { status: 400 });
    }

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

    await repointCrmContactIds(admin, source.id, target.id);

    const { error: deleteErr } = await admin.from('customer_contact_book').delete().eq('id', source.id);
    if (deleteErr) return NextResponse.json({ error: deleteErr.message }, { status: 500 });

    return NextResponse.json({ success: true, merged_into: target.id, removed: source.id });
  } catch (e) {
    return crmAuthErrorResponse(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { caller, db: admin } = await requireCustomerBookCaller();
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const { full_name, email, phone, role, school_name, class_name } = body as Record<string, string>;

    if (!full_name?.trim()) {
      return NextResponse.json({ error: 'full_name is required' }, { status: 400 });
    }

    let resolvedSchoolName = school_name?.trim() || null;
    if (caller.role !== 'admin') {
      const scope = await schoolNameNeedlesForCaller(admin, caller);
      if (scope === 'none' || scope === 'all') {
        return NextResponse.json({ error: 'No school assignment' }, { status: 403 });
      }
      if (resolvedSchoolName) {
        if (!rowMatchesSchoolNames({ school_name: resolvedSchoolName }, scope)) {
          return NextResponse.json({ error: 'School is outside your assignment' }, { status: 403 });
        }
      } else {
        resolvedSchoolName = scope[0];
      }
    }

    const now = new Date().toISOString();
    const { data, error } = await admin
      .from('customer_contact_book')
      .insert({
        full_name: full_name.trim(),
        email: email?.trim().toLowerCase() || null,
        phone: phone?.trim() || null,
        role: role || 'parent',
        school_name: resolvedSchoolName,
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
  } catch (e) {
    return crmAuthErrorResponse(e);
  }
}
