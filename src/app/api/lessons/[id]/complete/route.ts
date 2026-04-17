import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: lessonId } = await params;
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
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

    // 1. Validate inputs
    const minutes = Math.max(0, Number(timeSpentMinutes) || 0);
    const progress = Math.min(100, Math.max(0, Number(progressPercentage) || 0));

    // 2. Check if lesson exists and get course context
    const { data: lesson, error: lessonError } = await supabase
      .from('lessons')
      .select('id, title, course_id, courses!course_id(program_id)')
      .eq('id', lessonId)
      .single();

    if (lessonError || !lesson) {
      return NextResponse.json({ error: 'Lesson not found' }, { status: 404 });
    }

    const programId = (lesson as any).courses?.program_id;

    // 3. Verify enrollment
    const { data: enrollment } = await supabase
      .from('enrollments')
      .select('id')
      .eq('user_id', profile.id)
      .eq('program_id', programId)
      .maybeSingle();

    if (!enrollment) {
      return NextResponse.json({ error: 'You are not enrolled in this program' }, { status: 403 });
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

    // Mark lesson as complete in progress table
    const now = new Date().toISOString();
    if (existing) {
      const { error: updateError } = await supabase
        .from('lesson_progress')
        .update({
          completed_at: now,
          progress_percentage: progress || 100,
          time_spent_minutes: minutes,
          updated_at: now,
        })
        .eq('id', existing.id);
      if (updateError) throw updateError;
    } else {
      const { error: insertError } = await supabase
        .from('lesson_progress')
        .insert({
          portal_user_id: profile.id,
          lesson_id: lessonId,
          course_id: lesson.course_id,
          completed_at: now,
          progress_percentage: progress || 100,
          time_spent_minutes: minutes,
        });
      if (insertError) throw insertError;
    }

    // Use GamificationService for points, streak, and level logic
    const { gamificationService } = await import('@/services/gamification.service');
    const { totalPoints, streak } = await gamificationService.awardPoints(
      profile.id,
      'lesson_complete',
      lessonId,
      `Completed lesson: ${lesson.title}`
    );

    return NextResponse.json({
      success: true,
      message: 'Lesson marked as complete',
      xpAwarded: 10,
      totalPoints,
      newStreak: streak,
    });
  } catch (error: any) {
    console.error('Error marking lesson complete:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to mark lesson complete' },
      { status: 500 }
    );
  }
}
