import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { logAudit } from '@/lib/audit/log';
import { syncStudentIdentityAcrossStores, harmonizeStudentParentIdentity } from '@/lib/sync/student-parent-identity';
import { getAccountValuables } from '@/lib/students/account-valuables';
import { cleanStudentName } from '@/lib/students/clean-name';
import { cleanGrade } from '@/lib/classes/naming';
import { pruneRegistrationArchiveByEmails, wipePortalUserCascade } from '@/lib/students/permanent-wipe';
import {
  getProtectedAcademicEvidence,
  protectedAcademicEvidenceMessage,
} from '@/lib/students/protected-academic-evidence';

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

    let selectedSchool: { id: string; name: string } | null = null;
    if ('school_id' in body || 'school_name' in body) {
        const requestedSchoolId = String(body.school_id || '').trim();
        if (!requestedSchoolId) {
            return NextResponse.json({ error: 'Select a registered school from the list.' }, { status: 400 });
        }
        const admin = adminClient();
        const { data: school, error: schoolError } = await admin
            .from('schools')
            .select('id, name')
            .eq('id', requestedSchoolId)
            .eq('status', 'approved')
            .maybeSingle();
        if (schoolError || !school) {
            return NextResponse.json({ error: 'The selected school is not registered or approved.' }, { status: 400 });
        }
        if (caller.role === 'school' && school.id !== caller.school_id) {
            return NextResponse.json({ error: 'You cannot move this student to another school.' }, { status: 403 });
        }
        if (caller.role === 'teacher') {
            const { data: assignments } = await admin
                .from('teacher_schools')
                .select('school_id')
                .eq('teacher_id', caller.id);
            const assignedIds = (assignments ?? []).map((row: any) => row.school_id).filter(Boolean);
            if (caller.school_id) assignedIds.push(caller.school_id);
            if (!assignedIds.includes(school.id)) {
                return NextResponse.json({ error: 'You are not assigned to the selected school.' }, { status: 403 });
            }
        }
        selectedSchool = school;
    }

    // Whitelist updatable fields. students has current_class/section (not section_class).
    const allowed: Record<string, any> = {};
    const fields = ['full_name', 'name', 'parent_name', 'parent_email', 'parent_phone',
        'grade_level', 'city', 'state',
        'gender', 'date_of_birth', 'enrollment_type', 'status'];
    fields.forEach(f => { if (f in body) allowed[f] = body[f]; });
    if (selectedSchool) {
        allowed.school_id = selectedSchool.id;
        allowed.school_name = selectedSchool.name;
    }
    if (body.full_name) allowed.name = body.full_name; // keep name in sync
    if (typeof allowed.full_name === 'string') {
      allowed.full_name = cleanStudentName(allowed.full_name) || allowed.full_name.trim();
      allowed.name = allowed.full_name;
    } else if (typeof allowed.name === 'string') {
      allowed.name = cleanStudentName(allowed.name) || allowed.name.trim();
    }
    if ('grade_level' in allowed) {
      allowed.grade_level = allowed.grade_level ? cleanGrade(String(allowed.grade_level)) : null;
      allowed.grade = allowed.grade_level;
    }
    // API may send section_class for the cohort — map onto students.current_class / section.
    const sectionLabel = body.section_class !== undefined
      ? (typeof body.section_class === 'string' ? body.section_class.trim() || null : null)
      : (body.current_class !== undefined
        ? (typeof body.current_class === 'string' ? body.current_class.trim() || null : null)
        : undefined);
    if (sectionLabel !== undefined) {
      allowed.current_class = sectionLabel;
      allowed.section = sectionLabel;
    }
    allowed.updated_at = new Date().toISOString();

    const { data, error } = await adminClient().from('students').update(allowed).eq('id', id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    if ('parent_email' in body) {
      try {
        const { reconcileStudentParentEmail } = await import('@/lib/parents/links');
        await reconcileStudentParentEmail(
          adminClient() as any,
          id,
          typeof body.parent_email === 'string' ? body.parent_email : data?.parent_email,
          { actorId: caller.id, source: 'students.PATCH' },
        );
      } catch (linkErr) {
        console.error('[students PATCH] parent link reconcile failed:', linkErr);
      }
    }

    if (data?.user_id && ('gender' in body || 'date_of_birth' in body || 'full_name' in body || 'section_class' in body || 'current_class' in body || 'grade_level' in body)) {
        await syncStudentIdentityAcrossStores(adminClient(), data.user_id, {
            gender: allowed.gender,
            date_of_birth: allowed.date_of_birth,
            full_name: allowed.full_name,
            section_class: sectionLabel !== undefined ? sectionLabel : undefined,
            grade: allowed.grade_level,
        }, 'overwrite');
        await harmonizeStudentParentIdentity(adminClient(), { studentUserId: data.user_id });
    }

    return NextResponse.json({ data });
}

