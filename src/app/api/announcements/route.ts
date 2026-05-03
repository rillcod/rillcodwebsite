import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function getCallerProfile() {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const { data: profile } = await supabase
    .from('portal_users')
    .select('id, role, school_id')
    .eq('id', user.id)
    .single();
  return profile ?? null;
}

// POST /api/announcements — create announcement (admin/teacher/school only)
export async function POST(request: NextRequest) {
  const caller = await getCallerProfile();
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!['admin', 'teacher', 'school'].includes(caller.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const { title, content, target_audience, status, expires_at, class_id } = body;

  if (!title?.trim() || !content?.trim())
    return NextResponse.json({ error: 'title and content are required' }, { status: 400 });

  const admin = adminClient();

  // Resolve school_id — fallback to teacher_schools for multi-school teachers
  let resolvedSchoolId: string | null = (caller as any).school_id ?? null;
  if (!resolvedSchoolId && caller.role === 'teacher') {
    const { data: tsRows } = await admin
      .from('teacher_schools')
      .select('school_id')
      .eq('teacher_id', caller.id)
      .limit(1);
    resolvedSchoolId = (tsRows?.[0] as any)?.school_id ?? null;
  }

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
      school_id: resolvedSchoolId,
      is_active: true,
    })
    .select('*, portal_users!announcements_author_id_fkey(full_name)')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

// GET /api/announcements — list announcements (scoped by role)
export async function GET(request: NextRequest) {
  const caller = await getCallerProfile();
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const admin = adminClient();

  let q = admin
    .from('announcements')
    .select('*, portal_users!announcements_author_id_fkey(full_name)')
    .order('created_at', { ascending: false })
    .limit(50);

  if (status) q = q.eq('status', status) as any;

  if (caller.role !== 'admin') {
    if (caller.role === 'teacher') {
      const { data: tsRows } = await admin
        .from('teacher_schools')
        .select('school_id')
        .eq('teacher_id', caller.id);
      const schoolIds: string[] = [];
      if ((caller as any).school_id) schoolIds.push((caller as any).school_id);
      for (const r of tsRows ?? []) {
        if ((r as any).school_id) schoolIds.push((r as any).school_id);
      }
      if (schoolIds.length > 0) {
        q = q.in('school_id', schoolIds) as any;
      }
    } else if ((caller as any).school_id) {
      q = q.eq('school_id', (caller as any).school_id) as any;
    }
  }

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}
