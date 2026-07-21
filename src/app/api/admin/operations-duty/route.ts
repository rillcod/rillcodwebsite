import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { loadDutyCapacity } from '@/lib/communication/duty-assignment';
import { getOfficeAdminActor, officeAdminForbiddenResponse, officeAdminUnauthorizedResponse } from '@/lib/operations/access';

const DUTY_KINDS = ['general_service', 'academic_support', 'admissions', 'technical_support'] as const;

async function requireAdmin() {
  const actor = await getOfficeAdminActor();
  if (actor) return { user: actor.user, admin: actor.admin as any };
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: officeAdminUnauthorizedResponse(), user: null, admin: null };
  return { error: officeAdminForbiddenResponse(), user: null, admin: null };
}

export async function GET() {
  const actor = await requireAdmin();
  if (!actor.admin) return NextResponse.json({ error: actor.error?.error || 'Admin access required' }, { status: actor.error?.status || 403 });
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
  if (!actor.admin || !actor.user) {
    return NextResponse.json({ error: actor.error?.error || 'Admin access required' }, { status: actor.error?.status || 403 });
  }
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
  if (!actor.admin || !actor.user) {
    return NextResponse.json({ error: actor.error?.error || 'Admin access required' }, { status: actor.error?.status || 403 });
  }
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
  const { data, error } = await actor.admin.rpc('handover_primary_duty', {
    p_staff_id: staffId,
    p_duty_kind: dutyKind,
    p_starts_at: startsAt.toISOString(),
    p_ends_at: endsAt.toISOString(),
    p_created_by: actor.user.id,
    p_is_primary: body.isPrimary !== false,
  });
  if (error) return NextResponse.json({ error: 'Unable to start this duty period.' }, { status: 500 });
  return NextResponse.json({ success: true, data });
}
