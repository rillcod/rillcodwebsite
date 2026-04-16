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

/**
 * Returns true if the caller may manage (grade/delete) a submission.
 * Resolved by checking the submission's assignment school vs the caller's school.
 */
async function callerCanManageSubmission(
  caller: Caller,
  assignmentSchoolId: string | null,
  assignmentCreatedBy: string | null,
): Promise<boolean> {
  if (caller.role === 'admin') return true;
  if (caller.role === 'school') {
    return !assignmentSchoolId || assignmentSchoolId === caller.school_id;
  }
  if (caller.role === 'teacher') {
    if (assignmentCreatedBy === caller.id) return true;
    if (!assignmentSchoolId) return false;
    if (caller.school_id === assignmentSchoolId) return true;
    const { data: ts } = await adminClient()
      .from('teacher_schools')
      .select('school_id')
      .eq('teacher_id', caller.id)
      .eq('school_id', assignmentSchoolId)
      .maybeSingle();
    return !!ts;
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/assignment-submissions/[id]
// Update grade, feedback, status, submission_text on a submission.
// When status becomes 'graded', optionally cleans up the uploaded image file.
// ─────────────────────────────────────────────────────────────────────────────
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const caller = await getCaller();
    if (!caller) return NextResponse.json({ error: 'Staff access required' }, { status: 403 });

    const { id } = await params;
    const admin = adminClient();

    // Fetch submission + its assignment school for boundary check (single query)
    const { data: sub } = await admin
      .from('assignment_submissions')
      .select('id, assignment_id, file_url, assignments(school_id, created_by, weight, max_points)')
      .eq('id', id)
      .maybeSingle();

    if (!sub) return NextResponse.json({ error: 'Submission not found' }, { status: 404 });

    const assignment = (sub as any).assignments;
    const assignmentSchoolId: string | null  = assignment?.school_id   ?? null;
    const assignmentCreatedBy: string | null = assignment?.created_by  ?? null;

    const canManage = await callerCanManageSubmission(caller, assignmentSchoolId, assignmentCreatedBy);
    if (!canManage) {
      return NextResponse.json(
        { error: 'Access denied: this submission belongs to an assignment outside your school scope' },
        { status: 403 },
      );
    }

    const body = await request.json();

    // ── Whitelisted update fields ──────────────────────────────────────────
    // graded_by and graded_at are NOT client-settable — always set server-side
    const allowed: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if ('grade'           in body) allowed.grade           = body.grade           ?? null;
    if ('feedback'        in body) allowed.feedback        = body.feedback        ?? null;
    if ('status'          in body) allowed.status          = body.status;
    if ('submission_text' in body) allowed.submission_text = body.submission_text ?? null;
    // Allow explicit weighted_score override from GradeCanvas
    if ('weighted_score'  in body) allowed.weighted_score  = body.weighted_score  ?? null;

    if (body.status === 'graded' || 'grade' in body) {
      // Always use server-determined grader identity — never trust the body
      allowed.graded_by = caller.id;
      allowed.graded_at = new Date().toISOString();

      // Auto-compute weighted_score only when not explicitly provided
      if (body.grade != null && !('weighted_score' in body)) {
        const w  = assignment?.weight     ?? 0;
        const mp = assignment?.max_points ?? 100;
        allowed.weighted_score = (w > 0 && mp > 0)
          ? Math.round((Number(body.grade) / mp) * w)
          : null;
      }
    }

    // When marking as graded, delete image files from storage to free space
    if (body.status === 'graded' && sub.file_url) {
      if (/\.(png|jpe?g|gif|webp|bmp|heic)(\?|$)/i.test(sub.file_url)) {
        const marker    = '/object/public/assignments/';
        const markerIdx = sub.file_url.indexOf(marker);
        if (markerIdx !== -1) {
          const storagePath = decodeURIComponent(
            sub.file_url.slice(markerIdx + marker.length).split('?')[0],
          );
          await admin.storage.from('assignments').remove([storagePath]);
        }
        allowed.file_url = null;
      }
    }

    const { data, error } = await admin
      .from('assignment_submissions')
      .update(allowed)
      .eq('id', id)
      .select('id, grade, status, file_url')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/assignment-submissions/[id]
// Admin or teacher assigned to the assignment's school only.
// ─────────────────────────────────────────────────────────────────────────────
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const caller = await getCaller();
    if (!caller) return NextResponse.json({ error: 'Staff access required' }, { status: 403 });
    if (caller.role === 'school') {
      return NextResponse.json({ error: 'School accounts cannot delete submissions' }, { status: 403 });
    }

    const { id } = await params;
    const admin = adminClient();

    const { data: sub } = await admin
      .from('assignment_submissions')
      .select('id, assignments(school_id, created_by)')
      .eq('id', id)
      .maybeSingle();

    if (!sub) return NextResponse.json({ error: 'Submission not found' }, { status: 404 });

    const assignment = (sub as any).assignments;
    const canManage = await callerCanManageSubmission(
      caller,
      assignment?.school_id  ?? null,
      assignment?.created_by ?? null,
    );
    if (!canManage) {
      return NextResponse.json(
        { error: 'Access denied: this submission belongs to an assignment outside your school scope' },
        { status: 403 },
      );
    }

    const { error } = await admin.from('assignment_submissions').delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 });
  }
}
