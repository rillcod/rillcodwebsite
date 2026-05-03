import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// POST /api/attendance/upsert
// Body: { records: { session_id, user_id, status, notes? }[] }
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = adminClient();
    const { data: caller } = await admin
      .from('portal_users')
      .select('role, id, school_id')
      .eq('id', user.id)
      .single();

    if (!caller || !['admin', 'teacher'].includes(caller.role)) {
      return NextResponse.json({ error: 'Staff access required' }, { status: 403 });
    }

    const { records } = await request.json() as {
      records: { session_id: string; user_id: string; status: string; notes?: string | null }[];
    };

    if (!Array.isArray(records) || records.length === 0) {
      return NextResponse.json({ error: 'records array required' }, { status: 400 });
    }

    // Teacher: verify all session_ids belong to classes at their assigned schools
    if (caller.role === 'teacher') {
      const { data: tsRows } = await admin.from('teacher_schools').select('school_id').eq('teacher_id', caller.id);
      const schoolIds = new Set<string>();
      if (caller.school_id) schoolIds.add(caller.school_id);
      for (const r of tsRows ?? []) { if ((r as any).school_id) schoolIds.add((r as any).school_id); }

      const uniqueSessionIds = [...new Set(records.map(r => r.session_id))];
      const { data: sessions } = await admin
        .from('class_sessions')
        .select('id, classes(school_id)')
        .in('id', uniqueSessionIds);

      const invalidSession = (sessions ?? []).find((s: any) => {
        const sSchool = s.classes?.school_id;
        return sSchool && !schoolIds.has(sSchool);
      });
      if (invalidSession) {
        return NextResponse.json({ error: 'Access denied: session belongs to a different school' }, { status: 403 });
      }
    }

    const { error } = await admin
      .from('attendance')
      .upsert(records, { onConflict: 'session_id,user_id' });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ saved: records.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 });
  }
}
