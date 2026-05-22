import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { LANE_LABELS, MAX_LANE } from '@/lib/qa/resolveQaSpineLane';
import OpenAI from 'openai';

const openai = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY ?? '',
});

const MODELS = [
  'google/gemini-2.0-flash-001',
  'deepseek/deepseek-chat-v3-5',
  'meta-llama/llama-3.3-70b-instruct',
];

async function callAI(prompt: string): Promise<string> {
  for (const model of MODELS) {
    try {
      const res = await openai.chat.completions.create({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.55,
        max_tokens: 200,
      });
      const text = res.choices?.[0]?.message?.content?.trim() ?? '';
      if (text.length > 20) return text;
    } catch { /* try next model */ }
  }
  return '';
}

/**
 * POST /api/ai/lane-suggest
 * Deep-analyse class performance: per-topic weak spots, score distribution,
 * AI coaching narrative, lane direction.
 *
 * Body: { class_id, lane_index, course_id?, class_name?, year_number? }
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
  const yearNumber: number = Number(body.year_number ?? 1);

  if (!classId) return NextResponse.json({ error: 'class_id is required' }, { status: 400 });

  // Resolve class name
  const { data: cls } = await supabase
    .from('classes')
    .select('name')
    .eq('id', classId)
    .single();
  const className: string = body.class_name || cls?.name || 'This class';

  // ── Assignment performance: per-topic breakdown ────────────────────────────
  let assignQ = supabase.from('assignments').select('id, title').eq('class_id', classId);
  if (courseId) assignQ = assignQ.eq('course_id', courseId);
  const { data: assignments } = await assignQ;
  const assignmentIds = (assignments ?? []).map((a: { id: string }) => a.id);
  const titleMap: Record<string, string> = {};
  (assignments ?? []).forEach((a: { id: string; title: string }) => { titleMap[a.id] = a.title; });

  let allSubs: Array<{ assignment_id: string; grade: number }> = [];
  if (assignmentIds.length > 0) {
    const { data: subs } = await supabase
      .from('assignment_submissions')
      .select('assignment_id, grade, weighted_score')
      .in('assignment_id', assignmentIds)
      .eq('status', 'graded')
      .not('grade', 'is', null);
    allSubs = (subs ?? [])
      .map((s: { assignment_id: string | null; grade: number | null; weighted_score: number | null }) => ({
        assignment_id: s.assignment_id ?? '',
        grade: s.weighted_score ?? s.grade ?? 0,
      }))
      .filter(s => s.grade > 0 && s.assignment_id);
  }

  // Per-assignment averages
  const byAssignment: Record<string, number[]> = {};
  for (const s of allSubs) {
    (byAssignment[s.assignment_id] ??= []).push(s.grade);
  }
  const assignmentAvgs = Object.entries(byAssignment).map(([id, grades]) => ({
    id,
    title: titleMap[id] ?? 'Untitled',
    avg: Math.round(grades.reduce((a, b) => a + b, 0) / grades.length),
    count: grades.length,
  }));

  // Weak topics: below 65%, sorted worst-first, top 4
  const weakTopics = [...assignmentAvgs]
    .filter(a => a.avg < 65)
    .sort((a, b) => a.avg - b.avg)
    .slice(0, 4)
    .map(a => ({ title: a.title, avg_score: a.avg, count: a.count }));

  const assignmentGrades = allSubs.map(s => s.grade);
  const assignmentAvg = assignmentGrades.length > 0
    ? Math.round(assignmentGrades.reduce((a, b) => a + b, 0) / assignmentGrades.length) : null;

  // ── CBT scores via class students ─────────────────────────────────────────
  const { data: students } = await supabase
    .from('portal_users')
    .select('id')
    .eq('class_id', classId)
    .eq('role', 'student');
  const studentIds = (students ?? []).map((u: { id: string }) => u.id);

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
      .filter(s => s > 0);
  }
  const cbtAvg = cbtScores.length > 0
    ? Math.round(cbtScores.reduce((a, b) => a + b, 0) / cbtScores.length) : null;

  // ── Combined stats ────────────────────────────────────────────────────────
  const allScores = [...assignmentGrades, ...cbtScores];
  const submissionCount = allScores.length;
  const avgScore = submissionCount > 0
    ? Math.round(allScores.reduce((a, b) => a + b, 0) / submissionCount) : null;

  const excelling = allScores.filter(s => s >= 75).length;
  const developing = allScores.filter(s => s >= 60 && s < 75).length;
  const struggling = allScores.filter(s => s < 60).length;

  // ── Lane direction ────────────────────────────────────────────────────────
  const MIN_SUBS = 3;
  let suggestedLane = laneIndex;
  let direction: 'up' | 'down' | 'stay' = 'stay';

  if (avgScore !== null && submissionCount >= MIN_SUBS) {
    const severeWeakness = weakTopics.length >= 2 || (weakTopics.length === 1 && weakTopics[0].avg_score < 50);
    const majorGaps = avgScore < 70 && weakTopics.length >= 3;
    if (avgScore >= 82 && laneIndex < MAX_LANE && !severeWeakness) {
      suggestedLane = laneIndex + 1;
      direction = 'up';
    } else if ((avgScore <= 55 || majorGaps) && laneIndex > 1) {
      suggestedLane = laneIndex - 1;
      direction = 'down';
    }
  }

  // ── AI coaching narrative ─────────────────────────────────────────────────
  const laneLabel = LANE_LABELS[laneIndex] ?? `Lane ${laneIndex}`;
  const suggestedLabel = LANE_LABELS[suggestedLane] ?? `Lane ${suggestedLane}`;
  let narrative = '';

  if (avgScore !== null && submissionCount >= MIN_SUBS) {
    const weakStr = weakTopics.length > 0
      ? `Low-scoring topics: ${weakTopics.map(t => `"${t.title}" (${t.avg_score}%)`).join(', ')}.`
      : 'No specific weak topics identified.';
    const dirStr = direction === 'up'
      ? `advance to "${suggestedLabel}"`
      : direction === 'down'
        ? `scale back to "${suggestedLabel}" to consolidate foundations`
        : `remain on "${laneLabel}"`;

    const prompt = `You are a concise STEM curriculum advisor for Nigerian coding schools.

Class: ${className} | Lane: ${laneLabel} | Year ${yearNumber}
Overall avg: ${avgScore}% (${submissionCount} assessments)
${assignmentAvg !== null ? `Assignment avg: ${assignmentAvg}%` : ''}${cbtAvg !== null ? ` | CBT avg: ${cbtAvg}%` : ''}
Distribution: ${excelling} excelling (≥75%) · ${developing} developing (60–74%) · ${struggling} struggling (<60%)
${weakStr}
Recommendation: ${dirStr}

Write EXACTLY 2 sentences. Sentence 1: describe the class performance clearly. Sentence 2: tell the teacher specifically what to do next, naming weak topics if any. No greeting, no preamble.`;

    narrative = await callAI(prompt);
  }

  if (!narrative) {
    if (!avgScore || submissionCount < MIN_SUBS) {
      narrative = submissionCount === 0
        ? 'No graded assessments found yet — run a few assignments or CBT exams before lane analysis.'
        : `Only ${submissionCount} submission${submissionCount === 1 ? '' : 's'} so far — need at least ${MIN_SUBS} for a reliable analysis.`;
    } else {
      narrative = direction === 'up'
        ? `${className} is performing strongly at ${avgScore}% average with no significant weak spots — they're ready for the next lane.`
        : direction === 'down'
          ? `${className} is averaging ${avgScore}% with clear gaps — reinforce current content before advancing.`
          : `${className} is at ${avgScore}% average — the current lane is appropriate.`;
    }
  }

  return NextResponse.json({
    current_lane: laneIndex,
    current_label: laneLabel,
    suggested_lane: suggestedLane,
    suggested_label: suggestedLabel,
    avg_score: avgScore,
    submission_count: submissionCount,
    assignment_avg: assignmentAvg,
    cbt_avg: cbtAvg,
    direction,
    narrative,
    weak_topics: weakTopics,
    score_distribution: { excelling, developing, struggling },
  });
}
