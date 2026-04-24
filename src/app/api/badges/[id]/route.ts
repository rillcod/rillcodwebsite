import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

async function getUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('portal_users').select('role, school_id').eq('id', user.id).single();
  return data ? { ...user, role: data.role, school_id: data.school_id } : null;
}

// GET /api/badges/[id] — get badge detail + who earned it
export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await context.params;
  const db = createAdminClient();

  const [badgeRes, earnerRes] = await Promise.all([
    db.from('badges').select('*').eq('id', id).single(),
    db.from('user_badges').select('*, portal_users(id, full_name, email, role)').eq('badge_id', id).order('awarded_at', { ascending: false }),
  ]);

  if (badgeRes.error) return NextResponse.json({ error: badgeRes.error.message }, { status: 500 });
  if (!badgeRes.data) return NextResponse.json({ error: 'Badge not found' }, { status: 404 });

  return NextResponse.json({ data: badgeRes.data, earners: earnerRes.data ?? [] });
}

// PATCH /api/badges/[id] — update badge (admin only)
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await context.params;
  const body = await request.json();
  const db = createAdminClient();

  const { data, error } = await db.from('badges').update({ ...body, updated_at: new Date().toISOString() } as any).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

// DELETE /api/badges/[id] — soft-delete (admin only)
export async function DELETE(_req: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await context.params;
  const db = createAdminClient();

  const { error } = await db.from('badges').update({ is_active: false } as any).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
