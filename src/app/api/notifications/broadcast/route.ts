import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendPushNotification } from '@/lib/push';
import { loadCommunicationPolicy } from '@/lib/communication/abusePolicy';

/**
 * POST /api/notifications/broadcast
 * Admin or teacher can send an in-app + push notification to a target group.
 *
 * Body: {
 *   title: string,
 *   message: string,
 *   target: 'all' | 'students' | 'parents' | 'teachers' | 'schools',
 *   school_id?: string,   // optional: limit to one school
 *   type?: 'info' | 'warning' | 'success' | 'announcement'
 * }
 */
export async function POST(req: NextRequest) {
  // Auth check
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = createAdminClient();
  const { data: sender } = await db
    .from('portal_users')
    .select('id, role, full_name, school_id')
    .eq('id', user.id)
    .single();

  if (!sender || !['admin', 'teacher'].includes(sender.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const { title, message, target = 'all', school_id, type = 'info' } = body;
  const policy = await loadCommunicationPolicy();

  if (!title?.trim() || !message?.trim()) {
    return NextResponse.json({ error: 'Title and message are required' }, { status: 400 });
  }

  // Build target user query
  const targetRoles: string[] = target === 'all'
    ? ['student', 'parent', 'teacher', 'school', 'admin']
    : target === 'students'   ? ['student']
    : target === 'parents'    ? ['parent']
    : target === 'teachers'   ? ['teacher']
    : target === 'schools'    ? ['school']
    : ['student'];

  let userQuery = db
    .from('portal_users')
    .select('id')
    .in('role', targetRoles)
    .eq('is_active', true);

  // Teachers are scoped to all their assigned schools (teacher_schools + primary)
  if (sender.role === 'teacher') {
    const { data: tsRows } = await db.from('teacher_schools').select('school_id').eq('teacher_id', sender.id);
    const teacherSchoolIds = new Set<string>();
    if (sender.school_id) teacherSchoolIds.add(sender.school_id);
    for (const r of tsRows ?? []) {
      if ((r as any).school_id) teacherSchoolIds.add((r as any).school_id);
    }
    const ids = Array.from(teacherSchoolIds);
    if (ids.length === 0) {
      return NextResponse.json({ error: 'No school assignment found for this teacher' }, { status: 403 });
    }
    userQuery = userQuery.in('school_id', ids);
  } else if (school_id) {
    userQuery = userQuery.eq('school_id', school_id);
  }

  const { data: recipients } = await userQuery;
  if (!recipients?.length) {
    return NextResponse.json({ success: true, sent: 0, message: 'No recipients found' });
  }

  let inAppSent = 0;
  let pushSent = 0;
  const errors: string[] = [];

  // Batch insert in-app notifications (50 at a time)
  const now = new Date().toISOString();
  const rows = recipients.map(r => ({
    user_id: r.id,
    title: title.trim(),
    message: message.trim(),
    type,
    is_read: false,
    created_at: now,
    updated_at: now,
  }));

  for (let i = 0; i < rows.length; i += 50) {
    const batch = rows.slice(i, i + 50);
    const { error } = await db.from('notifications').insert(batch);
    if (error) errors.push(error.message);
    else inAppSent += batch.length;
  }

  // Send push notifications (fire-and-forget per user)
  const pushResults = await Promise.allSettled(
    recipients.map(r =>
      sendPushNotification(r.id, { title: title.trim(), body: message.trim(), url: '/dashboard/notifications' })
    )
  );
  pushSent = pushResults.filter(r => r.status === 'fulfilled' && (r.value as any).sent > 0).length;

  return NextResponse.json({
    success: true,
    recipients: recipients.length,
    in_app_sent: inAppSent,
    push_sent: pushSent,
    errors: errors.length ? errors : undefined,
    routing_hint: policy.whatsapp_primary_mode && ['students', 'parents', 'all'].includes(target)
      ? 'For urgent student/parent updates at scale, pair this with WhatsApp class broadcast/groups.'
      : 'In-app broadcast completed.',
  });
}
