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
  const { data: profile } = await supabase
    .from('portal_users')
    .select('id, role')
    .eq('id', user.id)
    .single();
  if (!profile || profile.role === 'student') return null;
  return profile;
}

// POST /api/announcements — create announcement (staff only)
export async function POST(request: NextRequest) {
  const caller = await requireStaff();
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json();
  const { title, content, target_audience } = body;

  if (!title?.trim() || !content?.trim())
    return NextResponse.json({ error: 'title and content are required' }, { status: 400 });

  const admin = adminClient();
  const { data, error } = await admin
    .from('announcements')
    .insert({
      title: title.trim(),
      content: content.trim(),
      target_audience: target_audience || 'all',
      author_id: caller.id,
      is_active: true,
    })
    .select('*, portal_users!announcements_author_id_fkey(full_name)')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
