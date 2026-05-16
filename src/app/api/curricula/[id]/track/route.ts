import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { notificationsService } from '@/services/notifications.service';

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
  _req: NextRequest,
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

  let query = admin.from('curriculum_week_tracking').select('*').eq('curriculum_id', id);
  if (curriculum.school_id) query = query.eq('school_id', curriculum.school_id);
  else query = query.is('school_id', null);

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
  const { term_number, week_number, status, teacher_notes, actual_date } = body;

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

  const payload: any = {
    curriculum_id: id,
    school_id: schoolId,
    term_number,
    week_number,
    status,
    teacher_notes: teacher_notes || null,
    actual_date: actual_date || null,
    updated_at: new Date().toISOString(),
  };
  if (status === 'completed') {
    payload.completed_by = auth.user.id;
    payload.completed_at = new Date().toISOString();
  } else {
    payload.completed_by = null;
    payload.completed_at = null;
  }

  // Use upsert with a SELECT first to handle the conditional unique index
  const matchQuery = admin
    .from('curriculum_week_tracking')
    .select('id')
    .eq('curriculum_id', id)
    .eq('term_number', term_number)
    .eq('week_number', week_number);

  if (schoolId) {
    matchQuery.eq('school_id', schoolId);
  } else {
    matchQuery.is('school_id', null);
  }

  const { data: existing } = await matchQuery.maybeSingle();

  let data, error;
  if (existing?.id) {
    ({ data, error } = await admin
      .from('curriculum_week_tracking')
      .update(payload)
      .eq('id', existing.id)
      .select()
      .single());
  } else {
    ({ data, error } = await admin
      .from('curriculum_week_tracking')
      .insert(payload)
      .select()
      .single());
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Fire-and-forget: notify parents when a week is marked completed
  if (status === 'completed' && schoolId) {
    const notifSettings = curriculum?.content?.notification_settings ?? { mode: 'all', channels: ['whatsapp'] };
    const shouldNotify = (() => {
      if (notifSettings.mode === 'none') return false;
      if (notifSettings.mode === 'all') return true;
      if (notifSettings.mode === 'every_n') return week_number % (notifSettings.every_n ?? 4) === 0;
      if (notifSettings.mode === 'specific') return (notifSettings.specific_weeks ?? []).includes(week_number);
      return false;
    })();
    if (shouldNotify) {
      void notifyParentsWeekComplete({
        schoolId,
        curriculumId: id,
        termNumber: term_number,
        weekNumber: week_number,
        weekTopic: body.week_topic ?? null,
        courseName: body.course_name ?? null,
        channels: notifSettings.channels ?? ['whatsapp'],
      }).catch(() => {});
    }
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
  const phoneId = process.env.WHATSAPP_PHONE_ID || '1165370629985726';
  const whatsappToken = process.env.WHATSAPP_API_TOKEN;

  const admin = createAdminClient() as any;

  // Get parent contact info from students in this school
  const { data: students } = await admin
    .from('portal_users')
    .select('id, full_name, student_id, students(parent_phone, parent_name, parent_email)')
    .eq('school_id', schoolId)
    .eq('role', 'student')
    .limit(200);

  if (!students?.length) return;

  const TERM_LABELS: Record<number, string> = { 1: 'First Term', 2: 'Second Term', 3: 'Third Term' };
  const termLabel = TERM_LABELS[termNumber] ?? `Term ${termNumber}`;
  const topicLine = weekTopic ? ` — *${weekTopic}*` : '';
  const courseLine = courseName ? ` (${courseName})` : '';
  const whatsappBody = `✅ *Rillcod Technologies*\n\nYour child has completed *${termLabel} Week ${weekNumber}*${topicLine}${courseLine}.\n\nKeep encouraging them — great progress! 🎉`;
  const whatsappApiUrl = `https://graph.facebook.com/v19.0/${phoneId}/messages`;

  for (const student of students) {
    const info = Array.isArray(student.students) ? student.students[0] : student.students;

    // WhatsApp notification
    if (channels.includes('whatsapp') && whatsappToken) {
      const phone = info?.parent_phone;
      if (phone) {
        const cleanPhone = String(phone).replace(/\D+/g, '').replace(/^0/, '234');
        await fetch(whatsappApiUrl, {
          method: 'POST',
          headers: { Authorization: `Bearer ${whatsappToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: cleanPhone,
            type: 'text',
            text: { body: whatsappBody },
          }),
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
        fromEmail: 'no-reply@rillcod.com',
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

  let q = admin.from('curriculum_week_tracking').delete().eq('curriculum_id', id);
  if (curriculum.school_id) q = q.eq('school_id', curriculum.school_id);
  else q = q.is('school_id', null);
  if (term) q = q.eq('term_number', parseInt(term, 10));
  if (week) q = q.eq('week_number', parseInt(week, 10));

  const { error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
