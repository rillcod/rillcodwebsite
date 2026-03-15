import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// POST /api/assignments/[id]/submit
// Upsert a student submission. Can be called by the student themselves (portal_user_id = their own id).
// Body: { portal_user_id, submission_text?, file_url?, answers? }
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = adminClient();
    const { data: caller } = await admin
      .from('portal_users')
      .select('role, id')
      .eq('id', user.id)
      .single();

    if (!caller) return NextResponse.json({ error: 'User not found' }, { status: 403 });

    const { id: assignment_id } = await params;
    const body = await request.json();
    const { portal_user_id, submission_text, file_url, answers } = body;

    // Only allow submitting for yourself unless staff
    const isStaff = ['admin', 'teacher', 'school'].includes(caller.role);
    const effectiveUserId = isStaff ? (portal_user_id ?? caller.id) : caller.id;

    const upsertData: Record<string, unknown> = {
      assignment_id,
      portal_user_id: effectiveUserId,
      submitted_at: new Date().toISOString(),
      status: 'submitted',
      updated_at: new Date().toISOString(),
    };
    if (submission_text !== undefined) upsertData.submission_text = submission_text || null;
    if (file_url !== undefined) upsertData.file_url = file_url || null;
    if (answers !== undefined && answers !== null) upsertData.answers = answers;

    const { data, error } = await admin
      .from('assignment_submissions')
      .upsert(upsertData, { onConflict: 'assignment_id,portal_user_id' })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 });
  }
}
