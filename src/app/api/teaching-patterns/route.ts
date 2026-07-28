import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireGovernanceActor } from '@/lib/curriculum/governance-server';
import { sanitizeTeachingPattern, teachingPatternAttemptsAcademicChange } from '@/lib/lesson-plans/teachingPattern';

export const dynamic = 'force-dynamic';

export async function GET() {
  const actor = await requireGovernanceActor();
  if (!actor || !['admin', 'teacher'].includes(actor.role)) {
    return NextResponse.json({ error: 'Teacher access required.' }, { status: 401 });
  }
  const db: any = createAdminClient();
  let query = db.from('teacher_delivery_patterns').select('*').eq('status', 'active').order('updated_at', { ascending: false });
  if (actor.role === 'teacher') query = query.eq('teacher_id', actor.id);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

export async function POST(req: NextRequest) {
  const actor = await requireGovernanceActor();
  if (!actor || actor.role !== 'teacher') {
    return NextResponse.json({ error: 'Only a teacher can create a personal teaching pattern.' }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (name.length < 2) return NextResponse.json({ error: 'Give the teaching pattern a clear name.' }, { status: 400 });
  if (teachingPatternAttemptsAcademicChange(body.content)) {
    return NextResponse.json({
      error: 'A teaching pattern can adjust delivery, but it cannot change the official topic, sequence, grade, or learning outcomes.',
    }, { status: 409 });
  }
  const content = sanitizeTeachingPattern(body.content);
  if (Object.keys(content).length === 0) {
    return NextResponse.json({ error: 'Add at least one activity, material, routine, example, or teaching note.' }, { status: 400 });
  }
  const db: any = createAdminClient();
  const { data, error } = await db.from('teacher_delivery_patterns').insert({
    teacher_id: actor.id,
    name: name.slice(0, 120),
    description: typeof body.description === 'string' ? body.description.trim().slice(0, 1000) : null,
    content,
  }).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}

