import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// POST /api/consent-forms/[id]/sign — parent signs a consent form
export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('portal_users').select('role').eq('id', user.id).single();
  if (profile?.role !== 'parent') {
    return NextResponse.json({ error: 'Only parents can sign consent forms' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const response_data = body?.response_data ?? null;

  const { error } = await supabase
    .from('consent_responses')
    .insert({ form_id: id, parent_id: user.id, signed_at: new Date().toISOString(), response_data });

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'ALREADY_SIGNED', message: 'You have already signed this form.' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
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
  if (profile?.role !== 'admin' && form.school_id !== profile?.school_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: responses } = await supabase
    .from('consent_responses')
    .select('signed_at, response_data, portal_users!parent_id(full_name, email, phone)')
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
