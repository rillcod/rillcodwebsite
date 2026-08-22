import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { canAccessSchool } from '@/lib/auth/school-scope';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

// POST /api/consent-forms/[id]/sign — parent signs a consent form
export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('portal_users').select('role, school_id').eq('id', user.id).single();
  if (profile?.role !== 'parent') {
    return NextResponse.json({ error: 'Only parents can sign consent forms' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const response_data = body?.response_data ?? null;
  const requestedStudentId = typeof body?.student_id === 'string' ? body.student_id.trim() : '';
  const submittedChildName = typeof response_data?.child_name === 'string'
    ? response_data.child_name.trim().toLowerCase().replace(/\s+/g, ' ')
    : '';

  const admin = createAdminClient();
  const [{ data: form, error: formError }, { data: links, error: linksError }] = await Promise.all([
    admin.from('consent_forms').select('id, school_id').eq('id', id).maybeSingle(),
    admin
      .from('parent_student_links')
      .select('student_id, students!parent_student_links_student_id_fkey(id, full_name, school_id)')
      .eq('parent_id', user.id),
  ]);
  if (formError || !form) return NextResponse.json({ error: 'This school form is no longer available.' }, { status: 404 });
  if (linksError) return NextResponse.json({ error: 'We could not verify your linked children. Please try again.' }, { status: 503 });

  const schoolLinks = (links ?? []).filter((link: any) => link.students?.school_id === form.school_id);
  if (schoolLinks.length === 0 && profile.school_id !== form.school_id) {
    return NextResponse.json({ error: 'This form belongs to a different school.' }, { status: 403 });
  }
  if (requestedStudentId && !schoolLinks.some((link: any) => link.student_id === requestedStudentId)) {
    return NextResponse.json({ error: 'The selected child is not linked to your account for this school.' }, { status: 403 });
  }
  const nameMatches = submittedChildName
    ? schoolLinks.filter((link: any) => String(link.students?.full_name ?? '').trim().toLowerCase().replace(/\s+/g, ' ') === submittedChildName)
    : [];
  const studentId = requestedStudentId
    || (nameMatches.length === 1 ? nameMatches[0].student_id : '')
    || (schoolLinks.length === 1 ? schoolLinks[0].student_id : '')
    || null;

  let { error } = await supabase
    .from('consent_responses')
    .insert({
      form_id: id,
      parent_id: user.id,
      student_id: studentId,
      signed_at: new Date().toISOString(),
      response_data,
    });

  // Keep deployment order safe while the additive migration is waiting to be
  // applied: the old schema can still accept one legacy parent-level response.
  if (error?.code === '42703' || error?.message?.includes('student_id')) {
    const fallback = await supabase
      .from('consent_responses')
      .insert({ form_id: id, parent_id: user.id, signed_at: new Date().toISOString(), response_data });
    error = fallback.error;
  }

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'ALREADY_SIGNED', message: 'You have already signed this form.' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, studentScoped: Boolean(studentId) });
}

// GET /api/consent-forms/[id]/sign — export CSV of portal signatures (school-scoped)
export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('portal_users').select('role, school_id').eq('id', user.id).single();
  if (!['teacher', 'admin', 'school'].includes(profile?.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Verify the form belongs to this staff member's school
  const { data: form } = await supabase
    .from('consent_forms').select('title, school_id').eq('id', id).single();
  if (!form) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!(await canAccessSchool(user.id, profile, form.school_id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: responses } = await supabase
    .from('consent_responses')
    .select('signed_at, response_data, portal_users!consent_responses_parent_id_fkey(full_name, email, phone)')
    .eq('form_id', id)
    .order('signed_at');

  function csvCell(v: unknown): string {
    if (v === null || v === undefined) return '';
    const s = String(v).replace(/"/g, '""');
    return /[",\n\r]/.test(s) ? `"${s}"` : s;
  }

  const headers = 'Parent Name,Email,Phone,Child Name,Child Age,Child Class,Programme,WhatsApp,Signed At';
  const dataRows = (responses ?? []).map((r: any) => {
    const d = (r.response_data ?? {}) as Record<string, string>;
    return [
      r.portal_users?.full_name ?? '',
      r.portal_users?.email    ?? '',
      r.portal_users?.phone    ?? '',
      d.child_name             ?? '',
      d.child_age              ?? '',
      d.child_class            ?? '',
      d.program_category       ?? '',
      d.parent_whatsapp        ?? '',
      r.signed_at,
    ].map(csvCell).join(',');
  });

  const csv = [headers, ...dataRows].join('\r\n');
  const safeTitle = form.title.replace(/[^a-z0-9]/gi, '_').slice(0, 40);

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${safeTitle}_signatures_${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
