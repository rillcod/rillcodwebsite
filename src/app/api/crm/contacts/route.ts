import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isCrmPlatformRole } from '@/lib/server/api-rbac';

async function requireCrmStaff() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error('Unauthorized');
  const db = createAdminClient();
  const { data: profile } = await db.from('portal_users').select('id, role, full_name, school_id').eq('id', user.id).single();
  if (!profile || !isCrmPlatformRole(profile.role)) throw new Error('Forbidden');
  return { profile, db };
}

// GET /api/crm/contacts?search=&role=all|parent|student|external|everyone&format=json|print|csv
//
// role=all (default) — parents + students who have a phone number on file
// role=parent        — parents with a phone number
// role=student       — students with a phone number
// role=external      — unlinked WhatsApp conversations
// role=everyone      — all portal_users regardless of role or phone (admin view)
export async function GET(req: NextRequest) {
  try {
    const { profile, db } = await requireCrmStaff();
    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search') || '';
    const role = searchParams.get('role') || 'all';
    const format = searchParams.get('format') || 'json';
    const limit = Math.min(parseInt(searchParams.get('limit') || '100'), format === 'json' ? 300 : 3000);

    // Primary CRM targets: parents + students with actual phone numbers
    const isPrimary = role === 'all' || role === 'parent' || role === 'student';
    const isEveryone = role === 'everyone';

    let q = db.from('portal_users')
      .select('id, full_name, email, phone, role, school_name, school_id, section_class, is_active, created_at, metadata')
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (isPrimary) {
      // Restrict to parents and/or students, and require a real phone number
      if (role === 'parent') {
        q = q.eq('role', 'parent');
      } else if (role === 'student') {
        q = q.eq('role', 'student');
      } else {
        // role === 'all': parents, students, and school owners with a phone
        q = q.in('role', ['parent', 'student', 'school']);
      }
      q = q.not('phone', 'is', null).neq('phone', '');
    } else if (!isEveryone && role !== 'external') {
      // Explicit single role requested (e.g. teacher, school)
      q = q.eq('role', role);
    }
    // isEveryone → no role filter, no phone filter

    if (search) q = q.ilike('full_name', `%${search}%`);

    if (profile.role === 'teacher' && profile.school_id) {
      q = q.eq('school_id', profile.school_id);
    }

    const { data: portalUsers } = await q.limit(limit);

    // Fetch pipeline stages in one query
    const ids = (portalUsers || []).map((u: any) => u.id);
    let stageMap: Record<string, string> = {};
    if (ids.length > 0) {
      const { data: pipes } = await db
        .from('crm_pipeline')
        .select('contact_id, stage')
        .in('contact_id', ids);
      (pipes || []).forEach((p: any) => { stageMap[p.contact_id] = p.stage; });
    }

    let contacts: any[] = (portalUsers || []).map((u: any) => ({ ...u, pipeline_stage: stageMap[u.id] }));

    // CRM carries GENUINE, contactable people only — exclude system-generated student
    // logins (e.g. mike123@rillcod.com) and no-email placeholders (@noemail.local), so
    // staff always know these are real records to contact. Phone-only contacts (no
    // email) are kept. The auto-generated logins live in the operational Records sheet
    // (/dashboard/records → Registrations & Logins), not here.
    const isSystemEmail = (e?: string | null) => {
      const x = (e || '').trim().toLowerCase();
      return x.endsWith('@rillcod.com') || x.endsWith('@noemail.local');
    };
    contacts = contacts.filter((c: any) => !isSystemEmail(c.email));

    // Enrich parents: resolve school_name from their linked students (consent-form flow)
    // and compute children_count. One query covers both.
    const parentContacts = contacts.filter(c => c.role === 'parent' && c.email);
    if (parentContacts.length > 0) {
      const parentEmails = parentContacts.map((c: any) => c.email as string);
      const { data: studentRows } = await db
        .from('students')
        .select('parent_email, school_name, school_id, full_name')
        .in('parent_email', parentEmails);

      // Build per-email: first school found + count of children
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

    // External WA contacts — unlinked conversations with a phone number
    let external: any[] = [];
    if (role === 'all' || role === 'external') {
      let waQ = db.from('whatsapp_conversations')
        .select('id, contact_name, phone_number, last_message_at')
        .is('portal_user_id', null)
        .not('phone_number', 'is', null)
        .order('last_message_at', { ascending: false });
      if (search) waQ = waQ.ilike('contact_name', `%${search}%`);
      const { data: waContacts } = await waQ.limit(80);
      external = (waContacts || []).map(c => ({
        id: c.id,
        full_name: c.contact_name || c.phone_number,
        phone: c.phone_number,
        role: 'external',
        source: 'whatsapp',
        last_message_at: c.last_message_at,
      }));
    }

    const allContacts = [...contacts, ...external];

    if (format === 'csv') {
      const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const header = ['#', 'Name', 'Email', 'Phone', 'Role', 'School', 'Class', 'Pipeline'];
      const rows = allContacts.map((c, i) => [
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
      const rowsHtml = allContacts.map((c, i) => `
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
<p class="sub">Generated: ${date} · ${allContacts.length} contacts</p>
<table><thead><tr>
  <th>#</th><th>Name</th><th>Email</th><th>Phone</th><th>Role</th><th>School</th><th>Class</th><th>Pipeline</th>
</tr></thead><tbody>${rowsHtml}</tbody></table>
<div class="footer">Rillcod Technologies · 26 Ogiesoba Avenue, GRA, Benin City · +234 811 660 0091 · rillcod.com</div>
<script>window.onload=()=>window.print()</script>
</body></html>`;
      return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }

    return NextResponse.json({ contacts: allContacts });
  } catch (e: any) {
    const msg = e.message as string;
    return NextResponse.json({ error: msg }, { status: msg === 'Unauthorized' ? 401 : msg === 'Forbidden' ? 403 : 500 });
  }
}

// POST /api/crm/contacts — create a manual contact (portal_users row)
export async function POST(req: NextRequest) {
  try {
    const { profile, db } = await requireCrmStaff();
    const body = await req.json();
    const { full_name, email, phone, role: contactRole = 'parent', school_name, school_id, class_name, tags, notes } = body;

    if (!full_name?.trim()) {
      return NextResponse.json({ error: 'full_name is required' }, { status: 400 });
    }

    // Check email uniqueness if provided
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

    // Create auth user only if email provided
    let authId: string | null = null;
    if (email) {
      const tempPw = `Rc@${Math.random().toString(36).slice(2, 10)}`;
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
      school_id: school_id || profile.school_id || null,
      section_class: class_name?.trim() || null,
      is_active: true,
      metadata: { tags: tags || [], notes: notes || '', created_by: profile.id, source: 'manual_crm' },
      created_at: now,
      updated_at: now,
    }).select().single();

    if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });
    return NextResponse.json({ contact }, { status: 201 });
  } catch (e: any) {
    const msg = e.message as string;
    return NextResponse.json({ error: msg }, { status: msg === 'Unauthorized' ? 401 : msg === 'Forbidden' ? 403 : 500 });
  }
}

// PUT /api/crm/contacts — update contact details
export async function PUT(req: NextRequest) {
  try {
    const { db } = await requireCrmStaff();
    const body = await req.json();
    const { id, full_name, email, phone, school_name, grade, tags, notes } = body;
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    // Build updates with only known columns to satisfy Supabase types
    let metadataUpdate: Record<string, unknown> | undefined;
    if (tags !== undefined || notes !== undefined) {
      const { data: existing } = await db.from('portal_users').select('metadata').eq('id', id).single();
      const meta = ((existing as any)?.metadata || {}) as Record<string, unknown>;
      if (tags !== undefined) meta.tags = tags;
      if (notes !== undefined) meta.notes = notes;
      metadataUpdate = meta;
    }

    const { data, error } = await (db as any).from('portal_users').update({
      ...(full_name !== undefined && { full_name: full_name.trim() }),
      ...(email !== undefined && { email: email?.trim().toLowerCase() || null }),
      ...(phone !== undefined && { phone: phone?.trim() || null }),
      ...(school_name !== undefined && { school_name: school_name?.trim() || null }),
      ...(grade !== undefined && { section_class: grade?.trim() || null }),
      ...(metadataUpdate !== undefined && { metadata: metadataUpdate }),
      updated_at: new Date().toISOString(),
    }).eq('id', id).select().single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ contact: data });
  } catch (e: any) {
    const msg = e.message as string;
    return NextResponse.json({ error: msg }, { status: msg === 'Unauthorized' ? 401 : msg === 'Forbidden' ? 403 : 500 });
  }
}

// PATCH /api/crm/contacts — update pipeline stage
export async function PATCH(req: NextRequest) {
  try {
    const { profile, db } = await requireCrmStaff();
    const body = await req.json();
    const { contact_id, contact_type, contact_name, stage, pipeline_notes } = body;

    if (!contact_id || !stage) {
      return NextResponse.json({ error: 'contact_id and stage are required' }, { status: 400 });
    }

    const { data: existing } = await db.from('crm_pipeline').select('id').eq('contact_id', contact_id).maybeSingle();

    const payload = {
      contact_id, contact_type: contact_type || 'portal_user', contact_name,
      stage, pipeline_notes: pipeline_notes || null,
      updated_by: profile.id, updated_by_name: profile.full_name,
      updated_at: new Date().toISOString(),
    };

    if (existing) {
      await db.from('crm_pipeline').update(payload).eq('contact_id', contact_id);
    } else {
      await db.from('crm_pipeline').insert({ ...payload, created_at: new Date().toISOString() });
    }

    return NextResponse.json({ success: true, stage });
  } catch (e: any) {
    const msg = e.message as string;
    return NextResponse.json({ error: msg }, { status: msg === 'Unauthorized' ? 401 : msg === 'Forbidden' ? 403 : 500 });
  }
}
