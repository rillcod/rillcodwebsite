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

// POST /api/messages — send a message
export async function POST(request: NextRequest) {
  const caller = await requireAuth();
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { recipient_id, subject, message } = body;

  if (!recipient_id || !message?.trim())
    return NextResponse.json({ error: 'recipient_id and message are required' }, { status: 400 });

  const admin = adminClient();
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
