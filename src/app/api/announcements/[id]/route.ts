import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function requireWriteStaff() {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const { data: profile } = await supabase
    .from('portal_users')
    .select('id, role, school_id')
    .eq('id', user.id)
    .single();
  if (!profile || !['admin', 'teacher', 'school'].includes(profile.role)) return null;
  return profile;
}

async function callerCanManageAnnouncement(
  caller: { id: string; role: string; school_id: string | null },
  announcementId: string,
): Promise<boolean> {
  if (caller.role === 'admin') return true;
  const admin = adminClient();
  const { data: ann } = await admin
    .from('announcements')
    .select('school_id, author_id')
    .eq('id', announcementId)
    .maybeSingle();
  if (!ann) return false;
  if (ann.author_id === caller.id) return true;
  const annSchool = ann.school_id;
  if (!annSchool) return false;
  if (caller.school_id === annSchool) return true;
  const { data: tsRows } = await admin
    .from('teacher_schools')
    .select('school_id')
    .eq('teacher_id', caller.id);
  return (tsRows ?? []).some((r: any) => r.school_id === annSchool);
}

// PATCH /api/announcements/[id]
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const caller = await requireWriteStaff();
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await context.params;

  if (!(await callerCanManageAnnouncement(caller as any, id))) {
    return NextResponse.json({ error: 'Access denied: announcement belongs to a different school' }, { status: 403 });
  }

  const body = await request.json();
  const update: Record<string, any> = {};
  const fields = ['title', 'content', 'target_audience', 'is_active'];
  for (const f of fields) {
    if (body[f] !== undefined) update[f] = body[f];
  }

  const admin = adminClient();
  const { data, error } = await admin
    .from('announcements')
    .update(update)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

// DELETE /api/announcements/[id]
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const caller = await requireWriteStaff();
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await context.params;

  if (!(await callerCanManageAnnouncement(caller as any, id))) {
    return NextResponse.json({ error: 'Access denied: announcement belongs to a different school' }, { status: 403 });
  }

  const admin = adminClient();
  const { error } = await admin.from('announcements').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
