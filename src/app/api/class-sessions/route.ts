import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

type Caller = { role: string; id: string; school_id: string | null };

async function getCaller(): Promise<Caller | null> {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const { data: caller } = await adminClient()
    .from('portal_users')
    .select('role, id, school_id')
    .eq('id', user.id)
    .single();
  if (!caller || !['admin', 'teacher', 'school'].includes(caller.role)) return null;
  return caller as Caller;
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/class-sessions
// Body: { class_id, session_date, topic?, start_time?, end_time? }
// Creates a session for a class. Caller must have school-level access to the class.
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const caller = await getCaller();
    if (!caller) return NextResponse.json({ error: 'Staff access required' }, { status: 403 });

    const body = await request.json();
    const { class_id, session_date, topic, start_time, end_time } = body;

    if (!class_id || !session_date) {
      return NextResponse.json({ error: 'class_id and session_date are required' }, { status: 400 });
    }

    const admin = adminClient();

    // Verify the class exists and fetch its school for boundary check
    const { data: cls } = await admin
      .from('classes')
      .select('id, name, school_id')
      .eq('id', class_id)
      .maybeSingle();

    if (!cls) return NextResponse.json({ error: 'Class not found' }, { status: 404 });

    // ── School boundary guard ─────────────────────────────────────────────────
    if (caller.role !== 'admin' && cls.school_id) {
      let hasAccess = caller.school_id === cls.school_id;

      if (!hasAccess && caller.role === 'teacher') {
        const { data: ts } = await admin
          .from('teacher_schools')
          .select('school_id')
          .eq('teacher_id', caller.id)
          .eq('school_id', cls.school_id)
          .maybeSingle();
        hasAccess = !!ts;
      }

      if (!hasAccess) {
        return NextResponse.json(
          { error: 'Access denied: you are not assigned to the school this class belongs to' },
          { status: 403 },
        );
      }
    }

    const { data, error } = await admin
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
