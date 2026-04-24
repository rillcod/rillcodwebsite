import { createClient } from '@supabase/supabase-js';
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

// GET /api/crm/interactions?contact_id=xxx&limit=50
export async function GET(req: NextRequest) {
  try {
    const { db } = await requireCrmStaff();
    const { searchParams } = new URL(req.url);
    const contact_id = searchParams.get('contact_id');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);

    let q = db.from('crm_interactions').select('*').order('created_at', { ascending: false }).limit(limit);
    if (contact_id) q = q.eq('contact_id', contact_id);

    const { data, error } = await q;
    if (error) throw error;
    return NextResponse.json({ interactions: data || [] });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.message === 'Unauthorized' ? 401 : e.message === 'Forbidden' ? 403 : 500 });
  }
}

// POST /api/crm/interactions
export async function POST(req: NextRequest) {
  try {
    const { profile, db } = await requireCrmStaff();
    const body = await req.json();
    const { contact_id, contact_type, contact_name, type = 'note', direction = 'outbound', content } = body;

    if (!contact_id || !contact_name || !content?.trim()) {
      return NextResponse.json({ error: 'contact_id, contact_name and content are required' }, { status: 400 });
    }

    const { data, error } = await db.from('crm_interactions').insert({
      contact_id, contact_type: contact_type || 'portal_user', contact_name, type, direction,
      content: content.trim(), staff_id: profile.id, staff_name: profile.full_name,
    }).select().single();

    if (error) throw error;
    return NextResponse.json({ interaction: data }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.message === 'Unauthorized' ? 401 : e.message === 'Forbidden' ? 403 : 500 });
  }
}

// DELETE /api/crm/interactions?id=xxx
export async function DELETE(req: NextRequest) {
  try {
    const { db } = await requireCrmStaff();
    const id = new URL(req.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    const { error } = await db.from('crm_interactions').delete().eq('id', id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.message === 'Unauthorized' ? 401 : e.message === 'Forbidden' ? 403 : 500 });
  }
}
