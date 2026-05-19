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

// GET /api/crm/contacts?search=&role=all&stage=&limit=80
export async function GET(req: NextRequest) {
  try {
    const { profile, db } = await requireCrmStaff();
    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search') || '';
    const role = searchParams.get('role') || 'all';
    const limit = Math.min(parseInt(searchParams.get('limit') || '80'), 200);

    let q = db.from('portal_users')
      .select('id, full_name, email, phone, role, school_name, school_id, section_class, is_active, created_at, metadata')
      .eq('is_active', true)
      .order('full_name');

    if (search) q = q.ilike('full_name', `%${search}%`);
    if (role !== 'all' && role !== 'external') q = q.eq('role', role);

    if (profile.role === 'teacher' && profile.school_id) {
      q = q.eq('school_id', profile.school_id);
    }

    const { data: portalUsers } = await q.limit(limit);

    // Fetch pipeline stages for all portal users in one query
    const ids = (portalUsers || []).map((u: any) => u.id);
    let stageMap: Record<string, string> = {};
    if (ids.length > 0) {
      const { data: pipes } = await db
        .from('crm_pipeline')
        .select('contact_id, stage')
        .in('contact_id', ids);
      (pipes || []).forEach((p: any) => { stageMap[p.contact_id] = p.stage; });
    }

    const contacts = (portalUsers || []).map((u: any) => ({ ...u, pipeline_stage: stageMap[u.id] }));

    // External WA contacts
    let external: any[] = [];
    if (role === 'all' || role === 'external') {
      let waQ = db.from('whatsapp_conversations')
        .select('id, contact_name, phone_number, last_message_at')
        .is('portal_user_id', null)
        .order('last_message_at', { ascending: false });
      if (search) waQ = waQ.ilike('contact_name', `%${search}%`);
      const { data: waContacts } = await waQ.limit(50);
      external = (waContacts || []).map(c => ({
        id: c.id,
        full_name: c.contact_name || c.phone_number,
        phone: c.phone_number,
        role: 'external',
        source: 'whatsapp',
        last_message_at: c.last_message_at,
      }));
    }

    return NextResponse.json({ contacts: [...contacts, ...external] });
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
