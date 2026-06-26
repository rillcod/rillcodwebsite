import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTeacherSchoolIds } from '@/lib/auth-utils';

async function getCallerProfile(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('portal_users').select('id, role, school_id, school_name').eq('id', user.id).single();
  return data as { id: string; role: string; school_id: string | null; school_name: string | null } | null;
}

async function canManageAssignmentGroups(admin: ReturnType<typeof createAdminClient>, profile: NonNullable<Awaited<ReturnType<typeof getCallerProfile>>>, assignmentId: string | null) {
  if (profile.role === 'admin') return true;
  if (!assignmentId) return false;
  const { data: assignment } = await admin
    .from('assignments')
    .select('id, school_id, created_by, class_id, metadata')
    .eq('id', assignmentId)
    .maybeSingle();
  if (!assignment) return false;
  const targetClassId = (assignment as any).metadata?.target_class_id || (assignment as any).class_id || null;
  if (profile.role === 'teacher') {
    if ((assignment as any).created_by === profile.id) return true;
    if (targetClassId) {
      const { data: cls } = await admin
        .from('classes')
        .select('teacher_id')
        .eq('id', targetClassId)
        .maybeSingle();
      if (cls?.teacher_id === profile.id) return true;
    }
    const scopedIds = await getTeacherSchoolIds(profile.id, profile.school_id);
    return !!(assignment as any).school_id && scopedIds.includes((assignment as any).school_id);
  }
  return false;
}

async function groupAssignmentId(admin: ReturnType<typeof createAdminClient>, groupId: string) {
  const { data } = await admin
    .from('project_groups')
    .select('assignment_id')
    .eq('id', groupId)
    .maybeSingle();
  return data?.assignment_id ?? null;
}

