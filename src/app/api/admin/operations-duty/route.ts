import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadDutyCapacity } from '@/lib/communication/duty-assignment';

const DUTY_KINDS = ['general_service', 'academic_support', 'admissions', 'technical_support'] as const;

async function requireAdmin() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const admin = createAdminClient() as any;
  const { data: profile } = await admin
    .from('portal_users')
    .select('id, role, is_active')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile?.is_active || profile.role !== 'admin') return null;
  return { user, admin };
}

export async function GET() {
  const actor = await requireAdmin();
  if (!actor) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  try {
    const snapshot = await loadDutyCapacity(actor.admin);
    return NextResponse.json({ data: snapshot });
  } catch (error) {
    console.error('[operations-duty] load failed:', error);
    return NextResponse.json({ error: 'Unable to load the duty board.' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const actor = await requireAdmin();
  if (!actor) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const userId = typeof body.userId === 'string' ? body.userId : '';
  if (!userId) return NextResponse.json({ error: 'A staff member is required.' }, { status: 400 });

  const { data: staff } = await actor.admin
    .from('portal_users')
    .select('id, role, is_active, is_deleted')
    .eq('id', userId)
    .maybeSingle();
  if (!staff?.is_active || staff.is_deleted || !['admin', 'teacher'].includes(staff.role)) {
    return NextResponse.json({ error: 'Select an active staff member.' }, { status: 400 });
  }

  const updates: Record<string, unknown> = { user_id: userId, updated_by: actor.user.id, updated_at: new Date().toISOString() };
  if (typeof body.isAvailable === 'boolean') updates.is_available = body.isAvailable;
  if (typeof body.acceptsGeneralQueue === 'boolean') updates.accepts_general_queue = body.acceptsGeneralQueue;
  if (body.maxActiveCases !== undefined) {
    const capacity = Number(body.maxActiveCases);
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 50) {
      return NextResponse.json({ error: 'Capacity must be a whole number from 1 to 50.' }, { status: 400 });
    }
    updates.max_active_cases = capacity;
  }
  if (Array.isArray(body.skillTags)) {
    updates.skill_tags = body.skillTags.map(String).map((value: string) => value.trim()).filter(Boolean).slice(0, 20);
  }

  const { error } = await actor.admin.from('operations_staff_settings').upsert(updates, { onConflict: 'user_id' });
  if (error) return NextResponse.json({ error: 'Unable to update staff availability.' }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function POST(req: NextRequest) {
  const actor = await requireAdmin();
  if (!actor) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const staffId = typeof body.staffId === 'string' ? body.staffId : '';
  const dutyKind = typeof body.dutyKind === 'string' ? body.dutyKind : 'general_service';
  const hours = Number(body.hours ?? 8);
  if (!staffId || !DUTY_KINDS.includes(dutyKind as typeof DUTY_KINDS[number])) {
    return NextResponse.json({ error: 'Valid staff and duty type are required.' }, { status: 400 });
  }
  if (!Number.isFinite(hours) || hours < 1 || hours > 24) {
    return NextResponse.json({ error: 'Duty length must be from 1 to 24 hours.' }, { status: 400 });
  }

  const { data: staff } = await actor.admin
    .from('portal_users')
    .select('id, role, is_active, is_deleted')
    .eq('id', staffId)
    .maybeSingle();
  if (!staff?.is_active || staff.is_deleted || !['admin', 'teacher'].includes(staff.role)) {
    return NextResponse.json({ error: 'Select an active staff member.' }, { status: 400 });
  }

  const startsAt = new Date();
  const endsAt = new Date(startsAt.getTime() + hours * 60 * 60 * 1000);
  if (body.isPrimary !== false) {
    await actor.admin
      .from('operations_duty_rota')
      .update({ status: 'completed', updated_at: startsAt.toISOString() })
      .eq('duty_kind', dutyKind)
      .eq('is_primary', true)
      .in('status', ['scheduled', 'active'])
      .lte('starts_at', startsAt.toISOString())
      .gt('ends_at', startsAt.toISOString());
  }
  const { data, error } = await actor.admin.from('operations_duty_rota').insert({
    staff_id: staffId,
    duty_kind: dutyKind,
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    is_primary: body.isPrimary !== false,
    status: 'active',
    created_by: actor.user.id,
  }).select('*').single();
  if (error) return NextResponse.json({ error: 'Unable to start this duty period.' }, { status: 500 });
  return NextResponse.json({ success: true, data });
}
