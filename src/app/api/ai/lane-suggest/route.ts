import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { LANE_LABELS, MAX_LANE } from '@/lib/qa/resolveQaSpineLane';

/**
 * POST /api/ai/lane-suggest
 * Analyse class assignment + CBT performance and return a lane adjustment suggestion.
 * Body: { class_id: string, lane_index: number, course_id?: string }
 * Returns: { current_lane, suggested_lane, avg_score, submission_count, direction, reason, label }
 */
export async function POST(req: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('portal_users')
    .select('role')
    .eq('id', user.id)
    .single();
  if (!profile || !['admin', 'teacher'].includes(profile.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const classId: string = body.class_id ?? '';
  const laneIndex: number = Number(body.lane_index ?? 1);
  const courseId: string = body.course_id ?? '';

  if (!classId) return NextResponse.json({ error: 'class_id is required' }, { status: 400 });

  // --- Assignment grades for this class ---
  let assignQ = supabase
    .from('assignments')
    .select('id')
    .eq('class_id', classId);
  if (courseId) assignQ = assignQ.eq('course_id', courseId);

  const { data: assignments } = await assignQ;
  const assignmentIds = (assignments ?? []).map((a: { id: string }) => a.id);

  let assignmentGrades: number[] = [];
  if (assignmentIds.length > 0) {
    const { data: subs } = await supabase
      .from('assignment_submissions')
      .select('grade, weighted_score')
      .in('assignment_id', assignmentIds)
      .eq('status', 'graded')
      .not('grade', 'is', null);
    assignmentGrades = (subs ?? [])
      .map((s: { grade: number | null; weighted_score: number | null }) =>
        s.weighted_score ?? s.grade ?? 0,
      )
      .filter((g: number) => g > 0);
  }

  // --- CBT scores: get students in this class, then their sessions ---
  const { data: classStudents } = await supabase
    .from('portal_users')
    .select('id')
    .eq('class_id', classId)
    .eq('role', 'student');
  const studentIds = (classStudents ?? []).map((u: { id: string }) => u.id);

  let cbtScores: number[] = [];
  if (studentIds.length > 0) {
    const { data: sessions } = await supabase
      .from('cbt_sessions')
      .select('score')
      .in('user_id', studentIds)
      .eq('status', 'completed')
      .not('score', 'is', null);
    cbtScores = (sessions ?? [])
      .map((s: { score: number | null }) => s.score ?? 0)
      .filter((s: number) => s > 0);
  }

  const allScores = [...assignmentGrades, ...cbtScores];
  const submissionCount = allScores.length;
  const avgScore = submissionCount > 0
    ? Math.round(allScores.reduce((a, b) => a + b, 0) / submissionCount)
    : null;

  const MIN_SUBMISSIONS = 3;
  let suggestedLane = laneIndex;
  let direction: 'up' | 'down' | 'stay' = 'stay';
  let reason: string;

  if (avgScore === null || submissionCount < MIN_SUBMISSIONS) {
    reason = submissionCount === 0
      ? 'No graded work found for this class yet. Complete a few assessments first.'
      : `Only ${submissionCount} graded submission${submissionCount === 1 ? '' : 's'} — need at least ${MIN_SUBMISSIONS} for a reliable suggestion.`;
  } else if (avgScore >= 85 && laneIndex < MAX_LANE) {
    suggestedLane = laneIndex + 1;
    direction = 'up';
    reason = `Class averaging ${avgScore}% across ${submissionCount} submissions — they're ready for more challenge.`;
  } else if (avgScore <= 55 && laneIndex > 1) {
    suggestedLane = laneIndex - 1;
    direction = 'down';
    reason = `Class averaging ${avgScore}% — consolidate current concepts before advancing.`;
  } else {
    reason = `Class averaging ${avgScore}% — lane ${laneIndex} is the right fit right now.`;
  }

  return NextResponse.json({
    current_lane: laneIndex,
    current_label: LANE_LABELS[laneIndex] ?? `Lane ${laneIndex}`,
    suggested_lane: suggestedLane,
    suggested_label: LANE_LABELS[suggestedLane] ?? `Lane ${suggestedLane}`,
    avg_score: avgScore,
    submission_count: submissionCount,
    direction,
    reason,
  });
}