export async function DELETE(
    _req: NextRequest,
    context: { params: Promise<{ id: string }> },
) {
    const delBody = await _req.json().catch(() => ({} as Record<string, unknown>));
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
        .select('user_id, school_id, school_name, full_name, name')
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

    // Safety gate: warn before destroying a PAID ID card or a PUBLISHED progress report
    // (with its term + year) unless the caller has explicitly confirmed.
    if (delBody.confirmDestroy !== true && student?.user_id) {
        const valuables = await getAccountValuables(admin, student.user_id, id);
        if (valuables.hasValuables) {
            return NextResponse.json({
                requiresConfirmation: true,
                error: `${valuables.summary} Deleting removes it permanently.`,
                valuables,
            }, { status: 409 });
        }
    }

    if (student?.user_id) {
        // Capture the login email first so we can purge the bulk-register archive.
        const { data: pu } = await admin.from('portal_users').select('email').eq('id', student.user_id).maybeSingle();
        // The shared wipe engine fails closed when any graded/manual evidence is
        // attached and propagates database errors instead of reporting success.
        const wipe = await wipePortalUserCascade(admin as any, student.user_id);
        if (!wipe.ok) {
            return NextResponse.json({
                error: wipe.error,
                code: 'PROTECTED_ACADEMIC_EVIDENCE',
            }, { status: 409 });
        }

        // Harmonise the bulk-register archive (keyed by email): drop this student's
        // history row and prune the batch if it becomes empty.
        const email = (pu as { email?: string } | null)?.email;
        if (email) await pruneRegistrationArchiveByEmails(admin as any, [email]);
    } else {
        // Pre-portal student rows can still own assignment marks through
        // assignment_submissions.student_id. Never treat them as disposable
        // merely because an auth/portal identity has not been created.
        let evidence;
        try {
            evidence = await getProtectedAcademicEvidence(admin as any, null, [id]);
        } catch (error) {
            return NextResponse.json({
                error: error instanceof Error ? error.message : 'Protected evidence could not be verified.',
            }, { status: 503 });
        }
        if (evidence.total > 0) {
            return NextResponse.json({
                error: protectedAcademicEvidenceMessage(evidence),
                code: 'PROTECTED_ACADEMIC_EVIDENCE',
            }, { status: 409 });
        }
        const { error } = await admin.from('students').delete().eq('id', id);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Audit trail — record WHO deleted this student (non-throwing).
    await logAudit(admin as any, {
      action: 'students.delete',
      actorId: caller.id,
      resourceType: 'students',
      resourceId: id,
      oldValue: `${(student as any).full_name || (student as any).name || 'Student'}${(student as any).school_name ? ` · ${(student as any).school_name}` : ''}`,
      oldValues: {
        student_name: (student as any).full_name || (student as any).name || null,
        school_name: student.school_name,
        user_id: student.user_id,
        school_id: student.school_id,
      },
    });

    return NextResponse.json({ success: true });
}
