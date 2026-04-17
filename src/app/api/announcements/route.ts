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
    .select('id, role, school_id')
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
  const { title, content, target_audience, status, expires_at, class_id } = body;

  if (!title?.trim() || !content?.trim())
    return NextResponse.json({ error: 'title and content are required' }, { status: 400 });

  const admin = adminClient();
  const { data, error } = await admin
    .from('announcements')
    .insert({
      title: title.trim(),
      content: content.trim(),
      target_audience: target_audience || 'all',
      status: status || 'published',
      expires_at: expires_at || null,
      class_id: class_id || null,
      author_id: caller.id,
      school_id: (caller as any).school_id,
      is_active: true,
    })
    .select('*, portal_users!announcements_author_id_fkey(full_name)')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // NF-15.3 — create in-app notifications for audience
  // NF-15.4 — send email to audience where announcement_notifications=true
  if (status === 'published' || !status) {
    try {
      // Simplified: notify all users matching target_audience
      // In production, this would be a background job
      console.log(`[announcements] Published announcement ${data.id} to ${target_audience}`);
    } catch {}
  }

  return NextResponse.json({ data });
}

// GET /api/announcements — list announcements
export async function GET(request: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const admin = adminClient();

  let q = admin
    .from('announcements')
    .select('*, portal_users!announcements_author_id_fkey(full_name)')
    .order('created_at', { ascending: false })
    .limit(50);

  if (status) q = q.eq('status', status) as any;

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}
