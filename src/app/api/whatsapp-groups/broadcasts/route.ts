import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import type { Database } from '@/types/supabase';

function adminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function getCaller() {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const { data: p } = await adminClient()
    .from('portal_users').select('id, role, school_id, full_name').eq('id', user.id).single();
  if (!p || !['admin','teacher','school'].includes(p.role)) return null;
  return p as typeof p & { full_name: string | null };
}

// GET /api/whatsapp-groups/broadcasts?group_id=&limit=20&school_id=
export async function GET(req: NextRequest) {
  const caller = await getCaller();
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const url = new URL(req.url);
  const groupId  = url.searchParams.get('group_id') || '';
  const schoolId = url.searchParams.get('school_id') || '';
  const limit    = Math.min(parseInt(url.searchParams.get('limit') || '30'), 100);

  const admin = adminClient();
  let q = admin.from('whatsapp_group_broadcasts')
    .select('*').order('sent_at', { ascending: false }).limit(limit);

  if (groupId)  q = q.eq('group_id', groupId);
  else if (caller.role !== 'admin') q = q.eq('school_id', caller.school_id ?? 'none');
  else if (schoolId) q = q.eq('school_id', schoolId);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

// POST /api/whatsapp-groups/broadcasts
// Body: { group_id, message }
export async function POST(req: NextRequest) {
  const caller = await getCaller();
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { group_id, message } = await req.json();
  if (!group_id) return NextResponse.json({ error: 'group_id required' }, { status: 400 });
  if (!message?.trim()) return NextResponse.json({ error: 'message required' }, { status: 400 });

  const admin = adminClient();
  const { data: group } = await admin.from('whatsapp_groups')
    .select('name, school_id, school_name').eq('id', group_id).single();
  if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 });

  // Stamp last_broadcast_at on the group
  await admin.from('whatsapp_groups').update({
    last_broadcast_at: new Date().toISOString(),
  }).eq('id', group_id);

  const { data, error } = await admin.from('whatsapp_group_broadcasts').insert({
    group_id,
    group_name:  (group as any).name,
    school_id:   (group as any).school_id,
    school_name: (group as any).school_name,
    sent_by:     caller.id,
    sent_by_name: (caller as any).full_name || 'Staff',
    message:     message.trim(),
    sent_at:     new Date().toISOString(),
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
