import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { evaluateAndTrackMessage } from '@/lib/communication/abusePolicy';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function requireAuth() {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const { data: profile } = await supabase
    .from('portal_users')
    .select('id, role')
    .eq('id', user.id)
    .single();
  return profile;
}

async function getAllowedRecipientIds(admin: ReturnType<typeof adminClient>, caller: { id: string; role: string }) {
  // Staff can message freely; parent/student are scoped.
  if (['admin', 'teacher', 'school'].includes(caller.role)) return null as string[] | null;

  if (caller.role === 'student') {
    const { data: me } = await admin
      .from('portal_users')
      .select('school_id, section_class')
      .eq('id', caller.id)
      .single();
    if (!me?.school_id) return [] as string[];

    const { data: staff } = await admin
      .from('portal_users')
      .select('id, role, school_id, section_class')
      .eq('is_active', true)
      .in('role', ['admin', 'teacher', 'school']);

    return (staff ?? [])
      .filter((u: any) => {
        if (u.role === 'admin') return true;
        if (u.role === 'school') return u.school_id === me.school_id;
        if (u.role === 'teacher') {
          if (u.school_id !== me.school_id) return false;
          // Prefer class-close match when available, else allow school-level teacher.
          if (!me.section_class || !u.section_class) return true;
          return String(u.section_class).trim().toLowerCase() === String(me.section_class).trim().toLowerCase();
        }
        return false;
      })
      .map((u: any) => u.id);
  }

  if (caller.role === 'parent') {
    const { data: me } = await admin
      .from('portal_users')
      .select('email')
      .eq('id', caller.id)
      .single();

    const schoolIds = new Set<string>();
    const childClasses = new Set<string>();

    const { data: linkedRows } = await admin
      .from('parent_student_links')
      .select('student_id')
      .eq('parent_id', caller.id);
    const linkedIds = (linkedRows ?? []).map((r: any) => r.student_id).filter(Boolean);

    let childQuery = admin
      .from('students')
      .select('id, school_id, current_class, section, grade_level');
    if (me?.email && linkedIds.length > 0) {
      childQuery = childQuery.or(`parent_email.ilike.${String(me.email).trim().toLowerCase()},id.in.(${linkedIds.join(',')})`) as typeof childQuery;
    } else if (me?.email) {
      childQuery = childQuery.ilike('parent_email', String(me.email).trim().toLowerCase()) as typeof childQuery;
    } else if (linkedIds.length > 0) {
      childQuery = childQuery.in('id', linkedIds) as typeof childQuery;
    } else {
      return [] as string[];
    }

    const { data: children } = await childQuery;
    for (const c of children ?? []) {
      if ((c as any).school_id) schoolIds.add((c as any).school_id);
      const cls = (c as any).current_class || (c as any).section || (c as any).grade_level;
      if (cls) childClasses.add(String(cls).trim().toLowerCase());
    }
    if (schoolIds.size === 0) return [] as string[];

    const { data: staff } = await admin
      .from('portal_users')
      .select('id, role, school_id, section_class')
      .eq('is_active', true)
      .in('role', ['admin', 'teacher', 'school']);

    return (staff ?? [])
      .filter((u: any) => {
        if (u.role === 'admin') return true;
        if (!schoolIds.has(u.school_id)) return false;
        if (u.role !== 'teacher') return true;
        if (childClasses.size === 0 || !u.section_class) return true;
        return childClasses.has(String(u.section_class).trim().toLowerCase());
      })
      .map((u: any) => u.id);
  }

  return [] as string[];
}

// GET /api/messages — list in-house messages (recent only)
export async function GET(request: NextRequest) {
  const caller = await requireAuth();
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = adminClient();
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const url = new URL(request.url);
  const includeChannels = url.searchParams.get('channels') === '1';

  const { data, error } = await admin
    .from('messages')
    .select('id, sender_id, recipient_id, subject, message, is_read, created_at, sender:portal_users!messages_sender_id_fkey(id, full_name, role), recipient:portal_users!messages_recipient_id_fkey(id, full_name, role)')
    .or(`sender_id.eq.${caller.id},recipient_id.eq.${caller.id}`)
    .gte('created_at', cutoff)
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (!includeChannels) return NextResponse.json({ data: data ?? [] });

  const allowedRecipientIds = await getAllowedRecipientIds(admin, caller as any);
  let recipients: any[] = [];
  if (allowedRecipientIds === null) {
    const { data: staff } = await admin
      .from('portal_users')
      .select('id, full_name, role, email, phone, school_name')
      .eq('is_active', true)
      .in('role', ['admin', 'teacher', 'school']);
    recipients = staff ?? [];
  } else if (allowedRecipientIds.length > 0) {
    const { data: scoped } = await admin
      .from('portal_users')
      .select('id, full_name, role, email, phone, school_name')
      .in('id', allowedRecipientIds);
    recipients = scoped ?? [];
  }
  return NextResponse.json({ data: data ?? [], recipients });
}

// POST /api/messages — send a message with role-based guards
export async function POST(request: NextRequest) {
  const caller = await requireAuth();
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { recipient_id, subject, message } = body;

  if (!recipient_id || !message?.trim())
    return NextResponse.json({ error: 'recipient_id and message are required' }, { status: 400 });

  const admin = adminClient();
  const allowedRecipientIds = await getAllowedRecipientIds(admin, caller as any);

  // ── Role-Based Guard ──
  // 1. Get recipient role
  const { data: recipient } = await admin
    .from('portal_users')
    .select('role')
    .eq('id', recipient_id)
    .single();

  if (!recipient) return NextResponse.json({ error: 'Recipient not found' }, { status: 404 });

  // 2. Scope rules for student/parent communications.
  if (allowedRecipientIds && !allowedRecipientIds.includes(recipient_id)) {
    return NextResponse.json({ error: 'Recipient is outside your allowed school/support channel scope' }, { status: 403 });
  }

  const policy = await evaluateAndTrackMessage({
    senderId: caller.id,
    senderRole: (caller.role ?? 'student') as 'student' | 'parent' | 'teacher' | 'admin' | 'school',
    channel: 'inapp_direct',
    message: message.trim(),
    targetConversationId: null,
  });
  if (!policy.allowed) {
    const status = policy.cooldownRemainingSeconds ? 429 : 403;
    return NextResponse.json(
      {
        error: policy.reason ?? 'Message blocked by safety policy',
        cooldown_remaining_seconds: policy.cooldownRemainingSeconds ?? null,
        remaining_daily: policy.remainingDaily ?? null,
        recommendation: policy.recommendation ?? 'none',
      },
      { status },
    );
  }

  const { data, error } = await admin
    .from('messages')
    .insert({
      sender_id: caller.id,
      recipient_id,
      subject: subject?.trim() || null,
      message: message.trim(),
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    data,
    policy: {
      remaining_daily: policy.remainingDaily ?? null,
      recommendation: policy.recommendation ?? 'none',
    },
  });
}
