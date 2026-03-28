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

    const { email, full_name, phone, student_id, relationship = 'Guardian' } = await req.json();

    if (!email || !full_name || !student_id) {
      return NextResponse.json({ error: 'email, full_name, and student_id are required' }, { status: 400 });
    }

    const admin = createAdminClient();

    // Check if auth user already exists for this email
    const { data: existingList } = await admin.auth.admin.listUsers({ perPage: 1 });
    // listUsers can't filter by email directly — use inviteUserByEmail which upserts
    // First try to find existing user
    let authUserId: string | null = null;

    // Check portal_users for existing parent with this email
    const { data: existingPortal } = await supabase
      .from('portal_users')
      .select('id')
      .eq('email', email.trim().toLowerCase())
      .maybeSingle();

    if (existingPortal?.id) {
      // Already has a portal account — just link to student
      authUserId = existingPortal.id;
      const { error: linkErr } = await supabase
        .from('students')
        .update({
          parent_email: email.trim().toLowerCase(),
          parent_name: full_name,
          parent_phone: phone ?? null,
          parent_relationship: relationship,
          updated_at: new Date().toISOString(),
        })
        .eq('id', student_id);
      if (linkErr) throw linkErr;

      // Ensure role is parent
      await supabase
        .from('portal_users')
        .update({ role: 'parent', updated_at: new Date().toISOString() })
        .eq('id', authUserId)
        .neq('role', 'parent');
    } else {
      // Create Supabase Auth user via invite (sends email with set-password link)
      const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(
        email.trim().toLowerCase(),
        { data: { full_name, role: 'parent' } }
      );
      if (inviteErr) throw inviteErr;

      authUserId = invited.user.id;

      // Create portal_users record and link student via RPC
      const { error: rpcErr } = await (supabase.rpc as any)('create_parent_and_link', {
        p_email: email.trim().toLowerCase(),
        p_full_name: full_name,
        p_phone: phone ?? null,
        p_student_id: student_id,
        p_relationship: relationship,
        p_auth_user_id: authUserId,
      });
      if (rpcErr) throw rpcErr;
    }

    return NextResponse.json({ success: true, invited: !existingPortal, auth_user_id: authUserId });
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

    const { parent_id, full_name, phone, student_id, relationship, is_active } = await req.json();
    if (!parent_id) return NextResponse.json({ error: 'parent_id is required' }, { status: 400 });

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

    // If re-linking to a student, fetch parent email then update student
    if (student_id) {
      const { data: parent } = await supabase
        .from('portal_users')
        .select('email, full_name, phone')
        .eq('id', parent_id)
        .single();

      if (parent) {
        const { error: linkErr } = await supabase
          .from('students')
          .update({
            parent_email: parent.email,
            parent_name: full_name ?? parent.full_name,
            parent_phone: phone ?? parent.phone,
            parent_relationship: relationship ?? 'Guardian',
            updated_at: new Date().toISOString(),
          })
          .eq('id', student_id);

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
    // Admin can pass ?school=<name>; teachers are automatically scoped to their school
    const schoolParam = url.searchParams.get('school') ?? '';
    const effectiveSchool = guard.profile.role === 'teacher'
      ? (guard.profile.school_name ?? '')
      : schoolParam;

    // If school-scoped, first find all parent_emails linked to students in that school
    let allowedEmails: string[] | null = null;
    if (effectiveSchool) {
      const { data: scopedStudents } = await supabase
        .from('students')
        .select('parent_email')
        .eq('school_name', effectiveSchool)
        .not('parent_email', 'is', null);
      allowedEmails = (scopedStudents ?? []).map((s: any) => s.parent_email).filter(Boolean);
      // If no students have parents in this school, return empty
      if (allowedEmails.length === 0) {
        return NextResponse.json({ success: true, data: [] });
      }
    }

    let query = supabase
      .from('portal_users')
      .select('id, email, full_name, phone, is_active, created_at')
      .eq('role', 'parent')
      .order('created_at', { ascending: false });

    if (search) {
      query = query.or(`email.ilike.%${search}%,full_name.ilike.%${search}%`);
    }

    if (allowedEmails) {
      query = query.in('email', allowedEmails);
    }

    const { data: parents, error } = await query.limit(200);
    if (error) throw error;

    // Fetch linked students for each parent via parent_email match
    const emails = (parents ?? []).map(p => p.email);
    let stuQuery = emails.length > 0
      ? supabase
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

    // Also return all students for the picker (scoped to school for teachers)
    let allStuQuery = supabase
      .from('students')
      .select('id, full_name, school_name, parent_email, grade_level')
      .order('full_name')
      .limit(2000);
    if (effectiveSchool) {
      allStuQuery = allStuQuery.eq('school_name', effectiveSchool);
    }
    const { data: allStudents } = await allStuQuery;

    return NextResponse.json({ success: true, data, students: allStudents ?? [] });
  } catch (err: any) {
    console.error('GET /api/parents/manage error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
