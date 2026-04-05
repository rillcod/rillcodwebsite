import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// ── Auth guard helper ────────────────────────────────────────────────────────
// Uses the RLS client only to verify identity; all data ops use admin client.
async function requireStaff(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized', status: 401 };

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from('portal_users')
    .select('id, role, school_name, school_id')
    .eq('id', user.id)
    .single();

  if (!profile || !['admin', 'teacher'].includes(profile.role)) {
    return { error: 'Forbidden: admin or teacher only', status: 403 };
  }
  return { profile };
}

// ─────────────────────────────────────────────────────────────────────────────
// POST — Create parent account + link to students
// Body: { email, full_name, phone, student_ids[], relationship?, password }
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const guard = await requireStaff(supabase);
    if ('error' in guard) return NextResponse.json({ error: guard.error }, { status: guard.status });

    const { email, full_name, phone, student_id, student_ids, relationship = 'Guardian', password } = await req.json();

    const studentIdList: string[] = Array.isArray(student_ids) && student_ids.length > 0
      ? student_ids
      : student_id ? [student_id] : [];

    if (!email || !full_name || studentIdList.length === 0) {
      return NextResponse.json({ error: 'email, full_name, and at least one student are required' }, { status: 400 });
    }
    if (!password || password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }

    const admin = createAdminClient();
    const cleanEmail = email.trim().toLowerCase();

    // Check if a portal_users record already exists for this email
    const { data: existingPortal } = await admin
      .from('portal_users')
      .select('id, role')
      .eq('email', cleanEmail)
      .maybeSingle();

    if (existingPortal && existingPortal.role !== 'parent') {
      return NextResponse.json({
        error: `This email is already registered as a ${existingPortal.role} account. Use a different email for the parent.`,
      }, { status: 409 });
    }

    let authUserId: string;
    const isExisting = !!existingPortal?.id;

    if (isExisting) {
      authUserId = existingPortal!.id;
      await admin.auth.admin.updateUserById(authUserId, { password });
      await admin.from('portal_users').update({
        full_name, phone: phone ?? null, updated_at: new Date().toISOString(),
      }).eq('id', authUserId);
    } else {
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email: cleanEmail,
        password,
        email_confirm: true,
        user_metadata: { full_name, role: 'parent' },
      });
      if (createErr) throw createErr;
      authUserId = created.user.id;

      const { error: upsertErr } = await admin.from('portal_users').upsert({
        id: authUserId,
        email: cleanEmail,
        full_name,
        phone: phone ?? null,
        role: 'parent',
        is_active: true,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });
      if (upsertErr) throw upsertErr;
    }

    // Link ALL selected students to this parent
    for (const sid of studentIdList) {
      const { data: ps } = await admin
        .from('portal_users')
        .select('full_name, school_id, school_name, section_class, email')
        .eq('id', sid)
        .single();

      if (ps) {
        const { error: linkErr } = await admin.from('students').upsert({
          user_id: sid,
          name: ps.full_name,
          full_name: ps.full_name,
          student_email: ps.email,
          school_id: ps.school_id,
          school_name: ps.school_name,
          current_class: ps.section_class,
          parent_email: cleanEmail,
          parent_name: full_name,
          parent_phone: phone ?? null,
          parent_relationship: relationship,
          enrollment_type: 'school',
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });
        if (linkErr) console.error(`[parents/manage POST] Failed to link student ${sid}:`, linkErr);
      } else {
        // Fallback: student already in students table but not portal_users
        await admin.from('students').update({
          parent_email: cleanEmail,
          parent_name: full_name,
          parent_phone: phone ?? null,
          parent_relationship: relationship,
          updated_at: new Date().toISOString(),
        }).eq('user_id', sid);
      }
    }

    return NextResponse.json({ success: true, auth_user_id: authUserId, existing: isExisting, email: cleanEmail, linked_count: studentIdList.length });
  } catch (err: any) {
    console.error('POST /api/parents/manage error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH — Update parent info or re-link to a student
// Body: { parent_id, full_name?, phone?, student_id?, relationship?, is_active?, reset_password? }
// ─────────────────────────────────────────────────────────────────────────────
export async function PATCH(req: Request) {
  try {
    const supabase = await createClient();
    const guard = await requireStaff(supabase);
    if ('error' in guard) return NextResponse.json({ error: guard.error }, { status: guard.status });

    const { parent_id, full_name, phone, student_id, relationship, is_active, reset_password } = await req.json();
    if (!parent_id) return NextResponse.json({ error: 'parent_id is required' }, { status: 400 });

    const admin = createAdminClient();

    // Password reset shortcut
    if (reset_password) {
      const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789@#$!';
      const newPw = Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
      const { error: pwErr } = await admin.auth.admin.updateUserById(parent_id, {
        password: newPw,
        user_metadata: { must_change_password: true },
      });
      if (pwErr) throw pwErr;
      return NextResponse.json({ success: true, new_password: newPw });
    }

    // Update portal_users record (admin bypasses RLS)
    const updates: Record<string, any> = { updated_at: new Date().toISOString() };
    if (full_name !== undefined) updates.full_name = full_name;
    if (phone !== undefined) updates.phone = phone;
    if (is_active !== undefined) updates.is_active = is_active;

    const { error: updateErr } = await admin
      .from('portal_users')
      .update(updates)
      .eq('id', parent_id)
      .eq('role', 'parent');
    if (updateErr) throw updateErr;

    // Link / re-link to a student
    if (student_id) {
      const { data: parent } = await admin
        .from('portal_users')
        .select('email, full_name, phone')
        .eq('id', parent_id)
        .eq('role', 'parent')
        .single();

      if (parent) {
        const { data: ps } = await admin
          .from('portal_users')
          .select('full_name, school_id, school_name, section_class, email')
          .eq('id', student_id)
          .single();

        const { error: linkErr } = await admin
          .from('students')
          .upsert({
            user_id: student_id,
            name: ps?.full_name || 'Student',
            full_name: ps?.full_name || 'Student',
            student_email: ps?.email || undefined,
            school_id: ps?.school_id || undefined,
            school_name: ps?.school_name || undefined,
            current_class: ps?.section_class || undefined,
            parent_email: parent.email,
            parent_name: full_name ?? parent.full_name,
            parent_phone: phone ?? parent.phone,
            parent_relationship: relationship ?? 'Guardian',
            enrollment_type: 'school',
            updated_at: new Date().toISOString(),
          }, { onConflict: 'user_id' });
        if (linkErr) throw linkErr;
      }
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('PATCH /api/parents/manage error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE — Unlink parent from a student; optionally deactivate parent account
// Query: ?student_id=<uuid>&parent_id=<uuid>&deactivate=1
// ─────────────────────────────────────────────────────────────────────────────
export async function DELETE(req: Request) {
  try {
    const supabase = await createClient();
    const guard = await requireStaff(supabase);
    if ('error' in guard) return NextResponse.json({ error: guard.error }, { status: guard.status });

    const url = new URL(req.url);
    const student_id = url.searchParams.get('student_id');
    const deactivate = url.searchParams.get('deactivate') === '1';
    const parent_id = url.searchParams.get('parent_id');

    if (!student_id && !parent_id) {
      return NextResponse.json({ error: 'student_id or parent_id is required' }, { status: 400 });
    }

    const admin = createAdminClient();

    if (student_id) {
      // Use admin client for the RPC to bypass RLS
      const { error } = await (admin.rpc as any)('unlink_parent_from_student', { p_student_id: student_id });
      if (error) throw error;
    }

    if (deactivate && parent_id) {
      const { error } = await admin
        .from('portal_users')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', parent_id)
        .eq('role', 'parent');
      if (error) throw error;
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('DELETE /api/parents/manage error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET — List parent accounts with linked children + optional picker data
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(req: Request) {
  try {
    const supabase = await createClient();
    const guard = await requireStaff(supabase);
    if ('error' in guard) return NextResponse.json({ error: guard.error }, { status: guard.status });

    const url = new URL(req.url);
    const search = url.searchParams.get('search') ?? '';
    const schoolParam = url.searchParams.get('school') ?? '';
    const classParam = url.searchParams.get('class') ?? '';
    const includePickerData = url.searchParams.get('include_picker_data') === 'true';

    const admin = createAdminClient();

    // Retrieve teacher's assigned schools
    let assignedSchools: string[] = [];
    if (guard.profile.role === 'teacher') {
      const { data: teacherAssignments } = await admin
        .from('teacher_schools')
        .select('schools(name)')
        .eq('teacher_id', guard.profile.id);

      assignedSchools = (teacherAssignments ?? [])
        .map((a: any) => a.schools?.name)
        .filter(Boolean);

      if (guard.profile.school_name && !assignedSchools.includes(guard.profile.school_name)) {
        assignedSchools.push(guard.profile.school_name);
      }
    }

    // Determine effective school scope
    let effectiveSchool = '';
    let allowedSchools: string[] = [];

    if (guard.profile.role === 'teacher') {
      if (schoolParam && assignedSchools.includes(schoolParam)) {
        effectiveSchool = schoolParam;
      } else if (assignedSchools.length > 0) {
        effectiveSchool = assignedSchools[0];
      } else {
        effectiveSchool = guard.profile.school_name ?? '';
      }
      allowedSchools = assignedSchools;
    } else {
      effectiveSchool = schoolParam;
    }

    // Find parent emails scoped to this school
    let allowedEmails: string[] | null = null;
    if (effectiveSchool) {
      let stuQuery = admin
        .from('students')
        .select('parent_email, current_class, grade_level, section')
        .ilike('school_name', effectiveSchool)
        .not('parent_email', 'is', null);

      if (classParam) {
        const cp = classParam.toLowerCase();
        const { data: allScoped } = await stuQuery;
        const filteredScoped = (allScoped ?? []).filter((s: any) => {
          const fields = [s.current_class, s.grade_level, s.section].map(v => (v ?? '').toLowerCase());
          return fields.some(f => f === cp || f.includes(cp));
        });
        allowedEmails = filteredScoped.map((s: any) => s.parent_email).filter(Boolean);
      } else {
        const { data: scopedStudents } = await stuQuery;
        allowedEmails = (scopedStudents ?? []).map((s: any) => s.parent_email).filter(Boolean);
      }
    }

    // Fetch parents (admin client bypasses RLS on portal_users)
    let parents: any[] = [];
    if (allowedEmails !== null && allowedEmails.length === 0) {
      // No parents for this school yet
    } else {
      let query = admin
        .from('portal_users')
        .select('id, email, full_name, phone, is_active, created_at')
        .eq('role', 'parent')
        .order('created_at', { ascending: false });

      if (search) {
        query = query.or(`email.ilike.%${search}%,full_name.ilike.%${search}%`);
      }
      if (allowedEmails && allowedEmails.length > 0) {
        query = query.in('email', allowedEmails);
      }

      const { data: parentsData, error } = await query.limit(200);
      if (error) throw error;
      parents = parentsData ?? [];
    }

    // Fetch linked children for each parent
    const emails = parents.map(p => p.email);
    let childrenQuery = emails.length > 0
      ? admin
          .from('students')
          .select('id, full_name, school_name, status, parent_email')
          .in('parent_email', emails)
      : null;
    if (childrenQuery && effectiveSchool) {
      childrenQuery = childrenQuery.eq('school_name', effectiveSchool);
    }
    const { data: linkedStudents } = childrenQuery ? await childrenQuery : { data: [] };

    const childrenMap: Record<string, any[]> = {};
    for (const s of linkedStudents ?? []) {
      if (!s.parent_email) continue;
      if (!childrenMap[s.parent_email]) childrenMap[s.parent_email] = [];
      childrenMap[s.parent_email].push(s);
    }

    const data = parents.map(p => ({ ...p, children: childrenMap[p.email] ?? [] }));

    if (!includePickerData) {
      return NextResponse.json({
        success: true,
        data,
        assigned_schools: guard.profile.role === 'teacher' ? allowedSchools : undefined,
      });
    }

    // ── Picker data (students, teachers, classes, schools) ───────────────────
    let portalStudentsQuery = admin
      .from('portal_users')
      .select('id, full_name, school_name, school_id, section_class, classes!portal_users_class_id_fkey(name)')
      .eq('role', 'student')
      .order('full_name')
      .limit(2000);
    if (effectiveSchool) {
      portalStudentsQuery = portalStudentsQuery.ilike('school_name', effectiveSchool);
    }

    let teachersQuery = admin
      .from('portal_users')
      .select('id, full_name, section_class, school_name')
      .eq('role', 'teacher')
      .order('full_name');
    if (effectiveSchool) {
      teachersQuery = teachersQuery.ilike('school_name', effectiveSchool);
    }

    // Classes: scope to teacher's own classes; admin gets all (filters client-side per school)
    let classesQuery = admin
      .from('classes')
      .select('id, name, schools!classes_school_id_fkey(name)')
      .order('name');
    if (guard.profile.role === 'teacher') {
      classesQuery = classesQuery.eq('teacher_id', guard.profile.id) as any;
      if (guard.profile.school_id) {
        classesQuery = classesQuery.eq('school_id', guard.profile.school_id) as any;
      }
    }

    let linkedQuery = admin
      .from('students')
      .select('user_id')
      .not('parent_email', 'is', null)
      .not('user_id', 'is', null);
    if (effectiveSchool) {
      linkedQuery = linkedQuery.ilike('school_name', effectiveSchool);
    }

    const [
      { data: portalStudents },
      { data: allTeachers },
      { data: officialClasses },
      { data: linkedStudentIds },
    ] = await Promise.all([portalStudentsQuery, teachersQuery, classesQuery, linkedQuery]);

    const linkedSet = new Set(
      (linkedStudentIds ?? []).map((s: any) => s.user_id).filter(Boolean)
    );

    const allStudents = (portalStudents ?? []).map((ps: any) => {
      const classFromFK = (ps.classes as any)?.name ?? null;
      return {
        id: ps.id,
        full_name: ps.full_name,
        school_name: ps.school_name,
        parent_email: linkedSet.has(ps.id) ? 'linked' : null,
        grade_level: classFromFK || ps.section_class || null,
        section: null,
        current_class: classFromFK || ps.section_class || null,
      };
    });

    let schoolsList: string[];
    if (guard.profile.role === 'teacher') {
      schoolsList = allowedSchools;
    } else {
      const { data: allSchools } = await admin
        .from('schools').select('name').eq('status', 'approved').order('name');
      schoolsList = (allSchools ?? []).map((s: any) => s.name).filter(Boolean);
    }

    return NextResponse.json({
      success: true,
      data,
      students: allStudents,
      teachers: allTeachers ?? [],
      classes: (officialClasses ?? []).map((c: any) => ({
        name: c.name,
        school_name: (c.schools as any)?.name ?? null,
      })),
      assigned_schools: schoolsList,
    });
  } catch (err: any) {
    console.error('GET /api/parents/manage error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
