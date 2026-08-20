import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabase } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { summarisePromotionPlan } from '@/lib/classes/class-promotion';
import {
  SESSION_BULK_SMART_DEFAULTS,
  type SessionPromotionTrackId,
} from '@/lib/classes/promotion-due-intelligence';
import {
  applySchoolSessionPromotionPlan,
  buildSchoolSessionPromotionPlan,
  summariseSessionPromotionPlan,
} from '@/lib/classes/school-session-promotion';
import { parseSmartPromotionOptions } from '@/lib/classes/promotion-server';
import { logAudit } from '@/lib/audit/log';

export const dynamic = 'force-dynamic';

function adminClient() {
  return createSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

type Caller = { role: string; id: string; school_id: string | null };

async function requireStaff(): Promise<Caller | null> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: caller } = await adminClient()
    .from('portal_users')
    .select('role, id, school_id')
    .eq('id', user.id)
    .single();
  if (!caller || !['admin', 'teacher', 'school'].includes(caller.role)) return null;
  return caller as Caller;
}

async function callerSchoolIds(admin: ReturnType<typeof adminClient>, caller: Caller): Promise<string[]> {
  if (caller.role === 'school' && caller.school_id) return [caller.school_id];
  if (caller.role === 'admin') {
    const { data } = await admin.from('schools').select('id').eq('is_active', true);
    return (data ?? []).map((s: { id: string }) => s.id);
  }
  const ids = new Set<string>();
  if (caller.school_id) ids.add(caller.school_id);
  const { data: ts } = await admin.from('teacher_schools').select('school_id').eq('teacher_id', caller.id);
  (ts ?? []).forEach((r: { school_id: string }) => ids.add(r.school_id));
  return [...ids];
}

async function callerHasSchoolAccess(admin: ReturnType<typeof adminClient>, caller: Caller, schoolId: string) {
  const allowed = await callerSchoolIds(admin, caller);
  return allowed.includes(schoolId);
}

function parseTrack(raw: string | null): SessionPromotionTrackId | null {
  if (raw === null) return 'young_to_teen';
  if (raw === 'basic5_to_6' || raw === 'young_to_teen' || raw === 'jss_to_ss') return raw;
  return null;
}

function sessionSmartOpts(input: {
  searchParams?: URLSearchParams;
  body?: Record<string, unknown>;
}) {
  const parsed = parseSmartPromotionOptions(input);
  const hasCurriculumOverride =
    input.body?.advance_curriculum != null
    || (input.searchParams?.get('advance_curriculum') ?? null) != null;
  return {
    ...SESSION_BULK_SMART_DEFAULTS,
    smart_mode: parsed.smart_mode,
    strict_class_gate: parsed.strict_class_gate,
    advance_curriculum: hasCurriculumOverride ? parsed.advance_curriculum : SESSION_BULK_SMART_DEFAULTS.advance_curriculum,
  };
}

function serialisePlan(plan: Awaited<ReturnType<typeof buildSchoolSessionPromotionPlan>>) {
  if ('error' in plan) return plan;
  return {
    ...plan,
    slices: plan.slices.map((slice) => ({
      class_id: slice.class_id,
      class_name: slice.class_name,
      due_students: slice.due_students,
      plan: slice.plan,
      summary: summarisePromotionPlan(slice.plan),
      intelligence: slice.plan.intelligence,
    })),
  };
}

/** GET preview · POST apply session promotion for a school + track */
export async function GET(req: NextRequest) {
  const caller = await requireStaff();
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = adminClient();
  const url = new URL(req.url);

  const schoolId = caller.role === 'school' ? caller.school_id : url.searchParams.get('school_id');
  const trackId = parseTrack(url.searchParams.get('track'));

  if (!schoolId) {
    return NextResponse.json({ error: 'school_id is required' }, { status: 400 });
  }
  if (!trackId) return NextResponse.json({ error: 'Invalid promotion track' }, { status: 400 });

  if (!(await callerHasSchoolAccess(admin, caller, schoolId))) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  const smartOpts = sessionSmartOpts({ searchParams: url.searchParams });
  const plan = await buildSchoolSessionPromotionPlan(admin, schoolId, trackId, smartOpts);
  if ('error' in plan) return NextResponse.json({ error: plan.error }, { status: 404 });

  return NextResponse.json({
    success: true,
    plan: serialisePlan(plan),
    summary: summariseSessionPromotionPlan(plan),
    track: plan.track,
    smart_options: smartOpts,
  });
}

export async function POST(req: NextRequest) {
  const caller = await requireStaff();
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (caller.role === 'teacher') {
    return NextResponse.json(
      { error: 'Session promotion is for admins and school accounts. Use Smart promote on each class instead.' },
      { status: 403 },
    );
  }

  const admin = adminClient();
  const body = await req.json().catch(() => ({}));
  const schoolId = caller.role === 'school' ? caller.school_id : (typeof body.school_id === 'string' ? body.school_id : null);
  const trackId = parseTrack(typeof body.track === 'string' ? body.track : null);

  if (!schoolId) {
    return NextResponse.json({ error: 'school_id is required' }, { status: 400 });
  }
  if (!trackId) return NextResponse.json({ error: 'Invalid promotion track' }, { status: 400 });

  if (!(await callerHasSchoolAccess(admin, caller, schoolId))) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  const smartOpts = sessionSmartOpts({ body });
  const plan = await buildSchoolSessionPromotionPlan(admin, schoolId, trackId, smartOpts);
  if ('error' in plan) return NextResponse.json({ error: plan.error }, { status: 404 });

  if (plan.total_promotable === 0) {
    return NextResponse.json(
      { error: plan.blocked[0] ?? 'No learners ready.', plan: serialisePlan(plan) },
      { status: 409 },
    );
  }

  const allResults = await applySchoolSessionPromotionPlan(admin, plan, caller);
  const promoted = allResults.reduce((n, r) => n + r.promoted, 0);
  const failedCount = allResults.reduce((n, r) => n + r.failed.length, 0);
  const track = plan.track;

  await logAudit(admin, {
    actorId: caller.id,
    action: 'school_session_promotion',
    resourceType: 'school',
    resourceId: schoolId,
    tableName: 'schools',
    newValues: {
      track: trackId,
      promoted,
      failed: failedCount,
      summary: summariseSessionPromotionPlan(plan),
    },
  }).catch(() => {});

  return NextResponse.json({
    success: failedCount === 0,
    promoted,
    failed: failedCount,
    track: trackId,
    programme_transitions: plan.programme_transition_count,
    results: allResults,
    plan: serialisePlan(plan),
    message:
      promoted > 0
        ? `Promoted ${promoted} learner${promoted === 1 ? '' : 's'} (${track.short_label}). Historical reports were not changed.`
        : 'No learners were promoted.',
  });
}
