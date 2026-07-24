import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getResultConsentAccessStatus } from '@/lib/consent/result-access';

export const dynamic = 'force-dynamic';

/** GET /api/parents/pending-consent — children linked to this parent who still need the one-time school form. */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: profile } = await admin.from('portal_users').select('role').eq('id', user.id).maybeSingle();
  if (profile?.role !== 'parent') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data: links } = await admin
    .from('parent_student_links')
    .select('student_id, students!parent_student_links_student_id_fkey(id, user_id, full_name, school_id, school_name)')
    .eq('parent_id', user.id);

  const pending: Array<{
    studentUserId: string;
    childName: string;
    schoolName: string | null;
    formUrl: string | null;
    formTitle: string | null;
  }> = [];

  for (const link of links ?? []) {
    const s = (link as any).students;
    if (!s?.user_id) continue;
    const { data: pu } = await admin
      .from('portal_users')
      .select('class_id, section_class')
      .eq('id', s.user_id)
      .maybeSingle();
    const consent = await getResultConsentAccessStatus(admin as any, {
      studentUserId: s.user_id,
      schoolId: s.school_id,
      classId: pu?.class_id ?? null,
    });
    if (consent.required && !consent.complete) {
      pending.push({
        studentUserId: s.user_id,
        childName: s.full_name ?? 'Your child',
        schoolName: s.school_name ?? null,
        formUrl: consent.formUrl,
        formTitle: consent.form?.title ?? null,
      });
    }
  }

  return NextResponse.json({ pending });
}
