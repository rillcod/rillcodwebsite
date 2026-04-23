import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import type { Database, TablesInsert } from '@/types/supabase';

function adminClient() {
  return createClient<Database>(
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
    const { phone, name, source, school_name, class_name, role_label } = body;

    if (!phone || !name?.trim()) {
      return NextResponse.json({ error: 'phone and name required' }, { status: 400 });
    }

    // Check if contact already exists in students table
    const { data: existing } = await admin
      .from('students')
      .select('id, full_name, name')
      .or(`parent_phone.eq.${phone},phone.eq.${phone}`)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ 
        error: `Contact already exists: ${existing.full_name || existing.name}`,
        existing: true 
      }, { status: 409 });
    }

    // Create a prospective student record
    const { data: newContact, error: insertErr } = await admin
      .from('students')
      .insert({
        name: name.trim(),
        full_name: name.trim(),
        parent_phone: phone,
        status: 'pending',
        enrollment_type: 'prospective',
        school_name: typeof school_name === 'string' && school_name.trim() ? school_name.trim() : null,
        section: typeof class_name === 'string' && class_name.trim() ? class_name.trim() : null,
        created_by: caller.id,
        created_at: new Date().toISOString(),
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

    const bookRow: TablesInsert<'customer_contact_book'> = {
      user_id: null,
      role: typeof role_label === 'string' && role_label.trim() ? role_label.trim() : 'prospective',
      full_name: name.trim(),
      email: null,
      phone,
      school_name: typeof school_name === 'string' && school_name.trim() ? school_name.trim() : null,
      class_name: typeof class_name === 'string' && class_name.trim() ? class_name.trim() : null,
      source: typeof source === 'string' && source.trim() ? source.trim() : 'whatsapp_capture',
      last_channel: 'whatsapp',
      metadata: {
        saved_by: caller.id,
        student_table_id: newContact.id,
      },
      confirmed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await admin.from('customer_contact_book').insert(bookRow);

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
