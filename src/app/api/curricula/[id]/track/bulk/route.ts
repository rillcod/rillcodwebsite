import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { triggerWeeklyMilestoneDigest } from '@/lib/curriculum/milestone-digest';

export const dynamic = 'force-dynamic';

// POST /api/curricula/[id]/track/bulk
// Mark several weeks of one class plan at once.
// Body: { weeks: [{ term_number, week_number, status, class_id, lesson_plan_id, teacher_notes?, actual_date? }] }
//
// This endpoint used to authorise on the curriculum's school alone and then
// write curriculum_week_tracking rows directly with the admin client, taking
// class_id and lesson_plan_id from the request body without ever checking
// them. A teacher at a school could therefore record delivery against another
// teacher's class. It now applies the same checks as the single-week route and
// routes every write through the same atomic delivery function, so there is
// one validated path rather than two.

const VALID_STATUSES = ['pending', 'in_progress', 'completed', 'skipped'] as const;
type TrackStatus = typeof VALID_STATUSES[number];

async function getStaff() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from('portal_users')
    .select('id, role, school_id')
    .eq('id', user.id)
    .single();
  if (!profile || !['admin', 'teacher'].includes(profile.role ?? '')) return null;
  return { user, profile };
}

async function callerCanManageSchool(
  admin: any,
  profile: { id: string; role: string; school_id: string | null },
  schoolId: string | null,
) {
  if (profile.role === 'admin') return true;
  if (!schoolId) return false;
  if (profile.school_id === schoolId) return true;
  if (profile.role === 'teacher') {
    const { data: ts } = await admin
      .from('teacher_schools')
      .select('school_id')
      .eq('teacher_id', profile.id)
      .eq('school_id', schoolId)
      .maybeSingle();
    return !!ts;
  }
  return false;
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await getStaff();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await context.params;
  const body = await req.json();

  const weeks: Array<{
    term_number: number;
    week_number: number;
    status: TrackStatus;
    teacher_notes?: string;
    actual_date?: string;
    class_id?: string | null;
    lesson_plan_id?: string | null;
  }> = body.weeks ?? [];

  if (!Array.isArray(weeks) || weeks.length === 0) {
    return NextResponse.json({ error: 'weeks array is required and must not be empty' }, { status: 400 });
  }

  for (const w of weeks) {
    if (!w.term_number || !w.week_number || !w.status) {
      return NextResponse.json({ error: 'Each week must have term_number, week_number, status' }, { status: 400 });
    }
    if (!VALID_STATUSES.includes(w.status)) {
      return NextResponse.json({ error: `Invalid status: ${w.status}` }, { status: 400 });
    }
    // Delivery belongs to a class plan; without one there is nothing to check
    // ownership against, which is how the unchecked writes got in.
    if (!w.class_id || !w.lesson_plan_id) {
      return NextResponse.json({
        error: 'Delivery progress belongs to a class plan. Each week needs class_id and lesson_plan_id.',
      }, { status: 409 });
    }
  }

  const admin = createAdminClient() as any;

  const { data: curriculum, error: currErr } = await admin
    .from('course_curricula')
    .select('id, school_id')
    .eq('id', id)
    .maybeSingle();

  if (currErr) return NextResponse.json({ error: currErr.message }, { status: 500 });
  if (!curriculum) return NextResponse.json({ error: 'Curriculum not found' }, { status: 404 });

  const canWrite = await callerCanManageSchool(admin, auth.profile, curriculum.school_id ?? null);
  if (!canWrite) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // Verify every distinct plan named in the payload: it must belong to this
  // curriculum version, match the class sent with it, and — for a teacher — be
  // a class they are assigned to.
  const planIds = [...new Set(weeks.map((w) => w.lesson_plan_id as string))];
  const { data: plans } = await admin
    .from('lesson_plans')
    .select('id,class_id,curriculum_version_id,classes!lesson_plans_class_id_fkey(teacher_id)')
    .in('id', planIds);
  const planById = new Map<string, any>((plans ?? []).map((p: any) => [p.id, p]));

  for (const w of weeks) {
    const plan = planById.get(w.lesson_plan_id as string);
    if (!plan || plan.class_id !== w.class_id || plan.curriculum_version_id !== id) {
      return NextResponse.json(
        { error: 'Class plan does not match this curriculum version' },
        { status: 400 },
      );
    }
    const planClass: any = Array.isArray(plan.classes) ? plan.classes[0] : plan.classes;
    if (auth.profile.role === 'teacher' && planClass?.teacher_id !== auth.user.id) {
      return NextResponse.json(
        { error: 'You can only update delivery for your assigned class' },
        { status: 403 },
      );
    }
  }

  const results: any[] = [];
  for (const w of weeks) {
    const deliveryStatus =
      w.status === 'completed' ? 'delivered' : w.status === 'skipped' ? 'skipped' : 'planned';
    const { data, error } = await admin.rpc('record_class_lesson_delivery', {
      p_lesson_plan_id: w.lesson_plan_id,
      p_week_number: Number(w.week_number),
      p_lesson_id: null,
      p_status: deliveryStatus,
      p_actor_id: auth.user.id,
      p_notes: w.teacher_notes || null,
      p_class_session_id: null,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    results.push(data);

    if (w.status === 'completed') {
      void triggerWeeklyMilestoneDigest({
        classId: w.class_id ?? null,
        schoolId: curriculum.school_id ?? null,
        curriculumId: id,
        termNumber: Number(w.term_number),
        weekNumber: Number(w.week_number),
      }).catch((err) => console.error('[track/bulk] milestone digest trigger error:', err));
    }
  }

  return NextResponse.json({ data: results, count: results.length });
}
