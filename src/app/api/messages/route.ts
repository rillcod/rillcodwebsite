import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';

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

// POST /api/messages — send a message with role-based guards
export async function POST(request: NextRequest) {
  const caller = await requireAuth();
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { recipient_id, subject, message } = body;

  if (!recipient_id || !message?.trim())
    return NextResponse.json({ error: 'recipient_id and message are required' }, { status: 400 });

  const admin = adminClient();

  // ── Role-Based Guard ──
  // 1. Get recipient role
  const { data: recipient } = await admin
    .from('portal_users')
    .select('role')
    .eq('id', recipient_id)
    .single();

  if (!recipient) return NextResponse.json({ error: 'Recipient not found' }, { status: 404 });

  // 2. Logic: Students can ONLY message Admins or Teachers.
  if (caller.role === 'student') {
    if (recipient.role !== 'admin' && recipient.role !== 'teacher') {
      return NextResponse.json({ error: 'Students can only message staff members' }, { status: 403 });
    }
  }
  // Admins and Teachers are permitted to message anyone.

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
  return NextResponse.json({ data });
}
