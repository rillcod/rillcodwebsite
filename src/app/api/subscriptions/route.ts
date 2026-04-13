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

// GET /api/subscriptions — list subscriptions
export async function GET(request: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const schoolId = searchParams.get('school_id');
  const status = searchParams.get('status');
  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);
  const offset = (page - 1) * limit;

  const db = createAdminClient();

  let query = db.from('subscriptions').select(`
    *, schools(id, name, email, status)
  `, { count: 'exact' }).order('created_at', { ascending: false }).range(offset, offset + limit - 1);

  if (user.role !== 'admin') {
    // Non-admins can only view their own school's subscription
    if (!user.school_id) return NextResponse.json({ data: [], total: 0 });
    query = query.eq('school_id', user.school_id);
  } else {
    if (schoolId) query = query.eq('school_id', schoolId);
  }

  if (status) query = query.eq('status', status);

  const { data, count, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [], total: count ?? 0, page, limit });
}

// POST /api/subscriptions — create subscription (admin only)
export async function POST(request: Request) {
  const user = await getUser();
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json();
  const { school_id, plan_name, plan_type, billing_cycle, amount, currency, start_date, end_date, features, max_students, max_teachers } = body;

  if (!school_id || !plan_name || !billing_cycle) {
    return NextResponse.json({ error: 'school_id, plan_name, and billing_cycle required' }, { status: 400 });
  }

  const db = createAdminClient();
  const { data, error } = await db.from('subscriptions').insert([{
    school_id, plan_name, plan_type: plan_type || 'standard', billing_cycle,
    amount: amount || 0, currency: currency || 'NGN',
    start_date: start_date || new Date().toISOString(),
    end_date: end_date || null,
    features: features || {},
    max_students: max_students || null,
    max_teachers: max_teachers || null,
    status: 'active',
  } as any]).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
