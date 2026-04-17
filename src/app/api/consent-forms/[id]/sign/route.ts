import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// POST /api/consent-forms/[id]/sign — parent signs a consent form
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('portal_users').select('role').eq('id', user.id).single();
  if (profile?.role !== 'parent') {
    return NextResponse.json({ error: 'Only parents can sign consent forms' }, { status: 403 });
  }

  const { error } = await supabase
    .from('consent_responses')
    .insert({ form_id: id, parent_id: user.id, signed_at: new Date().toISOString() });

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'ALREADY_SIGNED', message: 'You have already signed this form.' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

// GET /api/consent-forms/[id]/export — export CSV of responses
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('portal_users').select('role').eq('id', user.id).single();
  if (!['teacher', 'admin', 'school'].includes(profile?.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: responses } = await supabase
    .from('consent_responses')
    .select('signed_at, portal_users!parent_id(full_name, email)')
    .eq('form_id', id)
    .order('signed_at');

  const rows = [
    'Parent Name,Email,Signed At',
    ...(responses ?? []).map((r: any) => {
      const name = r.portal_users?.full_name ?? '';
      const email = r.portal_users?.email ?? '';
      return `"${name}","${email}","${r.signed_at}"`;
    }),
  ].join('\n');

  return new NextResponse(rows, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="consent-form-${id}-responses.csv"`,
    },
  });
}
