import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// GET /api/flashcards/decks
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('portal_users').select('school_id, role').eq('id', user.id).single();
  const url = new URL(req.url);
  const courseId = url.searchParams.get('course_id');
  const lessonId = url.searchParams.get('lesson_id');

  let query = supabase
    .from('flashcard_decks')
    .select('*, flashcard_cards(count)')
    .order('created_at', { ascending: false });

  if (profile?.school_id) query = query.eq('school_id', profile.school_id);
  if (courseId) query = query.eq('course_id', courseId);
  if (lessonId) query = query.eq('lesson_id', lessonId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

// POST /api/flashcards/decks
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('portal_users').select('role, school_id').eq('id', user.id).single();
  if (!['teacher', 'admin', 'school'].includes(profile?.role ?? '')) {
    return NextResponse.json({ error: 'Only teachers can create flashcard decks' }, { status: 403 });
  }

  const { title, lesson_id, course_id } = await req.json();
  if (!title?.trim()) return NextResponse.json({ error: 'Title is required', field: 'title' }, { status: 400 });

  const { data, error } = await supabase
    .from('flashcard_decks')
    .insert({ title: title.trim(), lesson_id: lesson_id || null, course_id: course_id || null, created_by: user.id, school_id: profile.school_id })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
