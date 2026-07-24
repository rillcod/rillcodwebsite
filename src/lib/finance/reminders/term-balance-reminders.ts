/**
 * Term registration instalment balance chasers — mirrors special-programme
 * payment-reminders but targets students with verified deposits and outstanding balance.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { SMTP_FROM_EMAIL } from '@/config/brand';
import { TERM_BALANCE_PATH } from '@/lib/registration/enrollment-types';
import { computeTermBalanceSnapshot } from '@/lib/registration/term-balance';

const TERM_STREAM = 'individual_billing';
const TERM_ACTION = 'term_balance_reminder';

export type TermBalanceReminderReport = {
  termScanned: number;
  termRemindedEmail: number;
  termRemindedWhatsapp: number;
  termSkipped: number;
  termCapped: number;
};

async function termReminderCount(admin: SupabaseClient, studentId: string): Promise<number> {
  const { count } = await admin
    .from('finance_automation_log')
    .select('*', { count: 'exact', head: true })
    .eq('stream', TERM_STREAM)
    .eq('action', TERM_ACTION)
    .eq('entity_id', studentId)
    .eq('channel', 'email')
    .eq('status', 'success');
  return count ?? 0;
}

async function lastTermReminderAt(admin: SupabaseClient, studentId: string): Promise<Date | null> {
  const { data } = await admin
    .from('finance_automation_log')
    .select('created_at')
    .eq('stream', TERM_STREAM)
    .eq('action', TERM_ACTION)
    .eq('entity_id', studentId)
    .eq('status', 'success')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data?.created_at) return null;
  const d = new Date(data.created_at);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function runTermBalanceReminders(input: {
  admin: SupabaseClient;
  baseUrl: string;
  everyDays: number;
  maxReminders: number;
  channelEmail: boolean;
  channelWhatsapp: boolean;
  notifyEmail: boolean;
  notifyWhatsapp: boolean;
  deadline: number;
  settingsUpdatedAt?: string | null;
}): Promise<TermBalanceReminderReport> {
  const report: TermBalanceReminderReport = {
    termScanned: 0,
    termRemindedEmail: 0,
    termRemindedWhatsapp: 0,
    termSkipped: 0,
    termCapped: 0,
  };

  const cutoff = Date.now() - input.everyDays * 86400000;
  const { data: students } = await input.admin
    .from('students')
    .select('id, full_name, name, parent_name, parent_email, parent_phone, enrollment_type, registration_payment_at')
    .not('registration_payment_at', 'is', null)
    .in('enrollment_type', ['online', 'school'])
    .eq('is_deleted', false)
    .order('updated_at', { ascending: true })
    .limit(100);

  const { notificationsService } = await import('@/services/notifications.service');
  const { buildRillcodTransactionalEmailHtml, escapeHtml } = await import('@/lib/email/rillcod-transactional-email');
  const { deliverReminder } = await import('@/lib/finance/reminders/orchestrator');
  const { resolveApprovedTemplate } = await import('@/lib/communication/template-registry');

  for (const row of (students ?? []) as Array<Record<string, unknown>>) {
    if (Date.now() > input.deadline) break;
    report.termScanned++;

    const studentId = String(row.id || '');
    if (!studentId) {
      report.termSkipped++;
      continue;
    }

    const sentSoFar = await termReminderCount(input.admin, studentId);
    if (sentSoFar >= input.maxReminders) {
      report.termCapped++;
      continue;
    }

    const last = await lastTermReminderAt(input.admin, studentId);
    if (last && last.getTime() > cutoff) {
      report.termSkipped++;
      continue;
    }

    const snapshot = await computeTermBalanceSnapshot(row as Parameters<typeof computeTermBalanceSnapshot>[0]);
    if (!snapshot || snapshot.balanceDue <= 0) {
      report.termSkipped++;
      continue;
    }

    const to = String(row.parent_email || '').trim().toLowerCase();
    if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(to)) {
      report.termSkipped++;
      continue;
    }

    const studentName = String(row.full_name || row.name || 'Student');
    const parentName = String(row.parent_name || 'Parent/Guardian');
    const payLink = `${input.baseUrl}${TERM_BALANCE_PATH}?email=${encodeURIComponent(to)}`;
    const amountStr = `₦${snapshot.balanceDue.toLocaleString()}`;
    const programLabel = snapshot.programName || 'Term registration';

    let delivered = false;

    if (input.channelEmail && input.notifyEmail) {
      try {
        const governedEmail = await resolveApprovedTemplate(input.admin, 'finance_balance_reminder', {
          customer_name: parentName,
          student_name: studentName,
          balance: amountStr,
          payment_link: payLink,
        });
        const emailResult = await deliverReminder({
          stream: TERM_STREAM,
          action: TERM_ACTION,
          entityType: 'student',
          entityId: studentId,
          stage: `count_${sentSoFar + 1}`,
          channel: 'email',
          dedupe: false,
          metadata: {
            balance_due: snapshot.balanceDue,
            settings_updated_at: input.settingsUpdatedAt,
            cadence_days: input.everyDays,
            max_reminders: input.maxReminders,
          },
          deliver: async () => {
            const html = buildRillcodTransactionalEmailHtml({
              eyebrow: 'Term registration',
              title: 'Reminder: registration balance due',
              bodyHtml: governedEmail
                ? `<p style="margin:0 0 16px;">${escapeHtml(governedEmail.body)}</p>`
                : `<p style="margin:0 0 10px;">Dear ${escapeHtml(parentName)}, thank you for registering <strong>${escapeHtml(studentName)}</strong> for ${escapeHtml(programLabel)}.</p>
          <p style="margin:0 0 16px;">This is a friendly reminder that <strong>${amountStr}</strong> remains on your instalment plan. Clearing it keeps your learner's place and access uninterrupted.</p>
          <div style="text-align:center;margin:0 0 8px;"><a href="${payLink}" style="display:inline-block;padding:13px 28px;background:#2563eb;color:#fff;font-size:14px;font-weight:800;text-decoration:none;border-radius:8px;">Pay balance online →</a></div>`,
              summaryRows: [
                { label: 'Learner', value: studentName },
                { label: 'Outstanding', value: amountStr },
                { label: 'Total tuition', value: `₦${snapshot.totalTuition.toLocaleString()}` },
                { label: 'Programme', value: programLabel },
              ],
              footerNote: 'Rillcod Technologies • term registration',
            });
            await notificationsService.sendExternalEmail({
              to,
              subject: governedEmail?.subject || `Reminder: registration balance for ${studentName}`,
              html,
              fromName: 'Rillcod Technologies',
              fromEmail: SMTP_FROM_EMAIL,
            });
          },
        });
        if (emailResult.status === 'success') {
          report.termRemindedEmail++;
          delivered = true;
        }
      } catch (emailErr) {
        console.error('[payment-reminders] term balance email failed:', emailErr);
      }
    }

    if (input.channelWhatsapp && input.notifyWhatsapp && row.parent_phone) {
      try {
        const waResult = await deliverReminder({
          stream: TERM_STREAM,
          action: TERM_ACTION,
          entityType: 'student',
          entityId: studentId,
          stage: `count_${sentSoFar + 1}`,
          channel: 'whatsapp',
          dedupe: false,
          metadata: {
            balance_due: snapshot.balanceDue,
            settings_updated_at: input.settingsUpdatedAt,
            cadence_days: input.everyDays,
            max_reminders: input.maxReminders,
          },
          deliver: async () => {
            const { sendWhatsApp } = await import('@/lib/whatsapp/send');
            const ok = await sendWhatsApp(String(row.parent_phone), [
              `Hello ${parentName}! 👋`,
              `Friendly reminder: ${amountStr} is still due on ${studentName}'s Rillcod term registration instalment.`,
              `Pay online: ${payLink}`,
              'Thank you!',
            ].join('\n'));
            if (!ok) throw new Error('WhatsApp send failed');
          },
        });
        if (waResult.status === 'success') {
          report.termRemindedWhatsapp++;
          delivered = true;
        }
      } catch {
        /* non-fatal */
      }
    }

    if (!delivered) report.termSkipped++;
  }

  return report;
}
