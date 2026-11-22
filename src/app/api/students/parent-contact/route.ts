import { NextResponse } from 'next/server';
import { createClient as createSupabase } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { isValidParentName, isValidParentPhone } from '@/lib/parents/contact';
import { accessCardCodeForStudent, formatAccessCardCodeDisplay } from '@/lib/access-card-code';

export const dynamic = 'force-dynamic';

function adminClient() {
  return createSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/**
 * GET /api/students/parent-contact
 * Lightweight readiness check for the existing ParentClaim gateway inside the Student Portal.
 * Uses the exact same student RC code, parent_students link, and recordGaps as /result-check.
 */
export async function GET() {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = adminClient();
    const [{ data: portal }, { data: studentRow }] = await Promise.all([
      admin
        .from('portal_users')
        .select('id, role, full_name, gender, date_of_birth, metadata')
        .eq('id', user.id)
        .maybeSingle(),
      admin
        .from('students')
        .select('id, parent_name, parent_phone, gender, date_of_birth')
        .eq('user_id', user.id)
        .maybeSingle(),
    ]);

    if (!portal || portal.role !== 'student') {
      return NextResponse.json({ needsParentContact: false });
    }

    const { data: linkedParents } = studentRow?.id
      ? await admin
          .from('parent_student_links')
          .select('id')
          .eq('student_id', studentRow.id)
          .limit(1)
      : { data: [] as Array<{ id: string }> };

    const meta = (portal.metadata && typeof portal.metadata === 'object' ? portal.metadata : {}) as Record<string, any>;
    const existingName = String(studentRow?.parent_name || meta.parent_name || '').trim();
    const existingPhone = String(studentRow?.parent_phone || meta.parent_phone || '').trim();

    const hasLinkedParent = Array.isArray(linkedParents) && linkedParents.length > 0;
    const hasValidStoredContact = isValidParentName(existingName) && isValidParentPhone(existingPhone);
    const needsParentContact = !hasLinkedParent && !hasValidStoredContact;

    const rawCode = accessCardCodeForStudent(portal.id);
    const hasGender = Boolean(portal.gender || studentRow?.gender);
    const hasDob = Boolean(portal.date_of_birth || studentRow?.date_of_birth);

    return NextResponse.json(
      {
        needsParentContact,
        studentName: portal.full_name || 'Student',
        rcCode: rawCode,
        rcCodeDisplay: formatAccessCardCodeDisplay(rawCode),
        recordGaps: {
          needsGender: !hasGender,
          needsAge: !hasDob,
        },
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Could not check parent contact status' }, { status: 500 });
  }
}
