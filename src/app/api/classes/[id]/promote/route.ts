import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabase } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { summarisePromotionPlan } from '@/lib/classes/class-promotion';
import {
  applyIntelligentPromotionPlan,
  buildSmartPromotionPlan,
  loadPromotionContext,
  parseSmartPromotionOptions,
  resyncSourceClassCount,
} from '@/lib/classes/promotion-server';
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

async function callerHasClassAccess(admin: ReturnType<typeof adminClient>, caller: Caller, classSchoolId: string | null) {
  if (caller.role === 'admin') return true;
  if (!classSchoolId) return true;
  if (caller.role === 'school') return caller.school_id === classSchoolId;
  if (caller.role === 'teacher') {
    if (caller.school_id === classSchoolId) return true;
    const { data: ts } = await admin
      .from('teacher_schools')
      .select('school_id')
      .eq('teacher_id', caller.id)
      .eq('school_id', classSchoolId)
      .maybeSingle();
    return !!ts;
  }
  return false;
}

/** GET preview · POST apply bulk class promotion */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const caller = await requireStaff();
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: classId } = await context.params;
  const admin = adminClient();

  const url = new URL(req.url);
  const destinationClassId = url.searchParams.get('destination_class_id');
  const studentIdsParam = url.searchParams.get('student_ids');
  const studentIds = studentIdsParam
    ? studentIdsParam.split(',').map((s) => s.trim()).filter(Boolean)
    : undefined;

  const ctx = await loadPromotionContext(admin, classId, studentIds);
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: 404 });

  const hasAccess = await callerHasClassAccess(admin, caller, ctx.sourceClass.school_id ?? null);
  if (!hasAccess) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  const smartOpts = parseSmartPromotionOptions({ searchParams: url });
  const plan = await buildSmartPromotionPlan(admin, ctx, destinationClassId, smartOpts);

  const destinationOptions = ctx.schoolClasses
    .filter((c) => c.id !== classId)
    .map((c) => ({ id: c.id, name: c.name, qa_grade_key: c.qa_grade_key, qa_grade_band: c.qa_grade_band }));

  return NextResponse.json({
    success: true,
    plan,
    summary: summarisePromotionPlan(plan),
    intelligence: plan.intelligence,
    smart_options: smartOpts,
    destination_options: destinationOptions,
    student_count: ctx.students.length,
  });
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const caller = await requireStaff();
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: classId } = await context.params;
  const admin = adminClient();
  const body = await req.json().catch(() => ({}));
  const studentIds = Array.isArray(body.studentIds) ? body.studentIds as string[] : undefined;
  const destinationClassId = typeof body.destination_class_id === 'string' ? body.destination_class_id : null;
  const apply = body.apply === true;

  const ctx = await loadPromotionContext(admin, classId, studentIds);
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: 404 });

  const hasAccess = await callerHasClassAccess(admin, caller, ctx.sourceClass.school_id ?? null);
  if (!hasAccess) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  if (caller.role === 'teacher' && ctx.sourceClass.teacher_id && ctx.sourceClass.teacher_id !== caller.id) {
    return NextResponse.json({ error: 'Only the primary owner of this class can promote its roster.' }, { status: 403 });
  }

  const smartOpts = parseSmartPromotionOptions({ body });
  const plan = await buildSmartPromotionPlan(admin, ctx, destinationClassId, smartOpts);

  if (!apply) {
    return NextResponse.json({
      success: true,
      plan,
      summary: summarisePromotionPlan(plan),
      intelligence: plan.intelligence,
      smart_options: smartOpts,
      dry_run: true,
    });
  }

  if (plan.blocked.length > 0 && plan.promotable_count === 0) {
    return NextResponse.json({ error: plan.blocked[0], plan }, { status: 409 });
  }

  const results = await applyIntelligentPromotionPlan(admin, ctx, plan, caller);
  const promoted = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);

  await logAudit({
    actorId: caller.id,
    action: 'class_bulk_promotion',
    resourceType: 'class',
    resourceId: classId,
    tableName: 'classes',
    details: {
      promoted,
      failed: failed.length,
      source_class: ctx.sourceClass.name,
      plan_summary: summarisePromotionPlan(plan),
      intelligence: plan.intelligence,
    },
  }).catch(() => {});

  await resyncSourceClassCount(admin, classId);

  const curriculumCount = results.filter((r) => r.ok && r.curriculum_advanced).length;
  const programmeCount = results.filter((r) => r.ok && r.programme_transition).length;

  return NextResponse.json({
    success: failed.length === 0,
    promoted,
    failed,
    plan,
    intelligence: plan.intelligence,
    programme_transitions: programmeCount,
    message:
      promoted > 0
        ? `Promoted ${promoted} learner${promoted === 1 ? '' : 's'}`
          + (programmeCount > 0
            ? ` (${programmeCount} graduated Young Innovators → Teen Developers)`
            : '')
          + (curriculumCount > 0 ? ` (${curriculumCount} curriculum track${curriculumCount === 1 ? '' : 's'} advanced)` : '')
          + '. Historical reports were not changed.'
        : 'No learners were promoted.',
  });
}
