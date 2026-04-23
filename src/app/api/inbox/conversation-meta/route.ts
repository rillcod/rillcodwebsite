import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabase } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import type { Database, TablesInsert } from '@/types/supabase';
import { isConversationInScope } from '@/lib/api-guards';

function adminClient() {
  return createSupabase<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function requireStaff() {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const { data } = await adminClient()
    .from('portal_users')
    .select('id, role, school_id')
    .eq('id', user.id)
    .maybeSingle();
  if (!data || !['admin', 'teacher', 'school'].includes(data.role)) return null;
  return data;
}

async function getConversationScope(
  admin: ReturnType<typeof adminClient>,
  conversationId: string,
): Promise<{ id: string; school_id: string | null } | null> {
  const { data: conv } = await admin
    .from('whatsapp_conversations')
    .select('id, portal_user_id')
    .eq('id', conversationId)
    .maybeSingle();
  if (!conv) return null;

  if (!conv.portal_user_id) {
    return { id: conv.id, school_id: null };
  }

  const { data: userRow } = await admin
    .from('portal_users')
    .select('school_id')
    .eq('id', conv.portal_user_id)
    .maybeSingle();

  return { id: conv.id, school_id: userRow?.school_id ?? null };
}

export async function GET(req: NextRequest) {
  const caller = await requireStaff();
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const conversationId = new URL(req.url).searchParams.get('conversation_id');
  if (!conversationId) return NextResponse.json({ error: 'conversation_id is required' }, { status: 400 });
  const admin = adminClient();
  const conv = await getConversationScope(admin, conversationId);
  if (!conv) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  if (!isConversationInScope(caller, conv)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { data: row, error } = await admin
    .from('communication_conversation_meta')
    .select('*')
    .eq('conversation_id', conversationId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: row ?? null });
}

export async function PATCH(req: NextRequest) {
  const caller = await requireStaff();
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const conversationId = typeof body.conversation_id === 'string' ? body.conversation_id : '';
  if (!conversationId) return NextResponse.json({ error: 'conversation_id is required' }, { status: 400 });
  const admin = adminClient();
  const conv = await getConversationScope(admin, conversationId);
  if (!conv) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  if (!isConversationInScope(caller, conv)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const updates: Partial<TablesInsert<'communication_conversation_meta'>> = {
    updated_by: caller.id,
    updated_at: new Date().toISOString(),
  };
  if (typeof body.priority === 'string' && ['low', 'medium', 'high'].includes(body.priority)) updates.priority = body.priority;
  if (typeof body.status === 'string' && ['open', 'closed', 'pending'].includes(body.status)) updates.status = body.status;
  if (typeof body.notes === 'string') updates.notes = body.notes;
  if (typeof body.sla_due_at === 'string' && body.sla_due_at.trim()) updates.sla_due_at = body.sla_due_at;

  const { error } = await admin
    .from('communication_conversation_meta')
    .upsert({ conversation_id: conversationId, ...updates }, { onConflict: 'conversation_id' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
