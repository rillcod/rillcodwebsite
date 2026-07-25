import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { permanentWipePortalUsers } from '@/lib/students/permanent-wipe';
import { isTeacherIsolationOn } from '@/lib/server/teacher-scope';
import { getTeacherClassScope } from '@/lib/server/teacher-class-scope';
import { SELECT } from '@/lib/supabase/embed-hints';
import { fetchAllSupabaseRows } from '@/lib/supabase/fetch-all-rows';
import { preparePortalStructure } from '@/lib/portal/ensure-structure';

const NO_MATCH_UUID = '00000000-0000-0000-0000-000000000000';

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
//   limit=500                 — optional capped list size for heavy pages (max 2000)
//                               When omitted, all matching rows are fetched via pagination.
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
    const includeDeleted = searchParams.get('include_deleted') === 'true';
    const deletedOnly = searchParams.get('deleted_only') === 'true';
    const limitParam = Number(searchParams.get('limit') ?? 0);
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 2000) : null;

    if (includeDeleted || deletedOnly) {
      if (caller.role === 'school') {
        return NextResponse.json({ error: 'School accounts cannot list hidden users' }, { status: 403 });
      }
      if (caller.role === 'teacher' && roleFilter !== 'student') {
        return NextResponse.json({ error: 'Teachers can only view hidden student accounts' }, { status: 403 });
      }
    }

    let query = admin
      .from('portal_users')
      .select(SELECT.portalUsersListWithClass)
      .order('full_name');

    if (deletedOnly) {
      query = query.eq('is_deleted', true) as typeof query;
    } else if (!includeDeleted) {
      query = query.eq('is_deleted', false) as typeof query;
    }

    if (roleFilter) query = query.eq('role', roleFilter) as any;
    if (classFilter) query = query.eq('class_id', classFilter) as any;

    // For teachers/school: scope to their school(s) when scoped=true
    if (scoped && caller.role !== 'admin') {
      if (caller.role === 'teacher') {
        // Class-privacy: when isolation is ON, a teacher sees students in owned/unowned
        // classes (+ students they authored reports for), never the whole school.
        const isolated = await isTeacherIsolationOn(admin);
        // Shared isolation boundary: owned classes plus unowned classes in assigned schools.
        const classScope = await getTeacherClassScope(admin, caller.id, caller.school_id, !isolated);
        const assignedIds = classScope.assignedSchoolIds;
        const myClassIds = classScope.classIds;
        const myClassNames = classScope.classNames;

        if (assignedIds.length === 0) return NextResponse.json({ data: [] });

        // Always include students this teacher has authored reports for — ensures
        // visibility is preserved even when students are moved to another class
        // (e.g. after a class reshuffle overwrites class_id on portal_users).
        const { data: authoredReports } = await admin
          .from('student_progress_reports')
          .select('student_id')
          .eq('teacher_id', caller.id)
          .not('student_id', 'is', null);
        const reportedStudentIds = new Set<string>(
          (authoredReports ?? []).map((r: any) => r.student_id).filter(Boolean)
        );

        if (myClassIds.length > 0) {
          // Collect student IDs: class_id primary + section_class fallback
          const studentIdSet = new Set<string>();
          const { data: direct } = await admin
            .from('portal_users').select('id').in('class_id', myClassIds).eq('role', 'student');
          (direct ?? []).forEach((s: any) => studentIdSet.add(s.id));

          if (myClassNames.length > 0) {
            const { data: fallback } = await admin
              .from('portal_users').select('id')
              .in('section_class', myClassNames)
              .in('school_id', assignedIds)
              .is('class_id', null)
              .eq('role', 'student');
            (fallback ?? []).forEach((s: any) => studentIdSet.add(s.id));
          }

          // Also add students this teacher has authored reports for
          reportedStudentIds.forEach((id) => studentIdSet.add(id));

          const studentIds = Array.from(studentIdSet);
          if (studentIds.length > 0) {
            query = query.in('id', studentIds) as any;
          } else if (!isolated) {
            // Classes exist but no students yet — scope to school so teacher can see all
            query = query.in('school_id', assignedIds) as any;
          } else {
            // Isolation on: nothing to show (no students in the teacher's own classes)
            query = query.in('id', [NO_MATCH_UUID]) as any;
          }
        } else if (isolated) {
          // Isolation on with no personal classes → only students this teacher authored
          // reports for; otherwise nothing (never the whole school).
          const ids = Array.from(reportedStudentIds);
          query = query.in('id', ids.length ? ids : [NO_MATCH_UUID]) as any;
        } else {
          // No personal classes set up — fall back to school-level scoping.
          // Also include any report-authored students not captured by school scope.
          const { data: schoolNames } = await admin.from('schools').select('name').in('id', assignedIds);
          const names = (schoolNames ?? []).map((s: any) => s.name).filter(Boolean);
          const idFilter = assignedIds.length > 0 ? `school_id.in.(${assignedIds.join(',')})` : '';
          const nameFilters = names.map((n: string) => `school_name.eq.${JSON.stringify(n)}`).join(',');
          const reportedFilter = reportedStudentIds.size > 0 ? `id.in.(${Array.from(reportedStudentIds).join(',')})` : '';
          const orFilter = [idFilter, nameFilters, reportedFilter].filter(Boolean).join(',');
          if (orFilter) query = query.or(orFilter) as any;
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

    if (limit) query = query.limit(limit) as any;

    let rows: any[] = [];
    let loadError: { message: string } | null = null;

    if (limit) {
      const { data, error } = await query;
      rows = data ?? [];
      loadError = error;
    } else {
      const paged = await fetchAllSupabaseRows<any>((from, to) => query.range(from, to));
      rows = paged.data;
      loadError = paged.error;
    }

    if (loadError) return NextResponse.json({ error: loadError.message }, { status: 500 });
    // Opt-in: attach THIS-term progress-report status (?with_reports=1) so lists (card studio,
    // students page) can flag who still needs a published report. Term-scoped for consistency.
    if (searchParams.get('with_reports') === '1' && rows.length) {
      const { isReportIndicatorEnabled } = await import('@/lib/server/app-settings');
      if (await isReportIndicatorEnabled(admin)) {
        const { reportCoverageForStudents, currentAcademicPeriod } = await import('@/lib/reports/coverage');
        const academicPeriod = currentAcademicPeriod();
        const { data: canonicalTerm } = await admin.from('academic_terms').select('id')
          .eq('term_label', academicPeriod.termLabel)
          .eq('academic_year', academicPeriod.periodLabel)
          .maybeSingle();
        const { published, drafted } = await reportCoverageForStudents(admin, rows.map((r: any) => r.id), {
          ...academicPeriod,
          termId: (canonicalTerm as { id?: string } | null)?.id ?? null,
        });
        rows = rows.map((r: any) => ({ ...r, has_published_report: published.has(r.id), has_draft_report: drafted.has(r.id) }));
      }
    }

    return NextResponse.json({ data: rows, total: rows.length });
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
          // Sync section_class name + school from class
          allowed.section_class = cls.name;
          allowed.school_id = cls.school_id;
          const { data: schoolRow } = await admin.from('schools').select('name').eq('id', cls.school_id).maybeSingle();
          if (schoolRow?.name) allowed.school_name = schoolRow.name;
          // Completing placement → reactivate
          allowed.is_active = true;

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
        // Clearing class on active students violates structure — deactivate.
        allowed.section_class = null;
        allowed.is_active = false;
      }
    }

    if ('school_id' in update) {
      allowed.school_id = update.school_id ?? null;
      // Sync school_name so the column stays accurate after refresh
      if (update.school_id) {
        const { data: schoolRow } = await admin
          .from('schools').select('name').eq('id', update.school_id).single();
        allowed.school_name = schoolRow?.name ?? null;
        // School alone is not enough for students — keep inactive unless class also set in this update.
        if (!('class_id' in update) || !update.class_id) {
          const { data: rows } = await admin.from('portal_users').select('id, class_id').in('id', ids);
          const withClass = (rows ?? []).filter((r: { class_id: string | null }) => !!r.class_id).map((r: { id: string }) => r.id);
          const withoutClass = (rows ?? []).filter((r: { class_id: string | null }) => !r.class_id).map((r: { id: string }) => r.id);
          if (withClass.length) {
            await admin.from('portal_users').update({
              school_id: update.school_id,
              school_name: schoolRow?.name ?? null,
              is_active: true,
              updated_at: new Date().toISOString(),
            }).in('id', withClass).eq('role', 'student');
          }
          if (withoutClass.length) {
            await admin.from('portal_users').update({
              school_id: update.school_id,
              school_name: schoolRow?.name ?? null,
              is_active: false,
              updated_at: new Date().toISOString(),
            }).in('id', withoutClass).eq('role', 'student');
          }
          // Already applied school updates per-cohort — skip generic update for school fields.
          delete allowed.school_id;
          delete allowed.school_name;
        }
      } else {
        allowed.school_name = null; // clearing school also clears school_name
        allowed.is_active = false;
      }
    }

    if (Object.keys(allowed).length === 0) {
      return NextResponse.json({ updated: ids.length });
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
    const { id, email, full_name, role, is_active, school_id, school_name, class_id, section_class, grade } = body;

    if (!id || !email || !full_name || !role) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const placed = await preparePortalStructure(supabaseAdmin as any, {
      role,
      schoolId: school_id ?? null,
      schoolName: school_name ?? null,
      classId: class_id ?? null,
      classHints: [section_class],
      grade: grade ?? null,
      wantActive: is_active !== false,
      autoCreateClass: true,
    });

    if (is_active !== false && !placed.isActive) {
      return NextResponse.json({
        error: placed.error || 'Cannot create an active account without school/class structure.',
      }, { status: 400 });
    }

    // Create or update portal user with admin privileges bypassing RLS
    const { data, error } = await supabaseAdmin
      .from('portal_users')
      .upsert({
        id,
        email: email.trim().toLowerCase(),
        full_name,
        role,
        school_id: placed.schoolId,
        school_name: placed.schoolName,
        class_id: placed.classId,
        section_class: section_class ?? placed.className,
        is_active: placed.isActive,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' })
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

    const { data: targets } = await admin.from('portal_users').select('id, role, school_id, email').in('id', safeIds);
    const { deleted, failed } = await permanentWipePortalUsers(admin, targets ?? []);

    if (failed.length && deleted.length === 0) {
      return NextResponse.json({ error: failed[0].error, failed }, { status: 500 });
    }

    return NextResponse.json({ success: true, deleted: deleted.length, failed });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
