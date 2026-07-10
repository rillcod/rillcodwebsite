import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
}

async function caller() {
  const server = await createServerClient();
  const { data: { user } } = await server.auth.getUser();
  if (!user) return null;
  const { data } = await adminClient().from('portal_users').select('id, role, full_name').eq('id', user.id).maybeSingle();
  return data && ['admin', 'teacher'].includes(data.role) ? data : null;
}

async function enrichedRequests(admin: ReturnType<typeof adminClient>, rows: any[]) {
  const studentIds = [...new Set(rows.map((row) => row.student_id))];
  const classIds = [...new Set(rows.flatMap((row) => [row.from_class_id, row.to_class_id]))];
  const teacherIds = [...new Set(rows.flatMap((row) => [row.from_teacher_id, row.requested_by, row.decided_by]).filter(Boolean))];
  const [studentsRes, classesRes, teachersRes] = await Promise.all([
    studentIds.length ? admin.from('portal_users').select('id, full_name, email').in('id', studentIds) : Promise.resolve({ data: [] }),
    classIds.length ? admin.from('classes').select('id, name, teacher_id, school_id').in('id', classIds) : Promise.resolve({ data: [] }),
    teacherIds.length ? admin.from('portal_users').select('id, full_name, email').in('id', teacherIds) : Promise.resolve({ data: [] }),
  ]);
  const students = new Map((studentsRes.data ?? []).map((row: any) => [row.id, row]));
  const classes = new Map((classesRes.data ?? []).map((row: any) => [row.id, row]));
  const teachers = new Map((teachersRes.data ?? []).map((row: any) => [row.id, row]));
  return rows.map((row) => ({
    ...row,
    student: students.get(row.student_id) ?? null,
    from_class: classes.get(row.from_class_id) ?? null,
    to_class: classes.get(row.to_class_id) ?? null,
    from_teacher: teachers.get(row.from_teacher_id) ?? null,
    requester: teachers.get(row.requested_by) ?? null,
    decider: teachers.get(row.decided_by) ?? null,
  }));
}

export async function GET() {
  const actor = await caller();
  if (!actor) return NextResponse.json({ error: 'Teacher or admin access required' }, { status: 403 });
  const admin = adminClient();
  let query = admin.from('student_transfer_requests').select('*').order('created_at', { ascending: false }).limit(200);
  if (actor.role !== 'admin') query = query.or(`from_teacher_id.eq.${actor.id},requested_by.eq.${actor.id}`) as any;
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ requests: await enrichedRequests(admin, data ?? []) });
}

export async function POST(request: NextRequest) {
  const actor = await caller();
  if (!actor) return NextResponse.json({ error: 'Teacher or admin access required' }, { status: 403 });
  const body = await request.json();
  const studentId = typeof body.student_id === 'string' ? body.student_id : null;
  const toClassId = typeof body.to_class_id === 'string' ? body.to_class_id : null;
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (!studentId || !toClassId || reason.length < 10) {
    return NextResponse.json({ error: 'student_id, to_class_id and a meaningful reason (10+ characters) are required' }, { status: 400 });
  }

  const admin = adminClient();
  const [{ data: student }, { data: destination }] = await Promise.all([
    admin.from('portal_users').select('id, full_name, class_id, school_id, primary_teacher_id').eq('id', studentId).eq('role', 'student').maybeSingle(),
    admin.from('classes').select('id, name, school_id, teacher_id').eq('id', toClassId).maybeSingle(),
  ]);
  if (!student || !student.class_id) return NextResponse.json({ error: 'Student is not currently owned by a class' }, { status: 409 });
  if (!destination?.teacher_id) return NextResponse.json({ error: 'Destination class has no owner' }, { status: 409 });
  if (actor.role === 'teacher' && destination.teacher_id !== actor.id) {
    return NextResponse.json({ error: 'You can only request a student for a class you own' }, { status: 403 });
  }
  const { data: source } = await admin.from('classes').select('id, name, school_id, teacher_id').eq('id', student.class_id).maybeSingle();
  if (!source?.teacher_id) return NextResponse.json({ error: 'Current class has no owner; ask an admin to repair ownership first' }, { status: 409 });
  if (source.id === destination.id) return NextResponse.json({ error: 'Student is already in this class' }, { status: 409 });
  if (source.school_id !== destination.school_id) return NextResponse.json({ error: 'Cross-school transfer requests are not allowed' }, { status: 403 });
  if (source.teacher_id === destination.teacher_id) return NextResponse.json({ error: 'Both classes have the same owner; use normal class transfer' }, { status: 409 });

  const { data: existing } = await admin.from('student_transfer_requests').select('id, status, to_class_id')
    .eq('student_id', student.id).eq('status', 'pending').maybeSingle();
  if (existing && existing.to_class_id === destination.id) return NextResponse.json({ success: true, pending: true, request_id: existing.id });
  if (existing) return NextResponse.json({ error: 'This student already has a pending transfer request. It must be decided before another can be sent.' }, { status: 409 });

  const { data: created, error } = await admin.from('student_transfer_requests').insert({
    student_id: student.id,
    from_class_id: source.id,
    to_class_id: destination.id,
    from_teacher_id: source.teacher_id,
    requested_by: actor.id,
    school_id: source.school_id,
    reason,
  }).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await admin.from('notifications').insert({
    user_id: source.teacher_id,
    title: `Student transfer request: ${student.full_name}`,
    message: `${actor.full_name} requested ${student.full_name} from ${source.name} to ${destination.name}.`,
    type: 'info',
    link: `/dashboard/classes/${source.id}`,
  });
  return NextResponse.json({ success: true, request: created }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const actor = await caller();
  if (!actor) return NextResponse.json({ error: 'Teacher or admin access required' }, { status: 403 });
  const body = await request.json();
  const requestId = typeof body.request_id === 'string' ? body.request_id : null;
  if (!requestId || !['approve', 'decline'].includes(body.decision)) {
    return NextResponse.json({ error: 'request_id and decision (approve/decline) are required' }, { status: 400 });
  }
  const admin = adminClient();
  const { data: transfer, error } = await admin.rpc('decide_student_transfer_request', {
    p_request_id: requestId,
    p_actor_id: actor.id,
    p_approve: body.decision === 'approve',
    p_note: typeof body.note === 'string' ? body.note : null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 409 });
  const row = Array.isArray(transfer) ? transfer[0] : transfer;
  if (row?.requested_by) {
    await admin.from('notifications').insert({
      user_id: row.requested_by,
      title: `Student transfer ${body.decision === 'approve' ? 'approved' : 'declined'}`,
      message: body.decision === 'approve' ? 'The student has been moved automatically.' : (body.note || 'The current teacher declined the request.'),
      type: body.decision === 'approve' ? 'success' : 'warning',
      link: `/dashboard/classes/${row.to_class_id}`,
    });
  }
  return NextResponse.json({ success: true, request: row });
}
