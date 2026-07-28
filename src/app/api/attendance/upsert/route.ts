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

    const validStatuses = new Set(['present', 'absent', 'late', 'excused']);
    const invalidRecord = records.find(record => !record.session_id || !record.user_id || !validStatuses.has(record.status));
    if (invalidRecord) {
      return NextResponse.json({ error: 'Each record needs a session, student, and valid status' }, { status: 400 });
    }

    const uniqueSessionIds = [...new Set(records.map(r => r.session_id).filter(Boolean))];
    const { data: sessionRows } = await admin
      .from('class_sessions')
      .select('id, class_id, term_id, classes!class_sessions_class_id_fkey(school_id,teacher_id)')
      .in('id', uniqueSessionIds);
    const sessionsById = new Map((sessionRows ?? []).map((session: any) => [session.id, session]));

    if (sessionsById.size !== uniqueSessionIds.length) {
      return NextResponse.json({ error: 'One or more sessions were not found' }, { status: 404 });
    }

    // Teacher: verify all session_ids belong to classes at their assigned schools
    if (caller.role === 'teacher') {
      const { data: tsRows } = await admin.from('teacher_schools').select('school_id').eq('teacher_id', caller.id);
      const schoolIds = new Set<string>();
      if (caller.school_id) schoolIds.add(caller.school_id);
      for (const r of tsRows ?? []) { if ((r as any).school_id) schoolIds.add((r as any).school_id); }

      const invalidSession = (sessionRows ?? []).find((s: any) => {
        const sSchool = s.classes?.school_id;
        const owner = s.classes?.teacher_id;
        return (sSchool && !schoolIds.has(sSchool)) || owner !== caller.id;
      });
      if (invalidSession) {
        return NextResponse.json({ error: 'Only the primary class teacher can record this attendance. An administrator can assist with cover sessions.' }, { status: 403 });
      }
    }

    const rosterLookups = records.map(async (record) => {
      const session = sessionsById.get(record.session_id) as any;
      if (!session?.class_id || !record.user_id) return { ...record, term_id: session?.term_id ?? null };
      let rosterQuery = admin
        .from('class_term_rosters')
        .select('id')
        .eq('class_id', session.class_id)
        .eq('student_id', record.user_id)
        .order('reinstated_at', { ascending: false, nullsFirst: false })
        .order('started_at', { ascending: false })
        .limit(1);
      rosterQuery = session.term_id ? rosterQuery.eq('term_id', session.term_id) : rosterQuery.is('term_id', null);
      const { data: roster } = await rosterQuery.maybeSingle();
      return {
        ...record,
        term_id: session.term_id ?? null,
        class_term_roster_id: roster?.id ?? null,
        recorded_by: caller.id,
      };
    });

    const scopedRecords = await Promise.all(rosterLookups);

    const { error } = await admin
      .from('attendance')
      .upsert(scopedRecords, { onConflict: 'session_id,user_id' });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ saved: scopedRecords.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 });
  }
}
