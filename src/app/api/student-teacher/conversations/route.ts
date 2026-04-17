import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = createClient();
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user profile
    const { data: profile } = await supabase
      .from('portal_users')
      .select('*')
      .eq('id', user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    let query = supabase
      .from('student_teacher_conversations')
      .select(`
        *,
        student:portal_users!student_id(full_name, email),
        teacher:portal_users!teacher_id(full_name, email)
      `)
      .order('updated_at', { ascending: false });

    // Filter based on user role
    if (profile.role === 'student') {
      query = query.eq('student_id', user.id);
    } else if (profile.role === 'teacher') {
      query = query.eq('teacher_id', user.id);
    } else if (profile.role === 'admin') {
      // Admins can see all conversations
    } else {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const { data: conversations, error } = await query;

    if (error) {
      console.error('Error fetching conversations:', error);
      return NextResponse.json({ error: 'Failed to fetch conversations' }, { status: 500 });
    }

    return NextResponse.json({ data: conversations });
  } catch (error) {
    console.error('Error in conversations API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { student_id, teacher_id } = body;

    // Get user profile
    const { data: profile } = await supabase
      .from('portal_users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    // Determine conversation participants based on user role
    let conversationData;
    if (profile.role === 'student') {
      if (!teacher_id) {
        return NextResponse.json({ error: 'Teacher ID required' }, { status: 400 });
      }
      conversationData = {
        student_id: user.id,
        teacher_id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
    } else if (profile.role === 'teacher') {
      if (!student_id) {
        return NextResponse.json({ error: 'Student ID required' }, { status: 400 });
      }
      conversationData = {
        student_id,
        teacher_id: user.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
    } else if (profile.role === 'admin') {
      if (!student_id || !teacher_id) {
        return NextResponse.json({ error: 'Both student_id and teacher_id required' }, { status: 400 });
      }
      conversationData = {
        student_id,
        teacher_id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
    } else {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Check if conversation already exists
    const { data: existing } = await supabase
      .from('student_teacher_conversations')
      .select('*')
      .eq('student_id', conversationData.student_id)
      .eq('teacher_id', conversationData.teacher_id)
      .single();

    if (existing) {
      return NextResponse.json({ data: existing });
    }

    // Create new conversation
    const { data: conversation, error } = await supabase
      .from('student_teacher_conversations')
      .insert(conversationData)
      .select(`
        *,
        student:portal_users!student_id(full_name, email),
        teacher:portal_users!teacher_id(full_name, email)
      `)
      .single();

    if (error) {
      console.error('Error creating conversation:', error);
      return NextResponse.json({ error: 'Failed to create conversation' }, { status: 500 });
    }

    return NextResponse.json({ data: conversation });
  } catch (error) {
    console.error('Error in conversations POST:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}