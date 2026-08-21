import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabase } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';

function adminClient() {
  return createSupabase(
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
  if (!caller || !['admin', 'teacher'].includes(caller.role)) return null;
  return caller as Caller;
}

async function callerCanManageClass(caller: Caller, classId: string) {
  const admin = adminClient();
  const { data: cls } = await admin.from('classes').select('school_id').eq('id', classId).maybeSingle();
  if (!cls) return false;
  if (caller.role === 'admin') return true;
  if (!cls.school_id) return false;
  if (caller.school_id === cls.school_id) return true;
  const { data: ts } = await admin
    .from('teacher_schools')
    .select('school_id')
    .eq('teacher_id', caller.id)
    .eq('school_id', cls.school_id)
    .maybeSingle();
  return !!ts;
}

async function scopedClassIds(caller: Caller): Promise<string[]> {
  const admin = adminClient();
  if (caller.role === 'admin') {
    const { data } = await admin.from('classes').select('id');
    return (data ?? []).map((c: any) => c.id).filter(Boolean);
  }
  const schoolIds: string[] = [];
  if (caller.school_id) schoolIds.push(caller.school_id);
  const { data: tsRows } = await admin
    .from('teacher_schools')
    .select('school_id')
    .eq('teacher_id', caller.id);
  (tsRows ?? []).forEach((r: any) => {
    if (r.school_id && !schoolIds.includes(r.school_id)) schoolIds.push(r.school_id);
  });

  const { data: classes } = await admin
    .from('classes')
    .select('id, teacher_id, school_id');
  return (classes ?? [])
    .filter((c: any) => c.teacher_id === caller.id || (c.school_id && schoolIds.includes(c.school_id)))
    .map((c: any) => c.id)
    .filter(Boolean);
}

export async function GET(req: NextRequest) {
  const caller = await getCaller();
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const classId = url.searchParams.get('class_id');
  if (!classId) return NextResponse.json({ error: 'class_id is required' }, { status: 400 });
  const canManage = await callerCanManageClass(caller, classId);
  if (!canManage) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const admin = adminClient();
  const { data: classSetting, error: classSettingError } = await admin
    .from('progression_path_visibility')
    .select('mode')
    .eq('class_id', classId)
    .is('student_id', null)
    .maybeSingle();
  if (classSettingError) {
    return NextResponse.json({ error: classSettingError.message }, { status: 500 });
  }

  const { data: students, error: studentsError } = await admin
    .from('portal_users')
    .select('id, full_name, class_id')
    .eq('class_id', classId)
    .eq('role', 'student')
    .order('full_name');
  if (studentsError) {
    return NextResponse.json({ error: studentsError.message }, { status: 500 });
  }
  let overrides: Record<string, string> = {};
  const studentIds = (students ?? []).map((student: any) => student.id);
  if (studentIds.length > 0) {
    const { data: rows, error: overridesError } = await admin
      .from('progression_path_visibility')
      .select('student_id, mode')
      .in('student_id', studentIds);
    if (overridesError) {
      return NextResponse.json({ error: overridesError.message }, { status: 500 });
    }
    overrides = Object.fromEntries(
      (rows ?? []).map((row: any) => [String(row.student_id), String(row.mode)]),
    );
  }

  return NextResponse.json({
    data: {
      class_id: classId,
      class_mode: classSetting?.mode ?? 'full',
      students: (students ?? []).map((s: any) => ({
        student_id: s.id,
        full_name: s.full_name,
        mode: overrides[s.id] ?? 'inherit',
      })),
    },
  });
}

export async function PUT(req: NextRequest) {
  const caller = await getCaller();
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const classId = typeof body.class_id === 'string' ? body.class_id : null;
  const studentId = typeof body.student_id === 'string' ? body.student_id : null;
  const applyToAll = body.apply_to_all === true;
  const mode = String(body.mode ?? '');

  if (!['full', 'milestone', 'inherit'].includes(mode)) {
    return NextResponse.json({ error: 'mode must be full, milestone, or inherit' }, { status: 400 });
  }
  if (!classId && !studentId && !applyToAll) {
    return NextResponse.json({ error: 'class_id, student_id, or apply_to_all is required' }, { status: 400 });
  }

  const admin = adminClient();
  if (applyToAll) {
    if (mode !== 'full' && mode !== 'milestone') {
      return NextResponse.json({ error: 'apply_to_all only supports full or milestone mode' }, { status: 400 });
    }
    const ids = await scopedClassIds(caller);
    if (ids.length === 0) return NextResponse.json({ success: true, data: { updated_count: 0 } });
    const rows = ids.map((id) => ({
      class_id: id,
      student_id: null,
      mode,
      updated_at: new Date().toISOString(),
      updated_by: caller.id,
    }));
    const { error } = await admin
      .from('progression_path_visibility')
      .upsert(rows, { onConflict: 'class_id,student_id' });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, data: { updated_count: ids.length, mode } });
  }

  let targetClassId = classId;
  if (!targetClassId && studentId) {
    const { data: student } = await admin
      .from('portal_users')
      .select('id, class_id')
      .eq('id', studentId)
      .eq('role', 'student')
      .maybeSingle();
    targetClassId = student?.class_id ?? null;
  }
  if (!targetClassId) return NextResponse.json({ error: 'Student is not assigned to a class' }, { status: 400 });

  const canManage = await callerCanManageClass(caller, targetClassId);
  if (!canManage) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  if (mode === 'inherit' && studentId) {
    const { error } = await admin
      .from('progression_path_visibility')
      .delete()
      .eq('student_id', studentId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, data: { student_id: studentId, mode } });
  }
  if (mode === 'inherit' && !studentId) {
    return NextResponse.json({ error: 'Class default cannot be inherit' }, { status: 400 });
  }

  const { error } = await admin
    .from('progression_path_visibility')
    .upsert(
      {
        class_id: studentId ? null : targetClassId,
        student_id: studentId,
        mode,
        updated_at: new Date().toISOString(),
        updated_by: caller.id,
      },
      { onConflict: 'class_id,student_id' },
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    success: true,
    data: studentId ? { student_id: studentId, mode } : { class_id: targetClassId, mode },
  });
}
