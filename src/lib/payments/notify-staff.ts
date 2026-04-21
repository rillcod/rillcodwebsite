/**
 * Notify all admins + teachers linked to a school when a payment event occurs.
 * Fire-and-forget — never throws, always resolves.
 */
import { createAdminClient } from '@/lib/payments/../supabase/admin';

interface NotifyStaffPaymentOptions {
  schoolId: string | null | undefined;
  /** Short one-line title for the popup, e.g. "Payment received" */
  title: string;
  /** Longer detail, e.g. "₦120,000 by Greenfield Schools – First Term 2025/26" */
  message: string;
  /** URL to open when user clicks the popup action button */
  actionUrl?: string;
}

export async function notifyStaffOfPayment(opts: NotifyStaffPaymentOptions): Promise<void> {
  try {
    const { notificationsService } = await import('@/services/notifications.service');
    const db = createAdminClient();

    // Fetch all admins
    const { data: admins } = await db
      .from('portal_users')
      .select('id')
      .eq('role', 'admin')
      .eq('is_active', true);

    // Fetch teachers linked to the school
    let teacherIds: string[] = [];
    if (opts.schoolId) {
      const { data: bySchoolId } = await db
        .from('portal_users')
        .select('id')
        .eq('role', 'teacher')
        .eq('school_id', opts.schoolId)
        .eq('is_active', true);

      const { data: byTeacherSchools } = await db
        .from('teacher_schools')
        .select('teacher_id')
        .eq('school_id', opts.schoolId);

      const direct = (bySchoolId ?? []).map((r: any) => r.id as string);
      const linked = (byTeacherSchools ?? []).map((r: any) => r.teacher_id as string);
      teacherIds = [...new Set([...direct, ...linked])];
    }

    const allIds = [
      ...(admins ?? []).map((r: any) => r.id as string),
      ...teacherIds,
    ].filter(Boolean);

    await Promise.allSettled(
      allIds.map(uid =>
        notificationsService.showPopupNotification(uid, opts.title, opts.message, 'success', {
          priority: 'high',
          actionLabel: 'View Finance',
          actionUrl: opts.actionUrl || '/dashboard/finance?tab=billing',
          category: 'payment_updates',
          sound: true,
        }),
      ),
    );
  } catch (err) {
    console.error('[notifyStaffOfPayment] failed:', err);
  }
}
