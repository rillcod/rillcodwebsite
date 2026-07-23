import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { deliverPortalCredentials } from '@/lib/credentials/deliver-portal-credentials';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = createAdminClient();
    const { data: profile } = await admin
      .from('portal_users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || !['admin', 'teacher', 'school'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { email, full_name, password, school_name, phone } = await req.json();
    if (!email || !full_name || !password) {
      return NextResponse.json({ error: 'email, full_name and password are required' }, { status: 400 });
    }

    const cleanEmail = email.trim().toLowerCase();
    const { data: parentRow } = await admin
      .from('portal_users')
      .select('id, school_id')
      .eq('email', cleanEmail)
      .eq('role', 'parent')
      .maybeSingle();

    if (!parentRow?.id) {
      return NextResponse.json(
        { error: 'Parent portal account not found. Save the parent record first, then resend credentials.' },
        { status: 404 },
      );
    }

    const delivery = await deliverPortalCredentials(admin, {
      parent: {
        userId: parentRow.id,
        email: cleanEmail,
        displayName: full_name,
        role: 'parent',
        storedPassword: password,
      },
      parentPhone: phone ?? null,
      parentName: full_name,
      schoolName: school_name ?? null,
      schoolId: parentRow.school_id ?? null,
      resetPolicy: 'never',
      archiveToRegistrationResults: true,
      emailChannel: 'external',
      emailSubject: `Your Rillcod Parent Portal Access${school_name ? ` — ${school_name}` : ''}`,
      title: `Your Rillcod Parent Portal Access${school_name ? ` — ${school_name}` : ''}`,
      bodyIntro: `Dear ${full_name}, welcome to your Rillcod parent portal${school_name ? ` for ${school_name}` : ''}.`,
    });

    if (!delivery.email && !delivery.whatsapp) {
      return NextResponse.json(
        { error: 'Could not deliver the login by email or WhatsApp. Check the address/phone and try again.' },
        { status: 502 },
      );
    }

    return NextResponse.json({ success: true, email: delivery.email, whatsapp: delivery.whatsapp });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to send credentials';
    console.error('[parents/send-credentials] error:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
