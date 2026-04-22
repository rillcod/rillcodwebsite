import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// PATCH /api/grading/submissions/[id] — accept AI grade or override
export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('portal_users').select('role').eq('id', user.id).single();
  if (!['teacher', 'admin', 'school'].includes(profile?.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { action, grade, feedback } = await req.json();

  // Fetch existing submission
  const { data: submission } = await supabase
    .from('assignment_submissions')
    .select('grade, ai_suggested_grade, grading_mode')
    .eq('id', id)
    .single();

  if (!submission) return NextResponse.json({ error: 'Submission not found' }, { status: 404 });

  const updateData: Record<string, any> = { updated_at: new Date().toISOString() };
  let auditAction = '';

  if (action === 'accept_ai') {
    updateData.grade = submission.ai_suggested_grade;
    updateData.grading_mode = 'auto';
    updateData.status = 'graded';
    updateData.graded_at = new Date().toISOString();
    updateData.graded_by = user.id;
    auditAction = 'accept_ai_grade';
  } else if (action === 'override') {
    if (grade == null) return NextResponse.json({ error: 'grade is required for override', field: 'grade' }, { status: 400 });
    updateData.grade = grade;
    updateData.feedback = feedback || null;
    updateData.grading_mode = 'manual';
    updateData.status = 'graded';
    updateData.graded_at = new Date().toISOString();
    updateData.graded_by = user.id;
    auditAction = 'override_grade';
  } else {
    return NextResponse.json({ error: 'Invalid action. Use accept_ai or override' }, { status: 400 });
  }

  const { error } = await supabase.from('assignment_submissions').update(updateData as any).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Write audit log
  await supabase.from('audit_logs').insert({
    actor_id: user.id,
    resource_type: 'assignment_submission',
    resource_id: id,
    action: auditAction,
    old_value: String(submission.grade ?? submission.ai_suggested_grade ?? ''),
    new_value: String(updateData.grade ?? ''),
  });

  return NextResponse.json({ success: true });
}
