import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAllConsentAccessStatuses } from '@/lib/consent/result-access';
import { requireActiveParent } from '@/lib/parents/access';

export const dynamic = 'force-dynamic';

/** GET /api/parents/pending-consent — optional intake forms for children already linked to this parent. */
export async function GET() {
  const supabase = await createClient();
  const admin = createAdminClient();
  const guard = await requireActiveParent(supabase, admin);
  if (!guard.ok) return NextResponse.json({ error: guard.error, code: guard.code }, { status: guard.status });
  const { user } = guard;

  const { data: links, error: linksError } = await admin
    .from('parent_student_links')
    .select('student_id, students!parent_student_links_student_id_fkey(id, user_id, full_name, school_id, school_name)')
    .eq('parent_id', user.id);
  if (linksError) {
    console.error('[parents/pending-consent] child links failed:', linksError);
    return NextResponse.json({ error: 'School forms could not be checked right now.', accessUnaffected: true }, { status: 503 });
  }

  const pending: Array<{
    studentUserId: string;
    childName: string;
    schoolName: string | null;
    formUrl: string | null;
    formTitle: string | null;
    formId: string;
    formType: string | null;
  }> = [];

  try {
    for (const link of links ?? []) {
      const s = (link as any).students;
      if (!s?.user_id) continue;
      const { data: pu, error: learnerError } = await admin
        .from('portal_users')
        .select('class_id, section_class, enrollment_type')
        .eq('id', s.user_id)
        .maybeSingle();
      if (learnerError) throw learnerError;
      const statuses = await getAllConsentAccessStatuses(admin as any, {
        studentUserId: s.user_id,
        schoolId: s.school_id,
        classId: pu?.class_id ?? null,
        enrollmentType: pu?.enrollment_type ?? 'school',
        parentId: user.id,
      });
      for (const consent of statuses.filter((status) => status.required && !status.complete && status.form)) {
        pending.push({
          studentUserId: s.user_id,
          childName: s.full_name ?? 'Your child',
          schoolName: s.school_name ?? null,
          formUrl: consent.formUrl,
          formTitle: consent.form?.title ?? null,
          formId: consent.form!.id,
          formType: consent.form!.form_type,
        });
      }
    }
  } catch (error) {
    console.error('[parents/pending-consent] form status failed:', error);
    return NextResponse.json({ error: 'School forms could not be checked right now.', accessUnaffected: true }, { status: 503 });
  }

  return NextResponse.json({ pending, available: true });
}
