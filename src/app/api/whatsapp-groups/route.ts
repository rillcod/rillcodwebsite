import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { loadCommunicationPolicy } from '@/lib/communication/abusePolicy';

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
  if (!profile || !['admin', 'teacher', 'school'].includes(profile.role)) return null;
  return profile;
}

// GET /api/whatsapp-groups — list groups for caller's school (or all for admin)
export async function GET() {
  const caller = await requireStaff();
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const admin = adminClient();
  let q = admin.from('whatsapp_groups').select('*').order('name');
  if (caller.role !== 'admin') q = q.eq('school_id', caller.school_id);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const policy = await loadCommunicationPolicy();
  return NextResponse.json({
    data: data ?? [],
    routing_hint: policy.whatsapp_primary_mode
      ? 'WhatsApp groups are preferred for large repetitive parent/student updates.'
      : 'Groups available; in-app channels remain active fallback.',
  });
}

// POST /api/whatsapp-groups — create a group
export async function POST(req: NextRequest) {
  const caller = await requireStaff();
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { name, link, school_id } = await req.json();
  if (!name?.trim() || !link?.trim()) {
    return NextResponse.json({ error: 'name and link are required' }, { status: 400 });
  }
  if (!link.startsWith('https://chat.whatsapp.com/') && !link.startsWith('https://wa.me/')) {
    return NextResponse.json({ error: 'Invalid WhatsApp group link' }, { status: 400 });
  }

  const resolvedSchoolId = caller.role === 'admin' ? (school_id || null) : caller.school_id;

  const admin = adminClient();
  const { data, error } = await admin.from('whatsapp_groups').insert({
    name: name.trim(),
    link: link.trim(),
    school_id: resolvedSchoolId,
    created_by: caller.id,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

// DELETE /api/whatsapp-groups?id=xxx
export async function DELETE(req: NextRequest) {
  const caller = await requireStaff();
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const admin = adminClient();
  // Only admin or the creator can delete
  const { data: existing } = await admin.from('whatsapp_groups').select('created_by, school_id').eq('id', id).single();
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (caller.role !== 'admin' && existing.created_by !== caller.id) {
    return NextResponse.json({ error: 'Only the creator or admin can delete this group' }, { status: 403 });
  }

  const { error } = await admin.from('whatsapp_groups').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
