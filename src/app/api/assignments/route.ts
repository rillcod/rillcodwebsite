import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function requireAuth() {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const { data: caller } = await adminClient()
    .from('portal_users')
    .select('role, id, school_id, school_name, class_id, section_class')
    .eq('id', user.id)
    .single();
  if (!caller) return null;
  return caller;
}

// GET /api/assignments — list assignments visible to current user
export async function GET(request: NextRequest) {
  try {
    const caller = await requireAuth();
    if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = adminClient();
    let query = admin
      .from('assignments')
      .select(`
        id, title, description, instructions, due_date, max_points,
        assignment_type, is_active, created_at, created_by,
        school_id, school_name, metadata,
        courses ( id, title, programs ( name ) ),
        assignment_submissions ( id, status, grade, portal_user_id )
      `)
      .order('due_date', { ascending: true });

    if (caller.role === 'teacher') {
      query = query.eq('created_by', caller.id) as any;
    } else if (caller.role === 'school') {
      const filters: string[] = [];
      if (caller.school_id) filters.push(`school_id.eq.${caller.school_id}`);
      if (caller.school_name) filters.push(`school_name.eq.${caller.school_name}`);
      if (filters.length > 0) query = query.or(filters.join(',')) as any;
    } else if (caller.role === 'student') {
      // Students only see active project assignments
      query = (query as any).eq('is_active', true).eq('assignment_type', 'project');
    }
    // admin: no filter, sees all

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    let rows = data ?? [];

    // For students: filter by visibility + targeting stored in metadata
    if (caller.role === 'student') {
      rows = rows.filter((a: any) => {
        const m = a.metadata || {};
        const vis = m.visibility;        // 'school' | 'class' | undefined
        const wm  = m.work_mode;         // 'individual' | 'specific' | 'group' | undefined
        const tcid = m.target_class_id;  // class UUID
        const tids: string[] = m.target_student_ids || [];
        const grps: any[]    = m.groups || [];

        // ── Visibility check ──────────────────────────────────────────────
        if (vis === 'class') {
          // Must match by class_id or (fallback) section_class name
          const classMatch =
            (tcid && caller.class_id && tcid === caller.class_id) ||
            (m.target_class_name && caller.section_class &&
             m.target_class_name.toLowerCase().trim() === caller.section_class.toLowerCase().trim());
          if (!classMatch) return false;
        } else {
          // school-wide (or unset): match school
          const schoolMatch =
            !a.school_id ||                               // no school scoping = global
            (caller.school_id && a.school_id === caller.school_id) ||
            (caller.school_name && a.school_name &&
             a.school_name.toLowerCase() === caller.school_name.toLowerCase());
          if (!schoolMatch) return false;
        }

        // ── Work mode / targeting check ───────────────────────────────────
        if (wm === 'specific') {
          if (!tids.includes(caller.id)) return false;
        } else if (wm === 'group') {
          const inGroup = grps.some((g: any) => (g.studentIds || []).includes(caller.id));
          if (!inGroup) return false;
        }
        // individual / unset: passes

        return true;
      });
    }

    return NextResponse.json({ data: rows });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 });
  }
}

// POST /api/assignments — create a new assignment (bypasses RLS)
export async function POST(request: NextRequest) {
  try {
    const caller = await requireAuth();
    if (!caller) return NextResponse.json({ error: 'Staff access required' }, { status: 403 });
    if (!['admin', 'teacher'].includes(caller.role)) return NextResponse.json({ error: 'Not authorized to create assignments' }, { status: 403 });

    const body = await request.json();
    const allowed = ['title', 'description', 'instructions', 'course_id', 'lesson_id', 'due_date',
      'max_points', 'assignment_type', 'is_active', 'questions', 'school_id', 'school_name', 'metadata'];
    const payload: Record<string, unknown> = {
      created_by:  caller.id,
      // auto-attach school from creator profile if not provided
      school_id:   body.school_id   ?? caller.school_id   ?? null,
      school_name: body.school_name ?? caller.school_name ?? null,
    };
    for (const f of allowed) {
      if (f in body) payload[f] = body[f] ?? null;
    }
    payload.created_at = new Date().toISOString();

    const { data, error } = await adminClient()
      .from('assignments')
      .insert(payload)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 });
  }
}
