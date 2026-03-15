import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function requireStaff() {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const { data: caller } = await adminClient()
    .from('portal_users').select('role, id').eq('id', user.id).single();
  if (!caller || !['admin', 'school'].includes(caller.role)) return null;
  return caller;
}

// GET /api/programs — list all programs
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const isActiveParam = searchParams.get('is_active');

    let query = adminClient()
      .from('programs')
      .select('*, courses ( id, title, is_active )')
      .order('created_at', { ascending: false });

    if (isActiveParam !== null) {
      query = query.eq('is_active', isActiveParam === 'true') as any;
    }

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 });
  }
}

// POST /api/programs — create program
export async function POST(request: NextRequest) {
  try {
    const caller = await requireStaff();
    if (!caller) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

    const body = await request.json();
    const { name, description, duration_weeks, difficulty_level, price, max_students, is_active } = body;

    if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });

    const { data, error } = await adminClient()
      .from('programs')
      .insert({
        name: name.trim(),
        description: description || null,
        duration_weeks: duration_weeks || null,
        difficulty_level: difficulty_level || 'beginner',
        price: price ?? 0,
        max_students: max_students || null,
        is_active: is_active ?? true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 });
  }
}
