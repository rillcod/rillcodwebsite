import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// ── Auth guard helper ────────────────────────────────────────────────────────
async function requireStaff(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized', status: 401 };

  const { data: profile } = await supabase
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
// POST — Create parent account + link to student
// Body: { email, full_name, phone, student_id, relationship? }
// Uses the DB function create_parent_and_link() which upserts portal_users +
// updates students.parent_email/name/phone/relationship.
// The corresponding Supabase Auth account is created via admin API here too.
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const guard = await requireStaff(supabase);
    if ('error' in guard) return NextResponse.json({ error: guard.error }, { status: guard.status });

    const { email, full_name, phone, student_id, student_ids, relationship = 'Guardian', password } = await req.json();

    // Support both single student_id and array of student_ids (multi-child)
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
    const { data: existingPortal } = await supabase
      .from('portal_users')
      .select('id, role')
      .eq('email', cleanEmail)
      .maybeSingle();

    // Block if existing account belongs to a non-parent role (student, teacher, admin)
    if (existingPortal && existingPortal.role !== 'parent') {
      return NextResponse.json({
        error: `This email is already registered as a ${existingPortal.role} account. Use a different email for the parent, or ask the ${existingPortal.role} to use a separate email.`,
      }, { status: 409 });
    }

    let authUserId: string;
    const isExisting = !!existingPortal?.id;

    if (isExisting) {
      authUserId = existingPortal!.id;
      // Update password and profile (existing parent account)
      await admin.auth.admin.updateUserById(authUserId, { password });
      await admin.from('portal_users').update({
        full_name, phone: phone ?? null, updated_at: new Date().toISOString(),
      }).eq('id', authUserId);
    } else {
      // Create auth user with the provided password
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email: cleanEmail,
        password,
        email_confirm: true,
        user_metadata: { full_name, role: 'parent' },
      });
      if (createErr) throw createErr;
      authUserId = created.user.id;

      // Create portal_users record
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
      // Find student profile to ensure we have their school/class info for the upsert
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
          enrollment_type: 'school', // default for staff-linked students
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });
        if (linkErr) console.error(`[parents/manage] Failed to link student ${sid}:`, linkErr);
      } else {
        // Fallback to update if portal_user session not found (unlikely)
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
// PATCH — Update parent info or re-link to a different student
// Body: { parent_id, full_name?, phone?, student_id?, relationship? }
// ─────────────────────────────────────────────────────────────────────────────
export async function PATCH(req: Request) {
  try {
    const supabase = await createClient();
    const guard = await requireStaff(supabase);
    if ('error' in guard) return NextResponse.json({ error: guard.error }, { status: guard.status });

    const { parent_id, full_name, phone, student_id, relationship, is_active, reset_password } = await req.json();
    if (!parent_id) return NextResponse.json({ error: 'parent_id is required' }, { status: 400 });

    // Password reset shortcut — generate, update auth, return new password
    if (reset_password) {
      const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789@#$!';
      const newPw = Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
      const adminPw = createAdminClient();
      const { error: pwErr } = await adminPw.auth.admin.updateUserById(parent_id, {
        password: newPw,
        user_metadata: { must_change_password: true },
      });
      if (pwErr) throw pwErr;
      return NextResponse.json({ success: true, new_password: newPw });
    }

    // Update portal_users record
    const updates: Record<string, any> = { updated_at: new Date().toISOString() };
    if (full_name !== undefined) updates.full_name = full_name;
    if (phone !== undefined) updates.phone = phone;
    if (is_active !== undefined) updates.is_active = is_active;

    const { error: updateErr } = await supabase
      .from('portal_users')
      .update(updates)
      .eq('id', parent_id)
      .eq('role', 'parent');

    if (updateErr) throw updateErr;

    // If linking/re-linking to a student, fetch parent info then upsert into 'students' table
    if (student_id) {
      const { data: parent } = await supabase
        .from('portal_users')
        .select('email, full_name, phone')
        .eq('id', parent_id)
        .eq('role', 'parent')
        .single();

      if (parent) {
        // Find current student profile to get their school/class info if they exist
        const { data: ps } = await supabase
          .from('portal_users')
          .select('full_name, school_id, school_name, section_class, email')
          .eq('id', student_id)
          .single();

        // Use upsert to handle cases where student is in portal_users but not students table yet
        const { error: linkErr } = await supabase
          .from('students')
          .upsert({
            user_id: student_id,
            name: ps?.full_name || 'Student',
            full_name: ps?.full_name || undefined,
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
// DELETE — Unlink parent from a student (clears student parent fields)
// Query: ?student_id=<uuid>
// Optionally also deactivate the parent account:  &deactivate=1
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

    if (student_id) {
      const { error } = await (supabase.rpc as any)('unlink_parent_from_student', { p_student_id: student_id });
      if (error) throw error;
    }

    if (deactivate && parent_id) {
      const { error } = await supabase
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
// GET — List all parent accounts with their linked children
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(req: Request) {
  try {
    const supabase = await createClient();
    const guard = await requireStaff(supabase);
    if ('error' in guard) return NextResponse.json({ error: guard.error }, { status: guard.status });

    const url = new URL(req.url);
    const search = url.searchParams.get('search') ?? '';
    // Admin can pass ?school=<name>; teachers are automatically scoped to their assigned schools
    const schoolParam = url.searchParams.get('school') ?? '';
    const classParam = url.searchParams.get('class') ?? '';
    const includePickerData = url.searchParams.get('include_picker_data') === 'true';
    
    // Retrieve all schools this teacher is assigned to (including their primary school_name)
    let assignedSchools: string[] = [];
    if (guard.profile.role === 'teacher') {
      const admin = createAdminClient();
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

    // Determine the school filter to apply for data fetching
    let effectiveSchool = '';
    let allowedSchools: string[] = [];

    if (guard.profile.role === 'teacher') {
      // If teacher has assigned schools, they can only see those.
      // If they passed a 'school' param and it's one of theirs, use it.
      if (schoolParam && assignedSchools.includes(schoolParam)) {
        effectiveSchool = schoolParam;
      } else if (assignedSchools.length > 0) {
        effectiveSchool = assignedSchools[0]; // Default to first assignment if no specific filter
      } else {
        effectiveSchool = guard.profile.school_name ?? '';
      }
      allowedSchools = assignedSchools;
    } else {
      // Admin
      effectiveSchool = schoolParam;
    }

    // If school-scoped, first find all parent_emails linked to students in that school
    const adminClient = createAdminClient();
    let allowedEmails: string[] | null = null;
    if (effectiveSchool) {
      let stuQuery = adminClient
        .from('students')
        .select('parent_email, current_class, grade_level, section')
        .ilike('school_name', effectiveSchool)
        .not('parent_email', 'is', null);

      if (classParam) {
        const cp = classParam.toLowerCase();
        // Since we can't easily do complex OR filters across multiple columns with 'in', 
        // we fetch the emails first and filter them in memory if class is provided.
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

    // If school-scoped with no linked parents yet, skip the parents query entirely
    // (passing an empty array to .in() is unreliable across Supabase versions)
    let parents: any[] = [];
    if (allowedEmails !== null && allowedEmails.length === 0) {
      // No parents for this school yet — parents stays []
    } else {
      let query = supabase
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

    // Fetch linked students for each parent via parent_email match (admin client bypasses RLS)
    const emails = (parents ?? []).map(p => p.email);
    let stuQuery = emails.length > 0
      ? adminClient
          .from('students')
          .select('id, full_name, school_name, status, parent_email')
          .in('parent_email', emails)
      : null;

    if (stuQuery && effectiveSchool) {
      stuQuery = stuQuery.eq('school_name', effectiveSchool);
    }

    const { data: linkedStudents } = stuQuery ? await stuQuery : { data: [] };

    // Group students by parent email
    const childrenMap: Record<string, any[]> = {};
    for (const s of linkedStudents ?? []) {
      if (!s.parent_email) continue;
      if (!childrenMap[s.parent_email]) childrenMap[s.parent_email] = [];
      childrenMap[s.parent_email].push(s);
    }

    const data = (parents ?? []).map(p => ({
      ...p,
      children: childrenMap[p.email] ?? [],
    }));

    // --- OPTIMIZATION: Only return picker data if requested ---
    if (!includePickerData) {
      return NextResponse.json({ 
        success: true, 
        data, 
        assigned_schools: guard.profile.role === 'teacher' ? allowedSchools : undefined
      });
    }

    // Return picker data: students (with class via FK join), teachers, classes
    const adminForStudents = createAdminClient();

    // ── Query 1: students — join classes via class_id FK (eliminates cross-ref round trip)
    // Load ALL schools for admin (no school filter) so switching schools in modal works.
    // Teachers are always scoped to their school.
    let portalStudentsQuery = adminForStudents
      .from('portal_users')
      .select('id, full_name, school_name, school_id, section_class, classes!portal_users_class_id_fkey(name)')
      .eq('role', 'student')
      .order('full_name')
      .limit(2000);
    if (effectiveSchool) {
      portalStudentsQuery = portalStudentsQuery.ilike('school_name', effectiveSchool);
    }

    // ── Query 2: teachers (scoped to school as before)
    let teachersQuery = adminForStudents
      .from('portal_users')
      .select('id, full_name, section_class, school_name')
      .eq('role', 'teacher')
      .order('full_name');
    if (effectiveSchool) {
      teachersQuery = teachersQuery.ilike('school_name', effectiveSchool);
    }

    // ── Query 3: all classes with school_name (no school filter — modal filters client-side)
    const classesQuery = adminForStudents
      .from('classes')
      .select('id, name, schools!classes_school_id_fkey(name)')
      .order('name');

    // ── Query 4: lightweight — just user_ids of students that already have a parent
    let linkedQuery = adminForStudents
      .from('students')
      .select('user_id')
      .not('parent_email', 'is', null)
      .not('user_id', 'is', null);
    if (effectiveSchool) {
      linkedQuery = linkedQuery.ilike('school_name', effectiveSchool);
    }

    // Run all four in parallel
    const [
      { data: portalStudents },
      { data: allTeachers },
      { data: officialClasses },
      { data: linkedStudentIds },
    ] = await Promise.all([portalStudentsQuery, teachersQuery, classesQuery, linkedQuery]);

    // Build set of already-linked student IDs (fast O(1) lookups)
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

    // Build schools list: teachers get their assigned schools; admins get all approved schools
    let schoolsList: string[];
    if (guard.profile.role === 'teacher') {
      schoolsList = allowedSchools;
    } else {
      const { data: allSchools } = await adminForStudents
        .from('schools').select('name').eq('status', 'approved').order('name');
      schoolsList = (allSchools ?? []).map((s: any) => s.name).filter(Boolean);
    }

    return NextResponse.json({
      success: true,
      data,
      students: allStudents ?? [],
      teachers: allTeachers ?? [],
      // { name, school_name } so the form can filter classes by selected school
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
