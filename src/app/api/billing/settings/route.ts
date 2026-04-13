import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

async function getCaller() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from('portal_users')
    .select('id, role, school_id')
    .eq('id', user.id)
    .single();
  return data ?? null;
}

// GET /api/billing/settings?school_id=...
export async function GET(request: Request) {
  const caller = await getCaller();
  if (!caller || !['admin', 'school', 'teacher'].includes(caller.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const schoolIdParam = searchParams.get('school_id');
  const schoolId = caller.role === 'admin' ? schoolIdParam : caller.school_id;
  if (!schoolId) return NextResponse.json({ data: null });

  const db = createAdminClient();
  const { data, error } = await db
    .from('billing_contacts')
    .select('*, schools(id, name, email, phone)')
    .eq('school_id', schoolId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? null });
}

// POST /api/billing/settings
export async function POST(request: Request) {
  const caller = await getCaller();
  if (!caller || !['admin', 'school', 'teacher'].includes(caller.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const school_id = caller.role === 'admin' ? body.school_id : caller.school_id;
  if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 });

  const payload = {
    school_id,
    representative_name: body.representative_name ?? null,
    representative_email: body.representative_email ?? null,
    representative_whatsapp: body.representative_whatsapp ?? null,
    teacher_id: body.teacher_id ?? null,
    notes: body.notes ?? null,
    updated_at: new Date().toISOString(),
  };

  const db = createAdminClient();
  const { data, error } = await db
    .from('billing_contacts')
    .upsert(payload, { onConflict: 'school_id' })
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

