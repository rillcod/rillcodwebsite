import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { getTeacherSchoolIds } from '@/lib/auth-utils';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function getCaller() {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const { data: profile } = await adminClient()
    .from('portal_users')
    .select('id, role, school_id, full_name, school_name')
    .eq('id', user.id)
    .single();
  if (!profile || !['admin', 'teacher', 'school'].includes(profile.role)) return null;
  return profile as typeof profile & { full_name: string | null; school_name: string | null };
}

// ── GET /api/whatsapp-groups ──────────────────────────────────────────────────
// Query params: status, group_type, school_id (admin only)
export async function GET(req: NextRequest) {
  const caller = await getCaller();
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const url = new URL(req.url);
  const statusFilter    = url.searchParams.get('status') || 'active';
  const typeFilter      = url.searchParams.get('group_type') || '';
  const schoolFilter    = url.searchParams.get('school_id') || '';

  const admin = adminClient();
  let q = admin
    .from('whatsapp_groups')
    .select('*, creator:portal_users!whatsapp_groups_created_by_fkey(full_name)')
    .order('group_type')
    .order('name');

  // Status filter (all = no filter)
  if (statusFilter !== 'all') q = q.eq('status', statusFilter);
  if (typeFilter)              q = q.eq('group_type', typeFilter);

  // Scope by role
  if (caller.role === 'admin') {
    if (schoolFilter) q = q.eq('school_id', schoolFilter);
  } else if (caller.role === 'teacher') {
    const schoolIds = await getTeacherSchoolIds(caller.id, caller.school_id ?? '');
    q = schoolIds.length > 0 ? q.in('school_id', schoolIds) : q.eq('school_id', 'none');
  } else {
    // school role
    q = q.eq('school_id', caller.school_id ?? 'none');
  }

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Also return schools list for admin filter UI
  let schools: { id: string; name: string }[] = [];
  if (caller.role === 'admin') {
    const { data: sc } = await admin.from('schools').select('id, name').order('name');
    schools = (sc ?? []) as { id: string; name: string }[];
  }

  const visible = caller.role === 'teacher'
    ? (data ?? []).filter((group: any) => !group.class_id || group.owner_teacher_id === caller.id)
    : (data ?? []);
  return NextResponse.json({ data: visible, schools, caller_role: caller.role });
}

// ── POST /api/whatsapp-groups ────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const caller = await getCaller();
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (caller.role === 'school') return NextResponse.json({ error: 'Only teachers and admins can create groups' }, { status: 403 });

  const body = await req.json();
  const { name, link, description, group_type, class_name, class_id, term, member_count, school_id } = body;

  if (!name?.trim()) return NextResponse.json({ error: 'Group name is required' }, { status: 400 });
  if (!link?.trim())  return NextResponse.json({ error: 'Group link is required' }, { status: 400 });
  if (!link.startsWith('https://chat.whatsapp.com/') && !link.startsWith('https://wa.me/')) {
    return NextResponse.json({ error: 'Must be a valid WhatsApp invite link (https://chat.whatsapp.com/...)' }, { status: 400 });
  }

  const admin = adminClient();

  let linkedClass: { id: string; name: string; school_id: string | null; teacher_id: string | null } | null = null;
  if (class_id) {
    const { data } = await admin.from('classes').select('id, name, school_id, teacher_id').eq('id', class_id).maybeSingle();
    linkedClass = data as { id: string; name: string; school_id: string | null; teacher_id: string | null } | null;
    if (!linkedClass) return NextResponse.json({ error: 'Selected class was not found' }, { status: 404 });
    if (caller.role === 'teacher' && linkedClass.teacher_id !== caller.id) {
      return NextResponse.json({ error: 'You can attach a WhatsApp group only to a class you own' }, { status: 403 });
    }
  } else if ((group_type || 'general') === 'class') {
    return NextResponse.json({ error: 'Select the owned class for a class WhatsApp group' }, { status: 400 });
  }

  // Resolve school_id and school_name
  let resolvedSchoolId: string | null = null;
  let resolvedSchoolName: string | null = null;

  if (caller.role === 'admin') {
    resolvedSchoolId = linkedClass?.school_id || school_id || null;
  } else {
    const schoolIds = await getTeacherSchoolIds(caller.id, caller.school_id ?? '');
    if (school_id) {
      if (!schoolIds.includes(school_id)) return NextResponse.json({ error: 'Not your school' }, { status: 403 });
      resolvedSchoolId = linkedClass?.school_id || school_id;
    } else {
      resolvedSchoolId = linkedClass?.school_id || caller.school_id;
    }
  }

  if (resolvedSchoolId) {
    const { data: sc } = await admin.from('schools').select('name').eq('id', resolvedSchoolId).single();
    resolvedSchoolName = (sc as any)?.name ?? null;
  }

  const { data, error } = await admin.from('whatsapp_groups').insert({
    name: name.trim(),
    link: link.trim(),
    description: description?.trim() || null,
    group_type: group_type || 'general',
    class_id: linkedClass?.id ?? null,
    owner_teacher_id: linkedClass?.teacher_id ?? (caller.role === 'teacher' ? caller.id : null),
    class_name: linkedClass?.name ?? class_name?.trim() ?? null,
    term: term?.trim() || null,
    member_count: member_count ? Number(member_count) : null,
    school_id: resolvedSchoolId,
    school_name: resolvedSchoolName,
    status: 'active',
    created_by: caller.id,
  }).select('*, creator:portal_users!whatsapp_groups_created_by_fkey(full_name)').single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}

