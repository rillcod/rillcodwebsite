import { NextRequest, NextResponse } from 'next/server';
import { generateTempPassword } from '@/lib/utils/password';
import { isTeacherIsolationOn } from '@/lib/server/teacher-scope';
import { crmAuthErrorResponse, requireCrmStaff } from '@/lib/crm/auth';
import { upsertCrmPipeline } from '@/lib/crm/pipeline';
import {
  assertCrmContactAccess,
  getCallerSchoolIds,
  getIsolatedTeacherContactIds,
  normalizeCrmStage,
  schoolNameNeedlesForCaller,
  rowMatchesSchoolNames,
} from '@/lib/crm/scope';
import { mergeContactMetadata } from '@/lib/supabase/json';
import { contactMatchesStage, computeCrmStageCounts } from '@/lib/crm/ui';
import type { CrmPipelineStage } from '@/lib/crm/stages';

const EMPTY_ID = '00000000-0000-0000-0000-000000000000';

function buildStageCounts(contacts: { pipeline_stage?: string | null }[]) {
  const counts: Record<string, number> = { all: contacts.length };
  for (const c of contacts) {
    const s = c.pipeline_stage || 'prospect';
    counts[s] = (counts[s] || 0) + 1;
  }
  return counts;
}

// GET /api/crm/contacts?search=&role=all|parent|student|external|lead|everyone&stage=all|prospect|...&format=json|print|csv
export async function GET(req: NextRequest) {
  try {
    const { caller, db } = await requireCrmStaff();
    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search') || '';
    const role = searchParams.get('role') || 'all';
    const stageParam = searchParams.get('stage') || 'all';
    const stageFilter: CrmPipelineStage | 'all' =
      stageParam === 'all' ? 'all' : normalizeCrmStage(stageParam);
    const format = searchParams.get('format') || 'json';
    const limit = Math.min(parseInt(searchParams.get('limit') || '100'), format === 'json' ? 300 : 3000);

    const isPrimary = role === 'all' || role === 'parent' || role === 'student';
    const isEveryone = role === 'everyone';

    let q = db.from('portal_users')
      .select('id, full_name, email, phone, role, school_name, school_id, section_class, is_active, created_at, metadata')
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (isPrimary) {
      if (role === 'parent') q = q.eq('role', 'parent');
      else if (role === 'student') q = q.eq('role', 'student');
      else q = q.in('role', ['parent', 'student', 'school']);
      q = q.not('phone', 'is', null).neq('phone', '');
    } else if (!isEveryone && role !== 'external' && role !== 'lead') {
      q = q.eq('role', role);
    }

    if (search) q = q.ilike('full_name', `%${search}%`);

    if (caller.role === 'teacher') {
      const isolated = await isTeacherIsolationOn(db);
      if (isolated) {
        const idSet = await getIsolatedTeacherContactIds(db, caller.id);
        q = q.in('id', idSet.size ? Array.from(idSet) : [EMPTY_ID]);
      } else {
        const schoolIds = await getCallerSchoolIds(db, caller);
        const ids = schoolIds === 'all' ? null : schoolIds;
        q = q.in('school_id', ids?.length ? ids : [EMPTY_ID]);
      }
    }

    // Skip portal query when only leads/externals requested
    const skipPortal = role === 'external' || role === 'lead';
    const { data: portalUsers } = skipPortal ? { data: [] as any[] } : await q.limit(limit);

    const ids = (portalUsers || []).map((u: any) => u.id);
    const stageMap: Record<string, string> = {};
    if (ids.length > 0) {
      const { data: pipes } = await db.from('crm_pipeline').select('contact_id, stage').in('contact_id', ids);
      (pipes || []).forEach((p: any) => { stageMap[p.contact_id] = p.stage; });
    }

    let contacts: any[] = (portalUsers || []).map((u: any) => ({
      ...u,
      pipeline_stage: normalizeCrmStage(stageMap[u.id]),
      _type: 'portal',
    }));

    const isSystemEmail = (e?: string | null) => {
      const x = (e || '').trim().toLowerCase();
      return x.endsWith('@rillcod.com') || x.endsWith('@noemail.local');
    };
    contacts = contacts.filter((c: any) => !isSystemEmail(c.email));

    const parentContacts = contacts.filter((c) => c.role === 'parent' && c.email);
    if (parentContacts.length > 0) {
      const parentEmails = parentContacts.map((c: any) => c.email as string);
      let studentQ = db
        .from('students')
        .select('parent_email, school_name, school_id, full_name')
        .in('parent_email', parentEmails);
      if (caller.role === 'teacher') {
        const schoolIds = await getCallerSchoolIds(db, caller);
        const ids = schoolIds === 'all' ? null : schoolIds;
        studentQ = studentQ.in('school_id', ids?.length ? ids : [EMPTY_ID]);
      }
      const { data: studentRows } = await studentQ;

      const schoolByEmail: Record<string, { school_name: string; school_id: string }> = {};
      const childCountByEmail: Record<string, number> = {};
      (studentRows || []).forEach((s: any) => {
        const e = s.parent_email;
        if (!e) return;
        childCountByEmail[e] = (childCountByEmail[e] || 0) + 1;
        if (!schoolByEmail[e] && s.school_name) {
          schoolByEmail[e] = { school_name: s.school_name, school_id: s.school_id };
        }
      });

      contacts = contacts.map((c: any) => {
        if (c.role !== 'parent' || !c.email) return c;
        const schoolFill = !c.school_name && schoolByEmail[c.email] ? schoolByEmail[c.email] : {};
        return { ...c, ...schoolFill, children_count: childCountByEmail[c.email] || 0 };
      });
    }

    let external: any[] = [];
    if (caller.role === 'admin' && (role === 'all' || role === 'external')) {
      let waQ = db.from('whatsapp_conversations')
        .select('id, contact_name, phone_number, last_message_at')
        .is('portal_user_id', null)
        .not('phone_number', 'is', null)
        .order('last_message_at', { ascending: false });
      if (search) waQ = waQ.ilike('contact_name', `%${search}%`);
      const { data: waContacts } = await waQ.limit(80);
      external = (waContacts || []).map((c) => ({
        id: c.id,
        full_name: c.contact_name || c.phone_number,
        phone: c.phone_number,
        role: 'external',
        source: 'whatsapp',
        last_message_at: c.last_message_at,
        _type: 'external',
      }));
    }

    let bookLeads: any[] = [];
    if (role === 'all' || role === 'lead' || role === 'external') {
      let bookQ = db
        .from('customer_contact_book')
        .select('id, full_name, email, phone, role, school_name, class_name, source, confirmed_at, created_at, metadata')
        .order('confirmed_at', { ascending: false })
        .limit(300);
      if (search) bookQ = bookQ.or(`full_name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`) as any;

      const { data: rawBookRows } = await bookQ;
      let bookRows = rawBookRows || [];

      const needles = await schoolNameNeedlesForCaller(db, caller);
      if (needles === 'none') bookRows = [];
      else if (needles !== 'all') {
        bookRows = bookRows.filter((b: any) => rowMatchesSchoolNames(b, needles));
      }
      bookRows = bookRows.slice(0, 150);

      const bookIds = bookRows.map((b: any) => b.id);
      const bookStage: Record<string, string> = {};
      if (bookIds.length) {
        const { data: pipes } = await db.from('crm_pipeline').select('contact_id, stage').in('contact_id', bookIds);
        (pipes || []).forEach((p: any) => { bookStage[p.contact_id] = p.stage; });
      }
      const portalEmails = new Set(
        contacts.map((c: any) => String(c.email || '').trim().toLowerCase()).filter(Boolean),
      );
      bookLeads = bookRows
        .filter((b: any) => {
          const e = String(b.email || '').trim().toLowerCase();
          return !e || !portalEmails.has(e);
        })
        .map((b: any) => ({
          id: b.id,
          full_name: b.full_name,
          email: b.email,
          phone: b.phone,
          role: 'lead',
          school_name: b.school_name,
          section_class: b.class_name,
          source: b.source || 'contact_book',
          pipeline_stage: normalizeCrmStage(bookStage[b.id]),
          created_at: b.confirmed_at || b.created_at,
          metadata: b.metadata,
          _type: 'book',
          children_count: Array.isArray(b.metadata?.children) ? b.metadata.children.length : 0,
        }));
    }

    const allContacts = [...contacts, ...bookLeads, ...external];
    const stage_counts = buildStageCounts(allContacts);
    const exportContacts =
      stageFilter === 'all'
        ? allContacts
        : allContacts.filter(c => contactMatchesStage(c.pipeline_stage, stageFilter));

    if (format === 'csv') {
      const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const header = ['#', 'Name', 'Email', 'Phone', 'Role', 'School', 'Class', 'Pipeline'];
      const rows = exportContacts.map((c, i) => [
        i + 1, c.full_name, c.email || '', c.phone || c.phone_number || '',
        c.role, c.school_name || '', c.section_class || '', c.pipeline_stage || 'prospect',
      ].map(esc).join(','));
      const csv = '﻿' + [header.join(','), ...rows].join('\n');
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="crm-contacts-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      });
    }

    if (format === 'print') {
      const date = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
      const rowsHtml = exportContacts.map((c, i) => `
        <tr>
          <td>${i + 1}</td>
          <td><strong>${c.full_name ?? '—'}</strong></td>
          <td>${c.email ?? '—'}</td>
          <td>${c.phone || c.phone_number || '—'}</td>
          <td>${c.role ?? '—'}</td>
          <td>${c.school_name ?? '—'}</td>
          <td>${c.section_class ?? '—'}</td>
          <td>${c.pipeline_stage ?? 'prospect'}</td>
        </tr>`).join('');
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>CRM Directory — Rillcod Technologies</title>
<style>
  body{font-family:Arial,sans-serif;font-size:11px;margin:20px;color:#111}
  h1{font-size:18px;margin-bottom:2px}.sub{font-size:11px;color:#666;margin-bottom:16px}
  table{width:100%;border-collapse:collapse;page-break-inside:auto}
  th{background:#09090b;color:#f5a623;font-size:9px;text-transform:uppercase;letter-spacing:.08em;padding:6px 8px;text-align:left}
  td{padding:5px 8px;border-bottom:1px solid #eee;vertical-align:top}
  tr:nth-child(even) td{background:#fafafa}
  .footer{margin-top:20px;font-size:9px;color:#999;border-top:1px solid #eee;padding-top:8px}
  @media print{@page{size:A4 landscape;margin:15mm}}
</style></head><body>
<h1>Rillcod Technologies — CRM Contact Directory</h1>
<p class="sub">Generated: ${date} · ${exportContacts.length} contacts</p>
<table><thead><tr>
  <th>#</th><th>Name</th><th>Email</th><th>Phone</th><th>Role</th><th>School</th><th>Class</th><th>Pipeline</th>
</tr></thead><tbody>${rowsHtml}</tbody></table>
<div class="footer">Rillcod Technologies · Confidential</div>
<script>window.onload=()=>window.print()</script>
</body></html>`;
      return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }

    return NextResponse.json({
      contacts: exportContacts,
      limit,
      truncated: (portalUsers || []).length >= limit,
      stage_counts,
      stats: computeCrmStageCounts(allContacts),
    });
  } catch (e: any) {
    return crmAuthErrorResponse(e);
  }
}

// POST /api/crm/contacts — create a manual contact (portal_users row)
export async function POST(req: NextRequest) {
  try {
    const { caller, db } = await requireCrmStaff();
    const body = await req.json();
    const { full_name, email, phone, role: contactRole = 'parent', school_name, school_id, class_name, tags, notes } = body;

    if (!full_name?.trim()) {
      return NextResponse.json({ error: 'full_name is required' }, { status: 400 });
    }

    if (email) {
      const { data: existing } = await db
        .from('portal_users')
        .select('id, email')
        .eq('email', email.trim().toLowerCase())
        .maybeSingle();
      if (existing) {
        return NextResponse.json({ error: 'A contact with this email already exists', existing_id: existing.id }, { status: 409 });
      }
    }

    let authId: string | null = null;
    if (email) {
      const tempPw = generateTempPassword();
      const { data: authUser, error: authErr } = await db.auth.admin.createUser({
        email: email.trim().toLowerCase(),
        password: tempPw,
        email_confirm: true,
        user_metadata: { full_name: full_name.trim(), role: contactRole },
      });
      if (authErr) return NextResponse.json({ error: authErr.message }, { status: 500 });
      authId = authUser.user?.id ?? null;
    }

    const now = new Date().toISOString();
    const contactId = authId ?? crypto.randomUUID();

    const { data: contact, error: insertErr } = await db.from('portal_users').upsert({
      id: contactId,
      full_name: full_name.trim(),
      email: email ? email.trim().toLowerCase() : null,
      phone: phone?.trim() || null,
      role: contactRole,
      school_name: school_name?.trim() || null,
      school_id: school_id || caller.school_id || null,
      section_class: class_name?.trim() || null,
      is_active: true,
      metadata: { tags: tags || [], notes: notes || '', created_by: caller.id, source: 'manual_crm' },
      created_at: now,
      updated_at: now,
    }).select().single();

    if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });
    return NextResponse.json({ contact }, { status: 201 });
  } catch (e: any) {
    return crmAuthErrorResponse(e);
  }
}

// PUT /api/crm/contacts — update contact details (portal or book)
export async function PUT(req: NextRequest) {
  try {
    const { caller, db } = await requireCrmStaff();
    const body = await req.json();
    const { id, full_name, email, phone, school_name, grade, tags, notes } = body;
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    const access = await assertCrmContactAccess(db, caller, id);
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

    if (access.kind === 'book') {
      const { data, error } = await db.from('customer_contact_book').update({
        ...(full_name !== undefined && { full_name: full_name.trim() }),
        ...(email !== undefined && { email: email?.trim().toLowerCase() || null }),
        ...(phone !== undefined && { phone: phone?.trim() || null }),
        ...(school_name !== undefined && { school_name: school_name?.trim() || null }),
        ...(grade !== undefined && { class_name: grade?.trim() || null }),
        updated_at: new Date().toISOString(),
      }).eq('id', id).select().single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ contact: data });
    }

    if (access.kind !== 'portal') {
      return NextResponse.json({ error: 'Cannot edit this contact type here' }, { status: 400 });
    }

    let metadataUpdate = undefined as ReturnType<typeof mergeContactMetadata> | undefined;
    if (tags !== undefined || notes !== undefined) {
      const { data: existing } = await db.from('portal_users').select('metadata').eq('id', id).single();
      metadataUpdate = mergeContactMetadata((existing as any)?.metadata, { tags, notes });
    }

    const { data, error } = await (db as any).from('portal_users').update({
      ...(full_name !== undefined && { full_name: full_name.trim() }),
      ...(email !== undefined && { email: email?.trim().toLowerCase() || null }),
      ...(phone !== undefined && { phone: phone?.trim() || null }),
      ...(school_name !== undefined && { school_name: school_name?.trim() || null }),
      ...(grade !== undefined && { grade: grade?.trim() || null }),
      ...(metadataUpdate !== undefined && { metadata: metadataUpdate }),
      updated_at: new Date().toISOString(),
    }).eq('id', id).select().single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ contact: data });
  } catch (e: any) {
    return crmAuthErrorResponse(e);
  }
}

// PATCH /api/crm/contacts — update pipeline stage
export async function PATCH(req: NextRequest) {
  try {
    const { caller, db } = await requireCrmStaff();
    const body = await req.json();
    const { contact_id, contact_type, contact_name, stage, pipeline_notes } = body;

    if (!contact_id || !stage) {
      return NextResponse.json({ error: 'contact_id and stage are required' }, { status: 400 });
    }

    const access = await assertCrmContactAccess(db, caller, contact_id);
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

    const next = await upsertCrmPipeline(db, {
      contactId: contact_id,
      contactName: contact_name || access.row.full_name || access.row.contact_name || 'Contact',
      contactType: contact_type || (access.kind === 'book' ? 'form_lead' : access.kind === 'whatsapp' ? 'external' : 'portal_user'),
      stage,
      promoteOnly: false,
      pipelineNotes: pipeline_notes ?? null,
      updatedBy: caller.id,
      updatedByName: caller.full_name ?? null,
    });

    return NextResponse.json({ success: true, stage: next });
  } catch (e: any) {
    return crmAuthErrorResponse(e);
  }
}
