import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function requireStaff() {
  const supabase = await createServerClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  
  if (authErr || !user) {
    throw new Error('Unauthorized');
  }

  const admin = adminClient();
  const { data: profile } = await admin
    .from('portal_users')
    .select('id, role, school_id')
    .eq('id', user.id)
    .single();

  if (!profile || !['admin', 'teacher', 'school'].includes(profile.role)) {
    throw new Error('Forbidden: Staff access required');
  }

  return profile;
}

// POST /api/contacts/save — save a new contact from WhatsApp
export async function POST(req: NextRequest) {
  try {
    const caller = await requireStaff();
    const admin = adminClient();

    const body = await req.json();
    const { phone, name, source } = body;

    if (!phone || !name?.trim()) {
      return NextResponse.json({ error: 'phone and name required' }, { status: 400 });
    }

    // Check if contact already exists in students table
    const { data: existing } = await admin
      .from('students')
      .select('id, full_name')
      .or(`parent_phone.eq.${phone},phone.eq.${phone}`)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ 
        error: `Contact already exists: ${existing.full_name}`,
        existing: true 
      }, { status: 409 });
    }

    // Create a prospective student record
    const { data: newContact, error: insertErr } = await admin
      .from('students')
      .insert({
        full_name: name.trim(),
        parent_phone: phone,
        status: 'pending',
        enrollment_type: 'prospective',
        created_at: new Date().toISOString(),
        metadata: { source: source || 'whatsapp', saved_by: caller.id },
      })
      .select()
      .single();

    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    // Update WhatsApp conversation with contact name
    await admin
      .from('whatsapp_conversations')
      .update({ contact_name: name.trim(), updated_at: new Date().toISOString() })
      .eq('phone_number', phone);

    return NextResponse.json({ 
      success: true, 
      data: newContact,
      message: `Contact saved: ${name.trim()}`
    });
  } catch (err: any) {
    const status = err.message === 'Unauthorized' ? 401 : err.message === 'Forbidden: Staff access required' ? 403 : 500;
    return NextResponse.json({ error: err.message }, { status });
  }
}