// ── PATCH /api/whatsapp-groups ───────────────────────────────────────────────
// Body: { id, ...fields }  — can update any column
export async function PATCH(req: NextRequest) {
  const caller = await getCaller();
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json();
  const { id, ...rest } = body;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const admin = adminClient();
  const { data: existing } = await admin.from('whatsapp_groups').select('created_by, school_id, class_id, group_type').eq('id', id).single();
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (caller.role !== 'admin' && existing.created_by !== caller.id) {
    return NextResponse.json({ error: 'Only the creator or admin can edit this group' }, { status: 403 });
  }

  if ('class_id' in rest && rest.class_id) {
    const { data: targetClass } = await admin.from('classes').select('id, teacher_id').eq('id', rest.class_id).maybeSingle();
    if (!targetClass) return NextResponse.json({ error: 'Selected class was not found' }, { status: 404 });
    if (caller.role === 'teacher' && targetClass.teacher_id !== caller.id) {
      return NextResponse.json({ error: 'You can attach a group only to a class you own' }, { status: 403 });
    }
  }
  if ((rest.group_type === 'class' || (rest.group_type == null && (existing as any).group_type === 'class')) && !('class_id' in rest ? rest.class_id : (existing as any).class_id)) {
    return NextResponse.json({ error: 'Class groups require an owned class' }, { status: 400 });
  }

  // Validate link if being updated
  if (rest.link && !rest.link.startsWith('https://chat.whatsapp.com/') && !rest.link.startsWith('https://wa.me/')) {
    return NextResponse.json({ error: 'Invalid WhatsApp link' }, { status: 400 });
  }

  // Strip unknown keys; whitelist safe columns
  const allowed = ['name','link','description','group_type','class_id','class_name','term','status','member_count','last_broadcast_at'];
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in rest) updates[key] = rest[key] ?? null;
  }
  if (Object.keys(updates).length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });

  const { data, error } = await admin.from('whatsapp_groups').update(updates as any).eq('id', id)
    .select('*, creator:portal_users!whatsapp_groups_created_by_fkey(full_name)').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

// ── DELETE /api/whatsapp-groups?id=xxx ───────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const caller = await getCaller();
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const admin = adminClient();
  const { data: existing } = await admin.from('whatsapp_groups').select('created_by').eq('id', id).single();
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (caller.role !== 'admin' && existing.created_by !== caller.id) {
    return NextResponse.json({ error: 'Only creator or admin can delete' }, { status: 403 });
  }

  const { error } = await admin.from('whatsapp_groups').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
