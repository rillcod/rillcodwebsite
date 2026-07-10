import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabase } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { evaluateAndTrackMessage, loadCommunicationPolicy } from '@/lib/communication/abusePolicy';
import { enqueueWhatsApp } from '@/lib/whatsapp/send';
import { resolveClassWhatsAppAudience } from '@/lib/whatsapp/audience';
import { logAudit } from '@/lib/audit/log';

export const dynamic = 'force-dynamic';
function adminClient() { return createSupabase(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!); }
type Caller = { role: 'admin' | 'teacher' | 'school'; id: string; school_id: string | null; full_name: string | null };
async function requireStaff(): Promise<Caller | null> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await adminClient().from('portal_users').select('role, id, school_id, full_name').eq('id', user.id).maybeSingle();
  return data && ['admin', 'teacher', 'school'].includes(data.role) ? data as Caller : null;
}
async function contextFor(classId: string) {
  const caller = await requireStaff();
  if (!caller) return { error: NextResponse.json({ error: 'Staff access required' }, { status: 403 }) };
  const admin = adminClient();
  const { data: cls } = await admin.from('classes').select('id, name, school_id, teacher_id').eq('id', classId).maybeSingle();
  if (!cls) return { error: NextResponse.json({ error: 'Class not found' }, { status: 404 }) };
  if (caller.role === 'teacher' && cls.teacher_id !== caller.id) return { error: NextResponse.json({ error: 'Only the primary owner of this class can broadcast to its students' }, { status: 403 }) };
  if (caller.role === 'school' && caller.school_id !== cls.school_id) return { error: NextResponse.json({ error: 'This class is outside your school' }, { status: 403 }) };
  return { caller, admin, cls };
}

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const ctx = await contextFor(id);
  if ('error' in ctx) return ctx.error;
  const audience = await resolveClassWhatsAppAudience(ctx.admin!, id);
  const { data: recent } = await ctx.admin!.from('whatsapp_outbox').select('id, status, attempts, last_error, created_at, sent_at')
    .eq('class_id', id).order('created_at', { ascending: false }).limit(50);
  const statuses = (recent ?? []).reduce((acc: Record<string, number>, row: any) => { acc[row.status] = (acc[row.status] ?? 0) + 1; return acc; }, {});
  return NextResponse.json({ total_students: audience.totalStudents, whatsapp_recipients: audience.recipients.length, whatsapp_covered_students: audience.whatsappCoveredStudentIds.length, eligible_student_ids: audience.whatsappCoveredStudentIds, fallback_student_ids: audience.fallbackStudentIds, in_app_fallback: audience.fallbackStudentIds.length, statuses, recent: recent ?? [] });
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: classId } = await context.params;
    const ctx = await contextFor(classId);
    if ('error' in ctx) return ctx.error;
    const { caller, admin, cls } = ctx as any;
    const body = await request.json();
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    const mediaUrl = typeof body.mediaUrl === 'string' ? body.mediaUrl.trim() : '';
    const useTemplate = body.use_template === true;
    const templateName = useTemplate && typeof body.template_name === 'string' ? body.template_name.trim() : '';
    const templateVariables = Array.isArray(body.template_variables) ? body.template_variables.map(String).slice(0, 20) : [];
    if (!text) return NextResponse.json({ error: 'Message text is required for the audit preview and in-app fallback' }, { status: 400 });
    if (useTemplate && !templateName) return NextResponse.json({ error: 'An approved Meta template name is required' }, { status: 400 });
    const prefixName = caller.full_name?.split(' ')[0] || (caller.role === 'school' ? 'School' : 'Teacher');
    const formattedMessage = `*[Rillcod: ${cls.name}]*\n_${prefixName} says:_\n\n${text}${mediaUrl ? `\n\nAttachment: ${mediaUrl}` : ''}`;
    if (formattedMessage.length > 4096) return NextResponse.json({ error: 'Message is too long for WhatsApp' }, { status: 400 });
    const safety = await evaluateAndTrackMessage({ senderId: caller.id, senderRole: caller.role, channel: 'broadcast', message: formattedMessage });
    if (!safety.allowed) return NextResponse.json({ error: safety.reason || 'Broadcast blocked' }, { status: 403 });

    const audience = await resolveClassWhatsAppAudience(admin, classId);
    const broadcastId = randomUUID();
    let queued = 0, queueFailed = 0;
    for (const recipient of audience.recipients) {
      const variables = templateVariables.map((value: string) => value.replaceAll('{{recipient}}', recipient.recipientName || 'Parent/Guardian').replaceAll('{{class}}', cls.name));
      const result = await enqueueWhatsApp(admin, {
        recipientUserId: recipient.recipientUserId, phone: recipient.phone, messageBody: formattedMessage,
        templateName: useTemplate ? templateName : null, templateVariables: variables,
        sourceType: 'class_broadcast', sourceId: broadcastId, schoolId: cls.school_id, classId, createdBy: caller.id,
        idempotencyKey: `${broadcastId}:${recipient.phone}`,
      });
      if (result.queued) queued++; else queueFailed++;
    }

    const fallbackIds = [...new Set([...audience.fallbackStudentIds])];
    let inAppFallbackSent = 0;
    if (fallbackIds.length) {
      const now = new Date().toISOString();
      const { error } = await admin.from('notifications').insert(fallbackIds.map((userId) => ({ user_id: userId, title: `${cls.name} announcement`, message: text, type: 'info', is_read: false, created_at: now, updated_at: now })));
      if (!error) inAppFallbackSent = fallbackIds.length;
    }
    await logAudit(admin, { action: 'queue_class_broadcast', actorId: caller.id, resourceType: 'class', resourceId: classId, newValues: { broadcast_id: broadcastId, queued, queue_failed: queueFailed, in_app_fallback_sent: inAppFallbackSent, template_name: templateName || null } });
    const policy = await loadCommunicationPolicy();
    return NextResponse.json({ success: queueFailed === 0, broadcast_id: broadcastId, total_students: audience.totalStudents, reachable_students: audience.recipients.length, messages_queued: queued, messages_sent: 0, failures: queueFailed, consent_skipped: audience.fallbackStudentIds.length, in_app_fallback_sent: inAppFallbackSent, message: `Queued ${queued} WhatsApp message${queued === 1 ? '' : 's'}; ${inAppFallbackSent} in-app fallback${inAppFallbackSent === 1 ? '' : 's'}.`, routing_hint: { channel: useTemplate ? 'approved_template' : 'free_form', recommendation: useTemplate ? 'Approved template queued for delivery.' : 'Free-form messages work only inside Meta\'s 24-hour customer-service window.', whatsapp_primary_mode: policy.whatsapp_primary_mode } });
  } catch (error: any) {
    console.error('Broadcast error:', error);
    return NextResponse.json({ error: error.message || 'Broadcast failed' }, { status: 500 });
  }
}