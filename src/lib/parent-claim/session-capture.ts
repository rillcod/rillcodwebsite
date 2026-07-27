import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { syncExplicitParentStudentLink } from '@/lib/parents/links';

type AnySupabase = SupabaseClient<any>;

/**
 * If a parent is logged in and already linked (or email matches the student record),
 * treat them as verified — no ParentClaim blocker on result-check.
 */
export async function resolveLoggedInParentCapture(
  admin: AnySupabase,
  studentUserId: string,
): Promise<{ captured: boolean; autoLinked: boolean; parentId: string | null }> {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) return { captured: false, autoLinked: false, parentId: null };

    const { data: parent } = await admin
      .from('portal_users')
      .select('id, role, email, phone')
      .eq('id', user.id)
      .maybeSingle();

    if (!parent?.id || parent.role !== 'parent') {
      return { captured: false, autoLinked: false, parentId: null };
    }

    const { data: studentRow } = await admin
      .from('students')
      .select('id, parent_email, parent_phone')
      .eq('user_id', studentUserId)
      .maybeSingle();

    if (!studentRow?.id) {
      return { captured: false, autoLinked: false, parentId: parent.id };
    }

    const { data: existingLink } = await admin
      .from('parent_student_links')
      .select('parent_id')
      .eq('student_id', studentRow.id)
      .eq('parent_id', parent.id)
      .maybeSingle();

    if (existingLink?.parent_id) {
      return { captured: true, autoLinked: false, parentId: parent.id };
    }

    const parentEmail = (parent.email || '').trim().toLowerCase();
    const studentEmail = (studentRow.parent_email || '').trim().toLowerCase();
    const emailMatch = !!parentEmail && !!studentEmail && parentEmail === studentEmail;

    const parentPhone = (parent.phone || '').replace(/\D/g, '');
    const studentPhone = (studentRow.parent_phone || '').replace(/\D/g, '');
    const phoneMatch = parentPhone.length >= 10 && studentPhone.length >= 10
      && (parentPhone === studentPhone || parentPhone.endsWith(studentPhone.slice(-10)) || studentPhone.endsWith(parentPhone.slice(-10)));

    if (emailMatch || phoneMatch) {
      await syncExplicitParentStudentLink(admin, parent.id, studentRow.id, {
        actorId: parent.id,
        source: 'parent-claim.sessionAutoLink',
        // A signed-in parent account whose OWN email/phone matches the student
        // record — the parent is present and authenticated, not merely asserted.
        parentVerified: true,
      });
      return { captured: true, autoLinked: true, parentId: parent.id };
    }

    return { captured: false, autoLinked: false, parentId: parent.id };
  } catch {
    return { captured: false, autoLinked: false, parentId: null };
  }
}
