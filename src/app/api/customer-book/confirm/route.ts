import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { upsertBookParent, promoteBookLeadToPortalIfLinked } from '@/lib/crm/contact-book';

export async function POST(req: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from('portal_users')
    .select('id, role')
    .eq('id', user.id)
    .maybeSingle();
  if (!existing || !['student', 'parent'].includes(existing.role)) {
    return NextResponse.json({ error: 'Only student/parent profiles can confirm details here' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const fullName = typeof body.full_name === 'string' ? body.full_name.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
  const schoolName = typeof body.school_name === 'string' ? body.school_name.trim() : '';
  const className = typeof body.class_name === 'string' ? body.class_name.trim() : '';
  const confirmed = body.confirmed === true;
  if (!confirmed) return NextResponse.json({ error: 'Confirmation checkbox is required' }, { status: 400 });
  if (!fullName || !email || !phone || !schoolName || !className) {
    return NextResponse.json({ error: 'Please complete name, email, phone, school, and class' }, { status: 400 });
  }

  const { error: profileErr } = await admin
    .from('portal_users')
    .update({
      full_name: fullName,
      email,
      phone,
      school_name: schoolName,
      section_class: className,
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id);
  if (profileErr) return NextResponse.json({ error: profileErr.message }, { status: 500 });

  const bookId = await upsertBookParent(admin, {
    fullName,
    email,
    phone,
    schoolName,
    className,
    source: 'self_confirm',
    lastChannel: 'inbox',
    role: existing.role,
    userId: user.id,
    extraMeta: { confirmed: true, confirmed_at: new Date().toISOString() },
  });
  if (!bookId) return NextResponse.json({ error: 'Failed to save contact book entry' }, { status: 500 });

  if (existing.role === 'parent') {
    await promoteBookLeadToPortalIfLinked(admin, { bookId, email, phone });
  }

  return NextResponse.json({ success: true });
}
