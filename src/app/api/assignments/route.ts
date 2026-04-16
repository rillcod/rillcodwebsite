import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

type Caller = {
  role: string; id: string;
  school_id: string | null; school_name: string | null;
  class_id: string | null; section_class: string | null;
};

async function requireAuth(): Promise<Caller | null> {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const { data: caller } = await adminClient()
    .from('portal_users')
    .select('role, id, school_id, school_name, class_id, section_class')
    .eq('id', user.id)
    .single();
  return (caller as Caller) ?? null;
}

/** All school IDs a teacher is assigned to. */
async function teacherSchoolIds(callerId: string, primarySchoolId: string | null): Promise<string[]> {
  const ids: string[] = [];
  if (primarySchoolId) ids.push(primarySchoolId);
  const { data: ts } = await adminClient()
    .from('teacher_schools')
    .select('school_id')
    .eq('teacher_id', callerId);
  (ts ?? []).forEach((r: any) => {
    if (r.school_id && !ids.includes(r.school_id)) ids.push(r.school_id);
  });
  return ids;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/assignments — list assignments visible to current user
// ─────────────────────────────────────────────────────────────────────────────
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

    if (caller.role === 'admin') {
      // No filter — see all
    } else if (caller.role === 'teacher') {
      // Teachers see assignments they created OR scoped to any of their schools
      const schoolIds = await teacherSchoolIds(caller.id, caller.school_id);
      const orParts = [`created_by.eq.${caller.id}`];
      if (schoolIds.length > 0) orParts.push(`school_id.in.(${schoolIds.join(',')})`);
      query = query.or(orParts.join(',')) as any;
    } else if (caller.role === 'school') {
      // School role: only their own school's assignments
      const orParts: string[] = [];
      if (caller.school_id) orParts.push(`school_id.eq.${caller.school_id}`);
      if (caller.school_name) orParts.push(`school_name.eq.${caller.school_name}`);
      if (orParts.length > 0) query = query.or(orParts.join(',')) as any;
    } else if (caller.role === 'student') {
      // Active project-type assignments only; full filtering done below
      query = query.eq('is_active', true).eq('assignment_type', 'project') as any;
    }

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    let rows = data ?? [];

    // Student: apply visibility + work-mode targeting from metadata
    if (caller.role === 'student') {
      rows = rows.filter((a: any) => {
        const m = a.metadata || {};
        const vis   = m.visibility;
        const wm    = m.work_mode;
        const tcid  = m.target_class_id;
        const tids: string[] = m.target_student_ids || [];
        const grps: any[]    = m.groups || [];

        // Visibility
        if (vis === 'class') {
          const classMatch =
            (tcid && caller.class_id && tcid === caller.class_id) ||
            (m.target_class_name && caller.section_class &&
             m.target_class_name.toLowerCase().trim() === caller.section_class.toLowerCase().trim());
          if (!classMatch) return false;
        } else {
          // school-wide or unset
          const schoolMatch =
            !a.school_id ||
            (caller.school_id && a.school_id === caller.school_id) ||
            (caller.school_name && a.school_name &&
             a.school_name.toLowerCase() === caller.school_name.toLowerCase());
          if (!schoolMatch) return false;
        }

        // Work-mode / targeting
        if (wm === 'specific') {
          if (!tids.includes(caller.id)) return false;
        } else if (wm === 'group') {
          const inGroup = grps.some((g: any) => (g.studentIds || []).includes(caller.id));
          if (!inGroup) return false;
        }

        return true;
      });
    }

    return NextResponse.json({ data: rows });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/assignments — create a new assignment
// Teacher: school is locked to their own assigned schools only
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const caller = await requireAuth();
    if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!['admin', 'teacher'].includes(caller.role)) {
      return NextResponse.json({ error: 'Not authorized to create assignments' }, { status: 403 });
    }

    const body = await request.json();

    if (!body.title) return NextResponse.json({ error: 'title is required' }, { status: 400 });

    const admin = adminClient();

    // Resolve school — teacher cannot set an arbitrary school_id
    let resolvedSchoolId: string | null = null;
    let resolvedSchoolName: string | null = null;

    if (caller.role === 'admin') {
      resolvedSchoolId   = body.school_id   ?? null;
      resolvedSchoolName = body.school_name ?? null;
    } else {
      // Teacher: validate school_id against their assignments
      const requestedSchoolId: string | null = typeof body.school_id === 'string' ? body.school_id : null;
      if (requestedSchoolId) {
        const scopedIds = await teacherSchoolIds(caller.id, caller.school_id);
        if (!scopedIds.includes(requestedSchoolId)) {
          return NextResponse.json(
            { error: 'You are not assigned to the school you selected for this assignment.' },
            { status: 403 },
          );
        }
        resolvedSchoolId = requestedSchoolId;
      } else {
        resolvedSchoolId = caller.school_id;
      }
      resolvedSchoolName = body.school_name ?? caller.school_name ?? null;
    }

    const allowedFields = [
      'title', 'description', 'instructions', 'course_id', 'lesson_id',
      'due_date', 'max_points', 'assignment_type', 'is_active', 'questions', 'metadata',
    ];
    const payload: Record<string, unknown> = {
      created_by:  caller.id,
      school_id:   resolvedSchoolId,
      school_name: resolvedSchoolName,
      created_at:  new Date().toISOString(),
    };
    for (const f of allowedFields) {
      if (f in body) payload[f] = body[f] ?? null;
    }

    const { data, error } = await admin
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