// ── GET ──────────────────────────────────────────────────────────────────────
// Staff:   returns all groups (scoped to school if teacher)
// Student: returns only groups the student belongs to, with their group members
export async function GET(req: Request) {
  try {
    const supabase = await createClient();
    const profile = await getCallerProfile(supabase);
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = createAdminClient();
    const url = new URL(req.url);
    const assignmentId = url.searchParams.get('assignment_id') ?? '';

    const isStaff = ['admin', 'teacher'].includes(profile.role);
    const isStudent = profile.role === 'student';

    if (isStaff) {
      let q = admin
        .from('project_groups')
        .select(`
          id, name, evaluation_type, group_score, group_feedback, is_graded,
          created_at, updated_at, class_name, school_name, assignment_id,
          assignments(id, title, description, due_date),
          project_group_members(
            id, student_id, individual_score, individual_feedback, task_description,
            portal_users(id, full_name, email, phone, section_class)
          )
        `)
        .order('created_at', { ascending: false });

      if (assignmentId) q = q.eq('assignment_id', assignmentId);
      if (profile.role === 'teacher' && assignmentId) {
        const allowed = await canManageAssignmentGroups(admin, profile, assignmentId);
        if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      } else if (profile.role === 'teacher' && profile.school_name) {
        q = q.eq('school_name', profile.school_name);
      }

      const { data, error } = await q;
      if (error) throw error;
      return NextResponse.json({ success: true, groups: data ?? [] });
    }

    if (isStudent) {
      // Find groups this student belongs to
      const { data: memberRows, error: mErr } = await admin
        .from('project_group_members')
        .select('group_id')
        .eq('student_id', profile.id);

      if (mErr) throw mErr;
      const groupIds = (memberRows ?? []).map(r => r.group_id);

      if (groupIds.length === 0) {
        return NextResponse.json({ success: true, groups: [] });
      }

      const { data, error } = await admin
        .from('project_groups')
        .select(`
          id, name, evaluation_type, group_score, group_feedback, is_graded,
          class_name, created_at, assignment_id,
          assignments(id, title, description, due_date),
          project_group_members(
            id, student_id, task_description,
            portal_users(id, full_name)
          )
        `)
        .in('id', groupIds)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return NextResponse.json({ success: true, groups: data ?? [] });
    }

    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ── POST — Create group ──────────────────────────────────────────────────────
// Body: { name, assignment_id?, class_name?, school_name?, evaluation_type, student_ids[] }
export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const profile = await getCallerProfile(supabase);
    if (!profile || !['admin', 'teacher'].includes(profile.role)) {
      return NextResponse.json({ error: 'Staff only' }, { status: 403 });
    }

    const body = await req.json();
    const { name, assignment_id, class_name, school_name, evaluation_type = 'individual', student_ids, member_tasks } = body;

    if (!name?.trim()) return NextResponse.json({ error: 'Group name is required' }, { status: 400 });
    if (!Array.isArray(student_ids) || student_ids.length < 2) {
      return NextResponse.json({ error: 'Select at least 2 students for a group' }, { status: 400 });
    }

    const admin = createAdminClient();
    const allowed = await canManageAssignmentGroups(admin, profile, assignment_id || null);
    if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    if (student_ids.length > 0) {
      let studentQuery = admin
        .from('portal_users')
        .select('id, school_id')
        .eq('role', 'student')
        .in('id', student_ids);
      if (profile.role === 'teacher' && profile.school_id) studentQuery = studentQuery.eq('school_id', profile.school_id);
      const { data: validStudents } = await studentQuery;
      const validIds = new Set((validStudents ?? []).map((student: any) => student.id));
      if ((student_ids as string[]).some((sid) => !validIds.has(sid))) {
        return NextResponse.json({ error: 'One or more students are outside your project scope.' }, { status: 403 });
      }
    }

    const { data: group, error: gErr } = await admin
      .from('project_groups')
      .insert({
        name: name.trim(),
        assignment_id: assignment_id || null,
        class_name: class_name || null,
        school_name: school_name || profile.school_name || null,
        evaluation_type,
        created_by: profile.id,
      })
      .select()
      .single();

    if (gErr) throw gErr;

    const tasksMap: Record<string, string> = member_tasks || {};
    const members = (student_ids as string[]).map(sid => ({
      group_id: group.id,
      student_id: sid,
      task_description: tasksMap[sid]?.trim() || null,
    }));
    const { error: mErr } = await admin.from('project_group_members').insert(members);
    if (mErr) throw mErr;

    return NextResponse.json({ success: true, group });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ── PATCH — Grade group or update group details ──────────────────────────────
// Body: { id, group_score?, group_feedback?, individual_scores?: {student_id, score, feedback}[], is_graded?, evaluation_type?, name? }
export async function PATCH(req: Request) {
  try {
    const supabase = await createClient();
    const profile = await getCallerProfile(supabase);
    if (!profile || !['admin', 'teacher'].includes(profile.role)) {
      return NextResponse.json({ error: 'Staff only' }, { status: 403 });
    }

    const body = await req.json();
    const { id, group_score, group_feedback, individual_scores, is_graded, evaluation_type, name, member_tasks } = body;
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    const admin = createAdminClient();
    const assignmentId = await groupAssignmentId(admin, id);
    const allowed = await canManageAssignmentGroups(admin, profile, assignmentId);
    if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    // Build typed update object
    const updates: {
      updated_at: string;
      name?: string;
      evaluation_type?: string;
      group_score?: number | null;
      group_feedback?: string | null;
      is_graded?: boolean;
    } = { updated_at: new Date().toISOString() };

    if (name !== undefined) updates.name = name;
    if (evaluation_type !== undefined) updates.evaluation_type = evaluation_type;
    if (group_score !== undefined) updates.group_score = group_score;
    if (group_feedback !== undefined) updates.group_feedback = group_feedback;
    if (is_graded !== undefined) updates.is_graded = is_graded;

    const { error: gErr } = await admin.from('project_groups').update(updates).eq('id', id);
    if (gErr) throw gErr;

    // Apply per-member scores (individual evaluation type)
    if (Array.isArray(individual_scores) && individual_scores.length > 0) {
      // Validate all submitted student_ids belong to this group before writing any score
      const { data: members } = await admin
        .from('project_group_members')
        .select('student_id')
        .eq('group_id', id);
      const memberSet = new Set((members ?? []).map((m: { student_id: string }) => m.student_id));
      const unknownIds = (individual_scores as { student_id: string }[])
        .map(s => s.student_id)
        .filter(sid => !memberSet.has(sid));
      if (unknownIds.length > 0) {
        return NextResponse.json(
          { error: `Students not in this group: ${unknownIds.join(', ')}` },
          { status: 422 },
        );
      }
      for (const s of individual_scores as { student_id: string; score: number; feedback?: string | null }[]) {
        await admin.from('project_group_members')
          .update({ individual_score: s.score, individual_feedback: s.feedback ?? null })
          .eq('group_id', id)
          .eq('student_id', s.student_id);
      }
    }

    // Update per-member task descriptions
    if (member_tasks && typeof member_tasks === 'object') {
      for (const [student_id, task] of Object.entries(member_tasks as Record<string, string>)) {
        await admin.from('project_group_members')
          .update({ task_description: (task as string)?.trim() || null })
          .eq('group_id', id)
          .eq('student_id', student_id);
      }
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ── DELETE — Remove a group ──────────────────────────────────────────────────
export async function DELETE(req: Request) {
  try {
    const supabase = await createClient();
    const profile = await getCallerProfile(supabase);
    if (!profile || !['admin', 'teacher'].includes(profile.role)) {
      return NextResponse.json({ error: 'Staff only' }, { status: 403 });
    }

    const url = new URL(req.url);
    const id = url.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    const admin = createAdminClient();
    const assignmentId = await groupAssignmentId(admin, id);
    const allowed = await canManageAssignmentGroups(admin, profile, assignmentId);
    if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const { error } = await admin.from('project_groups').delete().eq('id', id);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
