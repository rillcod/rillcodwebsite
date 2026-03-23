import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// POST /api/class-sessions
// Body: { class_id, session_date, topic?, start_time?, end_time? }
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: caller } = await adminClient()
      .from('portal_users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!caller || !['admin', 'teacher', 'school'].includes(caller.role)) {
      return NextResponse.json({ error: 'Staff access required' }, { status: 403 });
    }

    const body = await request.json();
    const { class_id, session_date, topic, start_time, end_time } = body;

    if (!class_id || !session_date) {
      return NextResponse.json({ error: 'class_id and session_date required' }, { status: 400 });
    }

    const { data, error } = await adminClient()
      .from('class_sessions')
      .insert({
        class_id,
        session_date,
        topic: topic || `Session on ${session_date}`,
        start_time: start_time || null,
        end_time: end_time || null,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 });
  }
}
