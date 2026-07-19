import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

const ALLOWED_ROLES = ['parent', 'student', 'teacher', 'school', 'admin'];

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = createAdminClient() as any;
    const { data: profile } = await admin
      .from('portal_users')
      .select('id, role, school_id, school_name, section_class')
      .eq('id', user.id)
      .single();
    if (!profile || !ALLOWED_ROLES.includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { full_name, phone, school_name, section_class } = body;

    // Validate and sanitise inputs
    const updates: Record<string, string> = {};
    if (full_name !== undefined) {
      const name = String(full_name).trim().slice(0, 100);
      if (!name) return NextResponse.json({ error: 'full_name cannot be empty' }, { status: 400 });
      updates.full_name = name;
    }
    if (phone !== undefined) {
      const cleanPhone = String(phone).replace(/\D/g, '');
      if (cleanPhone && (cleanPhone.length < 7 || cleanPhone.length > 15)) {
        return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 });
      }
      updates.phone = cleanPhone || '';
    }
    if (school_name !== undefined) {
      if (profile.school_id) {
        const { data: school } = await admin.from('schools').select('name').eq('id', profile.school_id).maybeSingle();
        if (school?.name) updates.school_name = school.name;
      } else if (!['parent', 'student'].includes(profile.role)) {
        updates.school_name = String(school_name).trim().slice(0, 100);
      }
    }
    if (section_class !== undefined && !['parent', 'student'].includes(profile.role)) {
      updates.section_class = String(section_class).trim().slice(0, 50);
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    }

    const { error: updateErr } = await admin
      .from('portal_users')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', user.id);

    if (updateErr) {
      console.error('[inbox/profile] update error:', updateErr.message);
      return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[inbox/profile]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
