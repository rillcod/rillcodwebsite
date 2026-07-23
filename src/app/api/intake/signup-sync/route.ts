import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { capturePortalSignupLead } from '@/lib/crm/intake-capture';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

/** POST /api/intake/signup-sync — sync portal self-signup into Contact Directory */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const { data: profile } = await supabase
      .from('portal_users')
      .select('full_name, email, role, school_name, phone')
      .eq('id', user.id)
      .maybeSingle();

    const role = (profile?.role || body.role) as 'student' | 'parent';
    if (role !== 'student' && role !== 'parent') {
      return NextResponse.json({ error: 'Unsupported role' }, { status: 400 });
    }

    const admin = adminClient();
    const bookId = await capturePortalSignupLead(admin as any, {
      userId: user.id,
      fullName: String(profile?.full_name || body.fullName || ''),
      email: String(profile?.email || user.email || '').trim().toLowerCase(),
      role,
      schoolName: (profile?.school_name || body.schoolName) as string | null,
      childName: body.childName ? String(body.childName) : null,
      phone: (profile?.phone || body.phone) as string | null,
    });

    return NextResponse.json({ success: true, bookId });
  } catch (e) {
    console.error('[intake/signup-sync]', e);
    return NextResponse.json({ error: 'Signup sync failed' }, { status: 500 });
  }
}
