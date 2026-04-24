import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// GET /api/school-teacher/conversations/[id]/messages - Get messages for conversation
export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('portal_users')
    .select('role, school_id, id')
    .eq('id', user.id)
    .single();

  if (!profile || !['school', 'teacher', 'admin'].includes(profile.role)) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  try {
    // Verify access to conversation
    let convQuery = supabase
      .from('school_teacher_conversations')
      .select('*')
      .eq('id', id);

    if (profile.role === 'school' && profile.school_id) {
      convQuery = convQuery.eq('school_id', profile.school_id);
    } else if (profile.role === 'teacher') {
      convQuery = convQuery.eq('teacher_id', profile.id);
    }

    const { data: conversation } = await convQuery.single();
    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    // Get messages
    const { data: messages, error } = await supabase
      .from('school_teacher_messages')
      .select(`
        *,
        sender:portal_users(full_name, avatar_url, role)
      `)
      .eq('conversation_id', id)
      .order('created_at', { ascending: true });

    if (error) throw error;

    // Mark messages as read for current user
    await supabase
      .from('school_teacher_messages')
      .update({ is_read: true })
      .eq('conversation_id', id)
      .neq('sender_id', user.id)
      .eq('is_read', false);

    return NextResponse.json({ data: messages });
  } catch (error: any) {
    console.error('Error fetching messages:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/school-teacher/conversations/[id]/messages - Send message
export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('portal_users')
    .select('role, school_id, id')
    .eq('id', user.id)
    .single();

  if (!profile || !['school', 'teacher', 'admin'].includes(profile.role)) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  const { body } = await req.json();
  if (!body?.trim()) {
    return NextResponse.json({ error: 'Message body is required' }, { status: 400 });
  }

  try {
    // Verify access to conversation
    let convQuery = supabase
      .from('school_teacher_conversations')
      .select('*')
      .eq('id', id);

    if (profile.role === 'school' && profile.school_id) {
      convQuery = convQuery.eq('school_id', profile.school_id);
    } else if (profile.role === 'teacher') {
      convQuery = convQuery.eq('teacher_id', profile.id);
    }

    const { data: conversation } = await convQuery.single();
    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    // Send message
    const { data: message, error } = await supabase
      .from('school_teacher_messages')
      .insert({
        conversation_id: id,
        sender_id: user.id,
        body: body.trim()
      })
      .select(`
        *,
        sender:portal_users(full_name, avatar_url, role)
      `)
      .single();

    if (error) throw error;

    // Update conversation timestamp
    await supabase
      .from('school_teacher_conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', id);

    return NextResponse.json({ data: message }, { status: 201 });
  } catch (error: any) {
    console.error('Error sending message:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}