import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// POST /api/consent-forms/[id]/clone — duplicate a form (title + body + form_type, resets is_public + due_date)
export async function POST(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('portal_users').select('role, school_id').eq('id', user.id).single();
  if (!profile || !['teacher', 'admin', 'school'].includes(profile.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: original } = await supabase
    .from('consent_forms')
    .select('title, body, form_type, school_id')
    .eq('id', id).single();

  if (!original) return NextResponse.json({ error: 'Form not found' }, { status: 404 });

  if (profile.role !== 'admin' && original.school_id !== profile.school_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: clone, error } = await supabase
    .from('consent_forms')
    .insert({
      title:      `${original.title} (Copy)`,
      body:       original.body,
      form_type:  original.form_type,
      school_id:  original.school_id,
      created_by: user.id,
      is_public:  false,
      due_date:   null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: clone });
}
