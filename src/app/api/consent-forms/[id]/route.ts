import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

// GET /api/consent-forms/[id] — staff: signed responses + public leads
export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('portal_users').select('role, school_id').eq('id', user.id).single();
  if (!['teacher', 'admin', 'school'].includes(profile?.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Use service-role for form_leads so RLS on that table never blocks staff reads.
  // Auth is already verified above (role check + school scope on the form itself).
  const admin = adminClient();

  // Non-admin: verify the form belongs to one of their schools
  if (profile?.role !== 'admin') {
    const { data: formCheck } = await supabase.from('consent_forms').select('school_id').eq('id', id).single();
    if (!formCheck) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    let allowedSchoolIds: string[] = [];
    if (profile?.school_id) allowedSchoolIds.push(profile.school_id);
    if (profile?.role === 'teacher') {
      const { data: ts } = await (admin as any).from('teacher_schools').select('school_id').eq('teacher_id', user.id);
      for (const row of ts ?? []) { if (row.school_id && !allowedSchoolIds.includes(row.school_id)) allowedSchoolIds.push(row.school_id); }
    }
    if (allowedSchoolIds.length > 0 && !allowedSchoolIds.includes(formCheck.school_id ?? '')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  const [formRes, { data: responses }, leadsResult] = await Promise.all([
    supabase.from('consent_forms').select('id, title, body, form_type, due_date, is_public, schools(name)').eq('id', id).single(),
    supabase
      .from('consent_responses')
      .select('id, signed_at, response_data, portal_users!parent_id(full_name, email, phone)')
      .eq('form_id', id)
      .order('signed_at', { ascending: false }),
    (admin as any)
      .from('form_leads')
      .select('id, submitted_at, email, child_current_school, response_data, status, match_status, match_confidence, match_notes, match_candidate_id, matched_student_id, matched_parent_id, contact_id, prospect_id, schools!matched_school_id(name), match_candidate:portal_users!match_candidate_id(id, full_name, section_class, email)')
      .eq('form_id', id)
      .order('submitted_at', { ascending: false }),
  ]);

  // If full query fails (FK join not available), fall back retaining all non-join columns.
  let leads = leadsResult.data;
  if (leadsResult.error) {
    const fallback = await (admin as any)
      .from('form_leads')
      .select('id, submitted_at, email, child_current_school, response_data, status, match_status, match_confidence, match_notes, match_candidate_id, matched_student_id, matched_parent_id, contact_id, prospect_id, school_id')
      .eq('form_id', id)
      .order('submitted_at', { ascending: false });
    leads = fallback.data ?? [];
  }

  // Find parent links to support multi-child persistence on frontend reload
  const parentIds = (leads ?? []).map((l: any) => l.matched_parent_id).filter(Boolean);
  let parentLinks: any[] = [];
  if (parentIds.length > 0) {
    const { data: links } = await (admin as any)
      .from('parent_student_links')
      .select('parent_id, student_id')
      .in('parent_id', parentIds);
    if (links && links.length > 0) {
      const studentIds = links.map((l: any) => l.student_id).filter(Boolean);
      if (studentIds.length > 0) {
        const { data: stus } = await (admin as any)
          .from('students')
          .select('id, full_name, user_id')
          .in('id', studentIds);
        if (stus) {
          const stuMap = new Map<string, { id: string; full_name: string; user_id: string | null }>(
            stus.map((s: any) => [s.id, s])
          );
          parentLinks = links.map((l: any) => {
            const match = stuMap.get(l.student_id);
            return {
              parent_id: l.parent_id,
              student_id: l.student_id,
              studentName: match?.full_name || 'Student',
              studentPortalId: match?.user_id || l.student_id,
            };
          });
        }
      }
    }
  }

  return NextResponse.json({
    form: formRes.data ?? null,
    data: responses ?? [],
    leads: leads ?? [],
    parentLinks,
  });
}

// PATCH /api/consent-forms/[id] — staff: toggle is_public / form_type
export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('portal_users').select('role, school_id').eq('id', user.id).single();
  if (!['teacher', 'admin', 'school'].includes(profile?.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const allowed = ['is_public', 'form_type', 'title', 'body', 'due_date'] as const;
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) updates[key] = body[key];
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  const { data: form } = await supabase.from('consent_forms').select('school_id').eq('id', id).single();
  if (!form) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (profile?.role !== 'admin' && form.school_id !== profile?.school_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data, error } = await supabase.from('consent_forms').update(updates as { is_public?: boolean; form_type?: string }).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

// DELETE /api/consent-forms/[id] — staff only
export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('portal_users').select('role, school_id').eq('id', user.id).single();
  if (!['teacher', 'admin', 'school'].includes(profile?.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: form } = await supabase.from('consent_forms').select('school_id').eq('id', id).single();
  if (!form) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (profile?.role !== 'admin' && form.school_id !== profile?.school_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { error } = await supabase.from('consent_forms').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
