import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { logAudit } from '@/lib/audit/log';
import { syncStudentIdentityAcrossStores, harmonizeStudentParentIdentity } from '@/lib/sync/student-parent-identity';

function adminClient() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
}

// PATCH /api/students/[id] — update a pre-portal student record (admin/teacher/school)
export async function PATCH(
    req: NextRequest,
    context: { params: Promise<{ id: string }> },
) {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: caller } = await supabase
        .from('portal_users')
        .select('id, role, school_id')
        .eq('id', user.id)
        .single();
    if (!caller || !['admin', 'teacher', 'school'].includes(caller.role)) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const { id } = await context.params;
    const body = await req.json();

    // Non-admins must be scoped to their assigned school
    if (caller.role !== 'admin') {
        const { data: student } = await adminClient()
            .from('students')
            .select('school_id')
            .eq('id', id)
            .single();

        let allowed = false;
        if (caller.role === 'school') {
            allowed = !!caller.school_id && student?.school_id === caller.school_id;
        } else if (caller.role === 'teacher') {
            const { data: assignments } = await adminClient()
                .from('teacher_schools')
                .select('school_id')
                .eq('teacher_id', caller.id);
            const ids = (assignments ?? []).map((a: any) => a.school_id).filter(Boolean);
            if (caller.school_id) ids.push(caller.school_id);
            allowed = student?.school_id ? ids.includes(student.school_id) : false;
        }
        if (!allowed) return NextResponse.json({ error: 'You can only edit students from your assigned school' }, { status: 403 });
    }

    // Whitelist updatable fields
    const allowed: Record<string, any> = {};
    const fields = ['full_name', 'name', 'parent_name', 'parent_email', 'parent_phone',
        'school_name', 'school_id', 'grade_level', 'section_class', 'city', 'state',
        'gender', 'date_of_birth', 'enrollment_type', 'status'];
    fields.forEach(f => { if (f in body) allowed[f] = body[f]; });
    if (body.full_name) allowed.name = body.full_name; // keep name in sync
    allowed.updated_at = new Date().toISOString();

    const { data, error } = await adminClient().from('students').update(allowed).eq('id', id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    if (data?.user_id && ('gender' in body || 'date_of_birth' in body || 'full_name' in body || 'section_class' in body || 'grade_level' in body)) {
        await syncStudentIdentityAcrossStores(adminClient(), data.user_id, {
            gender: allowed.gender,
            date_of_birth: allowed.date_of_birth,
            full_name: allowed.full_name,
            section_class: allowed.section_class ?? allowed.grade_level,
        }, 'overwrite');
        await harmonizeStudentParentIdentity(adminClient(), { studentUserId: data.user_id });
    }

    return NextResponse.json({ data });
}

export async function DELETE(
    _req: NextRequest,
    context: { params: Promise<{ id: string }> },
) {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: caller } = await supabase
        .from('portal_users')
        .select('id, role, school_id')
        .eq('id', user.id)
        .single();

    if (!caller || !['admin', 'teacher', 'school'].includes(caller.role)) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const { id } = await context.params;
    const admin = adminClient();

    // Fetch the student to verify school ownership before deleting
    const { data: student } = await admin
        .from('students')
        .select('user_id, school_id, school_name')
        .eq('id', id)
        .single();

    if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 });

    // Non-admins must be scoped to their own school
    if (caller.role !== 'admin') {
        let allowed = false;

        if (caller.role === 'school') {
            // School partner: must match their school_id directly
            allowed = !!caller.school_id && student.school_id === caller.school_id;
        } else if (caller.role === 'teacher') {
            // Teacher: check teacher_schools assignments
            const { data: assignments } = await admin
                .from('teacher_schools')
                .select('school_id')
                .eq('teacher_id', caller.id);

            const assignedIds = (assignments ?? []).map((a: any) => a.school_id).filter(Boolean);

            // Also include teacher's own profile school_id as fallback
            if (caller.school_id) assignedIds.push(caller.school_id);

            allowed = student.school_id
                ? assignedIds.includes(student.school_id)
                : false;
        }

        if (!allowed) {
            return NextResponse.json({ error: 'You can only delete students from your assigned school' }, { status: 403 });
        }
    }

    if (student?.user_id) {
        // Capture the login email first so we can purge the bulk-register archive.
        const { data: pu } = await admin.from('portal_users').select('email').eq('id', student.user_id).maybeSingle();
        await admin.from('files').update({ uploaded_by: null }).eq('uploaded_by', student.user_id);
        await admin.from('study_group_messages').update({ sender_id: null }).eq('sender_id', student.user_id);
        await admin.from('study_group_members').delete().eq('user_id', student.user_id);
        await admin.from('study_groups').update({ created_by: null }).eq('created_by', student.user_id);
        await admin.from('portal_users').delete().eq('id', student.user_id);
        await admin.auth.admin.deleteUser(student.user_id);

        // Harmonise the bulk-register archive (keyed by email): drop this student's
        // history row and prune the batch if it becomes empty.
        const email = (pu as { email?: string } | null)?.email;
        if (email) {
            const { data: archRows } = await admin.from('registration_results').select('batch_id').eq('email', email);
            const batchIds = [...new Set((archRows ?? []).map((r: any) => r.batch_id).filter(Boolean))];
            await admin.from('registration_results').delete().eq('email', email);
            for (const bId of batchIds) {
                const { count } = await admin.from('registration_results').select('id', { count: 'exact', head: true }).eq('batch_id', bId);
                if ((count ?? 0) === 0) await admin.from('registration_batches').delete().eq('id', bId);
                else await admin.from('registration_batches').update({ student_count: count }).eq('id', bId);
            }
        }
    }

    const { error } = await admin.from('students').delete().eq('id', id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Audit trail — record WHO deleted this student (non-throwing).
    await logAudit(admin as any, {
      action: 'students.delete',
      actorId: caller.id,
      resourceType: 'students',
      resourceId: id,
      oldValues: { user_id: student.user_id, school_id: student.school_id, school_name: student.school_name },
    });

    return NextResponse.json({ success: true });
}
