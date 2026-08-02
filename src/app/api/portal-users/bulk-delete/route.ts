import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { getAccountValuables } from '@/lib/students/account-valuables';
import { wipePortalUserCascade } from '@/lib/students/permanent-wipe';
import {
  getProtectedAcademicEvidence,
  protectedAcademicEvidenceMessage,
} from '@/lib/students/protected-academic-evidence';

export const dynamic = 'force-dynamic';

function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

// POST /api/portal-users/bulk-delete
// Tick-and-wipe: hard-delete many STUDENT accounts at once (built for cleaning out
// withdrawn students). Same guards as the single delete —
//   • caller must be admin or teacher
//   • teachers may only delete STUDENTS from their assigned school(s)
//   • paid ID cards / published reports are protected: those ids come back under
//     `needsConfirmation` (with what would be lost) unless { confirmDestroy: true }.
// Body: { ids: string[]; confirmDestroy?: boolean; classId?: string }
// classId lets a teacher clean out OLD students of a class they own even when the
// student's school_id is missing on legacy records — authorized by class ownership.
// Returns: { deleted: string[]; blocked: {id,reason}[]; needsConfirmation: {id,name,valuables}[] }
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const ids: string[] = Array.isArray(body.ids)
    ? [...new Set((body.ids as unknown[]).filter((x): x is string => typeof x === 'string'))]
    : [];
  const confirmDestroy = body.confirmDestroy === true;
  const classId = typeof body.classId === 'string' ? body.classId : null;

  const supabase = await createServerClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: caller } = await supabase.from('portal_users').select('role, id, school_id').eq('id', user.id).single();
  if (!caller || !['admin', 'teacher'].includes(caller.role)) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }
  if (ids.length === 0) return NextResponse.json({ error: 'No accounts selected.' }, { status: 400 });

  const admin = adminClient();

  // For teachers, pre-compute the schools they may act within, plus (when a classId is
  // given and they own it) the exact members of that class — so legacy/withdrawn students
  // with a missing school_id can still be cleaned by the teacher who owns their class.
  let assignedIds: string[] = [];
  const classMemberIds = new Set<string>();
  if (caller.role === 'teacher') {
    const { data: assignments } = await admin.from('teacher_schools').select('school_id').eq('teacher_id', caller.id);
    assignedIds = (assignments ?? []).map((a: any) => a.school_id).filter(Boolean);
    if (caller.school_id) assignedIds.push(caller.school_id);

    if (classId) {
      const { data: cls } = await admin.from('classes').select('id, teacher_id, school_id').eq('id', classId).maybeSingle();
      // Ownership is ASSIGNMENT-based (same rule as /api/classes visibility): the teacher owns
      // the class either because they are its teacher_id — which the
      // sync_class_ownership_from_teacher_schools trigger keeps in step with teacher_schools —
      // OR because the class belongs to a school they are assigned to (teacher_schools/profile).
      const ownsClass = !!cls && (cls.teacher_id === caller.id || (!!cls.school_id && assignedIds.includes(cls.school_id)));
      if (ownsClass) {
        const [{ data: direct }, { data: roster }] = await Promise.all([
          admin.from('portal_users').select('id').eq('class_id', classId).eq('role', 'student'),
          (admin as any).from('class_term_rosters').select('student_id').eq('class_id', classId),
        ]);
        (direct ?? []).forEach((r: any) => r.id && classMemberIds.add(r.id));
        (roster ?? []).forEach((r: any) => r.student_id && classMemberIds.add(r.student_id));
      }
    }
  }

  const deleted: string[] = [];
  const blocked: { id: string; reason: string }[] = [];
  const needsConfirmation: { id: string; name: string; valuables: Awaited<ReturnType<typeof getAccountValuables>> }[] = [];

  for (const id of ids) {
    if (id === caller.id) { blocked.push({ id, reason: 'You cannot delete your own account.' }); continue; }

    const { data: pu } = await admin.from('portal_users').select('role, school_id, full_name').eq('id', id).maybeSingle();
    if (!pu) { blocked.push({ id, reason: 'Account not found (already removed).' }); continue; }

    // This endpoint is student-focused (withdrawn cleanup). Teacher/parent/school accounts
    // must go through the single-delete flow that handles class reassignment etc.
    if (pu.role !== 'student') { blocked.push({ id, reason: 'Only student accounts can be bulk-deleted here.' }); continue; }
    const evidence = await getProtectedAcademicEvidence(admin, id);
    if (evidence.total > 0) {
      blocked.push({ id, reason: protectedAcademicEvidenceMessage(evidence) });
      continue;
    }


    const inAssignedSchool = !!pu.school_id && assignedIds.includes(pu.school_id);
    if (caller.role === 'teacher' && !inAssignedSchool && !classMemberIds.has(id)) {
      blocked.push({ id, reason: 'Outside your assigned school / class.' }); continue;
    }

    // Safety gate — don't quietly destroy paid cards / published reports.
    if (!confirmDestroy) {
      const { data: sRow } = await admin.from('students').select('id').eq('user_id', id).maybeSingle();
      const valuables = await getAccountValuables(admin, id, (sRow as any)?.id ?? null);
      if (valuables.hasValuables) {
        needsConfirmation.push({ id, name: pu.full_name ?? 'Student', valuables });
        continue;
      }
    }

    const wipeResult = await wipePortalUserCascade(admin, id);
    if (!wipeResult.ok) { blocked.push({ id, reason: wipeResult.error }); continue; }
    deleted.push(id);
  }

  return NextResponse.json({ success: true, deleted, blocked, needsConfirmation });
}
