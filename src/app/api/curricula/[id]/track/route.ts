import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { notificationsService } from '@/services/notifications.service';
import { triggerWeeklyMilestoneDigest } from '@/lib/curriculum/milestone-digest';
import { SMTP_FROM_EMAIL } from '@/config/brand';
import { isWhatsAppCloudApiApproved } from '@/lib/whatsapp/approval';
import { sendWhatsAppDetailed } from '@/lib/whatsapp/send';
import { parseRequestSession } from '@/lib/academic/session-identity';

export const dynamic = 'force-dynamic';

async function getStaff() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from('portal_users')
    .select('id, role, school_id')
    .eq('id', user.id)
    .single();
  if (!profile || !['admin', 'teacher', 'school'].includes(profile.role ?? '')) return null;
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
  return profile.role === 'school' && profile.school_id === schoolId;
}

// GET /api/curricula/[id]/track — get all week tracking for this curriculum
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await getStaff();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await context.params;
  const admin = createAdminClient() as any;
  const { data: curriculum, error: currErr } = await admin
    .from('course_curricula')
    .select('id, school_id')
    .eq('id', id)
    .maybeSingle();
  if (currErr) return NextResponse.json({ error: currErr.message }, { status: 500 });
  if (!curriculum) return NextResponse.json({ error: 'Curriculum not found' }, { status: 404 });
  const canSee = await callerCanManageSchool(admin, auth.profile, curriculum.school_id ?? null);
  if (!canSee) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const url = new URL(req.url);
  const classId = url.searchParams.get('class_id');
  const lessonPlanId = url.searchParams.get('lesson_plan_id');

  let query = admin.from('curriculum_week_tracking').select('*').eq('curriculum_id', id);
  if (curriculum.school_id) query = query.eq('school_id', curriculum.school_id);
  else query = query.is('school_id', null);
  if (classId) query = query.eq('class_id', classId);
  if (lessonPlanId) query = query.eq('lesson_plan_id', lessonPlanId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

// POST /api/curricula/[id]/track — upsert week tracking status
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await getStaff();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  // School role cannot mark progress — only admin/teacher
  if (auth.profile.role === 'school') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await context.params;
  const body = await req.json();
  const { term_number, week_number, status, teacher_notes, actual_date, class_id, lesson_plan_id } = body;
  const session = parseRequestSession(body) ?? 1;

  const VALID_STATUSES = ['pending', 'in_progress', 'completed', 'skipped'] as const;
  if (!term_number || !week_number || !status) {
    return NextResponse.json({ error: 'term_number, week_number, status required' }, { status: 400 });
  }
  if (!VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` }, { status: 400 });
  }
  if (teacher_notes && teacher_notes.length > 1000) {
    return NextResponse.json({ error: 'teacher_notes must be under 1000 characters' }, { status: 400 });
  }

  const admin = createAdminClient() as any;
  const { data: curriculum, error: currErr } = await admin
    .from('course_curricula')
    .select('id, school_id, content')
    .eq('id', id)
    .maybeSingle();
  if (currErr) return NextResponse.json({ error: currErr.message }, { status: 500 });
  if (!curriculum) return NextResponse.json({ error: 'Curriculum not found' }, { status: 404 });
  const canWrite = await callerCanManageSchool(admin, auth.profile, curriculum.school_id ?? null);
  if (!canWrite) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const schoolId = curriculum.school_id ?? null;

  // Compatibility endpoint: route every write through the same atomic delivery function used by Classes.
  if (!class_id || !lesson_plan_id) {
    return NextResponse.json({
      error: 'Delivery progress belongs to a class plan. Open the class teaching workspace to update it.',
    }, { status: 409 });
  }
  const { data: plan } = await admin.from('lesson_plans')
    .select('id,class_id,curriculum_version_id,classes!lesson_plans_class_id_fkey(teacher_id)')
    .eq('id', lesson_plan_id).maybeSingle();
  if (!plan || plan.class_id !== class_id || plan.curriculum_version_id !== id) {
    return NextResponse.json({ error: 'Class plan does not match this curriculum version' }, { status: 400 });
  }
  const planClass: any = Array.isArray(plan.classes) ? plan.classes[0] : plan.classes;
  if (auth.profile.role === 'teacher' && planClass?.teacher_id !== auth.user.id) {
    return NextResponse.json({ error: 'You can only update delivery for your assigned class' }, { status: 403 });
  }
  const deliveryStatus = status === 'completed' ? 'delivered' : status === 'skipped' ? 'skipped' : 'planned';
  const { data, error } = await admin.rpc('record_class_lesson_delivery', {
    p_lesson_plan_id: lesson_plan_id,
    p_week_number: Number(week_number),
    p_lesson_id: null,
    p_status: deliveryStatus,
    p_actor_id: auth.user.id,
    p_notes: teacher_notes || null,
    p_class_session_id: null,
    p_session_number: session,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // Fire-and-forget: trigger automated Weekly Milestone Digest when a week is marked completed
  if (status === 'completed') {
    void triggerWeeklyMilestoneDigest({
      classId: class_id ?? null,
      schoolId: schoolId ?? null,
      curriculumId: id,
      termNumber: Number(term_number),
      weekNumber: Number(week_number),
      weekTopic: body.week_topic ?? null,
      courseTitle: body.course_name ?? curriculum?.content?.course_title ?? null,
    }).catch((err) => console.error('[track] milestone digest trigger error:', err));
  }

  return NextResponse.json({ data });
}

// Notify parents of students in a school that a curriculum week was completed
async function notifyParentsWeekComplete(opts: {
  schoolId: string;
  curriculumId: string;
  termNumber: number;
  weekNumber: number;
  weekTopic: string | null;
  courseName: string | null;
  channels: string[];
}) {
  const { schoolId, termNumber, weekNumber, weekTopic, courseName, channels } = opts;
  const admin = createAdminClient() as any;

  // Get parent contact info from students in this school
  const { data: students } = await admin
    .from('portal_users')
    .select('id, full_name, student_id, students!portal_users_student_id_fkey(parent_phone, parent_name, parent_email)')
    .eq('school_id', schoolId)
    .eq('role', 'student')
    .limit(200);

  if (!students?.length) return;

  const TERM_LABELS: Record<number, string> = { 1: 'First Term', 2: 'Second Term', 3: 'Third Term' };
  const termLabel = TERM_LABELS[termNumber] ?? `Term ${termNumber}`;
  const topicLine = weekTopic ? ` — *${weekTopic}*` : '';
  const courseLine = courseName ? ` (${courseName})` : '';
  const whatsappBody = `✅ *Rillcod Technologies*\n\nYour child has completed *${termLabel} Week ${weekNumber}*${topicLine}${courseLine}.\n\nKeep encouraging them — great progress! 🎉`;

  for (const student of students) {
    const info = Array.isArray(student.students) ? student.students[0] : student.students;

    // WhatsApp notification
    if (channels.includes('whatsapp') && isWhatsAppCloudApiApproved()) {
      const phone = info?.parent_phone;
      if (phone) {
        await sendWhatsAppDetailed({
          to: String(phone),
          message: whatsappBody,
          persistToInbox: false,
          automated: true,
          metadata: { source: 'curriculum_week_complete', school_id: schoolId, week_number: weekNumber },
        }).catch(() => {});
      }
    }

    // Email notification
    if (channels.includes('email') && info?.parent_email) {
      const htmlBody = `<p>Your child has completed <b>${termLabel} Week ${weekNumber}</b>${weekTopic ? ` — <b>${weekTopic}</b>` : ''}${courseName ? ` (${courseName})` : ''}.</p><p>Keep encouraging them — great progress! 🎉</p><p style="color:#888;font-size:12px;">— Rillcod Technologies</p>`;
      await notificationsService.sendExternalEmail({
        to: info.parent_email,
        subject: `Week ${weekNumber} completed — ${courseName ?? 'Rillcod'}`,
        html: htmlBody,
        fromName: 'Rillcod Technologies',
        fromEmail: SMTP_FROM_EMAIL,
      }).catch(() => {});
    }
  }
}

// DELETE /api/curricula/[id]/track?term=1
// Resets tracking: term= scopes to one term, omit to clear all tracking for this curriculum.
export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await getStaff();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (auth.profile.role === 'school') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await context.params;
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

  const url = new URL(req.url);
  const term = url.searchParams.get('term');
  const week = url.searchParams.get('week');
  const classId = url.searchParams.get('class_id');
  const lessonPlanId = url.searchParams.get('lesson_plan_id');

  let q = admin.from('curriculum_week_tracking').delete().eq('curriculum_id', id);
  if (curriculum.school_id) q = q.eq('school_id', curriculum.school_id);
  else q = q.is('school_id', null);
  if (term) q = q.eq('term_number', parseInt(term, 10));
  if (week) q = q.eq('week_number', parseInt(week, 10));
  if (classId) q = q.eq('class_id', classId);
  if (lessonPlanId) q = q.eq('lesson_plan_id', lessonPlanId);

  const { error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
