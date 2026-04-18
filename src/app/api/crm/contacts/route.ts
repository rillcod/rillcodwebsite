import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

async function requireStaff() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error('Unauthorized');
  const db = createAdminClient();
  const { data: profile } = await db.from('portal_users').select('id, role, full_name, school_id').eq('id', user.id).single();
  if (!profile || !['admin', 'teacher', 'school'].includes(profile.role)) throw new Error('Forbidden');
  return { profile, db };
}

// GET /api/crm/contacts?search=xxx&role=all&limit=50
export async function GET(req: NextRequest) {
  try {
    const { profile, db } = await requireStaff();
    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search') || '';
    const role = searchParams.get('role') || 'all';
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200);

    // Portal users
    let q = db.from('portal_users')
      .select('id, full_name, email, phone, role, school_name, school_id, is_active, created_at')
      .eq('is_active', true)
      .order('full_name');

    if (search) q = q.ilike('full_name', `%${search}%`);
    if (role !== 'all') q = q.eq('role', role);

    // Teachers and school roles scoped to their school
    if (profile.role === 'teacher' && profile.school_id) {
      q = q.eq('school_id', profile.school_id);
    }

    const { data: portalUsers } = await q.limit(limit);

    // External WA contacts (phone only, no portal account)
    let waQ = db.from('whatsapp_conversations')
      .select('id, contact_name, phone_number, last_message_at')
      .is('portal_user_id', null)
      .order('last_message_at', { ascending: false });

    if (search) waQ = waQ.ilike('contact_name', `%${search}%`);

    const { data: waContacts } = await waQ.limit(50);

    const external = (waContacts || []).map(c => ({
      id: c.id,
      full_name: c.contact_name || c.phone_number,
      phone: c.phone_number,
      role: 'external',
      source: 'whatsapp',
      last_message_at: c.last_message_at,
    }));

    return NextResponse.json({
      contacts: [...(portalUsers || []), ...(role === 'all' || role === 'external' ? external : [])],
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.message === 'Unauthorized' ? 401 : 500 });
  }
}

// PATCH /api/crm/contacts — update pipeline stage
export async function PATCH(req: NextRequest) {
  try {
    const { profile, db } = await requireStaff();
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
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
