import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

async function getUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('portal_users').select('role, school_id').eq('id', user.id).single();
  return data ? { ...user, role: data.role, school_id: data.school_id } : null;
}

// GET /api/lesson-plans — list lesson plans for a lesson or all accessible ones
export async function GET(request: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const lessonId = searchParams.get('lesson_id');

  const db = createAdminClient();

  let query = db.from('lesson_plans').select(`
    *,
    lessons(id, title, course_id, school_id, created_by,
      courses(id, title, program_id)
    )
  `).order('created_at', { ascending: false });

  if (lessonId) {
    query = query.eq('lesson_id', lessonId);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Filter by school access for non-admins
  let plans = data ?? [];
  if (user.role !== 'admin' && user.school_id) {
    plans = plans.filter((p: any) => !p.lessons?.school_id || p.lessons.school_id === user.school_id);
  }

  return NextResponse.json({ data: plans });
}

// POST /api/lesson-plans — create or upsert a lesson plan
export async function POST(request: Request) {
  const user = await getUser();
  if (!user || !['admin', 'teacher'].includes(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const { lesson_id, objectives, activities, assessment_methods, staff_notes, summary_notes } = body;
  if (!lesson_id) return NextResponse.json({ error: 'lesson_id required' }, { status: 400 });

  const db = createAdminClient();

  // Upsert — lesson_plans has unique constraint on lesson_id
  const { data, error } = await db.from('lesson_plans').upsert({
    lesson_id,
    objectives: objectives || null,
    activities: activities || null,
    assessment_methods: assessment_methods || null,
    staff_notes: staff_notes || null,
    summary_notes: summary_notes || null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'lesson_id' }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
