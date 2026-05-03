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
    const scoped = searchParams.get('scoped') === 'true'; // apply school scoping

    let query = admin
      .from('portal_users')
      .select('id, full_name, email, role, school_id, school_name, class_id, section_class, is_active, created_at, updated_at')
      .order('full_name');

    if (roleFilter) query = query.eq('role', roleFilter) as any;
    if (classFilter) query = query.eq('class_id', classFilter) as any;

    // For teachers/school: scope to their school(s) when scoped=true
    if (scoped && caller.role !== 'admin') {
      if (caller.role === 'teacher') {
        // Prefer class-based scope; fall back to school-based when no classes exist
        const { data: myClasses } = await admin
          .from('classes')
          .select('id')
          .eq('teacher_id', caller.id);
        const myClassIds = (myClasses ?? []).map((c: any) => c.id);

        if (myClassIds.length > 0) {
          query = query.in('class_id', myClassIds) as any;
        } else {
          // No classes yet — scope to teacher's assigned schools so students are visible
          const { data: schoolAssignments } = await admin
            .from('teacher_schools')
            .select('school_id')
            .eq('teacher_id', caller.id);
          const assignedIds = (schoolAssignments ?? []).map((a: any) => a.school_id).filter(Boolean) as string[];
          if (caller.school_id && !assignedIds.includes(caller.school_id)) assignedIds.push(caller.school_id);
          if (assignedIds.length > 0) {
            query = query.in('school_id', assignedIds) as any;
          }
        }
      } else {
        // School role: scope to their school
        const schoolIds: string[] = [];
        if (caller.school_id) schoolIds.push(caller.school_id);

        if (schoolIds.length > 0) {
          const { data: schoolNames } = await admin
            .from('schools')
            .select('name')
            .in('id', schoolIds);
          const names = (schoolNames ?? []).map((s: any) => s.name).filter(Boolean);

          if (names.length > 0) {
            const nameFilters = names.map((n: string) => `school_name.eq.${JSON.stringify(n)}`).join(',');
            const idFilter = `school_id.in.(${schoolIds.join(',')})`;
            query = query.or(`${idFilter},${nameFilters}`) as any;
          } else {
            query = query.in('school_id', schoolIds) as any;
          }
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

    if ('class_id' in update) {
      const classId = update.class_id as string | null;
      allowed.class_id = classId;

      // ── School boundary guard for class assignment ─────────────────────
      if (classId) {
        const { data: cls } = await admin.from('classes').select('school_id, name').eq('id', classId).single();
        if (cls?.school_id) {
          // Sync section_class name
          allowed.section_class = cls.name;

          // Verify students belong to this school (strict guard)
          const { data: students } = await admin.from('portal_users').select('id, full_name, school_id').in('id', ids);
          const mismatches = (students ?? []).filter(s => s.school_id && s.school_id !== cls.school_id);

          if (mismatches.length > 0) {
            return NextResponse.json({
              error: `School boundary violation: ${mismatches.length} student(s) belong to a different school than class "${cls.name}".`,
              mismatches: mismatches.map(m => m.full_name)
            }, { status: 403 });
          }
        }
      } else {
        allowed.section_class = null;
      }
    }

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

// DELETE /api/portal-users — bulk hard-delete (admin only)
// Body: { ids: string[] }
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = adminClient();
    const { data: caller } = await admin.from('portal_users').select('role, id').eq('id', user.id).single();
    if (!caller || caller.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required for bulk delete' }, { status: 403 });
    }

    const { ids } = await request.json();
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'ids array is required' }, { status: 400 });
    }
    // Prevent self-deletion
    const safeIds = ids.filter((id: string) => id !== caller.id);
    if (safeIds.length === 0) return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 });

    // Fetch all targets (role + email for cleanup)
    const { data: targets } = await admin.from('portal_users').select('id, role, school_id, email').in('id', safeIds);
    const parentEmails = (targets ?? []).filter(t => t.role === 'parent' && t.email).map(t => t.email as string);

    // ── Cleanup dependent records ──────────────────────────────────────
    if (parentEmails.length > 0) {
      await admin.from('students').update({ parent_email: null, parent_name: null }).in('parent_email', parentEmails);
    }
    await admin.from('teacher_schools').delete().in('teacher_id', safeIds);
    await admin.from('student_progress_reports').update({ teacher_id: null }).in('teacher_id', safeIds);
    await admin.from('students').delete().in('user_id', safeIds);
    await admin.from('students').update({ created_by: null }).in('created_by', safeIds);
    await admin.from('enrollments').delete().in('user_id', safeIds);
    await admin.from('assignment_submissions').delete().in('portal_user_id', safeIds);
    await admin.from('assignment_submissions').update({ graded_by: null }).in('graded_by', safeIds);
    await admin.from('classes').update({ teacher_id: null }).in('teacher_id', safeIds);
    await admin.from('timetable_slots').update({ teacher_id: null }).in('teacher_id', safeIds);
    await admin.from('files').update({ uploaded_by: null }).in('uploaded_by', safeIds);
    await admin.from('study_group_messages').update({ sender_id: null }).in('sender_id', safeIds);
    await admin.from('study_group_members').delete().in('user_id', safeIds);
    await admin.from('study_groups').update({ created_by: null }).in('created_by', safeIds);

    // Handle school-role accounts
    const schoolAccounts = (targets ?? []).filter(t => t.role === 'school' && t.school_id);
    for (const t of schoolAccounts) {
      await admin.from('students').update({ school_id: null, school_name: null }).eq('school_id', t.school_id);
      await admin.from('teacher_schools').delete().eq('school_id', t.school_id);
      await admin.from('schools').delete().eq('id', t.school_id);
    }

    // ── Delete portal_users rows ───────────────────────────────────────
    const { error: dbErr } = await admin.from('portal_users').delete().in('id', safeIds);
    if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });

    // ── Delete auth accounts (best-effort) ────────────────────────────
    await Promise.allSettled(safeIds.map((id: string) => admin.auth.admin.deleteUser(id)));

    return NextResponse.json({ success: true, deleted: safeIds.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
