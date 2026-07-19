import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

const STAFF_ROLES = ['admin', 'teacher', 'school'];
const DIRECTORY_ROLES = ['admin', 'teacher', 'school', 'parent', 'student'];

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = createAdminClient() as any;
    const { data: caller } = await admin.from('portal_users')
      .select('id, role, school_id').eq('id', user.id).single();
    if (!caller || !DIRECTORY_ROLES.includes(caller.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const search = (searchParams.get('q') ?? '').trim().slice(0, 100)
      .replace(/[^\p{L}\p{N}@._+\- ']/gu, ' ');
    const requestedRole = searchParams.get('role') ?? 'all';
    const rawLimit = Number.parseInt(searchParams.get('limit') || '30', 10);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : 30;
    const includeExternal = searchParams.get('include_external') === '1' && STAFF_ROLES.includes(caller.role);

    if (requestedRole !== 'all' && !DIRECTORY_ROLES.includes(requestedRole)) {
      return NextResponse.json({ error: 'Invalid role filter' }, { status: 400 });
    }

    let allowedRoles = requestedRole === 'all' ? DIRECTORY_ROLES : [requestedRole];
    if (caller.role === 'parent' || caller.role === 'student') {
      allowedRoles = allowedRoles.filter((role) => STAFF_ROLES.includes(role));
    }

    let query = admin.from('portal_users')
      .select('id, full_name, email, phone, school_name, section_class, school_id, role, is_active')
      .in('role', allowedRoles).eq('is_active', true).eq('is_deleted', false)
      .neq('id', caller.id).limit(limit);

    if (caller.role !== 'admin') {
      if (!caller.school_id) query = query.eq('role', 'admin');
      else query = query.or(`school_id.eq.${caller.school_id},role.eq.admin`);
    }
    if (search) query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);

    const { data: portalContacts, error } = await query.order('full_name');
    if (error) {
      console.error('[inbox/contacts] portal query:', error.message);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }

    let externalContacts: any[] = [];
    if (includeExternal) {
      let externalQuery = admin.from('whatsapp_conversations')
        .select('id, phone_number, contact_name, opted_out, assigned_staff_id, last_message_at, last_message_preview, unread_count')
        .is('portal_user_id', null).order('last_message_at', { ascending: false }).limit(limit);
      if (caller.role !== 'admin') externalQuery = externalQuery.eq('assigned_staff_id', caller.id);
      if (search) externalQuery = externalQuery.ilike('contact_name', `%${search}%`);
      const { data, error: externalError } = await externalQuery;
      if (externalError) console.error('[inbox/contacts] external query:', externalError.message);
      externalContacts = (data ?? []).map((row: any) => ({
        ...row, full_name: row.contact_name || row.phone_number, phone: row.phone_number,
        role: 'external', source: 'whatsapp', isExternalWA: true,
      }));
    }

    return NextResponse.json({ data: [...(portalContacts ?? []), ...externalContacts] });
  } catch (err) {
    console.error('[inbox/contacts]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}