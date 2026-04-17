import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// GET /api/school-teacher/conversations - Get conversations for current user
export async function GET(req: NextRequest) {
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
    let query = supabase
      .from('school_teacher_conversations')
      .select(`
        *,
        school:schools(name),
        teacher:portal_users!school_teacher_conversations_teacher_id_fkey(full_name, avatar_url),
        last_message:school_teacher_messages(body, created_at, sender_id)
      `)
      .order('updated_at', { ascending: false });

    // Filter based on role
    if (profile.role === 'school' && profile.school_id) {
      query = query.eq('school_id', profile.school_id);
    } else if (profile.role === 'teacher') {
      query = query.eq('teacher_id', profile.id);
    }
    // Admin can see all conversations

    const { data: conversations, error } = await query;

    if (error) throw error;

    // Get unread counts
    const conversationIds = conversations?.map(c => c.id) || [];
    const { data: unreadCounts } = await supabase
      .from('school_teacher_messages')
      .select('conversation_id')
      .in('conversation_id', conversationIds)
      .neq('sender_id', user.id)
      .eq('is_read', false);

    const unreadMap = (unreadCounts || []).reduce((acc: any, msg: any) => {
      acc[msg.conversation_id] = (acc[msg.conversation_id] || 0) + 1;
      return acc;
    }, {});

    const enrichedConversations = conversations?.map(conv => ({
      ...conv,
      unread_count: unreadMap[conv.id] || 0,
      last_message_preview: conv.last_message?.[0]?.body || 'No messages yet',
      last_message_at: conv.last_message?.[0]?.created_at || conv.created_at
    }));

    return NextResponse.json({ data: enrichedConversations });
  } catch (error: any) {
    console.error('Error fetching conversations:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/school-teacher/conversations - Create new conversation
export async function POST(req: NextRequest) {
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

  const { teacher_id, school_id, subject, initial_message } = await req.json();

  if (!teacher_id || !school_id || !subject?.trim()) {
    return NextResponse.json({ error: 'Teacher, school, and subject are required' }, { status: 400 });
  }

  try {
    // Check if conversation already exists
    const { data: existing } = await supabase
      .from('school_teacher_conversations')
      .select('id')
      .eq('teacher_id', teacher_id)
      .eq('school_id', school_id)
      .single();

    if (existing) {
      return NextResponse.json({ data: existing });
    }

    // Create new conversation
    const { data: conversation, error: convError } = await supabase
      .from('school_teacher_conversations')
      .insert({
        teacher_id,
        school_id,
        subject: subject.trim(),
        created_by: user.id
      })
      .select()
      .single();

    if (convError) throw convError;

    // Send initial message if provided
    if (initial_message?.trim()) {
      await supabase
        .from('school_teacher_messages')
        .insert({
          conversation_id: conversation.id,
          sender_id: user.id,
          body: initial_message.trim()
        });
    }

    return NextResponse.json({ data: conversation }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating conversation:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}