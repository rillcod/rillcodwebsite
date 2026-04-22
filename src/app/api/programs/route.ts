import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { isAlwaysPublicProgramName, isCourseVisibleToLearners } from '@/lib/courses/visibility';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function requireSession() {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}

async function getCallerRole(userId: string): Promise<string | null> {
  const { data } = await adminClient()
    .from('portal_users')
    .select('role')
    .eq('id', userId)
    .maybeSingle();
  return data?.role ?? null;
}

/** Global program catalog — platform admins only (partner schools use curriculum UI, not this API). */
async function requireAdmin() {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const { data: caller } = await adminClient()
    .from('portal_users')
    .select('role, id')
    .eq('id', user.id)
    .single();
  if (!caller || caller.role !== 'admin') return null;
  return caller;
}

// GET /api/programs — authenticated users see full list; anonymous may pass ?is_active=true (public catalog only)
export async function GET(request: NextRequest) {
  try {
    const user = await requireSession();
    const { searchParams } = new URL(request.url);
    const isActiveParam = searchParams.get('is_active');
    const publicCatalog = isActiveParam === 'true';
    if (!user && !publicCatalog) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let callerRole: string | null = null;
    if (user) callerRole = await getCallerRole(user.id);


    let query = adminClient()
      .from('programs')
      .select('*, courses ( id, title, is_active, is_locked, program_id )')
      .order('created_at', { ascending: false });

    if (isActiveParam !== null) {
      query = query.eq('is_active', isActiveParam === 'true') as any;
    } else if (!publicCatalog && (!callerRole || !['admin', 'teacher', 'school'].includes(callerRole))) {
      // Students/parents should only see the active catalog when filter is omitted.
      query = query.eq('is_active', true) as any;
    }

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Staff see the raw list (including locked courses) so they can manage
    // visibility.  Learners / public callers only see unlocked courses, with
    // an exception carve-out for our always-public flagship programmes
    // (Young Innovator, Teen Developer — see `src/lib/courses/visibility.ts`).
    const isStaffCaller = callerRole && ['admin', 'teacher', 'school'].includes(callerRole);
    const rows = (data ?? []).map((row: any) => {
      if (isStaffCaller) return row;
      const alwaysPublic = isAlwaysPublicProgramName(row.name);
      const visibleCourses = (row.courses ?? []).filter((c: any) =>
        alwaysPublic
          ? c.is_active !== false
          : isCourseVisibleToLearners({ ...c, programs: { name: row.name } }),
      );
      return { ...row, courses: visibleCourses };
    });

    return NextResponse.json({ success: true, data: rows });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 });
  }
}

// POST /api/programs — create program (admin only)
export async function POST(request: NextRequest) {
  try {
    const caller = await requireAdmin();
    if (!caller) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

    const body = await request.json();
    const { name, description, duration_weeks, difficulty_level, price, max_students, is_active } = body;

    if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });

    const { delivery_type } = body;

    const { data, error } = await adminClient()
      .from('programs')
      .insert({
        name: name.trim(),
        description: description || null,
        duration_weeks: duration_weeks || null,
        difficulty_level: difficulty_level || 'beginner',
        price: price ?? 0,
        max_students: max_students || null,
        is_active: is_active ?? true,
        delivery_type: delivery_type === 'optional' ? 'optional' : 'compulsory',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 });
  }
}
