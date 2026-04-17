import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;

    // Verify user has access to this conversation
    const { data: conversation } = await supabase
      .from('student_teacher_conversations')
      .select('student_id, teacher_id')
      .eq('id', id)
      .single();

    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    // Get user profile
    const { data: profile } = await supabase
      .from('portal_users')
      .select('role')
      .eq('id', user.id)
      .single();

    // Check access permissions
    const hasAccess = 
      conversation.student_id === user.id ||
      conversation.teacher_id === user.id ||
      profile?.role === 'admin';

    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Get messages
    const { data: messages, error } = await supabase
      .from('student_teacher_messages')
      .select(`
        *,
        sender:portal_users!sender_id(full_name, role)
      `)
      .eq('conversation_id', id)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching messages:', error);
      return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 });
    }

    // Mark messages as read for the current user
    await supabase
      .from('student_teacher_messages')
      .update({ is_read: true })
      .eq('conversation_id', id)
      .neq('sender_id', user.id);

    return NextResponse.json({ data: messages });
  } catch (error) {
    console.error('Error in messages GET:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    const body = await request.json();
    const { content } = body;

    if (!content?.trim()) {
      return NextResponse.json({ error: 'Message content required' }, { status: 400 });
    }

    // Verify user has access to this conversation
    const { data: conversation } = await supabase
      .from('student_teacher_conversations')
      .select('student_id, teacher_id')
      .eq('id', id)
      .single();

    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    // Get user profile
    const { data: profile } = await supabase
      .from('portal_users')
      .select('role')
      .eq('id', user.id)
      .single();

    // Check access permissions
    const hasAccess = 
      conversation.student_id === user.id ||
      conversation.teacher_id === user.id ||
      profile?.role === 'admin';

    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Create message
    const { data: message, error } = await supabase
      .from('student_teacher_messages')
      .insert({
        conversation_id: id,
        sender_id: user.id,
        content: content.trim(),
        created_at: new Date().toISOString(),
        is_read: false
      })
      .select(`
        *,
        sender:portal_users!sender_id(full_name, role)
      `)
      .single();

    if (error) {
      console.error('Error creating message:', error);
      return NextResponse.json({ error: 'Failed to send message' }, { status: 500 });
    }

    // Update conversation timestamp
    await supabase
      .from('student_teacher_conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', id);

    return NextResponse.json({ data: message });
  } catch (error) {
    console.error('Error in messages POST:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}