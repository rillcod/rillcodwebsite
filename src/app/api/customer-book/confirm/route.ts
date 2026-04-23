import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabase } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import type { Database } from '@/types/supabase';

function adminClient() {
  return createSupabase<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(req: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = adminClient();
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

  const { error: bookErr } = await admin.from('customer_contact_book').upsert({
    user_id: user.id,
    role: existing.role,
    full_name: fullName,
    email,
    phone,
    school_name: schoolName,
    class_name: className,
    source: 'self_confirm',
    last_channel: 'inbox',
    metadata: { confirmed: true, confirmed_at: new Date().toISOString() },
    confirmed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });
  if (bookErr) return NextResponse.json({ error: bookErr.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
