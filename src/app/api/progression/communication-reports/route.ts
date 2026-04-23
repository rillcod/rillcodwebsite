import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabase } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createCommunicationReport } from '@/lib/communication/abusePolicy';

function adminClient() {
  return createSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function getCaller() {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const { data } = await adminClient()
    .from('portal_users')
    .select('id, role')
    .eq('id', user.id)
    .maybeSingle();
  return data ?? null;
}

export async function GET() {
  const caller = await getCaller();
  if (!caller || !['admin', 'teacher', 'school'].includes(caller.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { data, error } = await adminClient()
    .from('communication_reports')
    .select('id, reporter_id, reporter_role, target_conversation_id, reason, details, status, reviewed_by, reviewed_at, created_at')
    .order('created_at', { ascending: false })
    .limit(300);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

export async function POST(req: NextRequest) {
  const caller = await getCaller();
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const reason = String(body.reason ?? '').trim();
  if (!reason) return NextResponse.json({ error: 'reason is required' }, { status: 400 });

  try {
    const data = await createCommunicationReport({
      reporterId: caller.id,
      reporterRole: caller.role,
      targetConversationId: typeof body.target_conversation_id === 'string' ? body.target_conversation_id : null,
      targetMessageId: typeof body.target_message_id === 'string' ? body.target_message_id : null,
      reason,
      details: typeof body.details === 'string' ? body.details : null,
    });
    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to create report' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const caller = await getCaller();
  if (!caller || !['admin', 'teacher'].includes(caller.role)) {
    return NextResponse.json({ error: 'Admin/Teacher access required' }, { status: 403 });
  }
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const id = typeof body.id === 'string' ? body.id : '';
  const status = typeof body.status === 'string' ? body.status : '';
  if (!id || !['open', 'reviewing', 'closed'].includes(status)) {
    return NextResponse.json({ error: 'id and valid status are required' }, { status: 400 });
  }

  const { error } = await adminClient()
    .from('communication_reports')
    .update({
      status,
      reviewed_by: caller.id,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
