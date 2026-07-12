import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabase } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { reinstateStudentToClass } from '@/lib/students/reinstate-to-class';
import {
  loadSchoolStudentsForClaim,
  matchPastedNamesToStudents,
  parsePastedStudentNames,
} from '@/lib/students/claim-by-names';
import { isPasteClaimEnabled } from '@/lib/server/app-settings';

export const dynamic = 'force-dynamic';

function adminClient() {
  return createSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

type Caller = { role: string; id: string; school_id: string | null };

async function requireStaff(): Promise<Caller | { _err: string } | null> {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { _err: `auth:${error?.message ?? 'no user'}` };
  const { data: caller, error: dbErr } = await adminClient()
    .from('portal_users')
    .select('role, id, school_id')
    .eq('id', user.id)
    .single();
  if (!caller) return { _err: `profile:${dbErr?.message ?? 'not found'} uid=${user.id}` };
  // Admin + teacher only (school role cannot paste-claim)
  if (!['admin', 'teacher'].includes(caller.role)) return { _err: `role:${caller.role}` };
  return caller as Caller;
}

async function callerHasClassAccess(caller: Caller, classSchoolId: string | null): Promise<boolean> {
  if (caller.role === 'admin') return true;
  if (!classSchoolId) return true;
  if (caller.role === 'teacher') {
    if (caller.school_id === classSchoolId) return true;
    const { data: ts } = await adminClient()
      .from('teacher_schools')
      .select('school_id')
      .eq('teacher_id', caller.id)
      .eq('school_id', classSchoolId)
      .maybeSingle();
    return !!ts;
  }
  return false;
}

/**
 * POST /api/classes/[id]/enroll/by-names
 * Body: { names: string[] | string, confirm?: boolean }
 * - confirm false/omitted → dry-run match preview
 * - confirm true → DIRECT claim into this class (bypasses transfer requests / ownership waits)
 *   Requires admin LMS toggle allow_paste_claim_students. Admin or teacher with school access.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const staffResult = await requireStaff();
  if (!staffResult || '_err' in staffResult) {
    return NextResponse.json(
      { error: staffResult ? `Access denied [${(staffResult as any)._err}]` : 'Access denied' },
      { status: 403 },
    );
  }
  const caller = staffResult as Caller;
  const { id: classId } = await context.params;

  const admin = adminClient();
  const pasteClaimOn = await isPasteClaimEnabled(admin);
  if (!pasteClaimOn) {
    return NextResponse.json(
      {
        error: 'Paste-name claim is disabled. An admin must enable “Allow Paste-Name Claim” in LMS Settings.',
        code: 'FEATURE_DISABLED',
      },
      { status: 403 },
    );
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const confirm = body?.confirm === true;
  const names = parsePastedStudentNames(body?.names ?? body?.text ?? '');
  if (names.length === 0) {
    return NextResponse.json({ error: 'Paste at least one student name (one per line).' }, { status: 400 });
  }
  if (names.length > 500) {
    return NextResponse.json({ error: 'Maximum 500 names per claim batch.' }, { status: 400 });
  }

  const { data: cls, error: clsErr } = await admin
    .from('classes')
    .select('id, name, school_id, teacher_id, max_students, schools(name)')
    .eq('id', classId)
    .maybeSingle();

  if (clsErr || !cls) {
    return NextResponse.json({ error: 'Class not found' }, { status: 404 });
  }

  const hasAccess = await callerHasClassAccess(caller, cls.school_id ?? null);
  if (!hasAccess) {
    return NextResponse.json(
      { error: 'Access denied: you are not assigned to the school this class belongs to.' },
      { status: 403 },
    );
  }

  const schoolName = (cls as any).schools?.name ?? null;
  let students;
  try {
    students = await loadSchoolStudentsForClaim(
      admin as any,
      cls.school_id ?? null,
      schoolName,
      classId,
    );
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to load school students' }, { status: 500 });
  }

  const matches = matchPastedNamesToStudents(names, students, classId);

  const preview = {
    claimable: matches.filter((m) => m.status === 'claimable'),
    alreadyHere: matches.filter((m) => m.status === 'already_here'),
    ambiguous: matches.filter((m) => m.status === 'ambiguous'),
    unmatched: matches.filter((m) => m.status === 'unmatched'),
  };

  if (!confirm) {
    return NextResponse.json({
      preview: true,
      classId,
      className: cls.name,
      total: names.length,
      claimable: preview.claimable.map((m) => ({
        input: m.input,
        student: m.status === 'claimable' ? m.student : null,
      })),
      alreadyHere: preview.alreadyHere.map((m) => ({
        input: m.input,
        student: m.status === 'already_here' ? m.student : null,
      })),
      ambiguous: preview.ambiguous.map((m) => ({
        input: m.input,
        candidates: m.status === 'ambiguous' ? m.candidates : [],
      })),
      unmatched: preview.unmatched.map((m) => ({ input: m.input })),
    });
  }

  // Capacity: active roster / enrollments currently counted like enroll GET uses portal_users.class_id
  let seatsLeft = Infinity;
  if (cls.max_students && cls.max_students > 0) {
    const { count } = await admin
      .from('portal_users')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'student')
      .eq('class_id', classId)
      .or('is_deleted.eq.false,is_deleted.is.null');
    seatsLeft = Math.max(0, cls.max_students - (count ?? 0));
  }

  const claimed: Array<{ input: string; studentId: string; fullName: string; fromClassId: string | null }> = [];
  const failed: Array<{ input: string; studentId?: string; error: string; code?: string }> = [];
  const skippedAlready = preview.alreadyHere.map((m) => ({
    input: m.input,
    studentId: m.status === 'already_here' ? m.student.id : '',
    fullName: m.status === 'already_here' ? m.student.full_name : m.input,
  }));
  let capacityStopped = false;

  for (const row of preview.claimable) {
    if (row.status !== 'claimable') continue;
    if (seatsLeft !== Infinity && claimed.length >= seatsLeft) {
      capacityStopped = true;
      failed.push({
        input: row.input,
        studentId: row.student.id,
        error: 'Class is at capacity — remaining matches were not claimed.',
        code: 'CAPACITY',
      });
      continue;
    }

    const reinstate = await reinstateStudentToClass(admin as any, {
      studentId: row.student.id,
      classId,
      actor: { id: caller.id, role: caller.role },
      forceCrossTeacher: true,
    });

    if (!reinstate.ok) {
      failed.push({
        input: row.input,
        studentId: row.student.id,
        error: reinstate.error,
        code: reinstate.code,
      });
      if (reinstate.code === 'CAPACITY') {
        capacityStopped = true;
        seatsLeft = 0;
      }
      continue;
    }

    claimed.push({
      input: row.input,
      studentId: reinstate.studentId,
      fullName: reinstate.fullName,
      fromClassId: reinstate.fromClassId,
    });
  }

  return NextResponse.json({
    preview: false,
    classId,
    className: cls.name,
    claimed,
    alreadyHere: skippedAlready,
    ambiguous: preview.ambiguous.map((m) => ({
      input: m.input,
      candidates: m.status === 'ambiguous' ? m.candidates : [],
    })),
    unmatched: preview.unmatched.map((m) => ({ input: m.input })),
    failed,
    capacityStopped,
    summary: {
      claimed: claimed.length,
      alreadyHere: skippedAlready.length,
      ambiguous: preview.ambiguous.length,
      unmatched: preview.unmatched.length,
      failed: failed.length,
    },
  });
}
