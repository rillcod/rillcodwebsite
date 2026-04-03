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
      const { error: linkErr } = await admin.from('students').update({
        parent_email: cleanEmail,
        parent_name: full_name,
        parent_phone: phone ?? null,
        parent_relationship: relationship,
        updated_at: new Date().toISOString(),
      }).eq('id', sid);
      if (linkErr) console.error(`[parents/manage] Failed to link student ${sid}:`, linkErr);
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
          .select('full_name, school_id, school_name, section_class')
          .eq('id', student_id)
          .single();

        // Use upsert to handle cases where student is in portal_users but not students table yet
        const { error: linkErr } = await supabase
          .from('students')
          .upsert({
            user_id: student_id,
            name: ps?.full_name || 'Student',
            full_name: ps?.full_name || undefined,
            school_id: ps?.school_id || undefined,
            school_name: ps?.school_name || undefined,
            current_class: ps?.section_class || undefined,
            parent_email: parent.email,
            parent_name: full_name ?? parent.full_name,
            parent_phone: phone ?? parent.phone,
            parent_relationship: relationship ?? 'Guardian',
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
      const { data: scopedStudents } = await adminClient
        .from('students')
        .select('parent_email')
        .eq('school_name', effectiveSchool)
        .not('parent_email', 'is', null);
      allowedEmails = (scopedStudents ?? []).map((s: any) => s.parent_email).filter(Boolean);
      // NOTE: if allowedEmails is empty we still continue so that the student+teacher
      // picker arrays are returned (needed by the "Add Parent" modal even when no
      // parents exist yet for this school).
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

    // Also return all students for the picker (use admin client to bypass RLS)
    // We query portal_users to catch everyone with 'student' role (including bulk-registered ones)
    // and left-join with the 'students' table to get parent linking info.
    const adminForStudents = createAdminClient();
    
    // Fetch all students from portal_users
    let portalStudentsQuery = adminForStudents
      .from('portal_users')
      .select('id, full_name, school_name, section_class, email')
      .eq('role', 'student')
      .order('full_name')
      .limit(2000);
    
    if (effectiveSchool) {
      portalStudentsQuery = portalStudentsQuery.eq('school_name', effectiveSchool);
    }
    
    const { data: portalStudents } = await portalStudentsQuery;

    // Fetch matching records from students table to get parent_email and grade info
    const studentEmails = (portalStudents ?? []).map(s => s.email).filter(Boolean);
    const { data: studentRecords } = studentEmails.length > 0 
      ? await adminForStudents
          .from('students')
          .select('id, user_id, student_email, parent_email, grade_level, section, current_class')
          .or(`student_email.in.(${studentEmails.join(',')}),parent_email.in.(${studentEmails.join(',')})`)
      : { data: [] };

    // Merge: portal_users is the primary list, students table provides the extra fields
    const allStudents = (portalStudents ?? []).map(ps => {
      const sr = (studentRecords ?? []).find(r => r.user_id === ps.id || r.student_email === ps.email);
      return {
        id: ps.id, // Auth User ID is the primary ID for linking in the UI
        full_name: ps.full_name,
        school_name: ps.school_name,
        parent_email: sr?.parent_email ?? null,
        grade_level: sr?.grade_level ?? ps.section_class ?? null,
        section: sr?.section ?? null,
        current_class: sr?.current_class ?? ps.section_class ?? null
      };
    });

    // Return teachers for the school so the form can show a teacher filter
    let teachersQuery = adminForStudents
      .from('portal_users')
      .select('id, full_name, section_class, school_name')
      .eq('role', 'teacher')
      .order('full_name');
    if (effectiveSchool) {
      teachersQuery = teachersQuery.eq('school_name', effectiveSchool);
    }
    const { data: allTeachers } = await teachersQuery;

    // --- NEW: Fetch all defined classes for this school ---
    // This solves the issue where classes (like "Python Class") might not show up 
    // if no students are assigned to them yet.
    let classesQuery = adminForStudents
      .from('classes')
      .select('id, name')
      .order('name');
    
    if (effectiveSchool) {
      // Find school_id for the effectiveSchool name to filter correctly
      const { data: schoolRow } = await adminForStudents
        .from('schools')
        .select('id')
        .eq('name', effectiveSchool)
        .maybeSingle();
      if (schoolRow?.id) {
        classesQuery = classesQuery.eq('school_id', schoolRow.id);
      }
    }
    const { data: officialClasses } = await classesQuery;

    return NextResponse.json({ 
      success: true, 
      data, 
      students: allStudents ?? [], 
      teachers: allTeachers ?? [],
      classes: (officialClasses ?? []).map(c => c.name),
      assigned_schools: guard.profile.role === 'teacher' ? allowedSchools : undefined
    });
  } catch (err: any) {
    console.error('GET /api/parents/manage error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
