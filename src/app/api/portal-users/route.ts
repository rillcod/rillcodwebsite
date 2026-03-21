import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// GET /api/portal-users — admin/staff only, returns portal users (bypasses RLS)
// Query params:
//   role=student|teacher|...  — filter by role (optional)
//   scoped=true               — apply caller's school scoping (for teacher listing own students)
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const admin = adminClient();
    const { data: caller } = await admin
      .from('portal_users')
      .select('role, id, school_id, school_name')
      .eq('id', user.id)
      .single();
    if (!caller || !['admin', 'teacher', 'school'].includes(caller.role)) {
      return NextResponse.json({ error: 'Staff access required' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const roleFilter = searchParams.get('role');      // e.g. 'student'
    const classFilter = searchParams.get('class_id'); // e.g. UUID
    const scoped     = searchParams.get('scoped') === 'true'; // apply school scoping

    let query = admin
      .from('portal_users')
      .select('id, full_name, email, role, school_id, school_name, class_id, section_class, is_active, created_at, updated_at')
      .order('full_name');

    if (roleFilter) query = query.eq('role', roleFilter) as any;
    if (classFilter) query = query.eq('class_id', classFilter) as any;

    // For teachers/school: scope to their school(s) when scoped=true
    if (scoped && caller.role !== 'admin') {
      const schoolIds: string[] = [];
      if (caller.school_id) schoolIds.push(caller.school_id);

      // For teachers: also check teacher_schools junction table (multi-school support)
      if (caller.role === 'teacher') {
        const { data: ts } = await admin
          .from('teacher_schools')
          .select('school_id')
          .eq('teacher_id', caller.id);
        (ts ?? []).forEach((r: any) => {
          if (r.school_id && !schoolIds.includes(r.school_id)) schoolIds.push(r.school_id);
        });

        // Also include school_ids from classes this teacher teaches
        // (handles teacher reassignment — students at old school still visible via class)
        const { data: teacherClasses } = await admin
          .from('classes')
          .select('school_id')
          .eq('teacher_id', caller.id);
        (teacherClasses ?? []).forEach((c: any) => {
          if (c.school_id && !schoolIds.includes(c.school_id)) schoolIds.push(c.school_id);
        });
      }

      if (schoolIds.length > 0) {
        // Also allow school_name match for legacy records that have name but null school_id
        const { data: schoolNames } = await admin
          .from('schools')
          .select('name')
          .in('id', schoolIds);
        const names = (schoolNames ?? []).map((s: any) => s.name).filter(Boolean);

        if (names.length > 0) {
          // Match by school_id OR school_name (covers legacy registrations)
          // Names must be quoted so PostgREST handles spaces correctly
          const nameFilters = names.map((n: string) => `school_name.eq."${n}"`).join(',');
          const idFilter = `school_id.in.(${schoolIds.join(',')})`;
          query = query.or(`${idFilter},${nameFilters}`) as any;
        } else {
          query = query.in('school_id', schoolIds) as any;
        }
      }
    }

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data: data ?? [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 });
  }
}

// PATCH /api/portal-users
// Batch-update class_id (and optionally school_id) on a list of student profiles.
// Used by classes/add and classes/[id]/edit to assign students to a class.
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: caller } = await supabase
      .from('portal_users').select('role').eq('id', user.id).single();
    if (!caller || !['admin', 'teacher', 'school'].includes(caller.role)) {
      return NextResponse.json({ error: 'Staff access required' }, { status: 403 });
    }

    const { ids, update } = await request.json() as { ids: string[]; update: Record<string, unknown> };
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'ids array required' }, { status: 400 });
    }

    // Whitelist allowed fields — never let callers set arbitrary columns
    const admin = adminClient();
    const allowed: Record<string, unknown> = {};
    if ('class_id'  in update) allowed.class_id  = update.class_id ?? null;
    if ('school_id' in update) {
      allowed.school_id = update.school_id ?? null;
      // Sync school_name so the column stays accurate after refresh
      if (update.school_id) {
        const { data: schoolRow } = await admin
          .from('schools').select('name').eq('id', update.school_id).single();
        allowed.school_name = schoolRow?.name ?? null;
      } else {
        allowed.school_name = null; // clearing school also clears school_name
      }
    }

    const { error } = await admin
      .from('portal_users')
      .update({ ...allowed, updated_at: new Date().toISOString() })
      .in('id', ids)
      .eq('role', 'student'); // safety: only update students

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ updated: ids.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 });
  }
}

// This API route creates a portal user with admin privileges using the service role key
export async function POST(request: NextRequest) {
  try {
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const body = await request.json();
    const { id, email, full_name, role, is_active } = body;

    if (!id || !email || !full_name || !role) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Create or update portal user with admin privileges bypassing RLS
    const { data, error } = await supabaseAdmin
      .from('portal_users')
      .upsert({ id, email: email.trim().toLowerCase(), full_name, role, is_active, updated_at: new Date().toISOString() }, { onConflict: 'id' })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
