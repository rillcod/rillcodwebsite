import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function requireAdmin() {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const { data: profile } = await supabase
    .from('portal_users')
    .select('id, role')
    .eq('id', user.id)
    .single();
  if (!profile || profile.role !== 'admin') return null;
  return profile;
}

// POST /api/timetables — create timetable (admin only)
export async function POST(request: NextRequest) {
  const caller = await requireAdmin();
  if (!caller) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

  const body = await request.json();
  const { title, section, academic_year, term, school_id, is_active } = body;
  if (!title?.trim()) return NextResponse.json({ error: 'Title is required' }, { status: 400 });

  const admin = adminClient();
  const { data, error } = await admin
    .from('timetables')
    .insert({
      title: title.trim(),
      section: section || null,
      academic_year: academic_year || null,
      term: term || null,
      school_id: school_id || null,
      is_active: is_active ?? true,
      created_by: caller.id,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
