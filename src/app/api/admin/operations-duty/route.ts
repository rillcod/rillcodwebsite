import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { loadDutyCapacity } from '@/lib/communication/duty-assignment';
import { getOfficeAdminActor, officeAdminForbiddenResponse, officeAdminUnauthorizedResponse } from '@/lib/operations/access';
import { logAudit } from '@/lib/audit/log';

const DUTY_KINDS = ['general_service', 'academic_support', 'admissions', 'technical_support'] as const;

async function requireAdmin() {
  const actor = await getOfficeAdminActor();
  if (actor) return { user: actor.user, admin: actor.admin as any };
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { error: officeAdminUnauthorizedResponse(), user: null, admin: null };
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
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
    return NextResponse.json({ error: 'A valid staff member is required.' }, { status: 400 });
  }

  const { data: staff, error: staffError } = await actor.admin
    .from('portal_users')
    .select('id, role, is_active, is_deleted')
    .eq('id', userId)
    .maybeSingle();
  if (staffError) return NextResponse.json({ error: staffError.message }, { status: 500 });
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
    if (body.skillTags.some((value: unknown) => typeof value !== 'string' || value.trim().length > 40)) {
      return NextResponse.json({ error: 'Skill tags must be short text values.' }, { status: 400 });
    }
    updates.skill_tags = [...new Set(body.skillTags.map((value: string) => value.trim()).filter(Boolean))].slice(0, 20);
  }
  if (Object.keys(updates).length === 3) {
    return NextResponse.json({ error: 'No staff availability changes supplied.' }, { status: 400 });
  }

  const { data: previous, error: previousError } = await actor.admin
    .from('operations_staff_settings')
    .select('is_available, accepts_general_queue, max_active_cases, skill_tags')
    .eq('user_id', userId)
    .maybeSingle();
  if (previousError) return NextResponse.json({ error: previousError.message }, { status: 500 });

  const { data: saved, error } = await actor.admin
    .from('operations_staff_settings')
    .upsert(updates, { onConflict: 'user_id' })
    .select('user_id, is_available, accepts_general_queue, max_active_cases, skill_tags')
    .maybeSingle();
  if (error || !saved) return NextResponse.json({ error: error?.message || 'Unable to update staff availability.' }, { status: 500 });
  await logAudit(actor.admin, {
    action: 'update_operations_staff_capacity',
    actorId: actor.user.id,
    resourceType: 'operations_staff_settings',
    resourceId: userId,
    newValue: 'Updated staff availability and service capacity',
    oldValues: {
      is_available: previous?.is_available ?? true,
      accepts_general_queue: previous?.accepts_general_queue ?? true,
      max_active_cases: previous?.max_active_cases ?? 8,
      skill_tags: previous?.skill_tags ?? [],
    },
    newValues: {
      is_available: saved.is_available,
      accepts_general_queue: saved.accepts_general_queue,
      max_active_cases: saved.max_active_cases,
      skill_tags: saved.skill_tags,
    },
  });
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
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(staffId) || !DUTY_KINDS.includes(dutyKind as typeof DUTY_KINDS[number])) {
    return NextResponse.json({ error: 'Valid staff and duty type are required.' }, { status: 400 });
  }
  if (!Number.isFinite(hours) || hours < 1 || hours > 24) {
    return NextResponse.json({ error: 'Duty length must be from 1 to 24 hours.' }, { status: 400 });
  }

  const { data: staff, error: staffError } = await actor.admin
    .from('portal_users')
    .select('id, role, is_active, is_deleted')
    .eq('id', staffId)
    .maybeSingle();
  if (staffError) return NextResponse.json({ error: staffError.message }, { status: 500 });
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
  if (error || !data || typeof data !== 'object' || !('id' in (data as Record<string, unknown>))) {
    return NextResponse.json({ error: error?.message || 'Unable to start this duty period.' }, { status: 500 });
  }
  await logAudit(actor.admin, {
    action: 'handover_primary_operations_duty',
    actorId: actor.user.id,
    resourceType: 'operations_duty_assignment',
    resourceId: String((data as Record<string, unknown>).id),
    newValue: `Assigned ${dutyKind} duty for ${hours} hour${hours === 1 ? '' : 's'}`,
    newValues: {
      staff_id: staffId,
      assignment_id: (data as Record<string, unknown>).id,
      duty_kind: dutyKind,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      is_primary: body.isPrimary !== false,
    },
  });
  return NextResponse.json({ success: true, data });
}
