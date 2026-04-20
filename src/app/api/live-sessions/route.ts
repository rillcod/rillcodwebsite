import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { notifySessionScheduled } from '@/lib/live-session-notify';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function requireAuth() {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const { data: profile } = await supabase
    .from('portal_users')
    .select('id, role, school_id')
    .eq('id', user.id)
    .single();
  return profile;
}

// GET /api/live-sessions — list all sessions (role-filtered)
export async function GET(request: NextRequest) {
  const caller = await requireAuth();
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = adminClient();
  let query = admin
    .from('live_sessions')
    .select('*, program:programs(name), host:portal_users!live_sessions_host_id_fkey(full_name, role)')
    .order('scheduled_at', { ascending: true });

  if ((caller.role === 'school' || caller.role === 'student') && caller.school_id) {
    query = query.or(`school_id.eq.${caller.school_id},school_id.is.null`);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

// POST /api/live-sessions — create session (staff only)
export async function POST(request: NextRequest) {
  const caller = await requireAuth();
  if (!caller || !['admin', 'teacher'].includes(caller.role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json();
  const {
    title, description, platform, session_url,
    scheduled_at, duration_minutes, school_id,
    program_id, status, recording_url, notes,
  } = body;

  if (!title?.trim()) return NextResponse.json({ error: 'Title is required' }, { status: 400 });

  const admin = adminClient();
  const { data, error } = await admin
    .from('live_sessions')
    .insert({
      title: title.trim(),
      description: description?.trim() || null,
      platform: platform ?? 'zoom',
      session_url: session_url?.trim() || null,
      scheduled_at,
      duration_minutes: Number(duration_minutes) || 60,
      school_id: school_id || null,
      program_id: program_id || null,
      status: status ?? 'scheduled',
      recording_url: recording_url?.trim() || null,
      notes: notes?.trim() || null,
      host_id: caller.id,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
