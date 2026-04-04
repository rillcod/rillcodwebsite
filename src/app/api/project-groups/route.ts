import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

async function getCallerProfile(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('portal_users').select('id, role, school_id, school_name').eq('id', user.id).single();
  return data as { id: string; role: string; school_id: string | null; school_name: string | null } | null;
}

// ── GET ──────────────────────────────────────────────────────────────────────
// Staff:   returns all groups (scoped to school if teacher)
// Student: returns only groups the student belongs to, with their group members
export async function GET(req: Request) {
  try {
    const supabase = await createClient();
    const profile  = await getCallerProfile(supabase);
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = createAdminClient();
    const url   = new URL(req.url);
    const assignmentId = url.searchParams.get('assignment_id') ?? '';

    const isStaff   = ['admin', 'teacher'].includes(profile.role);
    const isStudent = profile.role === 'student';

    if (isStaff) {
      let q = admin
        .from('project_groups')
        .select(`
          id, name, evaluation_type, group_score, group_feedback, is_graded,
          created_at, updated_at, class_name, school_name,
          assignments(id, title),
          project_group_members(
            id, individual_score, individual_feedback,
            portal_users(id, full_name, email, section_class)
          )
        `)
        .order('created_at', { ascending: false });

      if (assignmentId) q = q.eq('assignment_id', assignmentId);
      if (profile.role === 'teacher' && profile.school_name) {
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
          class_name, created_at,
          assignments(id, title, description, due_date),
          project_group_members(
            id, student_id, individual_score, individual_feedback,
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
    const profile  = await getCallerProfile(supabase);
    if (!profile || !['admin', 'teacher'].includes(profile.role)) {
      return NextResponse.json({ error: 'Staff only' }, { status: 403 });
    }

    const body = await req.json();
    const { name, assignment_id, class_name, school_name, evaluation_type = 'individual', student_ids } = body;

    if (!name?.trim())           return NextResponse.json({ error: 'Group name is required' }, { status: 400 });
    if (!Array.isArray(student_ids) || student_ids.length < 2) {
      return NextResponse.json({ error: 'Select at least 2 students for a group' }, { status: 400 });
    }

    const admin = createAdminClient();

    const { data: group, error: gErr } = await admin
      .from('project_groups')
      .insert({
        name:            name.trim(),
        assignment_id:   assignment_id || null,
        class_name:      class_name    || null,
        school_name:     school_name   || profile.school_name || null,
        evaluation_type,
        created_by:      profile.id,
      })
      .select()
      .single();

    if (gErr) throw gErr;

    const members = (student_ids as string[]).map(sid => ({ group_id: group.id, student_id: sid }));
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
    const profile  = await getCallerProfile(supabase);
    if (!profile || !['admin', 'teacher'].includes(profile.role)) {
      return NextResponse.json({ error: 'Staff only' }, { status: 403 });
    }

    const body = await req.json();
    const { id, group_score, group_feedback, individual_scores, is_graded, evaluation_type, name } = body;
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    const admin = createAdminClient();

    // Build typed update object
    const updates: {
      updated_at: string;
      name?: string;
      evaluation_type?: string;
      group_score?: number | null;
      group_feedback?: string | null;
      is_graded?: boolean;
    } = { updated_at: new Date().toISOString() };

    if (name            !== undefined) updates.name            = name;
    if (evaluation_type !== undefined) updates.evaluation_type = evaluation_type;
    if (group_score     !== undefined) updates.group_score     = group_score;
    if (group_feedback  !== undefined) updates.group_feedback  = group_feedback;
    if (is_graded       !== undefined) updates.is_graded       = is_graded;

    const { error: gErr } = await admin.from('project_groups').update(updates).eq('id', id);
    if (gErr) throw gErr;

    // Apply per-member scores (individual evaluation type)
    if (Array.isArray(individual_scores)) {
      for (const s of individual_scores as { student_id: string; score: number; feedback?: string | null }[]) {
        await admin.from('project_group_members')
          .update({ individual_score: s.score, individual_feedback: s.feedback ?? null })
          .eq('group_id', id)
          .eq('student_id', s.student_id);
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
    const profile  = await getCallerProfile(supabase);
    if (!profile || !['admin', 'teacher'].includes(profile.role)) {
      return NextResponse.json({ error: 'Staff only' }, { status: 403 });
    }

    const url = new URL(req.url);
    const id  = url.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    const admin = createAdminClient();
    const { error } = await admin.from('project_groups').delete().eq('id', id);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
