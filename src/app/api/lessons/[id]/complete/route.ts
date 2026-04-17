import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const lessonId = params.id;
    const body = await req.json();
    const { timeSpentMinutes, progressPercentage } = body;

    // Get user profile to check role
    const { data: profile } = await supabase
      .from('portal_users')
      .select('id, role')
      .eq('id', user.id)
      .single();

    if (!profile || profile.role !== 'student') {
      return NextResponse.json({ error: 'Only students can mark lessons complete' }, { status: 403 });
    }

    // Check if lesson exists
    const { data: lesson, error: lessonError } = await supabase
      .from('lessons')
      .select('id, title, course_id')
      .eq('id', lessonId)
      .single();

    if (lessonError || !lesson) {
      return NextResponse.json({ error: 'Lesson not found' }, { status: 404 });
    }

    // Check if already completed
    const { data: existing } = await supabase
      .from('lesson_progress')
      .select('id, completed_at')
      .eq('portal_user_id', profile.id)
      .eq('lesson_id', lessonId)
      .maybeSingle();

    if (existing?.completed_at) {
      return NextResponse.json({ 
        message: 'Lesson already completed',
        alreadyCompleted: true 
      });
    }

    const now = new Date().toISOString();

    if (existing) {
      // Update existing progress record
      const { error: updateError } = await supabase
        .from('lesson_progress')
        .update({
          completed_at: now,
          progress_percentage: progressPercentage || 100,
          time_spent_minutes: timeSpentMinutes || 0,
          updated_at: now,
        })
        .eq('id', existing.id);

      if (updateError) throw updateError;
    } else {
      // Create new progress record
      const { error: insertError } = await supabase
        .from('lesson_progress')
        .insert({
          portal_user_id: profile.id,
          lesson_id: lessonId,
          course_id: lesson.course_id,
          completed_at: now,
          progress_percentage: progressPercentage || 100,
          time_spent_minutes: timeSpentMinutes || 0,
        });

      if (insertError) throw insertError;
    }

    // Award XP for lesson completion (10 XP per lesson)
    const { data: points } = await supabase
      .from('user_points')
      .select('id, total_points, current_streak, last_activity_date')
      .eq('portal_user_id', profile.id)
      .maybeSingle();

    const xpToAward = 10;
    const today = new Date().toISOString().split('T')[0];
    const lastActivity = points?.last_activity_date;
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    let newStreak = 1;
    if (lastActivity === today) {
      // Same day - keep streak
      newStreak = points?.current_streak || 1;
    } else if (lastActivity === yesterday) {
      // Consecutive day - increment streak
      newStreak = (points?.current_streak || 0) + 1;
    }

    if (points) {
      await supabase
        .from('user_points')
        .update({
          total_points: (points.total_points || 0) + xpToAward,
          current_streak: newStreak,
          last_activity_date: today,
        })
        .eq('id', points.id);
    } else {
      await supabase
        .from('user_points')
        .insert({
          portal_user_id: profile.id,
          total_points: xpToAward,
          current_streak: 1,
          last_activity_date: today,
        });
    }

    // Create notification for lesson completion
    await supabase
      .from('notifications')
      .insert({
        user_id: profile.id,
        title: 'Lesson Completed! 🎉',
        message: `You completed "${lesson.title}" and earned ${xpToAward} XP!`,
        type: 'achievement',
        is_read: false,
      });

    return NextResponse.json({
      success: true,
      message: 'Lesson marked as complete',
      xpAwarded: xpToAward,
      newStreak,
    });
  } catch (error: any) {
    console.error('Error marking lesson complete:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to mark lesson complete' },
      { status: 500 }
    );
  }
}
